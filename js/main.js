const backend = "/api";

const setupPanel = document.getElementById("setup-panel");
const gamePanel = document.getElementById("game-panel");
const playerChip = document.getElementById("player-chip");
const scoreChip = document.getElementById("score-chip");
const submissionsChip = document.getElementById("submissions-chip");

const state = {
  player: "",
  score: 100,
  submissions: 0,
  stage: 0,
  year: null,
  round: null,
  session: null,
  results: [],
  top10: [],
  teams: [],
  entrantsByTeam: new Map(),
  top10Teams: new Set(),
  top10TeamCounts: new Map(),
  top10SingleTeamDriver: new Map(),
  driverNumbers: new Map(),
  teamColors: new Map(),
  stage1Confirmed: new Set(),
  stage1Eliminated: new Set(),
  stage1History: [],
  stage2Resolved: new Map(),
  stage2History: [],
  stage3Resolved: new Map(),
  stage3History: [],
  stage4Locked: new Map(),
  stage4Guesses: [],
  backendHealth: { status: "checking", message: "Checking backend status…" }
};

const byTeamName = (a, b) => a.localeCompare(b);
const cache = new Map();
const inFlightRequests = new Map();
const selectionControllers = {
  rounds: null,
  sessions: null
};
const CACHE_TTL_MS = {
  default: 45_000,
  years: 5 * 60_000,
  rounds: 2 * 60_000,
  sessions: 90_000,
  sessionResults: 30_000
};

function logTelemetry(level, event, details = {}) {
  const payload = { event, ts: new Date().toISOString(), ...details };
  const logger = console[level] || console.log;
  logger(`[telemetry] ${event}`, payload);
}

