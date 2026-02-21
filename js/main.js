const backend = "/api";

const setupPanel = document.getElementById("setup-panel");
const gamePanel = document.getElementById("game-panel");
const playerChip = document.getElementById("player-chip");
const scoreChip = document.getElementById("score-chip");
const submissionsChip = document.getElementById("submissions-chip");

const driverNumbers = {
  "Max Verstappen": 1, "Sergio Perez": 11, "Lewis Hamilton": 44, "George Russell": 63,
  "Charles Leclerc": 16, "Carlos Sainz": 55, "Lando Norris": 4, "Oscar Piastri": 81,
  "Fernando Alonso": 14, "Lance Stroll": 18, "Pierre Gasly": 10, "Esteban Ocon": 31,
  "Alexander Albon": 23, "Logan Sargeant": 2, "Valtteri Bottas": 77, "Guanyu Zhou": 24,
  "Yuki Tsunoda": 22, "Daniel Ricciardo": 3, "Kevin Magnussen": 20, "Nico Hulkenberg": 27
};

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
  stage1Confirmed: new Set(),
  stage1Eliminated: new Set(),
  stage1History: [],
  stage2Resolved: new Map(),
  stage2History: [],
  stage3Resolved: new Map(),
  stage3History: [],
  stage4Locked: new Map(),
  stage4Guesses: []
};

const byTeamName = (a, b) => a.localeCompare(b);
const cache = new Map();

async function fetchData(url, timeoutMs = 45000) {
  if (cache.has(url)) return cache.get(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const data = await res.json();
    cache.set(url, data);
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
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
    <div class="grid-3">
      <div><label for="playerName">Player name</label><input id="playerName" placeholder="e.g. Oliver"/></div>
      <div style="align-self:end;"><button id="loadSessionsBtn">Get Available F1 Sessions</button></div>
    </div>
    <div id="sessionControls" class="grid-3 hidden" style="margin-top:0.75rem;">
      <div><label for="year">Year</label><select id="year"></select></div>
      <div><label for="round">Round</label><select id="round"></select></div>
      <div><label for="session">Session</label><select id="session"></select></div>
    </div>
    <div id="startWrap" class="grid-3 hidden" style="margin-top:0.75rem;">
      <div></div><div></div><div style="align-self:end;"><button id="startBtn" disabled>Start Game</button></div>
    </div>
    <div id="setupSpinner" class="spinner hidden" aria-live="polite" aria-label="Loading"></div>
  `;
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
  const sessionControls = document.getElementById("sessionControls");
  const startWrap = document.getElementById("startWrap");
  const spinner = document.getElementById("setupSpinner");

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
      const yearSel = document.getElementById("year");
      const roundSel = document.getElementById("round");
      const sessionSel = document.getElementById("session");
      const startBtn = document.getElementById("startBtn");

      const updateStartBtnState = () => {
        const ready = Boolean(yearSel.value) && Boolean(roundSel.value) && Boolean(sessionSel.value);
        startBtn.disabled = !ready;
      };

      const years = await fetchData(`${backend}/years`, 60000);
      yearSel.innerHTML = "";
      years.forEach((y) => yearSel.add(new Option(y, y)));

      async function loadRounds() {
        roundSel.innerHTML = "";
        sessionSel.innerHTML = "";
        updateStartBtnState();
        const rounds = await fetchData(`${backend}/rounds?year=${yearSel.value}`, 60000);
        rounds.forEach((r) => roundSel.add(new Option(formatRound(r), r.round)));
        await loadSessions();
      }

      async function loadSessions() {
        sessionSel.innerHTML = "";
        updateStartBtnState();
        const sessions = await fetchData(`${backend}/sessions?year=${yearSel.value}&round=${roundSel.value}`, 60000);
        sessions
          .filter((s) => s.session_name && s.session_name !== "None")
          .forEach((s) => sessionSel.add(new Option(s.session_name, s.session_name)));
        updateStartBtnState();
      }

      yearSel.addEventListener("change", () => loadRounds());
      roundSel.addEventListener("change", () => loadSessions());
      sessionSel.addEventListener("change", () => updateStartBtnState());

      await loadRounds();

      title.textContent = "Pick a Session";
      sessionControls.classList.remove("hidden");
      startWrap.classList.remove("hidden");
      selectorsReady = true;
      status.textContent = "Sessions loaded. Select year, round and session, then tap Start Game.";
      updateStartBtnState();

      startBtn.addEventListener("click", async () => {
        if (!playerInput.value.trim()) return alert("Please enter your name first.");
        state.player = playerInput.value.trim();
        state.year = Number(yearSel.value);
        state.round = Number(roundSel.value);
        state.session = sessionSel.value;

        renderScore();
        status.textContent = "Loading session data… this can take up to 2 minutes on free tier.";
        startBtn.disabled = true;
        showSpinner(true);

        try {
          const results = await fetchData(`${backend}/session_results?year=${state.year}&round=${state.round}&session=${encodeURIComponent(state.session)}`, 120000);

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
          showSpinner(false);
          status.textContent = `Could not load that session yet (${error.message}). Please try another session.`;
          updateStartBtnState();
        }
      });
    } catch (error) {
      status.textContent = `Could not load available sessions (${error.message}). Please try again.`;
      loadSessionsBtn.disabled = false;
    } finally {
      showSpinner(false);
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
  results.forEach((r) => {
    if (!entrantsByTeam.has(r.team)) entrantsByTeam.set(r.team, []);
    entrantsByTeam.get(r.team).push(r.driver);
  });

  entrantsByTeam.forEach((drivers, team) => entrantsByTeam.set(team, [...new Set(drivers)].sort((a, b) => (driverNumbers[a] || 999) - (driverNumbers[b] || 999))));
  state.entrantsByTeam = entrantsByTeam;
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
    card.innerHTML = `<h4>${team}</h4>${drivers.map((d) => `<p>#${driverNumbers[d] || "--"} ${d}</p>`).join("")}`;

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

    if (count === 2) {
      const both = state.top10.filter((r) => r.team === team).map((r) => r.driver);
      both.forEach((d) => state.stage3Resolved.set(`${team}:${d}`, d));
      card.innerHTML = `<h4>${team}</h4><p>Auto: ${both.join(" & ")}</p>`;
    } else {
      card.innerHTML = `<h4>${team}</h4>${drivers
        .map((d, i) => `<label><input type="radio" name="${team}" value="${d}" ${i === 0 ? "checked" : ""}/> #${driverNumbers[d] || "--"} ${d}</label>`)
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
