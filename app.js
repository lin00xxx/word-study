const STORAGE_KEY = "platinum-wordbook-v2";
const THEME_KEY = "wordbook-theme-v1";
const LEGACY_KEYS = ["black-gold-wordbook-v1"];
const DAILY_NEW_LIMIT = 30;
const LONG_PRESS_MS = 720;
const REVIEW_INTERVALS = [1, 2, 4, 7, 15];
const SCHEDULE_COLUMNS = [
  { label: "First", offset: 0 },
  { label: "Day1", offset: 1 },
  { label: "Day2", offset: 2 },
  { label: "Day4", offset: 4 },
  { label: "Day7", offset: 7 },
  { label: "Day15", offset: 15 }
];

const state = {
  words: [],
  visibleIds: [],
  screen: "import",
  mode: "browse",
  filter: "none",
  theme: "light",
  hiddenIds: new Set(),
  resultById: new Map(),
  draftById: new Map(),
  taskMetaById: new Map()
};

const els = {};
let longPressTimer = null;
let longPressTargetId = null;
let longPressTriggered = false;

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  loadTheme();
  loadWords();
  bindEvents();
  render();
  initIcons();
});

window.addEventListener("load", initIcons);

function cacheElements() {
  els.input = document.querySelector("#wordInput");
  els.fileInput = document.querySelector("#fileInput");
  els.importBtn = document.querySelector("#importBtn");
  els.todayBtn = document.querySelector("#todayBtn");
  els.planBtn = document.querySelector("#planBtn");
  els.themeBtn = document.querySelector("#themeBtn");
  els.taskDictationBtn = document.querySelector("#taskDictationBtn");
  els.taskPanel = document.querySelector("#taskPanel");
  els.taskGroups = document.querySelector("#taskGroups");
  els.taskSummary = document.querySelector("#taskSummary");
  els.planModal = document.querySelector("#planModal");
  els.closePlanBtn = document.querySelector("#closePlanBtn");
  els.scheduleBody = document.querySelector("#scheduleBody");
  els.batchList = document.querySelector("#batchList");
  els.modalTotalCount = document.querySelector("#modalTotalCount");
  els.modalBatchCount = document.querySelector("#modalBatchCount");
  els.modalEndDate = document.querySelector("#modalEndDate");
  els.modalRemainingCount = document.querySelector("#modalRemainingCount");
  els.wordListSummary = document.querySelector("#wordListSummary");
  els.totalCount = document.querySelector("#totalCount");
  els.todayCount = document.querySelector("#todayCount");
  els.doneCount = document.querySelector("#doneCount");
  els.dueCount = document.querySelector("#dueCount");
  els.modeLabel = document.querySelector("#modeLabel");
  els.statusText = document.querySelector("#statusText");
}

function bindEvents() {
  els.importBtn.addEventListener("click", () => importWordsFromText(els.input.value, "粘贴内容"));
  els.fileInput.addEventListener("change", importWordsFromFile);
  els.todayBtn.addEventListener("click", () => loadTodayTasks(true));
  els.planBtn.addEventListener("click", openPlanModal);
  els.themeBtn.addEventListener("click", toggleTheme);
  els.taskDictationBtn.addEventListener("click", startDictation);
  els.closePlanBtn.addEventListener("click", closePlanModal);
  els.planModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-plan]")) closePlanModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePlanModal();
  });

  document.addEventListener("input", (event) => {
    const input = event.target.closest(".answer-input");
    if (!input) return;
    state.draftById.set(input.dataset.id, input.value);
  });

  document.addEventListener("keydown", (event) => {
    const input = event.target.closest(".answer-input");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    submitAnswer(input);
  });

  document.addEventListener("click", (event) => {
    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggered = false;
      return;
    }

    const checkButton = event.target.closest("[data-check-answer]");
    if (checkButton) {
      const input = document.querySelector(`.answer-input[data-id="${cssEscape(checkButton.dataset.checkAnswer)}"]`);
      if (input) submitAnswer(input);
      return;
    }

    const speakTarget = event.target.closest("[data-speak-word]");
    if (!speakTarget || event.target.closest("input, textarea, [data-check-answer]")) return;
    const word = findWord(speakTarget.dataset.speakWord);
    if (word) speak(word.english);
  });

  document.addEventListener("pointerdown", startLongPress);
  document.addEventListener("pointerup", clearLongPress);
  document.addEventListener("pointercancel", clearLongPress);
  document.addEventListener("pointerleave", clearLongPress);
}

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function loadTheme() {
  state.theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  applyTheme();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle("dark-theme", state.theme === "dark");
  if (!els.themeBtn) return;
  els.themeBtn.setAttribute("aria-pressed", state.theme === "dark" ? "true" : "false");
  els.themeBtn.querySelector("span").textContent = state.theme === "dark" ? "白天模式" : "夜间模式";
  const icon = els.themeBtn.querySelector("[data-lucide]");
  if (icon) {
    icon.setAttribute("data-lucide", state.theme === "dark" ? "sun" : "moon");
    initIcons();
  }
}

