const backend = "/api";

const setupPanel = document.getElementById("setup-panel");
const gamePanel = document.getElementById("game-panel");
const playerChip = document.getElementById("player-chip");
const scoreChip = document.getElementById("score-chip");
const submissionsChip = document.getElementById("submissions-chip");
const backendFeedback = document.getElementById("backend-feedback");

const state = {
  player: "",
  score: 100,
  submissions: 0,
  stage: 0,
  year: null,
  round: null,
  roundName: "",
  session: null,
  results: [],
  top10: [],
  teams: [],
  entrantsByTeam: new Map(),
  top10Teams: new Set(),
  top10TeamCounts: new Map(),
  top10SingleTeamDriver: new Map(),
  top10Drivers: new Set(),
  driverNumbers: new Map(),
  driverAbbreviations: new Map(),
  driverTeams: new Map(),
  teamColors: new Map(),
  stage1Confirmed: new Set(),
  stage1Locked: new Map(),
  stage1Eliminated: new Set(),
  stage1History: [],
  stage2Resolved: new Map(),
  stage2History: [],
  stage3Resolved: new Map(),
  stage3History: [],
  stage4Locked: new Map(),
  stage4Guesses: [],
  stage1Guesses: [],
  stage1Current: [],
  stage2Attempts: [],
  stage2Current: new Set(),
  stage2Locked: new Set(),
  stage2Rejected: new Set(),
  stage2Correction: null,
  stage3Attempts: [],
  stage3Current: new Map(),
  pendingOverlay: null,
  stage123TeamOrder: [],
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

function buildSeasonYearOptions(apiYears) {
  const currentYear = new Date().getFullYear();
  const allYears = new Set();

  for (let year = 1950; year <= currentYear; year += 1) {
    allYears.add(year);
  }

  (Array.isArray(apiYears) ? apiYears : []).forEach((year) => {
    const parsedYear = Number(year);
    if (Number.isInteger(parsedYear)) {
      allYears.add(parsedYear);
    }
  });

  return [...allYears].sort((a, b) => b - a);
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

function getDriverAbbreviation(driver) {
  return state.driverAbbreviations.get(driver) || driver;
}

function getDriverTeam(driver) {
  return state.driverTeams.get(driver) || "";
}

function fallbackDriverAbbreviation(driver) {
  if (!driver) return "---";
  const cleaned = String(driver).trim().replace(/\./g, "");
  if (!cleaned) return "---";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    return last.slice(0, 3).toUpperCase();
  }
  return cleaned.slice(0, 3).toUpperCase();
}

function formatDriverTag(driver) {
  const number = getDriverNumber(driver);
  const tag = getDriverAbbreviation(driver);
  return `#${number || "--"} ${tag}`;
}

function formatDriverHoverLabel(driver) {
  const number = getDriverNumber(driver) || "--";
  const name = String(driver || "").trim();
  if (!name) return `#${number} ---`;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return `#${number} ${parts[0]}`;
  const initial = parts[0][0] ? `${parts[0][0]}.` : "";
  const lastName = parts[parts.length - 1];
  return `#${number} ${initial}${lastName}`;
}

function getStage2CoverageState(selectedDrivers) {
  const selectedSet = selectedDrivers instanceof Set ? selectedDrivers : new Set(selectedDrivers);
  const missingTeams = getStage123TeamOrder().filter((team) => {
    const teamDrivers = state.entrantsByTeam.get(team) || [];
    return !teamDrivers.some((driver) => selectedSet.has(driver) || state.stage2Locked.has(driver));
  });
  return { covered: missingTeams.length === 0, missingTeams };
}

function formatInfoValue(value) {
  if (value === null || value === undefined) return "N/A";
  const text = String(value).trim();
  if (!text) return "N/A";
  return text.replace(/^0\s+days?\s+/i, "");
}

function getSessionType(sessionName) {
  const label = String(sessionName || "").toLowerCase();
  if (label.includes("qualifying") || label.includes("shootout")) return "qualifying";
  if (label.includes("race") || label.includes("sprint") || label.includes("grand prix")) return "race";
  if (label.includes("practice") || /^fp\d$/i.test(label)) return "practice";
  return "unknown";
}

function toLapTimeMs(value) {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const raw = String(value).trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  if (/^(dnf|dns|na|n\/a)$/i.test(raw)) return Number.POSITIVE_INFINITY;

  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) * 1000;

  const parts = raw.split(":");
  if (!parts.length || parts.some((part) => part.trim() === "")) return Number.POSITIVE_INFINITY;

  const secondsPart = Number(parts.pop());
  if (Number.isNaN(secondsPart)) return Number.POSITIVE_INFINITY;

  let minutes = 0;
  let hours = 0;
  if (parts.length === 1) {
    minutes = Number(parts[0]);
    if (Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;
  } else if (parts.length === 2) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;
  } else if (parts.length > 2) {
    return Number.POSITIVE_INFINITY;
  }

  return (((hours * 60) + minutes) * 60 + secondsPart) * 1000;
}