function getSessionKey(year, round, session) {
  return `${year}::${round}::${session}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data, ttl = CACHE_TTL_MS.default) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

function normalizeHexColor(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}

function toTint(hex, alpha = 0.18) {
  const c = normalizeHexColor(hex);
  if (!c) return "rgba(39,49,66,0.35)";
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTeamColor(team) {
  return state.teamColors.get(team) || "#3d444d";
}

function getDriverNumber(driver) {
  return state.driverNumbers.get(driver);
}

function applyTeamCardStyle(card, team, subdued = false) {
  const teamColor = getTeamColor(team);
  card.style.borderColor = teamColor;
  if (!subdued) {
    card.style.background = `linear-gradient(140deg, ${toTint(teamColor, 0.22)}, var(--panel-alt) 58%)`;
  }
}

async function fetchData(url, options = {}) {
  const {
    timeoutMs = 45000,
    method = "GET",
    body,
    headers = {},
    cacheKey = url,
    cacheTtlMs = CACHE_TTL_MS.default,
    skipCache = false,
    dedupeKey = `${method}:${url}`,
    signal
  } = options;

  if (!skipCache && method === "GET") {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  if (inFlightRequests.has(dedupeKey)) return inFlightRequests.get(dedupeKey);

  const controller = new AbortController();
  let abortedByCaller = false;
  const onAbort = () => {
    abortedByCaller = true;
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const requestPromise = (async () => {
    const res = await fetch(url, {
      method,
      body,
      headers,
      signal: controller.signal
    });

    if (!res.ok) {
      let details = "";
      try {
        const body = await res.json();
        details = body?.message || body?.error || "";
      } catch {
        // Ignore parse errors and fall back to status only.
      }
      const error = new Error(details ? `Request failed: ${res.status} (${details})` : `Request failed: ${res.status}`);
      error.status = res.status;
      throw error;
    }

    const data = await res.json();
    if (method === "GET" && !skipCache) writeCache(cacheKey, data, cacheTtlMs);
    return data;
  })()
    .catch((error) => {
      if (error.name === "AbortError") {
        if (abortedByCaller) {
          const cancelledError = new Error("Request cancelled");
          cancelledError.code = "CANCELLED";
          throw cancelledError;
        }
        const timeoutError = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      inFlightRequests.delete(dedupeKey);
    });

  inFlightRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}

const api = {
  health: () => fetchData(`${backend}/health`, { timeoutMs: 20_000, cacheTtlMs: 10_000 }),
  years: () => fetchData(`${backend}/years`, { timeoutMs: 60_000, cacheTtlMs: CACHE_TTL_MS.years }),
  rounds: (year, signal) => fetchData(`${backend}/rounds?year=${year}`, {
    timeoutMs: 60_000,
    cacheKey: `rounds:${year}`,
    cacheTtlMs: CACHE_TTL_MS.rounds,
    dedupeKey: `rounds:${year}`,
    signal
  }),
  sessions: (year, round, signal) => fetchData(`${backend}/sessions?year=${year}&round=${round}`, {
    timeoutMs: 60_000,
    cacheKey: `sessions:${year}:${round}`,
    cacheTtlMs: CACHE_TTL_MS.sessions,
    dedupeKey: `sessions:${year}:${round}`,
    signal
  }),
  sessionResults: (year, round, session, opts = {}) => {
    const key = getSessionKey(year, round, session);
    return fetchData(`${backend}/session_results?year=${year}&round=${round}&session=${encodeURIComponent(session)}`, {
      timeoutMs: 120_000,
      cacheKey: `session_results:${key}`,
      cacheTtlMs: CACHE_TTL_MS.sessionResults,
      dedupeKey: `session_results:${key}`,
      skipCache: opts.skipCache
    });
  },
  refreshSessionResults: (year, round, session) => {
    const key = getSessionKey(year, round, session);
    cache.delete(`session_results:${key}`);
    return fetchData(`${backend}/refresh_session_results?year=${year}&round=${round}&session=${encodeURIComponent(session)}`, {
      method: "POST",
      timeoutMs: 120_000,
      dedupeKey: `refresh_session_results:${key}`,
      skipCache: true
    });
  }
};

function isRecoverableSessionLoadError(error) {
  return error?.status === 502 || error?.code === "TIMEOUT" || /network|fetch|timed out/i.test(error?.message || "");
}

async function loadSessionResultsWithRefresh(year, round, session) {
  try {
    return await api.sessionResults(year, round, session);
  } catch (firstError) {
    if (!isRecoverableSessionLoadError(firstError)) throw firstError;
    logTelemetry("warn", "session_results_initial_failure", { year, round, session, message: firstError.message });

    try {
      await api.refreshSessionResults(year, round, session);
    } catch (refreshError) {
      logTelemetry("error", "session_results_refresh_failure", { year, round, session, message: refreshError.message });
      const e = new Error("Could not refresh latest data");
      e.cause = refreshError;
      throw e;
    }

    return api.sessionResults(year, round, session, { skipCache: true });
  }
}

function bumpSubmission(isCorrect) {
  state.submissions += 1;
  if (!isCorrect) state.score = Math.max(0, state.score - 5);
  renderScore();
}

function renderScore() {
  playerChip.textContent = state.player || "-";
  scoreChip.textContent = String(state.score);
  submissionsChip.textContent = String(state.submissions);
}

function renderSetup(message = "") {
  setupPanel.innerHTML = `
    <h2 id="setupTitle">Let's Get Started</h2>
    <p class="status" id="setupStatus">${message || "Enter your name, then load available sessions."}</p>
    <p class="status" id="backendHealthStatus">Backend status: ${state.backendHealth.message}</p>
    <div class="grid-3">
      <div><label for="playerName">Player name</label><input id="playerName" placeholder="e.g. Oliver"/></div>
      <div style="align-self:end;"><button id="loadSessionsBtn">Get Available F1 Sessions</button></div>
    </div>
    <div id="sessionStep" class="hidden"></div>
    <div id="setupSpinner" class="spinner hidden" aria-live="polite" aria-label="Loading"></div>
  `;
}

function renderSessionStep() {
  const sessionStep = document.getElementById("sessionStep");
  sessionStep.innerHTML = `
    <div class="grid-3" style="margin-top:0.75rem;">
      <div><label for="year">Year</label><select id="year"></select></div>
      <div><label for="round">Round</label><select id="round"></select></div>
      <div><label for="session">Session</label><select id="session"></select></div>
    </div>
    <div class="grid-3" style="margin-top:0.75rem;">
      <div><button id="refreshResultsBtn" disabled>Refresh latest results</button></div><div></div><div style="align-self:end;"><button id="startBtn" disabled>Start Game</button></div>
    </div>
  `;
  sessionStep.classList.remove("hidden");
}

function updateBackendHealthStatus() {
  const node = document.getElementById("backendHealthStatus");
  if (!node) return;
  node.textContent = `Backend status: ${state.backendHealth.message}`;
}

async function checkBackendHealth() {
  try {
    const health = await api.health();
    state.backendHealth = {
      status: "up",
      message: health?.status ? `Online (${health.status})` : "Online"
    };
  } catch (error) {
    state.backendHealth = {
      status: "degraded",
      message: "Unavailable right now (cold start possible). You can still try loading sessions."
    };
    logTelemetry("warn", "health_check_failed", { message: error.message });
  }
  updateBackendHealthStatus();
}

function formatRound(r) {
  return `${r.round}. ${r.round_name} · ${r.location}`;
}

async function setupFlow() {
  renderSetup();
  const playerInput = document.getElementById("playerName");
  const loadSessionsBtn = document.getElementById("loadSessionsBtn");
  const status = document.getElementById("setupStatus");
  const title = document.getElementById("setupTitle");
  const sessionStep = document.getElementById("sessionStep");
  const spinner = document.getElementById("setupSpinner");

  checkBackendHealth();

  let selectorsReady = false;

  const showSpinner = (isBusy) => spinner.classList.toggle("hidden", !isBusy);

  loadSessionsBtn.addEventListener("click", async () => {
    if (!playerInput.value.trim()) {
      status.textContent = "Please enter your name first.";
      return;
    }

    state.player = playerInput.value.trim();
    renderScore();

    if (selectorsReady) {
      title.textContent = "Pick a Session";
      status.textContent = "Sessions are ready below. Pick your session and start.";
      return;
    }

    loadSessionsBtn.disabled = true;
    showSpinner(true);
    status.textContent = "Waking the F1 backend and loading available sessions… this can take around 30-60 seconds.";

    try {
      renderSessionStep();

      const yearSel = document.getElementById("year");
      const roundSel = document.getElementById("round");
      const sessionSel = document.getElementById("session");
      const startBtn = document.getElementById("startBtn");
      const refreshBtn = document.getElementById("refreshResultsBtn");

      const updateStartBtnState = () => {
        const ready = Boolean(yearSel.value) && Boolean(roundSel.value) && Boolean(sessionSel.value);
        startBtn.disabled = !ready;
        refreshBtn.disabled = !ready;
      };

      const years = await api.years();
      yearSel.innerHTML = "";
      years.forEach((y) => yearSel.add(new Option(y, y)));

      async function loadRounds() {
        selectionControllers.rounds?.abort();
        selectionControllers.rounds = new AbortController();
        roundSel.innerHTML = "";
        sessionSel.innerHTML = "";
        updateStartBtnState();
        try {
          const rounds = await api.rounds(yearSel.value, selectionControllers.rounds.signal);
          rounds.forEach((r) => roundSel.add(new Option(formatRound(r), r.round)));
          await loadSessions();
        } catch (error) {
          if (error?.code === "CANCELLED") return;
          throw error;
        }
      }

      async function loadSessions() {
        selectionControllers.sessions?.abort();
        selectionControllers.sessions = new AbortController();
        sessionSel.innerHTML = "";
        updateStartBtnState();
        try {
          const sessions = await api.sessions(yearSel.value, roundSel.value, selectionControllers.sessions.signal);
          sessions
            .filter((s) => s.session_name && s.session_name !== "None")
            .forEach((s) => sessionSel.add(new Option(s.session_name, s.session_name)));
          updateStartBtnState();
        } catch (error) {
          if (error?.code === "CANCELLED") return;
          throw error;
        }
      }

      yearSel.addEventListener("change", async () => {
        try {
          await loadRounds();
        } catch (error) {
          status.textContent = `Could not reload rounds (${error.message}).`;
          logTelemetry("error", "rounds_reload_failed", { year: yearSel.value, message: error.message });
        }
      });
      roundSel.addEventListener("change", async () => {
        try {
          await loadSessions();
        } catch (error) {
          status.textContent = `Could not reload sessions (${error.message}).`;
          logTelemetry("error", "sessions_reload_failed", { year: yearSel.value, round: roundSel.value, message: error.message });
        }
      });
      sessionSel.addEventListener("change", () => updateStartBtnState());

      await loadRounds();

      title.textContent = "Pick a Session";
      selectorsReady = true;
      status.textContent = "Sessions loaded. Select year, round and session, then tap Start Game.";
      updateStartBtnState();

      refreshBtn.addEventListener("click", async () => {
        updateStartBtnState();
        refreshBtn.disabled = true;
        showSpinner(true);
        status.textContent = "Refreshing latest backend data…";
        try {
          await api.refreshSessionResults(Number(yearSel.value), Number(roundSel.value), sessionSel.value);
          status.textContent = "Latest data refreshed. You can start the game now.";
        } catch (error) {
          logTelemetry("error", "manual_refresh_failed", { year: yearSel.value, round: roundSel.value, session: sessionSel.value, message: error.message });
          status.textContent = "Could not refresh latest data.";
        } finally {
          showSpinner(false);
          updateStartBtnState();
        }
      });

      startBtn.addEventListener("click", async () => {
        if (!playerInput.value.trim()) return alert("Please enter your name first.");
        state.player = playerInput.value.trim();
        state.year = Number(yearSel.value);
        state.round = Number(roundSel.value);
        state.session = sessionSel.value;

        if (!state.year || Number.isNaN(state.round) || !state.session) {
          status.textContent = "Please select year, round and session before starting.";
          updateStartBtnState();
          return;
        }

        renderScore();
        status.textContent = "Loading session data… this can take up to 2 minutes on free tier.";
        startBtn.disabled = true;
        showSpinner(true);

        try {
          const results = await loadSessionResultsWithRefresh(state.year, state.round, state.session);

          const normalizedResults = Array.isArray(results)
            ? results
            : Array.isArray(results?.results)
              ? results.results
              : null;

          if (!normalizedResults || normalizedResults.length < 10) {
            throw new Error("Session does not have enough result data.");
          }

          prepareGame(normalizedResults);
          setupPanel.classList.add("hidden");
          gamePanel.classList.remove("hidden");
          state.stage = 1;
          renderGame();
        } catch (error) {
          logTelemetry("error", "start_game_failed", { year: state.year, round: state.round, session: state.session, message: error.message });
          showSpinner(false);
          status.textContent = `Could not load that session yet (${error.message}). Please try another session.`;
          updateStartBtnState();
        }
      });
    } catch (error) {
      sessionStep.classList.add("hidden");
      status.textContent = `Could not load available sessions (${error.message}). Please try again.`;
      loadSessionsBtn.disabled = false;
    } finally {
      showSpinner(false);
    }
  });
}

function prepareGame(results) {
  if (!Array.isArray(results)) {
    throw new Error("Unexpected session results format from backend");
  }

  state.score = 100;
  state.submissions = 0;
  state.results = results;
  state.top10 = results.slice(0, 10);

  const entrantsByTeam = new Map();
  const driverNumbersMap = new Map();
  const teamColors = new Map();

  results.forEach((r) => {
    if (!entrantsByTeam.has(r.team)) entrantsByTeam.set(r.team, []);
    entrantsByTeam.get(r.team).push(r.driver);

    const driverNumber = Number(r.driver_number ?? r.driverNumber ?? r.number ?? r.driver_no);
    if (!Number.isNaN(driverNumber)) driverNumbersMap.set(r.driver, driverNumber);

    const teamColor = normalizeHexColor(r.team_colour ?? r.team_color ?? r.teamColour);
    if (teamColor) teamColors.set(r.team, teamColor);
  });

  entrantsByTeam.forEach((drivers, team) => entrantsByTeam.set(
    team,
    [...new Set(drivers)].sort((a, b) => (driverNumbersMap.get(a) || 999) - (driverNumbersMap.get(b) || 999))
  ));
  state.entrantsByTeam = entrantsByTeam;
  state.driverNumbers = driverNumbersMap;
  state.teamColors = teamColors;
  state.teams = [...entrantsByTeam.keys()].sort(byTeamName);

  state.top10Teams = new Set(state.top10.map((r) => r.team));
  state.top10TeamCounts = new Map();
  state.top10.forEach((r) => state.top10TeamCounts.set(r.team, (state.top10TeamCounts.get(r.team) || 0) + 1));

  state.top10SingleTeamDriver = new Map();
  state.top10TeamCounts.forEach((count, team) => {
    if (count === 1) state.top10SingleTeamDriver.set(team, state.top10.find((r) => r.team === team).driver);
  });

  state.stage1Confirmed = new Set();
  state.stage1Eliminated = new Set();
  state.stage1History = [];
  state.stage2Resolved = new Map();
  state.stage2History = [];
  state.stage3Resolved = new Map();
  state.stage3History = [];
  state.stage4Locked = new Map();
  state.stage4Guesses = [];
  renderScore();
}

function stageHeader(title, help) {
  return `<h2 class="stage-title">${title}</h2><p class="status">${help}</p>`;
}

function renderGame() {
  if (state.stage === 1) return renderStage1();
  if (state.stage === 2) return renderStage2();
  if (state.stage === 3) return renderStage3();
  if (state.stage === 4) return renderStage4();
  renderFinish();
}

function renderPriorSummary() {
  const teams = [...state.top10Teams].sort(byTeamName).map((t) => `${t} (${state.top10TeamCounts.get(t)})`).join(" · ");
  const drivers = state.top10.map((r) => `${r.position}. ${r.driver}`).join(" | ");
  return `
    <div class="panel" style="padding:0.75rem;margin-top:0.75rem;">
      <div class="history"><strong>Known so far:</strong> ${state.stage > 1 ? teams : "Teams not solved yet"}</div>
      <div class="history"><strong>Driver pool:</strong> ${state.stage > 3 ? drivers : "Solved in Stage 3"}</div>
    </div>
  `;
}

function renderStage1() {
  const required = state.top10Teams.size;
  gamePanel.innerHTML = `
    ${stageHeader("Stage 1: Which Teams are in the Top 10?", `Select exactly ${required} teams. Wrong picks are greyed out; correct picks stay locked.`)}
    <div class="inline-list"><span class="badge">Session: ${state.year} · Round ${state.round} · ${state.session}</span></div>
    <div class="team-grid" id="teamGrid"></div>
    <button id="submitStage1" disabled>Submit Teams</button>
    <div class="history" id="history"></div>
  `;

  const selected = new Set([...state.stage1Confirmed]);
  const grid = document.getElementById("teamGrid");

  state.teams.forEach((team) => {
    const drivers = state.entrantsByTeam.get(team) || [];
    const card = document.createElement("div");
    card.className = "card";
    if (state.stage1Confirmed.has(team)) card.classList.add("locked");
    if (state.stage1Eliminated.has(team)) card.classList.add("eliminated");
    if (!state.stage1Eliminated.has(team) && !state.stage1Confirmed.has(team)) card.classList.add("selectable");
    if (selected.has(team)) card.classList.add("selected");
    card.innerHTML = `<h4>${team}</h4>${drivers.map((d) => `<p>#${getDriverNumber(d) || "--"} ${d}</p>`).join("")}`;
    applyTeamCardStyle(card, team, state.stage1Eliminated.has(team));

    if (!state.stage1Eliminated.has(team) && !state.stage1Confirmed.has(team)) {
      card.addEventListener("click", () => {
        if (selected.has(team)) selected.delete(team);
        else if (selected.size < required) selected.add(team);
        renderStage1WithSelection(selected);
      });
    }
    grid.appendChild(card);
  });

  const submit = document.getElementById("submitStage1");
  submit.disabled = selected.size !== required;
  submit.addEventListener("click", () => {
    const pick = [...selected];
    const wrong = pick.filter((t) => !state.top10Teams.has(t));
    const correct = pick.filter((t) => state.top10Teams.has(t));
    correct.forEach((t) => state.stage1Confirmed.add(t));
    wrong.forEach((t) => state.stage1Eliminated.add(t));
    state.stage1History.push(`Picked: ${pick.join(", ")} | Wrong: ${wrong.length || 0}`);
    const solved = state.stage1Confirmed.size === required;
    bumpSubmission(solved);
    if (solved) state.stage = 2;
    renderGame();
  });

  document.getElementById("history").innerHTML = state.stage1History.length
    ? `<strong>Previous guesses</strong><ul>${state.stage1History.map((h) => `<li>${h}</li>`).join("")}</ul>` : "";
}

function renderStage1WithSelection(selected) {
  const required = state.top10Teams.size;
  const cards = [...document.querySelectorAll("#teamGrid .card")];
  cards.forEach((c) => {
    const team = c.querySelector("h4").textContent;
    c.classList.toggle("selected", selected.has(team));
  });
  document.getElementById("submitStage1").disabled = selected.size !== required;
}

function renderStage2() {
  const teams = [...state.top10Teams].sort(byTeamName);
  gamePanel.innerHTML = `
    ${stageHeader("Stage 2: One or Two Drivers per Team?", "Set each team to 1 or 2 drivers. Total must equal 10.")}
    <div id="s2Grid" class="team-grid"></div>
    <div class="status">Current total: <strong id="totalS2">0</strong> / 10</div>
    <button id="submitS2" disabled>Submit Stage 2</button>
    <div class="history">${state.stage2History.length ? `<ul>${state.stage2History.map((h) => `<li>${h}</li>`).join("")}</ul>` : ""}</div>
    ${renderPriorSummary()}
  `;
  const guesses = new Map(teams.map((t) => [t, state.stage2Resolved.get(t) || 1]));
  const grid = document.getElementById("s2Grid");

  teams.forEach((team) => {
    const card = document.createElement("div");
    card.className = "card";
    applyTeamCardStyle(card, team);
    card.innerHTML = `<h4>${team}</h4>
      <label><input type="radio" name="${team}" value="1" ${guesses.get(team) === 1 ? "checked" : ""}/> 1 driver</label>
      <label><input type="radio" name="${team}" value="2" ${guesses.get(team) === 2 ? "checked" : ""}/> 2 drivers</label>`;
    card.addEventListener("change", (e) => {
      guesses.set(team, Number(e.target.value));
      refresh();
    });
    grid.appendChild(card);
  });

  function refresh() {
    const total = [...guesses.values()].reduce((a, b) => a + b, 0);
    document.getElementById("totalS2").textContent = String(total);
    document.getElementById("submitS2").disabled = total !== 10;
  }

  refresh();
  document.getElementById("submitS2").addEventListener("click", () => {
    let anyWrong = false;
    teams.forEach((t) => {
      const guessed = guesses.get(t);
      const actual = state.top10TeamCounts.get(t);
      if (guessed !== actual) anyWrong = true;
      state.stage2Resolved.set(t, actual);
    });
    state.stage2History.push(`Submitted totals: ${teams.map((t) => `${t}=${guesses.get(t)}`).join(", ")}`);
    bumpSubmission(!anyWrong);
    state.stage = 3;
    renderGame();
  });
}

function renderStage3() {
  const teams = [...state.top10Teams].sort(byTeamName);
  const singleTeams = teams.filter((t) => state.stage2Resolved.get(t) === 1);

  gamePanel.innerHTML = `
    ${stageHeader("Stage 3: Which Driver is in the Top 10?", "Teams with 2 drivers are auto-filled. Pick one driver for each 1-driver team.")}
    <div class="driver-grid" id="s3Grid"></div>
    <button id="submitS3" disabled>Submit Stage 3</button>
    <div class="history">${state.stage3History.length ? `<ul>${state.stage3History.map((h) => `<li>${h}</li>`).join("")}</ul>` : ""}</div>
    ${renderPriorSummary()}
  `;

  const guesses = new Map();
  const grid = document.getElementById("s3Grid");

  teams.forEach((team) => {
    const count = state.stage2Resolved.get(team);
    const drivers = state.entrantsByTeam.get(team) || [];
    const card = document.createElement("div");
    card.className = "card";
    applyTeamCardStyle(card, team);

    if (count === 2) {
      const both = state.top10.filter((r) => r.team === team).map((r) => r.driver);
      both.forEach((d) => state.stage3Resolved.set(`${team}:${d}`, d));
      card.innerHTML = `<h4>${team}</h4><p>Auto: ${both.join(" & ")}</p>`;
    } else {
      card.innerHTML = `<h4>${team}</h4>${drivers
        .map((d, i) => `<label><input type="radio" name="${team}" value="${d}" ${i === 0 ? "checked" : ""}/> #${getDriverNumber(d) || "--"} ${d}</label>`)
        .join("")}`;
      guesses.set(team, drivers[0]);
      card.addEventListener("change", (e) => {
        guesses.set(team, e.target.value);
        document.getElementById("submitS3").disabled = [...guesses.values()].some((v) => !v);
      });
    }
    grid.appendChild(card);
  });

  document.getElementById("submitS3").disabled = singleTeams.length > 0 && [...guesses.values()].some((v) => !v);

  document.getElementById("submitS3").addEventListener("click", () => {
    let anyWrong = false;
    singleTeams.forEach((team) => {
      const guessed = guesses.get(team);
      const actual = state.top10SingleTeamDriver.get(team);
      if (guessed !== actual) anyWrong = true;
      state.stage3Resolved.set(team, actual);
    });
    state.stage3History.push(`Guessed: ${singleTeams.map((t) => `${t}=${guesses.get(t)}`).join(", ")}`);
    bumpSubmission(!anyWrong);
    state.stage = 4;
    renderGame();
  });
}

function getStage4Pool() {
  return state.top10.map((r) => r.driver);
}

function renderStage4() {
  const pool = getStage4Pool();
  if (!state.stage4Guesses.length) {
    state.stage4Guesses.push(Array(10).fill(""));
  }

  const currentRound = state.stage4Guesses[state.stage4Guesses.length - 1];

  gamePanel.innerHTML = `
    ${stageHeader("Stage 4: Put the Top 10 in Order", "Click a driver from the pool to fill the next available slot. Correct slots lock in place.")}
    <div class="inline-list" id="driverPool"></div>
    <div class="board-wrap"><div class="board" id="board"></div></div>
    <button id="submitS4" disabled>Submit Order</button>
    ${renderPriorSummary()}
  `;

  const poolDiv = document.getElementById("driverPool");
  let selectedDriver = null;

  pool.forEach((driver) => {
    const btn = document.createElement("button");
    btn.className = "badge";
    btn.style.width = "auto";
    btn.textContent = driver;
    btn.disabled = [...state.stage4Locked.values()].includes(driver) || currentRound.includes(driver);
    btn.addEventListener("click", () => {
      selectedDriver = driver;
      fillNext();
    });
    poolDiv.appendChild(btn);
  });

  function fillNext() {
    if (!selectedDriver) return;
    for (let i = 0; i < 10; i += 1) {
      if (state.stage4Locked.has(i)) continue;
      if (!currentRound[i]) {
        currentRound[i] = selectedDriver;
        selectedDriver = null;
        return renderStage4();
      }
    }
  }

  const board = document.getElementById("board");

  const posCol = document.createElement("div");
  posCol.className = "board-col";
  posCol.innerHTML = `<h5>Pos</h5>${Array.from({ length: 10 }, (_, i) => `<div class="slot">P${i + 1}</div>`).join("")}`;
  board.appendChild(posCol);

  state.stage4Guesses.forEach((guess, idx) => {
    const col = document.createElement("div");
    col.className = "board-col";
    col.innerHTML = `<h5>Guess ${idx + 1}</h5>`;
    for (let i = 0; i < 10; i += 1) {
      const slot = document.createElement("div");
      slot.className = "slot";
      if (state.stage4Locked.has(i)) slot.classList.add("good");
      if (idx === state.stage4Guesses.length - 1 && !state.stage4Locked.has(i)) slot.classList.add("current");
      slot.textContent = guess[i] || "—";
      col.appendChild(slot);
    }
    board.appendChild(col);
  });

  const canSubmit = currentRound.every((d, i) => state.stage4Locked.has(i) || d);
  document.getElementById("submitS4").disabled = !canSubmit;

  document.getElementById("submitS4").addEventListener("click", () => {
    const actual = pool;
    let roundPerfect = true;
    for (let i = 0; i < 10; i += 1) {
      if (state.stage4Locked.has(i)) continue;
      if (currentRound[i] === actual[i]) {
        state.stage4Locked.set(i, actual[i]);
      } else {
        roundPerfect = false;
      }
    }

    bumpSubmission(roundPerfect && state.stage4Locked.size === 10);

    if (state.stage4Locked.size === 10) {
      state.stage = 5;
      return renderGame();
    }

    const next = Array(10).fill("");
    state.stage4Locked.forEach((driver, i) => { next[i] = driver; });
    state.stage4Guesses.push(next);
    renderGame();
  });
}

function renderFinish() {
  gamePanel.innerHTML = `
    <h2>🏁 Finished</h2>
    <p>Congratulations ${state.player} — you scored <strong>${state.score}</strong> points.</p>
    <p>Total submissions: <strong>${state.submissions}</strong>. Perfect game is 4 submissions for 100 points.</p>
    <button id="playAgain">Play Another Session</button>
  `;
  document.getElementById("playAgain").addEventListener("click", () => location.reload());
}

setupFlow();
