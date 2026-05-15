const HORSE_CSV_PATH = "./horses_g1_multi_starter.csv";
const QUESTION_JSON_PATH = "./questions_g1_starter.json";
const MAX_QUESTIONS = 10;

let horses = [];
let questions = [];
let secretHorse = null;
let currentCategory = "";
let showAllQuestions = false;
let history = [];

const elements = {
  loadPanel: document.getElementById("loadPanel"),
  loadStatus: document.getElementById("loadStatus"),
  horseFileInput: document.getElementById("horseFileInput"),
  questionFileInput: document.getElementById("questionFileInput"),
  dataCount: document.getElementById("dataCount"),
  era: document.getElementById("era"),
  sex: document.getElementById("sex"),
  questionCount: document.getElementById("questionCount"),
  answer: document.getElementById("answer"),
  categoryTabs: document.getElementById("categoryTabs"),
  questionButtons: document.getElementById("questionButtons"),
  history: document.getElementById("history"),
  guessInput: document.getElementById("guessInput"),
  result: document.getElementById("result"),
  answerDetail: document.getElementById("answerDetail"),
  detailName: document.getElementById("detailName"),
  detailG1Wins: document.getElementById("detailG1Wins"),
  detailJraWins: document.getElementById("detailJraWins"),
  detailOverseasWins: document.getElementById("detailOverseasWins"),
  detailNotes: document.getElementById("detailNotes")
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(value => value.trim() !== "")) rows.push(row);
  }

  const headers = rows.shift().map(header => header.trim());

  return rows.map(values => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = normalizeValue(values[index] ?? "");
    });
    return object;
  });
}