function toSortablePosition(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Number.POSITIVE_INFINITY;
}

function sortResultsForGame(results) {
  return [...results]
    .sort((a, b) => {
      const positionDiff = toSortablePosition(a.position) - toSortablePosition(b.position);
      if (positionDiff !== 0) return positionDiff;

      const lapTimeDiff = toLapTimeMs(a.lap_time) - toLapTimeMs(b.lap_time);
      if (lapTimeDiff !== 0) return lapTimeDiff;

      return String(a.driver || "").localeCompare(String(b.driver || ""));
    });
}

function getFinalInfoByDriver(driver) {
  const result = state.top10.find((row) => row.driver === driver);
  if (!result) return "N/A";

  const sessionType = getSessionType(state.session);

  if (sessionType === "practice") {
    const laps = formatInfoValue(result.laps);
    const lapTime = formatInfoValue(result.lap_time);
    return `${laps} laps | Best: ${lapTime}`;
  }

  if (sessionType === "qualifying") {
    return `Lap: ${formatInfoValue(result.lap_time)}`;
  }

  if (sessionType === "race") {
    const isWinner = Number(result.position) === 1;
    if (isWinner) return `Time: ${formatInfoValue(result.race_time)}`;
    return `Gap: ${formatInfoValue(result.gap_to_winner)}`;
  }

  return "N/A";
}