function loadWords() {
  const saved = readStoredWords(STORAGE_KEY) || LEGACY_KEYS.map(readStoredWords).find(Boolean);
  state.words = Array.isArray(saved) ? saved.map(normalizeWordRecord).filter((word) => word.english && word.meaning) : [];
  saveWords();
}

function readStoredWords(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

function normalizeWordRecord(word) {
  return {
    id: word.id || makeId(),
    english: String(word.english || "").trim(),
    meaning: String(word.meaning || "").trim(),
    stage: Number(word.stage || 0),
    nextDueDate: word.nextDueDate || null,
    lastReviewedDate: word.lastReviewedDate || null,
    planDate: word.planDate || null,
    reviewPlanDate: word.reviewPlanDate || null,
    completedDate: word.completedDate || null,
    reviewLog: Array.isArray(word.reviewLog) ? word.reviewLog : [],
    correctCount: Number(word.correctCount || 0),
    wrongCount: Number(word.wrongCount || 0),
    createdAt: word.createdAt || new Date().toISOString()
  };
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.words));
}

function createWord(english, meaning) {
  return {
    id: makeId(),
    english,
    meaning,
    stage: 0,
    nextDueDate: null,
    lastReviewedDate: null,
    planDate: null,
    reviewPlanDate: null,
    completedDate: null,
    reviewLog: [],
    correctCount: 0,
    wrongCount: 0,
    createdAt: new Date().toISOString()
  };
}

function makeId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function importWordsFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    importWordsFromText(text, file.name);
  } catch {
    setStatus("文件读取失败，请换成 txt 或 csv 文件");
  } finally {
    event.target.value = "";
  }
}

function importWordsFromText(text, sourceName) {
  const parsed = parseWordText(text);
  if (parsed.length === 0) {
    setStatus("没有识别到词表。格式建议：英文 中文释义");
    return;
  }

  let added = 0;
  let updated = 0;
  const index = new Map(state.words.map((word) => [normalizeAnswer(word.english), word]));

  parsed.forEach(({ english, meaning }) => {
    const key = normalizeAnswer(english);
    const existing = index.get(key);
    if (existing) {
      existing.english = english;
      existing.meaning = meaning;
      updated += 1;
      return;
    }

    const word = createWord(english, meaning);
    state.words.push(word);
    index.set(key, word);
    added += 1;
  });

  saveWords();
  els.input.value = "";
  setStatus(`已从${sourceName}导入 ${added} 个，更新 ${updated} 个。点击“加载今日任务”开始。`);
  if (state.screen === "tasks") {
    loadTodayTasks(false);
    return;
  }
  render();
}

function parseWordText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean);
}

