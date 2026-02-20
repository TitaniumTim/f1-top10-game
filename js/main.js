const backend = "https://f1-backend-78sj.onrender.com";

// DOM elements
const yearSelect = document.getElementById("year");
const roundSelect = document.getElementById("round");
const sessionSelect = document.getElementById("session");
const stageStatus = document.getElementById("stage-status");
const guessInputs = document.getElementById("guess-inputs");
const submitBtn = document.getElementById("submit-guess");
const feedbackDiv = document.getElementById("feedback");

let currentResults = [];
let stage = 1;
const maxStages = 4;

// -------------------- Utility --------------------
async function fetchData(url, cacheKey) {
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch (err) {
    console.error(err);
    return null;
  }
}

// -------------------- Populate dropdowns --------------------
const years = [2023, 2024, 2025, 2026];
years.forEach(y => {
  const opt = document.createElement("option");
  opt.value = y;
  opt.textContent = y;
  yearSelect.appendChild(opt);
});
yearSelect.value = 2024;

async function updateRounds() {
  roundSelect.innerHTML = "";
  sessionSelect.innerHTML = "";
  stageStatus.textContent = "Select session to start.";
  feedbackDiv.innerHTML = "";
  guessInputs.innerHTML = "";
  submitBtn.disabled = true;

  const year = yearSelect.value;
  const rounds = await fetchData(`${backend}/rounds?year=${year}`, `rounds-${year}`);
  if (!rounds) return;

  rounds.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.round;
    opt.textContent = r.round_name;
    roundSelect.appendChild(opt);
  });
  updateSessions();
}

async function updateSessions() {
  sessionSelect.innerHTML = "";
  stageStatus.textContent = "Select session to start.";
  feedbackDiv.innerHTML = "";
  guessInputs.innerHTML = "";
  submitBtn.disabled = true;

  const year = yearSelect.value;
  const round = roundSelect.value;
  const sessions = await fetchData(`${backend}/sessions?year=${year}&round=${round}`, `sessions-${year}-${round}`);
  if (!sessions) return;

  sessions.forEach(s => {
    if (s.session_name && s.session_name !== "None") {
      const opt = document.createElement("option");
      opt.value = s.session_name;
      opt.textContent = s.session_name;
      sessionSelect.appendChild(opt);
    }
  });
  if (sessionSelect.options.length > 0) sessionSelect.value = sessionSelect.options[0].value;
}

// -------------------- Fetch session results --------------------
async function fetchSessionResults() {
  const year = yearSelect.value;
  const round = roundSelect.value;
  const session = sessionSelect.value;
  const results = await fetchData(
    `${backend}/session_results?year=${year}&round=${round}&session=${encodeURIComponent(session)}`,
    `results-${year}-${round}-${session}`
  );
  if (!results) return [];
  // store only top 5 for game
  return results.slice(0, 5).map(r => r.driver);
}

// -------------------- Game logic --------------------
function renderGuessInputs() {
  guessInputs.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Driver #${i + 1}`;
    input.dataset.index = i;
    guessInputs.appendChild(input);
  }
}

function checkGuess() {
  const inputs = Array.from(guessInputs.querySelectorAll("input")).map(i => i.value.trim());
  let correctPositions = 0;
  let correctDrivers = 0;

  inputs.forEach((driver, i) => {
    if (driver === currentResults[i]) correctPositions++;
    else if (currentResults.includes(driver)) correctDrivers++;
  });

  return { correctPositions, correctDrivers };
}

function nextStage() {
  stage++;
  if (stage > maxStages) {
    stageStatus.textContent = "Game complete!";
    submitBtn.disabled = true;
    return;
  }
  stageStatus.textContent = `Stage ${stage} of ${maxStages}`;
  guessInputs.querySelectorAll("input").forEach(i => (i.value = ""));
  feedbackDiv.innerHTML = "";
}

// -------------------- Event listeners --------------------
yearSelect.addEventListener("change", updateRounds);
roundSelect.addEventListener("change", updateSessions);

sessionSelect.addEventListener("change", async () => {
  currentResults = await fetchSessionResults();
  if (!currentResults || currentResults.length === 0) {
    stageStatus.textContent = "No results available for this session.";
    submitBtn.disabled = true;
    return;
  }
  stage = 1;
  stageStatus.textContent = `Stage ${stage} of ${maxStages}`;
  renderGuessInputs();
  submitBtn.disabled = false;
});

submitBtn.addEventListener("click", () => {
  const { correctPositions, correctDrivers } = checkGuess();
  feedbackDiv.innerHTML = `Correct positions: ${correctPositions}, Correct drivers (wrong position): ${correctDrivers}`;
  nextStage();
});

// -------------------- Initial load --------------------
updateRounds();