function createStage4DriverCard(driver, options = {}) {
  const { asButton = false, draggable = false } = options;
  const node = document.createElement(asButton ? "button" : "div");
  node.className = `driver-token${asButton ? " driver-token-btn" : ""}`;
  node.textContent = formatDriverTag(driver);
  node.title = formatDriverHoverLabel(driver);
  node.dataset.driver = driver;
  if (draggable) node.draggable = true;

  const team = getDriverTeam(driver);
  if (team) applyTeamCardStyle(node, team);
  return node;
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

function setBackendFeedback(message = "") {
  if (!backendFeedback) return;
  backendFeedback.textContent = message;
}

function getSessionDisplayLabel() {
  if (!state.year || !state.round || !state.session) return "-";
  const roundLabel = state.roundName || `Round ${state.round}`;
  return `${state.year} · ${roundLabel} · ${state.session}`;
}

function renderSetup(message = "") {
  setupPanel.innerHTML = `
    <h2 id="setupTitle">Let's Get Started</h2>
    <p class="status" id="setupStatus">${message || "Enter your name, then load available sessions."}</p>
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
  setBackendFeedback(`Backend status: ${state.backendHealth.message}`);
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
  const setStatus = (message = "", backendMessage = "") => {
    status.textContent = message;
    setBackendFeedback(backendMessage);
  };

  loadSessionsBtn.addEventListener("click", async () => {
    if (!playerInput.value.trim()) {
      setStatus("Please enter your name first.");
      return;
    }

    state.player = playerInput.value.trim();
    renderScore();

    if (selectorsReady) {
      title.textContent = "Pick a Session";
      setStatus("Sessions are ready below. Pick your session and start.");
      return;
    }

    loadSessionsBtn.disabled = true;
    showSpinner(true);
    setStatus("Waking the F1 backend and loading available sessions… this can take around 30-60 seconds.", "Waking the F1 backend and loading available sessions… this can take around 30-60 seconds.");

    try {
      renderSessionStep();

      const yearSel = document.getElementById("year");
      const roundSel = document.getElementById("round");
      const sessionSel = document.getElementById("session");
      const startBtn = document.getElementById("startBtn");
      const refreshBtn = document.getElementById("refreshResultsBtn");
      let availableRounds = [];

      const updateStartBtnState = () => {
        const ready = Boolean(yearSel.value) && Boolean(roundSel.value) && Boolean(sessionSel.value);
        startBtn.disabled = !ready;
        refreshBtn.disabled = !ready;
      };

      const years = buildSeasonYearOptions(await api.years());
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
          availableRounds = rounds;
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
          setStatus(`Could not reload rounds (${error.message}).`, `Could not reload rounds (${error.message}).`);
          logTelemetry("error", "rounds_reload_failed", { year: yearSel.value, message: error.message });
        }
      });
      roundSel.addEventListener("change", async () => {
        try {
          await loadSessions();
        } catch (error) {
          setStatus(`Could not reload sessions (${error.message}).`, `Could not reload sessions (${error.message}).`);
          logTelemetry("error", "sessions_reload_failed", { year: yearSel.value, round: roundSel.value, message: error.message });
        }
      });
      sessionSel.addEventListener("change", () => updateStartBtnState());

      await loadRounds();

      title.textContent = "Pick a Session";
      selectorsReady = true;
      setStatus("Sessions loaded. Select year, round and session, then tap Start Game.", "Sessions loaded. Select year, round and session, then tap Start Game.");
      updateStartBtnState();

      refreshBtn.addEventListener("click", async () => {
        updateStartBtnState();
        refreshBtn.disabled = true;
        showSpinner(true);
        setStatus("Refreshing latest backend data…", "Refreshing latest backend data…");
        try {
          await api.refreshSessionResults(Number(yearSel.value), Number(roundSel.value), sessionSel.value);
          setStatus("Latest data refreshed. You can start the game now.", "Latest data refreshed. You can start the game now.");
        } catch (error) {
          logTelemetry("error", "manual_refresh_failed", { year: yearSel.value, round: roundSel.value, session: sessionSel.value, message: error.message });
          setStatus("Could not refresh latest data.", "Could not refresh latest data.");
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
        state.roundName = availableRounds.find((r) => Number(r.round) === state.round)?.round_name || "";
        state.session = sessionSel.value;

        if (!state.year || Number.isNaN(state.round) || !state.session) {
          setStatus("Please select year, round and session before starting.");
          updateStartBtnState();
          return;
        }

        renderScore();
        setStatus("Loading session data… this can take up to 2 minutes on free tier.", "Loading session data… this can take up to 2 minutes on free tier.");
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
          setBackendFeedback("");
          renderGame();
        } catch (error) {
          logTelemetry("error", "start_game_failed", { year: state.year, round: state.round, session: state.session, message: error.message });
          showSpinner(false);
          setStatus(`Could not load that session yet (${error.message}). Please try another session.`, `Could not load that session yet (${error.message}). Please try another session.`);
          updateStartBtnState();
        }
      });
    } catch (error) {
      sessionStep.classList.add("hidden");
      setStatus(`Could not load available sessions (${error.message}). Please try again.`, `Could not load available sessions (${error.message}). Please try again.`);
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
  const orderedResults = sortResultsForGame(results);
  state.results = orderedResults;
  state.top10 = orderedResults.slice(0, 10);

  const entrantsByTeam = new Map();
  const driverNumbersMap = new Map();
  const driverAbbreviationsMap = new Map();
  const driverTeamsMap = new Map();
  const teamColors = new Map();

  orderedResults.forEach((r) => {
    if (!entrantsByTeam.has(r.team)) entrantsByTeam.set(r.team, []);
    entrantsByTeam.get(r.team).push(r.driver);
    driverTeamsMap.set(r.driver, r.team);

    const driverNumber = Number(r.driver_number ?? r.driverNumber ?? r.number ?? r.driver_no);
    if (!Number.isNaN(driverNumber)) driverNumbersMap.set(r.driver, driverNumber);

    const abbreviation = ((r.driver_code ?? r.driverCode ?? r.code ?? r.driver_abbreviation ?? r.driverAbbreviation) || "").trim();
    driverAbbreviationsMap.set(r.driver, abbreviation || fallbackDriverAbbreviation(r.driver));

    const teamColor = normalizeHexColor(r.team_colour ?? r.team_color ?? r.teamColour);
    if (teamColor) teamColors.set(r.team, teamColor);
  });

  entrantsByTeam.forEach((drivers, team) => entrantsByTeam.set(
    team,
    [...new Set(drivers)].sort((a, b) => (driverNumbersMap.get(a) || 999) - (driverNumbersMap.get(b) || 999))
  ));
  state.entrantsByTeam = entrantsByTeam;
  state.driverNumbers = driverNumbersMap;
  state.driverAbbreviations = driverAbbreviationsMap;
  state.driverTeams = driverTeamsMap;
  state.teamColors = teamColors;
  state.teams = [...entrantsByTeam.keys()].sort(byTeamName);

  state.top10Teams = new Set(state.top10.map((r) => r.team));
  state.top10TeamCounts = new Map();
  state.top10.forEach((r) => state.top10TeamCounts.set(r.team, (state.top10TeamCounts.get(r.team) || 0) + 1));

  state.top10SingleTeamDriver = new Map();
  state.top10TeamCounts.forEach((count, team) => {
    if (count === 1) state.top10SingleTeamDriver.set(team, state.top10.find((r) => r.team === team).driver);
  });
  state.top10Drivers = new Set(state.top10.map((r) => r.driver));

  state.stage1Confirmed = new Set();
  state.stage1Locked = new Map();
  state.stage1Eliminated = new Set();
  state.stage1History = [];
  state.stage2Resolved = new Map();
  state.stage2History = [];
  state.stage3Resolved = new Map();
  state.stage3History = [];
  state.stage4Locked = new Map();
  state.stage4Guesses = [];
  state.stage1Guesses = [];
  state.stage1Current = [];
  state.stage2Attempts = [];
  state.stage2Current = new Set();
  state.stage2Locked = new Set();
  state.stage2Rejected = new Set();
  state.stage2Correction = null;
  state.stage3Attempts = [];
  state.stage3Current = new Map();
  state.pendingOverlay = null;
  state.stage123TeamOrder = [];
  renderScore();
}

function stageHeader(title, help) {
  return `<div class="stage-head"><div><h2 class="stage-title">${title}</h2><p class="status">${help}</p></div><div class="session-chip"><span>Session: </span><strong>${getSessionDisplayLabel()}</strong></div></div>`;
}

function renderGame() {
  if (state.pendingOverlay) return renderStageOverlay();
  if (state.stage === 1) return renderStage1();
  if (state.stage === 2) return renderStage2();
  if (state.stage === 3) return renderStage123Review();
  if (state.stage === 4) return renderStage4();
  renderFinish();
}

function preserveBoardScroll(renderFn) {
  const wrap = gamePanel.querySelector(".board-wrap");
  const previousScrollLeft = wrap ? wrap.scrollLeft : 0;
  renderFn();
  const nextWrap = gamePanel.querySelector(".board-wrap");
  if (nextWrap) nextWrap.scrollLeft = previousScrollLeft;
}

function createTeamCard(team, draggable = false) {
  const card = document.createElement("button");
  card.className = "driver-token driver-token-btn team-token";
  card.type = "button";
  if (draggable) card.draggable = true;
  const drivers = (state.entrantsByTeam.get(team) || []).map((d) => `#${getDriverNumber(d) || "--"} ${getDriverAbbreviation(d)}`);
  const hoverLines = (state.entrantsByTeam.get(team) || []).map((driver) => formatDriverHoverLabel(driver));
  card.innerHTML = `<strong>${team}</strong><span>${drivers.join(" · ")}</span>`;
  card.title = hoverLines.join("\n");
  applyTeamCardStyle(card, team);
  return card;
}
function getStage123TeamOrder() {
  if (state.stage123TeamOrder.length) return state.stage123TeamOrder;
  return [...state.top10Teams].sort(byTeamName);
}



function renderStageOverlay() {
  const { title, message, buttonText, onContinue } = state.pendingOverlay;
  if (state.stage >= 3) {
    gamePanel.innerHTML = `<div class="board-wrap"><div id="stage2Board" class="board stage2-driver-board"></div></div>`;
    renderStage2Board({ includeCurrent: false });
  } else {
    gamePanel.innerHTML = `<div class="board-wrap"><div id="stage123Board" class="board stage123-board"></div></div>`;
    renderStage123Board();
  }
  const overlay = document.createElement("div");
  overlay.className = "finish-overlay";
  overlay.innerHTML = `<div class="finish-modal"><h2>${title}</h2><p>${message}</p><p><strong>Score: ${state.score}/100</strong></p><button id="continueStages">${buttonText}</button></div>`;
  gamePanel.appendChild(overlay);
  document.getElementById("continueStages").addEventListener("click", () => {
    state.pendingOverlay = null;
    onContinue();
    renderGame();
  });
}

function renderStage123Board(options = {}) {
  const { stage1Editable = false } = options;
  const rowCount = state.top10Teams.size;
  const board = document.getElementById("stage123Board");
  if (!board) return;
  board.innerHTML = "";

  const indexCol = document.createElement("div");
  indexCol.className = "board-col stage-mini-col";
  indexCol.innerHTML = `<h5>Top 10 Team</h5>${Array.from({ length: rowCount }, (_, i) => `<div class="slot">${i + 1}</div>`).join("")}`;
  board.appendChild(indexCol);

  state.stage1Guesses.forEach((guess, idx) => {
    const col = document.createElement("div");
    col.className = "board-col stage-mini-col";
    col.innerHTML = `<h5>S1 Guess ${idx + 1}</h5>`;
    const lockedBefore = new Set(guess.lockedBefore || []);
    for (let i = 0; i < rowCount; i += 1) {
      const team = guess.teams[i] || "";
      const slot = document.createElement("div");
      const isLockedCell = lockedBefore.has(i);
      slot.className = `slot history-slot ${isLockedCell ? "good" : (team ? (state.top10Teams.has(team) ? "good" : "bad") : "")}`;
      if (!isLockedCell && team) {
        const token = createTeamCard(team, false);
        token.classList.remove("driver-token-btn");
        token.classList.add("driver-token-static");
        slot.appendChild(token);
      }
      col.appendChild(slot);
    }
    board.appendChild(col);
  });

  if (stage1Editable) {
    const col = document.createElement("div");
    col.className = "board-col stage-mini-col";
    col.innerHTML = "<h5>S1 Current</h5>";
    for (let i = 0; i < rowCount; i += 1) {
      const slot = document.createElement("div");
      const locked = state.stage1Locked.has(i);
      slot.className = `slot current ${locked ? "good" : ""}`;
      const team = state.stage1Current[i];
      if (locked) {
        slot.textContent = "";
      } else if (team) {
        const token = createTeamCard(team, false);
        token.classList.remove("driver-token-btn");
        token.classList.add("driver-token-static");
        token.addEventListener("click", () => {
          state.stage1Current[i] = "";
          renderStage1();
        });
        token.draggable = true;
        token.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData("text/source-slot", String(i));
          event.dataTransfer.setData("text/team", team);
        });
        slot.appendChild(token);
      } else {
        slot.textContent = "Drop here";
      }
      slot.addEventListener("dragover", (event) => event.preventDefault());
      slot.addEventListener("drop", (event) => {
        event.preventDefault();
        if (state.stage1Locked.has(i)) return;
        const fromSlotRaw = event.dataTransfer.getData("text/source-slot");
        const hasSourceSlot = fromSlotRaw !== "";
        const fromSlot = Number(fromSlotRaw);
        const droppedTeam = event.dataTransfer.getData("text/team");
        if (!droppedTeam) return;
        if (hasSourceSlot && !Number.isNaN(fromSlot)) {
          const displaced = state.stage1Current[i];
          state.stage1Current[i] = droppedTeam;
          state.stage1Current[fromSlot] = displaced || "";
        } else {
          const existing = state.stage1Current.indexOf(droppedTeam);
          if (existing >= 0) state.stage1Current[existing] = "";
          state.stage1Current[i] = droppedTeam;
        }
        renderStage1();
      });
      col.appendChild(slot);
    }
    board.appendChild(col);
  }
}