function parseLine(line) {
  const csvParts = splitCsvLine(line);
  if (csvParts.length >= 2 && looksLikeEnglish(csvParts[0])) {
    return {
      english: csvParts[0].trim(),
      meaning: csvParts.slice(1).join(" ").trim()
    };
  }

  const tabParts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 2 && looksLikeEnglish(tabParts[0])) {
    return {
      english: tabParts[0],
      meaning: tabParts.slice(1).join(" ")
    };
  }

  const match = line.match(/^([A-Za-z][A-Za-z'’.-]*)\s+(.+)$/u);
  if (!match) return null;

  return {
    english: match[1].trim(),
    meaning: match[2].trim()
  };
}

function splitCsvLine(line) {
  const normalized = line.replaceAll("，", ",");
  const result = [];
  let current = "";
  let quoted = false;

  for (const char of normalized) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result.filter(Boolean);
}

function looksLikeEnglish(value) {
  return /^[A-Za-z][A-Za-z'’.-]*$/.test(value.trim());
}

function loadTodayTasks(showMessage) {
  const today = todayString();
  assignDailyNewWords(today);
  assignDailyReviewWords(today);
  const batchInfoById = getWordBatchInfoMap(today);
  const todayWords = getTodayWords(today);

  state.visibleIds = todayWords.map((word) => word.id);
  state.taskMetaById = new Map(todayWords.map((word) => [word.id, buildTaskMeta(word, today, batchInfoById.get(word.id))]));
  state.screen = "tasks";
  state.filter = "today";
  state.mode = "browse";
  state.hiddenIds.clear();
  state.resultById.clear();
  state.draftById.clear();
  saveWords();

  if (showMessage) {
    const stats = getPlanStats(today);
    setStatus(`今日任务：${stats.newWords} 个新学，${stats.reviewWords} 个复习。`);
  }

  render();
}

function assignDailyNewWords(today) {
  const alreadyAssignedCount = state.words.filter((word) => word.planDate === today).length;
  const slots = Math.max(0, DAILY_NEW_LIMIT - alreadyAssignedCount);
  if (slots === 0) return;

  getOrderedWords()
    .filter((word) => !word.planDate && !word.lastReviewedDate)
    .slice(0, slots)
    .forEach((word) => {
      word.planDate = today;
    });
}

function assignDailyReviewWords(today) {
  state.words
    .filter((word) => word.lastReviewedDate && word.nextDueDate && word.nextDueDate <= today)
    .forEach((word) => {
      word.reviewPlanDate = today;
    });
}

function getTodayWords(today) {
  return state.words
    .filter((word) => isInTodayPlan(word, today))
    .sort((a, b) => {
      const aMeta = state.taskMetaById.get(a.id);
      const bMeta = state.taskMetaById.get(b.id);
      if (aMeta && bMeta && aMeta.sortKey !== bMeta.sortKey) return aMeta.sortKey.localeCompare(bMeta.sortKey);
      const aDone = a.completedDate === today ? 1 : 0;
      const bDone = b.completedDate === today ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

function isInTodayPlan(word, today) {
  return word.planDate === today || word.reviewPlanDate === today;
}

function startDictation() {
  if (state.screen !== "tasks" || state.visibleIds.length === 0) {
    loadTodayTasks(false);
  }

  if (state.visibleIds.length === 0) {
    setStatus("今天暂时没有可默写的单词");
    render();
    return;
  }

  const pendingIds = state.visibleIds.filter((id) => {
    const word = findWord(id);
    return word && word.lastReviewedDate !== todayString();
  });

  state.mode = "dictation";
  state.visibleIds = shuffle([...pendingIds, ...state.visibleIds.filter((id) => !pendingIds.includes(id))]);
  state.hiddenIds = new Set(pendingIds);
  state.resultById.clear();
  state.draftById.clear();
  render();
  setStatus("已进入默写：在英文位置书写，回车或点审查。");
  focusFirstAnswer();
}

function submitAnswer(input) {
  const id = input.dataset.id;
  const word = findWord(id);
  if (!word) return;

  const isCorrect = normalizeAnswer(input.value) === normalizeAnswer(word.english);
  const today = todayString();

  if (isCorrect) {
    const nextStage = Math.min((word.stage || 0) + 1, REVIEW_INTERVALS.length);
    const interval = REVIEW_INTERVALS[nextStage - 1];
    word.stage = nextStage;
    word.lastReviewedDate = today;
    word.completedDate = today;
    word.nextDueDate = addDaysString(interval);
    word.correctCount = (word.correctCount || 0) + 1;
    word.reviewLog = Array.isArray(word.reviewLog) ? word.reviewLog : [];
    word.reviewLog.push({ date: today, cycle: nextStage });
    state.hiddenIds.delete(id);
    state.resultById.set(id, "correct");
    state.draftById.delete(id);
    saveWords();
    render();
    speak(word.english);
    setStatus(`${word.english} 正确，下次 ${formatDue(word.nextDueDate)} 复习`);
    focusNextAnswer(id);
    return;
  }

  word.stage = 0;
  word.lastReviewedDate = today;
  word.completedDate = null;
  word.nextDueDate = addDaysString(1);
  word.wrongCount = (word.wrongCount || 0) + 1;
  state.hiddenIds.add(id);
  state.resultById.set(id, "wrong");
  saveWords();
  render();
  setStatus(`${word.english} 未通过，已安排明天重新复习`);

  const refreshedInput = document.querySelector(`.answer-input[data-id="${cssEscape(id)}"]`);
  if (refreshedInput) {
    refreshedInput.focus();
    refreshedInput.select();
  }
}

function render() {
  const today = todayString();
  const visibleWords = getVisibleWords();
  const plan = getPlanStats(today);

  els.totalCount.textContent = `${state.words.length} 词`;
  els.todayCount.textContent = `今日 ${plan.total}`;
  els.doneCount.textContent = `已完成 ${plan.completed}`;
  els.dueCount.textContent = `待复习 ${countDueReview(today)}`;
  els.modeLabel.textContent = state.mode === "dictation" ? "默写模式" : state.screen === "tasks" ? "今日任务" : "导入词表";
  els.taskPanel.hidden = state.screen !== "tasks";
  els.taskDictationBtn.disabled = visibleWords.length === 0;
  els.taskSummary.textContent = buildTaskSummary(plan);

  if (state.screen === "tasks") {
    renderTaskGroups(visibleWords, today);
  }

  renderPlanModal();
  initIcons();
}

function getVisibleWords() {
  const wordsById = new Map(state.words.map((word) => [word.id, word]));
  return state.visibleIds.map((id) => wordsById.get(id)).filter(Boolean);
}

function renderTaskGroups(words, today) {
  if (words.length === 0) {
    els.taskGroups.innerHTML = `<div class="empty-state">今天没有安排内容。导入更多单词后，系统会自动分配每天 ${DAILY_NEW_LIMIT} 个新词。</div>`;
    return;
  }

  els.taskGroups.innerHTML = getTaskGroups(words, today).map(renderTaskGroup).join("");
}

function getTaskGroups(words, today) {
  const batchInfoById = getWordBatchInfoMap(today);
  const groups = new Map();

  words.forEach((word) => {
    const meta = state.taskMetaById.get(word.id) || buildTaskMeta(word, today, batchInfoById.get(word.id));
    const key = `${meta.batchNo}-${meta.column}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        batchNo: meta.batchNo,
        column: meta.column,
        title: meta.title,
        dateText: meta.dateText,
        words: []
      });
    }
    groups.get(key).words.push(word);
  });

  return [...groups.values()].sort((a, b) => {
    if (a.dateText !== b.dateText) return a.dateText.localeCompare(b.dateText);
    if (a.batchNo !== b.batchNo) return a.batchNo - b.batchNo;
    return columnOrder(a.column) - columnOrder(b.column);
  });
}

function renderTaskGroup(group) {
  return `
    <article class="task-card">
      <header class="task-card-head">
        <div>
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(group.dateText)} · ${group.words.length} 个词</p>
        </div>
        <span class="task-badge">第 ${group.batchNo} 批</span>
      </header>
      <table class="word-table task-table">
        <colgroup>
          <col class="english-col" />
          <col class="meaning-col" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">英文单词</th>
            <th scope="col">中文释义</th>
          </tr>
        </thead>
        <tbody>
          ${group.words.map(renderRow).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderRow(word) {
  const today = todayString();
  const hidden = state.mode === "dictation" && state.hiddenIds.has(word.id);
  const result = state.resultById.get(word.id) || "";
  const draft = state.draftById.get(word.id) || "";
  const completed = word.completedDate === today;
  const inputClass = `answer-input ${result ? `is-${result}` : ""}`.trim();

  return `
    <tr class="word-row ${completed ? "is-completed" : ""}" data-word-id="${escapeHtml(word.id)}" data-speak-word="${escapeHtml(word.id)}">
      <td>
        <div class="word-block">
          ${renderEnglishArea(word, hidden, draft, inputClass)}
        </div>
      </td>
      <td>
        <div class="meaning-cell">
          <div class="meaning-text">${escapeHtml(word.meaning)}</div>
          <div class="review-meta">
            <span class="review-chip">${wordTypeLabel(word, today)}</span>
            <span class="review-chip">${stageLabel(word)}</span>
            <span class="review-chip">${dueLabel(word)}</span>
            <span class="review-chip">长按删除</span>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderEnglishArea(word, hidden, draft, inputClass) {
  if (hidden) {
    return `
      <div class="answer-row">
        <input
          class="${inputClass}"
          data-id="${escapeHtml(word.id)}"
          value="${escapeHtml(draft)}"
          placeholder="在这里默写英文"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          aria-label="默写 ${escapeHtml(word.meaning)} 的英文"
        />
        <button class="check-answer-btn" type="button" data-check-answer="${escapeHtml(word.id)}">
          <i data-lucide="check" aria-hidden="true"></i>
          <span>审查</span>
        </button>
      </div>
    `;
  }

  return `
    <div class="word-button">
      <span>${escapeHtml(word.english)}</span>
      <i data-lucide="volume-2" aria-hidden="true"></i>
    </div>
  `;
}

function buildTaskMeta(word, today, batchInfo) {
  const info = batchInfo || { batchNo: 1, firstDate: parseDate(word.planDate || today) };
  if (word.planDate === today) {
    return {
      batchNo: info.batchNo,
      column: "First",
      title: `第 ${info.batchNo} 批 · 新学 First`,
      dateText: formatDateDot(parseDate(today)),
      sortKey: `${today}-00-${String(info.batchNo).padStart(4, "0")}`
    };
  }

  const column = reviewColumnForStage(word.stage);
  return {
    batchNo: info.batchNo,
    column,
    title: `第 ${info.batchNo} 批 · 复习 ${column}`,
    dateText: formatDateDot(parseDate(today)),
    sortKey: `${today}-${String(columnOrder(column)).padStart(2, "0")}-${String(info.batchNo).padStart(4, "0")}`
  };
}

function reviewColumnForStage(stage) {
  const index = Math.max(1, Math.min(Number(stage || 1), SCHEDULE_COLUMNS.length - 1));
  return SCHEDULE_COLUMNS[index].label;
}

function columnOrder(label) {
  const index = SCHEDULE_COLUMNS.findIndex((column) => column.label === label);
  return index === -1 ? 99 : index;
}

function getPlanStats(today) {
  const todayWords = state.screen === "tasks" ? getVisibleWords() : state.words.filter((word) => isInTodayPlan(word, today));
  const completed = todayWords.filter((word) => word.completedDate === today).length;
  const remaining = todayWords.filter((word) => word.lastReviewedDate !== today).length;
  return {
    total: todayWords.length,
    newWords: todayWords.filter((word) => word.planDate === today).length,
    reviewWords: todayWords.filter((word) => word.reviewPlanDate === today).length,
    completed,
    remaining
  };
}

function buildTaskSummary(plan) {
  if (plan.total === 0) return "今天没有到期任务";
  return `今天 ${plan.total} 个：新学 ${plan.newWords} 个，复习 ${plan.reviewWords} 个，剩余 ${plan.remaining} 个`;
}

function countDueReview(today) {
  return state.words.filter((word) => word.lastReviewedDate !== today && (word.reviewPlanDate === today || (word.lastReviewedDate && word.nextDueDate && word.nextDueDate <= today))).length;
}

function wordTypeLabel(word, today) {
  const meta = state.taskMetaById.get(word.id);
  if (meta?.column === "First") return "新学";
  if (word.completedDate === today) return "今日完成";
  if (word.lastReviewedDate === today && !word.completedDate) return "明日重背";
  if (meta) return meta.column;
  if (!word.lastReviewedDate) return "新词";
  if (word.reviewPlanDate === today || (word.nextDueDate && word.nextDueDate <= today)) return "到期复习";
  return "复习中";
}

function stageLabel(word) {
  const stage = word.stage || 0;
  if (!word.lastReviewedDate) return "阶段 0/5";
  if (stage === 0) return "已重置";
  return `阶段 ${stage}/${REVIEW_INTERVALS.length}`;
}

function dueLabel(word) {
  if (!word.nextDueDate) return "今日";
  if (word.completedDate === todayString()) return `下次 ${formatDue(word.nextDueDate)}`;
  if (word.nextDueDate <= todayString()) return "今日到期";
  return `下次 ${formatDue(word.nextDueDate)}`;
}

function openPlanModal() {
  renderPlanModal();
  els.planModal.classList.add("is-open");
  els.planModal.setAttribute("aria-hidden", "false");
}

function closePlanModal() {
  els.planModal.classList.remove("is-open");
  els.planModal.setAttribute("aria-hidden", "true");
}

function renderPlanModal() {
  const today = todayString();
  const batches = buildScheduleBatches(today);
  const scheduleRows = buildScheduleRows(batches);

  els.modalTotalCount.textContent = `${state.words.length}`;
  els.modalBatchCount.textContent = `${batches.length}`;
  els.modalEndDate.textContent = batches.length ? formatDateDot(batches[batches.length - 1].finalDate) : "--";
  els.modalRemainingCount.textContent = `${countDueReview(today)}`;
  els.wordListSummary.textContent = `共 ${state.words.length} 个词，按每天 ${DAILY_NEW_LIMIT} 个分批`;
  els.scheduleBody.innerHTML = scheduleRows.length ? scheduleRows.map(renderScheduleRow).join("") : renderEmptyScheduleRow();
  els.batchList.innerHTML = batches.length ? batches.map(renderBatchCard).join("") : `<div class="empty-state">暂无词表，先导入文件或粘贴内容。</div>`;
  initIcons();
}

function buildScheduleBatches(today) {
  const orderedWords = getOrderedWords();
  const batches = [];
  const baseDate = parseDate(today);

  for (let index = 0; index < orderedWords.length; index += DAILY_NEW_LIMIT) {
    const chunk = orderedWords.slice(index, index + DAILY_NEW_LIMIT);
    const batchIndex = Math.floor(index / DAILY_NEW_LIMIT);
    const plannedDate = chunk.find((word) => word.planDate)?.planDate;
    const firstDate = plannedDate ? parseDate(plannedDate) : addDays(baseDate, batchIndex);
    const reviewDates = SCHEDULE_COLUMNS.map((column) => ({
      label: column.label,
      date: addDays(firstDate, column.offset)
    }));
    batches.push({
      no: batchIndex + 1,
      firstDate,
      reviewDates,
      words: chunk,
      finalDate: addDays(firstDate, 15)
    });
  }

  return batches;
}

function buildScheduleRows(batches) {
  const rowsByDate = new Map();

  batches.forEach((batch) => {
    batch.reviewDates.forEach((item) => {
      const key = formatDate(item.date);
      if (!rowsByDate.has(key)) {
        rowsByDate.set(key, {
          date: item.date,
          columns: new Map()
        });
      }
      rowsByDate.get(key).columns.set(item.label, batch.no);
    });
  });

  return [...rowsByDate.values()].sort((a, b) => a.date - b.date);
}

function renderScheduleRow(row, index) {
  const cells = SCHEDULE_COLUMNS.map((column) => renderScheduleCell(row.columns.get(column.label))).join("");

  return `
    <tr>
      <td class="schedule-no">${index + 1}</td>
      <td class="schedule-date">${formatDateDot(row.date)}</td>
      ${cells}
    </tr>
  `;
}

function renderScheduleCell(batchNo) {
  if (!batchNo) return `<td><div class="schedule-cell is-empty">/</div></td>`;
  return `<td><div class="schedule-cell"><span class="batch-number">${batchNo}</span></div></td>`;
}

function renderEmptyScheduleRow() {
  return `
    <tr>
      <td colspan="8">
        <div class="empty-state">暂无计划</div>
      </td>
    </tr>
  `;
}

function renderBatchCard(batch) {
  return `
    <article class="batch-card">
      <div class="batch-head">
        <strong>第 ${batch.no} 批</strong>
        <span>${batch.words.length} 个词</span>
      </div>
      <div class="batch-meta">
        <span>First ${formatDateDot(batch.firstDate)}</span>
        <span>结束 ${formatDateDot(batch.finalDate)}</span>
      </div>
      <ol class="batch-words">
        ${batch.words
          .map(
            (word) => `
              <li>
                <button type="button" class="batch-word" data-word-id="${escapeHtml(word.id)}" data-speak-word="${escapeHtml(word.id)}">
                  <span class="batch-en">${escapeHtml(word.english)}</span>
                  <span class="batch-zh">${escapeHtml(word.meaning)}</span>
                  <i data-lucide="volume-2" aria-hidden="true"></i>
                </button>
              </li>
            `
          )
          .join("")}
      </ol>
    </article>
  `;
}

function getWordBatchInfoMap(today) {
  const batches = buildScheduleBatches(today);
  const map = new Map();

  batches.forEach((batch) => {
    batch.words.forEach((word) => {
      map.set(word.id, {
        batchNo: batch.no,
        firstDate: batch.firstDate
      });
    });
  });

  return map;
}

function getOrderedWords() {
  return [...state.words].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function startLongPress(event) {
  const target = event.target.closest("[data-word-id]");
  if (!target || event.target.closest("input, textarea, [data-check-answer]")) return;

  clearLongPress();
  longPressTriggered = false;
  longPressTargetId = target.dataset.wordId;
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true;
    deleteWord(longPressTargetId);
    clearLongPress();
  }, LONG_PRESS_MS);
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
  }
  longPressTimer = null;
  longPressTargetId = null;
}

function deleteWord(id) {
  const word = findWord(id);
  if (!word) return;
  const confirmed = window.confirm(`删除「${word.english}」吗？删除后它不会再出现在复习计划里。`);
  if (!confirmed) return;

  state.words = state.words.filter((item) => item.id !== id);
  state.visibleIds = state.visibleIds.filter((itemId) => itemId !== id);
  state.hiddenIds.delete(id);
  state.resultById.delete(id);
  state.draftById.delete(id);
  state.taskMetaById.delete(id);
  saveWords();
  setStatus(`已删除 ${word.english}`);
  render();
}

function findWord(id) {
  return state.words.find((word) => word.id === id);
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  const voice = pickAmericanVoice();
  if (voice) {
    utterance.voice = voice;
  }
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function pickAmericanVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "en-US" && /samantha|alex|google|microsoft|aria|jenny|guy/i.test(voice.name)) ||
    voices.find((voice) => voice.lang === "en-US") ||
    null
  );
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function normalizeAnswer(value) {
  return value.trim().toLocaleLowerCase("en-US");
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function formatDue(dateString) {
  const [, month, day] = dateString.split("-").map(Number);
  return `${month}月${day}日`;
}

function todayString() {
  return formatDate(new Date());
}

function addDaysString(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDot(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function focusFirstAnswer() {
  window.requestAnimationFrame(() => {
    const first = document.querySelector(".answer-input");
    if (first) first.focus();
  });
}

function focusNextAnswer(currentId) {
  window.requestAnimationFrame(() => {
    const inputs = [...document.querySelectorAll(".answer-input")];
    const currentIndex = inputs.findIndex((input) => input.dataset.id === currentId);
    const next = inputs[currentIndex + 1];
    if (next) next.focus();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}