function normalizeValue(value) {
  const trimmed = String(value).trim();
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

async function loadDefaultData() {
  try {
    const [horseResponse, questionResponse] = await Promise.all([
      fetch(HORSE_CSV_PATH),
      fetch(QUESTION_JSON_PATH)
    ]);

    if (!horseResponse.ok || !questionResponse.ok) {
      throw new Error("データファイルを取得できませんでした。");
    }

    const csvText = await horseResponse.text();
    const questionText = await questionResponse.text();
    horses = parseCsv(csvText).filter(horse => horse.name && Number(horse.g1_wins_total) >= 2);
    questions = JSON.parse(questionText);
    afterDataLoaded();
  } catch (error) {
    elements.loadPanel.classList.remove("hidden");
    elements.loadStatus.textContent = "自動読み込みできませんでした。CSVとJSONを手動で選択してください。";
    elements.dataCount.textContent = "未読み込み";
    disableGameControls(true);
  }
}

function disableGameControls(disabled) {
  document.getElementById("newGameButton").disabled = disabled;
  document.getElementById("giveUpButton").disabled = disabled;
  document.getElementById("guessButton").disabled = disabled;
  document.getElementById("showAllButton").disabled = disabled;
}

function afterDataLoaded() {
  if (!horses.length || !questions.length) {
    elements.loadStatus.textContent = "馬データまたは質問データが空です。";
    return;
  }

  disableGameControls(false);
  elements.loadPanel.classList.add("hidden");
  elements.dataCount.textContent = `${horses.length}頭 / ${questions.length}問`;
  currentCategory = getCategories()[0] ?? "";
  startGame();
}

function getCategories() {
  return [...new Set(questions.map(question => question.category || "その他"))];
}

function startGame() {
  if (!horses.length) return;

  const randomIndex = Math.floor(Math.random() * horses.length);
  secretHorse = horses[randomIndex];
  history = [];
  showAllQuestions = false;

  elements.era.textContent = secretHorse.era || "---";
  elements.sex.textContent = secretHorse.sex || "---";
  elements.questionCount.textContent = `0 / ${MAX_QUESTIONS}`;
  setAnswer("まだ質問していません。", "");
  elements.result.textContent = "";
  elements.result.className = "result-text";
  elements.guessInput.value = "";
  elements.answerDetail.classList.add("hidden");

  renderCategories();
  renderQuestions();
  renderHistory();
}

function renderCategories() {
  const categories = getCategories();
  elements.categoryTabs.innerHTML = "";

  categories.forEach(category => {
    const button = document.createElement("button");
    button.textContent = category;
    button.className = `tab-button ${category === currentCategory ? "active" : ""}`;
    button.addEventListener("click", () => {
      currentCategory = category;
      showAllQuestions = false;
      renderCategories();
      renderQuestions();
    });
    elements.categoryTabs.appendChild(button);
  });
}

function renderQuestions() {
  elements.questionButtons.innerHTML = "";

  const visibleQuestions = showAllQuestions
    ? questions
    : questions.filter(question => (question.category || "その他") === currentCategory);

  visibleQuestions.forEach(question => {
    const button = document.createElement("button");
    const past = history.find(item => item.id === question.id);
    button.textContent = past ? `${question.text} → ${past.answer}` : question.text;
    button.className = "question-button";

    if (past?.answer === "Yes") button.classList.add("used-yes");
    if (past?.answer === "No") button.classList.add("used-no");

    const isNewQuestion = !past;
    if (history.length >= MAX_QUESTIONS && isNewQuestion) {
      button.disabled = true;
      button.title = "質問は10問までです。馬名を答えるか、降参してください。";
    }

    button.addEventListener("click", () => answerQuestion(question));
    elements.questionButtons.appendChild(button);
  });
}

function answerQuestion(question) {
  if (!secretHorse) return;

  const alreadyAsked = history.some(item => item.id === question.id);
  if (history.length >= MAX_QUESTIONS && !alreadyAsked) {
    setAnswer("質問は10問までです。馬名を答えるか、降参してください。", "unknown");
    return;
  }

  const value = secretHorse[question.id];
  let answerText = "わからない";
  let answerClass = "unknown";

  if (value === true) {
    answerText = "Yes";
    answerClass = "yes";
  } else if (value === false) {
    answerText = "No";
    answerClass = "no";
  }

  setAnswer(answerText, answerClass);

  const existingIndex = history.findIndex(item => item.id === question.id);
  const historyItem = { id: question.id, text: question.text, answer: answerText };
  if (existingIndex >= 0) {
    history[existingIndex] = historyItem;
  } else {
    history.push(historyItem);
  }

  elements.questionCount.textContent = `${history.length} / ${MAX_QUESTIONS}`;
  renderHistory();
  renderQuestions();
}

function setAnswer(text, className) {
  elements.answer.textContent = text;
  elements.answer.className = `answer-text ${className}`.trim();
}

function renderHistory() {
  elements.history.innerHTML = "";

  if (!history.length) {
    const item = document.createElement("li");
    item.textContent = "まだ質問履歴はありません。";
    elements.history.appendChild(item);
    return;
  }

  history.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.text} → ${item.answer}`;
    elements.history.appendChild(li);
  });
}

function normalizeName(name) {
  return String(name)
    .trim()
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .replace(/[・ーｰ]/g, match => match);
}

function guessHorse() {
  if (!secretHorse) return;

  const userGuess = normalizeName(elements.guessInput.value);
  const correctName = normalizeName(secretHorse.name);

  if (!userGuess) {
    elements.result.textContent = "馬名を入力してください。";
    elements.result.className = "result-text wrong";
    return;
  }

  if (userGuess === correctName) {
    elements.result.textContent = `正解です！答えは「${secretHorse.name}」でした。`;
    elements.result.className = "result-text correct";
    showAnswerDetail();
  } else {
    elements.result.textContent = "違います。もう少し質問してみてください。";
    elements.result.className = "result-text wrong";
  }
}

function showAnswerDetail() {
  if (!secretHorse) return;
  elements.detailName.textContent = secretHorse.name || "---";
  elements.detailG1Wins.textContent = `${secretHorse.g1_wins_total ?? "---"}勝`;
  elements.detailJraWins.textContent = secretHorse.jra_flat_g1_win_names || "---";
  elements.detailOverseasWins.textContent = secretHorse.overseas_g1_win_names || "なし";
  elements.detailNotes.textContent = secretHorse.notes || "---";
  elements.answerDetail.classList.remove("hidden");
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

async function handleManualFiles() {
  const horseFile = elements.horseFileInput.files[0];
  const questionFile = elements.questionFileInput.files[0];

  if (!horseFile || !questionFile) {
    elements.loadStatus.textContent = "CSVとJSONの両方を選択してください。";
    return;
  }

  try {
    const [csvText, questionText] = await Promise.all([
      readFileAsText(horseFile),
      readFileAsText(questionFile)
    ]);
    horses = parseCsv(csvText).filter(horse => horse.name && Number(horse.g1_wins_total) >= 2);
    questions = JSON.parse(questionText);
    afterDataLoaded();
  } catch (error) {
    elements.loadStatus.textContent = `読み込みに失敗しました：${error.message}`;
  }
}

document.getElementById("newGameButton").addEventListener("click", startGame);
document.getElementById("giveUpButton").addEventListener("click", () => {
  if (!secretHorse) return;
  setAnswer(`答え：${secretHorse.name}`, "unknown");
  showAnswerDetail();
});
document.getElementById("guessButton").addEventListener("click", guessHorse);
elements.guessInput.addEventListener("keydown", event => {
  if (event.key === "Enter") guessHorse();
});
document.getElementById("clearHistoryButton").addEventListener("click", () => {
  history = [];
  elements.questionCount.textContent = `0 / ${MAX_QUESTIONS}`;
  renderHistory();
  renderQuestions();
});
document.getElementById("showAllButton").addEventListener("click", () => {
  showAllQuestions = !showAllQuestions;
  document.getElementById("showAllButton").textContent = showAllQuestions ? "カテゴリ表示に戻す" : "全質問を表示";
  renderQuestions();
});
elements.horseFileInput.addEventListener("change", handleManualFiles);
elements.questionFileInput.addEventListener("change", handleManualFiles);

disableGameControls(true);
loadDefaultData();