function renderStage1() {
  const required = state.top10Teams.size;
  if (!state.stage1Current.length) state.stage1Current = Array(required).fill("");
  gamePanel.innerHTML = `${stageHeader("Stage 1: Which Teams are in the Top 10?", `Pick ${required} teams.`)}<div class="inline-list" id="stage1Pool"></div><div class="board-wrap"><div id="stage123Board" class="board stage123-board"></div></div><button id="submitStage1" disabled>Submit Teams</button>`;
  renderStage123Board({ stage1Editable: true });

  const poolDiv = document.getElementById("stage1Pool");
  const poolTeams = state.teams
    .filter((team) => !state.stage1Current.includes(team) && !state.stage1Eliminated.has(team))
    .sort(byTeamName);
  poolTeams.forEach((team) => {
    const card = createTeamCard(team, true);
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/team", team);
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("click", () => {
      const idx = state.stage1Current.findIndex((v) => !v);
      if (idx >= 0) state.stage1Current[idx] = team;
      renderStage1();
    });
    poolDiv.appendChild(card);
  });
  document.getElementById("submitStage1").disabled = state.stage1Current.some((team, idx) => !team && !state.stage1Locked.has(idx));
  document.getElementById("submitStage1").addEventListener("click", () => {
    const guess = [...state.stage1Current];
    const lockedBefore = new Set(state.stage1Locked.keys());
    let roundPerfect = true;
    for (let i = 0; i < required; i += 1) {
      if (state.stage1Locked.has(i)) continue;
      if (state.top10Teams.has(guess[i])) {
        state.stage1Locked.set(i, guess[i]);
      } else {
        if (guess[i]) state.stage1Eliminated.add(guess[i]);
        roundPerfect = false;
      }
    }
    const solved = state.stage1Locked.size === required;
    state.stage1Guesses.push({ teams: guess, lockedBefore: [...lockedBefore] });
    bumpSubmission(roundPerfect && solved);
    state.stage1Current = Array.from({ length: required }, (_, idx) => state.stage1Locked.get(idx) || "");
    if (solved) {
      state.stage123TeamOrder = Array.from({ length: required }, (_, idx) => state.stage1Locked.get(idx)).filter(Boolean);
      state.stage = 2;
      state.pendingOverlay = {
        title: "Stage 1 Complete",
        message: "Great work — you found all top-10 teams.",
        buttonText: "Continue to Stage 2",
        onContinue: () => {}
      };
    }
    renderGame();
  });
}

function renderStage2Board(options = {}) {
  const { includeCurrent = true } = options;
  const teams = getStage123TeamOrder();
  const board = document.getElementById("stage2Board");
  if (!board) return;
  board.innerHTML = "";

  const stage2Columns = [];

  const teamCol = document.createElement("div");
  teamCol.className = "board-col stage2-driver-col";
  teamCol.innerHTML = "<h5>Teams</h5>";
  teams.forEach((team) => {
    const slot = document.createElement("div");
    slot.className = "slot stage2-driver-slot";
    slot.textContent = team;
    slot.style.borderColor = getTeamColor(team);
    teamCol.appendChild(slot);
  });
  board.appendChild(teamCol);
  stage2Columns.push(teamCol);

  state.stage2Attempts.forEach((attempt, idx) => {
    const col = document.createElement("div");
    col.className = "board-col stage2-driver-col";
    col.innerHTML = `<h5>S2 Guess ${idx + 1}</h5>`;
    const selectedSet = new Set(attempt.selected || []);
    const hitSet = new Set(attempt.hits || []);
    const missSet = new Set(attempt.misses || []);

    teams.forEach((team) => {
      const slot = document.createElement("div");
      slot.className = "slot stage2-driver-slot history-slot";
      const row = document.createElement("div");
      row.className = "stage2-driver-row";
      (state.entrantsByTeam.get(team) || []).forEach((driver) => {
        const chip = document.createElement("span");
        chip.className = "stage2-driver-chip";
        chip.title = formatDriverHoverLabel(driver);
        chip.textContent = formatDriverTag(driver);
        if (!selectedSet.has(driver)) chip.classList.add("neutral");
        else if (hitSet.has(driver)) chip.classList.add("good");
        else if (missSet.has(driver)) chip.classList.add("bad");
        row.appendChild(chip);
      });
      slot.appendChild(row);
      col.appendChild(slot);
    });
    board.appendChild(col);
    stage2Columns.push(col);
  });

  if (includeCurrent) {
    const currentCol = document.createElement("div");
    currentCol.className = "board-col stage2-driver-col";
    currentCol.innerHTML = "<h5>S2 Current</h5>";
    teams.forEach((team) => {
      const slot = document.createElement("div");
      slot.className = "slot stage2-driver-slot current";
      slot.style.borderColor = getTeamColor(team);
      const row = document.createElement("div");
      row.className = "stage2-driver-row";
      (state.entrantsByTeam.get(team) || []).forEach((driver) => {
        const label = document.createElement("label");
        label.className = "stage2-driver-chip selectable";
        const locked = state.stage2Locked.has(driver);
        const rejected = state.stage2Rejected.has(driver);
        if (locked) label.classList.add("good");
        if (rejected) label.classList.add("bad");
        if (state.stage2Current.has(driver)) label.classList.add("selected");
        label.title = formatDriverHoverLabel(driver);
        label.innerHTML = `<input type="checkbox" data-driver="${driver}" ${state.stage2Current.has(driver) ? "checked" : ""} ${locked || rejected ? "disabled" : ""}/><span>${formatDriverTag(driver)}</span>`;
        row.appendChild(label);
      });
      slot.appendChild(row);
      currentCol.appendChild(slot);
    });
    board.appendChild(currentCol);
    stage2Columns.push(currentCol);
  }

  const slotGroups = stage2Columns.map((col) => [...col.querySelectorAll(".stage2-driver-slot")]);
  teams.forEach((_, rowIdx) => {
    const rowSlots = slotGroups.map((slots) => slots[rowIdx]).filter(Boolean);
    const rowHeight = Math.max(...rowSlots.map((slot) => slot.offsetHeight), 34);
    rowSlots.forEach((slot) => {
      slot.style.minHeight = `${rowHeight}px`;
    });
  });
}


function renderStage2() {
  if (!state.stage2Current.size) state.stage2Current = new Set(state.stage2Locked);

  gamePanel.innerHTML = `${stageHeader("Stage 2: Pick the Top-10 Drivers", "Tick drivers on the board. Select exactly 10 each guess.")}<div class="board-wrap"><div id="stage2Board" class="board stage2-driver-board"></div></div><p class="status" id="stage2Count"></p><button id="submitS2" disabled>Submit Stage 2</button>`;
  renderStage2Board({ includeCurrent: true });

  const updateStatus = () => {
    const coverage = getStage2CoverageState(state.stage2Current);
    const coverageText = coverage.covered
      ? "Team coverage complete"
      : `Need at least one from: ${coverage.missingTeams.join(", ")}`;
    document.getElementById("stage2Count").textContent = `Selected ${state.stage2Current.size}/10 · Locked ${state.stage2Locked.size}/10 · ${coverageText}`;
  };
  updateStatus();

  document.querySelectorAll('#stage2Board input[data-driver]').forEach((input) => {
    input.addEventListener("change", (event) => {
      const driver = event.target.dataset.driver;
      const checked = event.target.checked;
      if (checked && state.stage2Current.size >= 10) {
        event.target.checked = false;
        return;
      }
      if (checked) state.stage2Current.add(driver);
      else state.stage2Current.delete(driver);
      preserveBoardScroll(() => renderStage2());
    });
  });

  const coverage = getStage2CoverageState(state.stage2Current);
  const canSubmit = state.stage2Current.size === 10
    && [...state.stage2Locked].every((driver) => state.stage2Current.has(driver))
    && coverage.covered;
  document.getElementById("submitS2").disabled = !canSubmit;
  document.getElementById("submitS2").addEventListener("click", () => {
    const selected = [...state.stage2Current];
    const newlyGuessed = selected.filter((driver) => !state.stage2Locked.has(driver));
    const hits = newlyGuessed.filter((driver) => state.top10Drivers.has(driver));
    const misses = newlyGuessed.filter((driver) => !state.top10Drivers.has(driver));

    hits.forEach((driver) => state.stage2Locked.add(driver));
    misses.forEach((driver) => state.stage2Rejected.add(driver));

    state.stage2Attempts.push({ selected, hits, misses });

    const solved = state.stage2Locked.size === 10;
    bumpSubmission(misses.length === 0 && solved);

    if (solved) {
      state.stage = 3;
      state.pendingOverlay = {
        title: "Stage 2 Complete",
        message: "Great work — review Stage 2 before moving to the final stage.",
        buttonText: "Review Stage 2",
        onContinue: () => {}
      };
      return renderGame();
    }

    state.stage2Current = new Set(state.stage2Locked);
    renderStage2();
  });
}

function renderStage123Review() {
  gamePanel.innerHTML = `${stageHeader("Stages 1-2 Summary", "Review all guesses, then move to the final stage.")}<div class="board-wrap"><div id="stage2Board" class="board stage2-driver-board"></div></div><button id="toStage3">Find the Final Order!</button>`;
  renderStage2Board({ includeCurrent: false });
  document.getElementById("toStage3").addEventListener("click", () => {
    state.stage = 4;
    renderGame();
  });
}


function getStage4Pool() {
  return [...state.top10]
    .sort((a, b) => (getDriverNumber(a.driver) || 999) - (getDriverNumber(b.driver) || 999))
    .map((r) => r.driver);
}

function getStage4ActualOrder() {
  return [...state.top10]
    .sort((a, b) => {
      const pa = Number(a.position);
      const pb = Number(b.position);
      if (Number.isNaN(pa) && Number.isNaN(pb)) return 0;
      if (Number.isNaN(pa)) return 1;
      if (Number.isNaN(pb)) return -1;
      return pa - pb;
    })
    .map((r) => r.driver);
}

function renderStage4(options = {}) {
  const { finalBoard = false } = options;
  const pool = getStage4Pool();
  const actualOrder = getStage4ActualOrder();
  if (!state.stage4Guesses.length) {
    state.stage4Guesses.push(Array(10).fill(""));
  }

  const currentRound = state.stage4Guesses[state.stage4Guesses.length - 1];

  gamePanel.innerHTML = `
    ${stageHeader("Stage 3: Put the Top 10 in Order", "How many guesses do you need?")}
    <div class="inline-list" id="driverPool"></div>
    <div class="board-wrap"><div class="board" id="board"></div></div>
    ${finalBoard ? "" : '<button id="submitS4" disabled>Submit Order</button>'}
  `;

  const poolDiv = document.getElementById("driverPool");
  const getCurrentPoolDrivers = () => pool
    .filter((driver) => ![...state.stage4Locked.values()].includes(driver) && !currentRound.includes(driver));

  function handleDropOnPool(event) {
    event.preventDefault();
    const sourceIdxRaw = event.dataTransfer.getData("text/source-index");
    const sourceIdx = Number(sourceIdxRaw);
    if (Number.isNaN(sourceIdx)) return;
    if (state.stage4Locked.has(sourceIdx)) return;
    currentRound[sourceIdx] = "";
    renderStage4();
  }

  if (!finalBoard) {
    poolDiv.addEventListener("dragover", (event) => event.preventDefault());
    poolDiv.addEventListener("drop", handleDropOnPool);
  }

  getCurrentPoolDrivers().forEach((driver) => {
    const card = createStage4DriverCard(driver, { asButton: true, draggable: !finalBoard });
    if (!finalBoard) {
      card.addEventListener("click", () => fillNext(driver));
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/driver", driver);
        event.dataTransfer.setData("text/source-index", "pool");
      });
    } else {
      card.disabled = true;
    }
    poolDiv.appendChild(card);
  });

  function fillNext(driver) {
    if (!driver) return;
    for (let i = 0; i < 10; i += 1) {
      if (state.stage4Locked.has(i)) continue;
      if (!currentRound[i]) {
        currentRound[i] = driver;
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
      if (idx !== state.stage4Guesses.length - 1) slot.classList.add("history-slot");
      if (idx === state.stage4Guesses.length - 1 && !state.stage4Locked.has(i)) slot.classList.add("current");
      if (!finalBoard && idx === state.stage4Guesses.length - 1 && !state.stage4Locked.has(i)) {
        slot.addEventListener("dragover", (event) => event.preventDefault());
        slot.addEventListener("drop", (event) => {
          event.preventDefault();
          const driver = event.dataTransfer.getData("text/driver");
          const source = event.dataTransfer.getData("text/source-index");
          if (!driver || state.stage4Locked.has(i)) return;

          const sourceIdx = Number(source);
          if (!Number.isNaN(sourceIdx) && sourceIdx !== i && !state.stage4Locked.has(sourceIdx)) {
            const displaced = currentRound[i];
            currentRound[i] = driver;
            currentRound[sourceIdx] = displaced || "";
          } else {
            const existingIdx = currentRound.findIndex((d, idx2) => d === driver && idx2 !== i && !state.stage4Locked.has(idx2));
            if (existingIdx >= 0) {
              const displaced = currentRound[i];
              currentRound[i] = driver;
              currentRound[existingIdx] = displaced || "";
            } else {
              currentRound[i] = driver;
            }
          }
          renderStage4();
        });
      }

      if (guess[i]) {
        const token = createStage4DriverCard(guess[i], {
          draggable: !finalBoard && idx === state.stage4Guesses.length - 1 && !state.stage4Locked.has(i)
        });

        if (token.draggable) {
          token.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/driver", guess[i]);
            event.dataTransfer.setData("text/source-index", String(i));
          });
          token.addEventListener("click", () => {
            currentRound[i] = "";
            renderStage4();
          });
        }
        slot.appendChild(token);
      } else if (!finalBoard && idx === state.stage4Guesses.length - 1 && !state.stage4Locked.has(i)) {
        slot.textContent = "Drop here";
      } else {
        slot.textContent = "";
      }
      col.appendChild(slot);
    }
    board.appendChild(col);
  });

  if (finalBoard) {
    const infoCol = document.createElement("div");
    infoCol.className = "board-col";
    infoCol.innerHTML = "<h5>Session Info</h5>";

    actualOrder.forEach((driver) => {
      const info = getFinalInfoByDriver(driver);
      const slot = document.createElement("div");
      slot.className = "slot result-info-slot";
      slot.innerHTML = `<div><div class="result-info-main">${info}</div></div>`;
      infoCol.appendChild(slot);
    });

    board.appendChild(infoCol);
  }

  if (finalBoard) return;

  const canSubmit = currentRound.every((d, i) => state.stage4Locked.has(i) || d);
  document.getElementById("submitS4").disabled = !canSubmit;

  document.getElementById("submitS4").addEventListener("click", () => {
    const actual = actualOrder;
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

    state.stage4Guesses.push(Array(10).fill(""));
    renderGame();
  });
}

function renderFinish() {
  renderStage4({ finalBoard: true });

  const overlay = document.createElement("div");
  overlay.className = "finish-overlay";
  overlay.innerHTML = `
    <div class="finish-modal" role="dialog" aria-modal="true" aria-labelledby="finishTitle">
      <h2 id="finishTitle">🏁 Finished</h2>
      <p>Congratulations ${state.player} — you scored <strong>${state.score}</strong> points.</p>
      <p>Total submissions: <strong>${state.submissions}</strong>. Perfect game is 3 submissions for 100 points.</p>
      <div class="finish-actions">
        <button id="dismissFinish">View Final Board</button>
        <button id="playAgain">Play Another Session</button>
      </div>
    </div>
  `;
  gamePanel.appendChild(overlay);

  document.getElementById("dismissFinish").addEventListener("click", () => {
    overlay.remove();
  });
  document.getElementById("playAgain").addEventListener("click", () => location.reload());
}

setupFlow();
