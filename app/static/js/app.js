const $ = id => document.getElementById(id);

const dom = {
  statTotal: $("stat-total"),
  statCooling: $("stat-cooling"),
  statAvailable: $("stat-available"),
  cooldownDisplay: $("cooldown-display"),
  cooldownValue: $("cooldown-value"),
  clearCooldown: $("clear-cooldown"),
  addStudent: $("add-student"),
  studentList: $("student-list"),
  cooldownList: $("cooldown-list"),
  studentSearch: $("student-search"),
  resultName: $("result-name"),
  resultNote: $("result-note"),
  pickAny: $("pick-any"),
  pickBatch: $("pick-batch"),
  pickGroup: $("pick-group"),
  ignoreCooldown: $("ignore-cooldown"),
  classSwitcher: $("class-switcher"),
  classSwitcherLabel: $("class-switcher-label"),
  contextMenu: $("context-menu"),
  modalRoot: $("modal-root"),
  toast: $("toast"),
  resultCard: document.querySelector(".result-card"),
  historyList: $("history-list"),
  historyGroups: $("history-groups"),
  historyEmpty: document.querySelector("[data-history-empty]"),
};

const STORAGE_MODE = window.__APP_STORAGE_MODE__ || "filesystem";
const USE_BROWSER_STORAGE = STORAGE_MODE === "browser";
const STORAGE_KEY = "pickme::payload";
const DEFAULT_CLASS_NAME = "默认班级";

const state = {
  app: null,
  classes: [],
  classMap: new Map(),
  classData: new Map(),
  currentClassId: "",
  currentClassName: "",
  payload: null,
  students: [],
  studentsMap: new Map(),
  search: "",
  ignoreCooldown: false,
  busy: false,
  isAnimating: false,
  lastSelection: null,
  history: [],
  historyIndex: new Map(),
  historyHighlightId: "",
  contextTarget: null,
  historyStudentId: null,
  classDragSource: null,
};

let toastTimer = null;
let animationInterval = null;
let animationTimeout = null;
let modalPointerDownOnBackdrop = false;
let modalBackdropTeardown = null;

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeShortFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const HISTORY_MENU_ICON =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.25 8a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Zm3.75 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Zm3.75 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" fill="currentColor"/></svg>';

init();

function init() {
  state.ignoreCooldown = dom.ignoreCooldown.checked;
  const initialState = loadInitialState();
  applyAppState(initialState);
  bindEvents();
  render();
}

function loadInitialState() {
  const initial = window.__APP_INITIAL_DATA__ || {};
  if (!USE_BROWSER_STORAGE) {
    return initial;
  }
  const stored = readStoredState();
  if (hasValidStoredState(stored)) {
    return stored;
  }
  if (hasValidStoredState(initial)) {
    persistState(initial);
    return initial;
  }
  return initial;
}

function readStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    console.warn("\u8bfb\u53d6\u6d4f\u89c8\u5668\u5b58\u6863\u5931\u8d25", error);
    return null;
  }
}

function hasValidStoredState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  if (Array.isArray(candidate.classes) && candidate.classes.length > 0) {
    return true;
  }
  const current = candidate.current_class;
  if (
    current &&
    typeof current === "object" &&
    current.payload &&
    typeof current.payload === "object" &&
    Array.isArray(current.payload.students) &&
    current.payload.students.length > 0
  ) {
    return true;
  }
  if (Array.isArray(candidate.students) && candidate.students.length > 0) {
    return true;
  }
  return false;
}

function persistState(appState) {
  if (!USE_BROWSER_STORAGE) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    console.warn("\u5199\u5165\u6d4f\u89c8\u5668\u5b58\u6863\u5931\u8d25", error);
  }
}

function buildPersistableState(normalized) {
  const classesData = {};
  state.classData.forEach((payload, classId) => {
    classesData[classId] = payload;
  });
  const classes = state.classes.map(item => ({
    ...item,
    data: classesData[item.id] || null,
  }));
  return {
    version: normalized.version,
    current_class_id: state.currentClassId,
    current_class: {
      id: state.currentClassId,
      name: state.currentClassName,
      payload: state.payload,
    },
    classes,
    classes_data: classesData,
  };
}

function bindEvents() {
  dom.pickAny.addEventListener("click", () => handleRandom("any"));
  if (dom.pickBatch) {
    dom.pickBatch.addEventListener("click", openBatchModal);
  }
  dom.pickGroup.addEventListener("click", () => handleRandom("group"));
  dom.ignoreCooldown.addEventListener("change", event => {
    state.ignoreCooldown = event.target.checked;
  });
  dom.studentSearch.addEventListener("input", event => {
    const value = event.target.value;
    state.search = value.trim() ? value : "";
    renderLists();
  });
  dom.cooldownDisplay.addEventListener("click", openCooldownModal);
  dom.clearCooldown.addEventListener("click", handleClearCooldown);
  dom.addStudent.addEventListener("click", () => openStudentModal("create"));
  if (dom.classSwitcher) {
    dom.classSwitcher.addEventListener("click", openClassModal);
  }
  dom.studentList.addEventListener("contextmenu", handleContextTrigger);
  dom.cooldownList.addEventListener("contextmenu", handleContextTrigger);
  if (dom.historyList) {
    dom.historyList.addEventListener("contextmenu", handleHistoryContextTrigger);
    dom.historyList.addEventListener("click", handleHistoryClick);
    dom.historyList.addEventListener("scroll", closeContextMenu);
  }
  document.addEventListener("click", handleGlobalClick);
  window.addEventListener("resize", closeContextMenu);
  dom.contextMenu.addEventListener("click", handleContextSelection);
  dom.studentList.addEventListener("scroll", closeContextMenu);
  dom.cooldownList.addEventListener("scroll", closeContextMenu);
  window.addEventListener("keydown", handleKeydown);
}

function applyAppState(rawState) {
  const normalized = normalizeAppState(rawState);
  if (!(state.classData instanceof Map)) {
    state.classData = new Map();
  }
  state.classes = normalized.classes;
  state.classMap = new Map(
    state.classes.map(item => [item.id, item])
  );
  state.currentClassId =
    normalized.current_class_id ||
    (state.classes.length ? state.classes[0].id : "");
  const currentMeta =
    state.classMap.get(state.currentClassId) ||
    state.classes.find(item => item.id === state.currentClassId) ||
    null;
  state.currentClassName = currentMeta ? currentMeta.name : DEFAULT_CLASS_NAME;
  const classesData = normalized.classes_data || {};
  Object.entries(classesData).forEach(([classId, payload]) => {
    if (payload && typeof payload === "object") {
      state.classData.set(classId, normalizePayload(payload));
    }
  });
  const rawCurrent =
    normalized.current_class && typeof normalized.current_class === "object"
      ? normalized.current_class
      : {};
  let payloadSource = rawCurrent.payload;
  if (!payloadSource && state.classData.has(state.currentClassId)) {
    payloadSource = state.classData.get(state.currentClassId);
  }
  state.payload = normalizePayload(payloadSource || {});
  state.classData.set(state.currentClassId, state.payload);
  if (currentMeta) {
    currentMeta.student_count = state.payload.students.length;
    currentMeta.cooldown_days = state.payload.cooldown_days;
  }
  state.studentsMap = new Map(
    state.payload.students.map(student => [student.id, student])
  );
  state.students = getSortedStudents(state.payload.students);
  const historyData = state.payload.history || { entries: [] };
  state.history = Array.isArray(historyData.entries) ? historyData.entries : [];
  state.historyIndex = new Map(
    state.history.map(entry => [entry.id, entry])
  );
  syncSelection();
  const persistable = buildPersistableState(normalized);
  state.app = persistable;
  persistState(persistable);
  renderClassSwitcher();
  updateClassModal();
}

function render() {
  renderStats();
  renderLists();
  renderHistory();
  renderSelection();
  dom.ignoreCooldown.checked = state.ignoreCooldown;
  renderClassSwitcher();
  updateControls();
  if (state.historyStudentId) {
    updateHistoryModal(state.historyStudentId);
  }
}

function renderClassSwitcher() {
  if (!dom.classSwitcherLabel) {
    return;
  }
  const name = state.currentClassName || "默认班级";
  dom.classSwitcherLabel.textContent = name;
  if (dom.classSwitcher) {
    dom.classSwitcher.dataset.classId = state.currentClassId || "";
    dom.classSwitcher.title = `${name} · ${state.payload.students.length} 人`;
  }
}

function renderStats() {
  dom.cooldownValue.textContent = state.payload.cooldown_days;
  const total = state.payload.students.length;
  let cooling = 0;
  for (const student of state.payload.students) {
    if (student.is_cooling) {
      cooling += 1;
    }
  }
  dom.statTotal.textContent = total;
  dom.statCooling.textContent = cooling;
  dom.statAvailable.textContent = total - cooling;
}

function renderLists() {
  dom.studentSearch.value = state.search;
  const keyword = state.search.trim();
  const base = state.students;
  const filtered = keyword
    ? base.filter(student => matchesKeyword(student, keyword))
    : base;
  dom.studentList.innerHTML = filtered.length
    ? filtered.map(renderStudentItem).join("")
    : '<li class="empty-message">\u672a\u627e\u5230\u5339\u914d\u7684\u5b66\u751f</li>';
  const coolingStudents = base.filter(student => student.is_cooling);
  dom.cooldownList.innerHTML = coolingStudents.length
    ? coolingStudents.map(renderCooldownItem).join("")
    : '<li class="empty-message">\u5f53\u524d\u6ca1\u6709\u5b66\u751f\u5904\u4e8e\u51b7\u5374</li>';
}

function renderHistory() {
  if (!dom.historyList || !dom.historyGroups) {
    return;
  }
  const entries = Array.isArray(state.history) ? state.history : [];
  if (!entries.length) {
    dom.historyGroups.innerHTML = "";
    if (dom.historyEmpty) {
      dom.historyEmpty.classList.remove("d-none");
    }
    return;
  }
  if (dom.historyEmpty) {
    dom.historyEmpty.classList.add("d-none");
  }
  const groups = buildHistoryGroups(entries);
  dom.historyGroups.innerHTML = groups.map(renderHistoryGroup).join("");
  requestAnimationFrame(() => {
    highlightHistoryEntry();
  });
}

function buildHistoryGroups(entries) {
  const sorted = entries.slice().sort((a, b) => b.timestamp - a.timestamp);
  const dayMap = new Map();
  for (const entry of sorted) {
    const dayKey = buildHistoryDayKey(entry.timestamp);
    let group = dayMap.get(dayKey);
    if (!group) {
      group = {
        key: dayKey,
        label: formatHistoryDayLabel(entry.timestamp),
        order: entry.timestamp,
        subgroups: new Map(),
      };
      dayMap.set(dayKey, group);
    }
    const period = resolveHistoryPeriod(entry.timestamp);
    let bucket = group.subgroups.get(period.key);
    if (!bucket) {
      bucket = { key: period.key, label: period.label, entries: [] };
      group.subgroups.set(period.key, bucket);
    }
    bucket.entries.push(entry);
  }
  return Array.from(dayMap.values())
    .sort((a, b) => b.order - a.order)
    .map(group => {
      const subgroups = Array.from(group.subgroups.values());
      if (subgroups.length <= 1) {
        const entriesList = subgroups.length ? subgroups[0].entries : [];
        return {
          key: group.key,
          label: group.label,
          entries: entriesList,
          subgroups: [],
        };
      }
      return {
        key: group.key,
        label: group.label,
        entries: [],
        subgroups,
      };
    });
}

function renderHistoryGroup(group) {
  const content = group.subgroups.length
    ? group.subgroups.map(renderHistorySubgroup).join("")
    : `<div class="history-entries">${group.entries
        .map(renderHistoryEntry)
        .join("")}</div>`;
  return `<section class="history-group" data-history-group="${escapeHtml(group.key)}">
    <div class="history-group-label">${escapeHtml(group.label)}</div>
    ${content}
  </section>`;
}

function renderHistorySubgroup(subgroup) {
  return `<div class="history-subgroup" data-history-period="${escapeHtml(
    subgroup.key
  )}">
    <div class="history-subgroup-label">${escapeHtml(subgroup.label)}</div>
    <div class="history-entries">
      ${subgroup.entries.map(renderHistoryEntry).join("")}
    </div>
  </div>`;
}

function renderHistoryEntry(entry) {
  const modeLabel = describeHistoryMode(entry);
  const names = formatHistoryNames(entry);
  const meta = buildHistoryEntryMeta(entry);
  const metaMarkup = `<div class="history-entry-meta">${meta.join("")}</div>`;
  const noteMarkup = entry.note
    ? `<div class="history-entry-note">${escapeHtml(entry.note)}</div>`
    : "";
  const menuButton = `<button type="button" class="history-entry-menu" data-history-menu="${escapeHtml(
    entry.id
  )}" aria-label="\u5907\u6ce8\u6216\u5220\u9664">${HISTORY_MENU_ICON}</button>`;
  return `<article class="history-entry" data-entry-id="${escapeHtml(
    entry.id
  )}" data-history-mode="${escapeHtml(entry.mode)}">
    <div class="history-entry-header">
      <div class="history-entry-title">
        <div class="history-entry-mode">${escapeHtml(modeLabel)}</div>
        <div class="history-entry-names">${escapeHtml(names)}</div>
      </div>
      ${menuButton}
    </div>
    ${metaMarkup}
    ${noteMarkup}
  </article>`;
}

function renderStudentItem(student) {
  const color = groupColor(student.group);
  const cooldown = student.is_cooling
    ? `\u51b7\u5374 ${formatDuration(student.remaining_cooldown)}`
    : "";
  const domId = buildDomId("student", student.id);
  return `<li id="${domId}" class="student-item${
    student.is_cooling ? " is-cooling" : ""
  }" data-id="${escapeHtml(String(student.id))}" data-cooling="${
    student.is_cooling ? "1" : "0"
  }" style="--group-color:${color}">
    <div class="student-item-main">
      <div class="student-line">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="student-badge">\u7ec4 ${escapeHtml(String(student.group))}</span>
      </div>
      <div class="student-meta">
        <span>\u62bd ${student.pick_count} \u6b21</span>
        ${
          student.is_cooling
            ? `<span class="student-cooldown">${escapeHtml(cooldown)}</span>`
            : ""
        }
      </div>
    </div>
  </li>`;
}



function describeHistoryMode(entry) {
  switch (entry && entry.mode) {
    case "group":
      return "抽取小组";
    case "batch":
      return "批量抽取";
    default:
      return "随机抽人";
  }
}

function formatHistoryNames(entry) {
  const students = Array.isArray(entry.students) ? entry.students : [];
  const names = students
    .map(student => (student && student.name ? student.name : ""))
    .filter(Boolean);
  if (!names.length) {
    return "--";
  }
  if (entry.mode === "group" && Number.isFinite(entry.group)) {
    return `第 ${entry.group} 组 · ${names.join("、")}`;
  }
  return names.join("、");
}

function buildHistoryEntryMeta(entry) {
  const meta = [];
  const absolute = formatTime(entry.timestamp);
  const shortTime = timeShortFormatter.format(new Date(entry.timestamp * 1000));
  const relative = formatSince(entry.timestamp);
  meta.push(
    `<span class="history-entry-tag" title="${escapeHtml(absolute)}">${escapeHtml(shortTime)} · ${escapeHtml(relative)}</span>`
  );
  if (entry.mode === "group" && Number.isFinite(entry.group)) {
    meta.push(
      `<span class="history-entry-tag">第 ${escapeHtml(String(entry.group))} 组</span>`
    );
  }
  if (entry.mode === "batch") {
    const count =
      Number.isFinite(entry.count) && entry.count > 0
        ? entry.count
        : entry.students.length;
    meta.push(`<span class="history-entry-tag">共 ${escapeHtml(String(count))} 人</span>`);
  }
  if (entry.ignore_cooldown) {
    meta.push(`<span class="history-entry-tag">忽略冷却</span>`);
  }
  return meta;
}

function buildHistoryDayKey(timestamp) {
  const date = new Date(timestamp * 1000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatHistoryDayLabel(timestamp) {
  const target = new Date(timestamp * 1000);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(target)) / 86400000);
  if (diff === 0) {
    return "今天";
  }
  if (diff === 1) {
    return "昨天";
  }
  if (diff === 2) {
    return "前天";
  }
  const month = target.getMonth() + 1;
  const day = target.getDate();
  const weekday = WEEKDAY_LABELS[target.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

function resolveHistoryPeriod(timestamp) {
  const hour = new Date(timestamp * 1000).getHours();
  if (hour < 6) {
    return { key: "dawn", label: "清晨" };
  }
  if (hour < 12) {
    return { key: "morning", label: "上午" };
  }
  if (hour < 18) {
    return { key: "afternoon", label: "下午" };
  }
  return { key: "evening", label: "晚间" };
}

function highlightHistoryEntry() {
  if (!state.historyHighlightId || !dom.historyList) {
    return;
  }


function getHistoryEntryById(entryId) {
  if (!entryId) {
    return null;
  }
  const key = String(entryId);
  if (state.historyIndex instanceof Map && state.historyIndex.has(key)) {
    return state.historyIndex.get(key) || null;
  }
  if (Array.isArray(state.history)) {
    const match = state.history.find(item => item.id === key);
    if (match) {
      return match;
    }
  }
  return null;
}
  const selector = `[data-entry-id="${escapeCssIdentifier(state.historyHighlightId)}"]`;
  const element = dom.historyList.querySelector(selector);
  if (element) {
    element.classList.add("is-highlight");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      element.classList.remove("is-highlight");
    }, 1400);
  }
  state.historyHighlightId = "";
}

function renderCooldownItem(student) {
  const color = groupColor(student.group);
  const remaining = `\u5269\u4f59 ${formatDuration(student.remaining_cooldown)}`;
  const last = student.last_pick
    ? `\u4e0a\u6b21 ${formatTime(student.last_pick)}`
    : "\u6682\u65e0\u8bb0\u5f55";
  const domId = buildDomId("cooling", student.id);
  return `<li id="${domId}" class="student-item is-cooling" data-id="${escapeHtml(String(student.id))}" data-cooling="1" style="--group-color:${color}">
    <div class="student-item-main">
      <div class="student-line">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="student-badge">\u7ec4 ${escapeHtml(String(student.group))}</span>
      </div>
      <div class="student-meta">
        <span class="student-cooldown">${escapeHtml(remaining)}</span>
        <span>${escapeHtml(last)}</span>
      </div>
    </div>
  </li>`;
}

function renderSelection() {
  if (!state.lastSelection) {
    dom.resultName.textContent = "--";
    dom.resultNote.textContent = "等待抽取";
    return;
  }
  const selection = state.lastSelection;
  switch (selection.type) {
    case "single": {
      const id = selection.ids[0];
      const student = state.studentsMap.get(id);
      if (student) {
        selection.name = student.name;
        selection.group = student.group;
      }
      const name = selection.name || "--";
      const groupValue = Number.isFinite(selection.group)
        ? selection.group
        : null;
      dom.resultName.textContent = name;
      dom.resultNote.textContent = groupValue !== null
        ? `来自第 ${groupValue} 组`
        : "随机抽取";
      break;
    }
    case "batch": {
      const ids = Array.isArray(selection.ids) ? selection.ids : [];
      const names = [];
      for (const id of ids) {
        const student = state.studentsMap.get(id);
        if (student) {
          names.push(student.name);
        }
      }
      if (!names.length && Array.isArray(selection.names)) {
        names.push(...selection.names);
      } else {
        selection.names = names.slice();
      }
      dom.resultName.textContent = names.length ? names.join("、") : "--";
      const count = ids.length || names.length;
      dom.resultNote.textContent = count
        ? `批量抽取 · 共 ${count} 人`
        : "批量抽取";
      break;
    }
    case "group":
    default: {
      const names = [];
      let groupValue = Number.isFinite(selection.group)
        ? selection.group
        : null;
      for (const id of selection.ids) {
        const student = state.studentsMap.get(id);
        if (student) {
          names.push(student.name);
          groupValue = student.group;
        }
      }
      if (!names.length && Array.isArray(selection.names)) {
        names.push(...selection.names);
      } else {
        selection.names = names.slice();
      }
      selection.group = groupValue;
      dom.resultName.textContent = groupValue !== null
        ? `第 ${groupValue} 组`
        : "小组抽取";
      dom.resultNote.textContent = names.length
        ? names.join("、")
        : "成员已加入冷却";
      break;
    }
  }
}


function resetSelection() {
  state.lastSelection = null;
  renderSelection();
}

function updateControls() {
  const disabled = state.busy || state.isAnimating;
  dom.pickAny.disabled = disabled;
  if (dom.pickBatch) {
    dom.pickBatch.disabled = disabled;
  }
  dom.pickGroup.disabled = disabled;
  dom.clearCooldown.disabled = disabled;
  dom.addStudent.disabled = disabled;
  dom.cooldownDisplay.disabled = disabled;
  dom.ignoreCooldown.disabled = disabled;
  if (dom.classSwitcher) {
    dom.classSwitcher.disabled = disabled;
  }
  dom.resultCard.classList.toggle("is-animating", state.isAnimating);
  const historyButtons = dom.modalRoot.querySelectorAll("[data-history-action]");
  historyButtons.forEach(button => {
    button.disabled = state.busy;
  });
  const confirmButton = dom.modalRoot.querySelector("[data-confirm]");
  if (confirmButton) {
    confirmButton.disabled = state.busy;
  }
}

function matchesKeyword(student, rawKeyword) {
  const keyword = rawKeyword.trim();
  if (!keyword) {
    return true;
  }
  if (/^\d+$/.test(keyword)) {
    return String(student.group) === keyword;
  }
  const lowered = keyword.toLowerCase();
  return student.name.toLowerCase().includes(lowered);
}

function openCooldownModal() {
  if (state.busy || state.isAnimating) {
    return;
  }
  const content = buildCooldownModal(state.payload.cooldown_days);
  showModal(content);
  const form = dom.modalRoot.querySelector("#cooldown-form");
  const input = dom.modalRoot.querySelector("#cooldown-days");
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = input ? input.value : "";
      handleCooldownSave(value);
    });
  }
  if (input) {
    input.focus();
    input.select();
  }
}

function openClassModal() {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  const content = buildClassModal();
  showModal(content);
  bindClassModalEvents();
}

function buildClassModal() {
  return `
<div class="modal-backdrop class-modal-backdrop" data-class-modal="panel">
  <div class="modal-panel class-modal-panel">
    <div class="modal-header">
      <h2 class="modal-title">班级管理</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-modal-close>关闭</button>
    </div>
    <div class="class-modal-body">
      <div class="class-toolbar">
        <button type="button" class="btn btn-accent btn-sm" id="class-add-btn">添加班级</button>
        <span class="class-toolbar-note">拖拽列表可调整班级顺序</span>
      </div>
      <ul id="class-list" class="class-list">
        ${buildClassListItems()}
      </ul>
    </div>
  </div>
</div>
<div class="modal-layer d-none" id="class-add-layer">
  <div class="modal-panel class-add-panel">
    <div class="modal-header">
      <h3 class="modal-title">添加班级</h3>
    </div>
    <form id="class-add-form" class="class-add-form">
      <label for="class-add-name" class="form-label">班级名称</label>
      <input id="class-add-name" name="name" type="text" class="form-control" maxlength="40" autocomplete="off" required>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-class-cancel>取消</button>
        <button type="submit" class="btn btn-accent">确认添加</button>
      </div>
    </form>
  </div>
</div>`;
}

function buildClassListItems() {
  if (!state.classes.length) {
    return '<li class="empty-message">暂无班级</li>';
  }
  return state.classes.map(buildClassItem).join("");
}

function buildClassItem(meta) {
  const id = String(meta.id || "");
  const isActive = id === state.currentClassId;
  const deleteDisabled = state.classes.length <= 1 ? " disabled" : "";
  const switchDisabled = isActive ? " disabled" : "";
  const lastUsedText =
    meta.last_used_at > 0 ? `最近 ${formatSince(meta.last_used_at)}` : "尚未使用";
  const createdText = meta.created_at > 0 ? formatDate(meta.created_at) : "--";
  return `
  <li class="class-item${isActive ? " is-active" : ""}" draggable="true" data-class-id="${escapeHtml(id)}">
    <div class="class-item-handle" aria-hidden="true" data-class-handle>
      <span class="visually-hidden">拖拽排序</span>
    </div>
    <div class="class-item-main" data-class-switch>
      <div class="class-item-name">${escapeHtml(meta.name)}</div>
      <div class="class-item-meta">
        <span>${meta.student_count} 人</span>
        <span>冷却 ${meta.cooldown_days} 天</span>
        <span>${escapeHtml(lastUsedText)}</span>
        <span>创建于 ${escapeHtml(createdText)}</span>
      </div>
    </div>
    <div class="class-item-actions">
      <button type="button" class="btn btn-ghost btn-xs" data-class-switch${switchDisabled}>${isActive ? "当前班级" : "切换"}</button>
      <button type="button" class="btn btn-ghost btn-xs" data-class-delete${deleteDisabled}>删除</button>
    </div>
  </li>`;
}

function bindClassModalEvents() {
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  const addButton = dom.modalRoot.querySelector("#class-add-btn");
  if (addButton) {
    addButton.addEventListener("click", openClassAddLayer);
  }
  const list = dom.modalRoot.querySelector("#class-list");
  if (list) {
    list.addEventListener("click", handleClassListClick);
    list.addEventListener("dragover", handleClassDragOver);
    list.addEventListener("drop", handleClassDrop);
    attachClassListHandlers(list);
  }
  const layer = dom.modalRoot.querySelector("#class-add-layer");
  if (layer) {
    layer.addEventListener("click", event => {
      if (event.target === layer) {
        closeClassAddLayer();
      }
    });
    const cancelButton = layer.querySelector("[data-class-cancel]");
    if (cancelButton) {
      cancelButton.addEventListener("click", closeClassAddLayer);
    }
    const form = layer.querySelector("#class-add-form");
    if (form) {
      form.addEventListener("submit", handleClassAddSubmit);
    }
  }
}

function updateClassModal() {
  const list = dom.modalRoot.querySelector("#class-list");
  if (!list) {
    return;
  }
  list.innerHTML = buildClassListItems();
  attachClassListHandlers(list);
}

function attachClassListHandlers(list) {
  const items = list.querySelectorAll(".class-item");
  items.forEach(item => {
    item.addEventListener("dragstart", handleClassDragStart);
    item.addEventListener("dragend", handleClassDragEnd);
  });
}

function handleClassListClick(event) {
  if (state.busy) {
    return;
  }
  const deleteButton = event.target.closest("[data-class-delete]");
  if (deleteButton) {
    const item = deleteButton.closest(".class-item");
    if (!item || deleteButton.disabled) {
      return;
    }
    const classId = item.dataset.classId;
    if (classId) {
      handleClassDeleteRequest(classId);
    }
    return;
  }
  const switchTarget = event.target.closest("[data-class-switch]");
  if (switchTarget) {
    const item = switchTarget.closest(".class-item");
    if (!item || switchTarget.disabled) {
      return;
    }
    const classId = item.dataset.classId;
    if (!classId || classId === state.currentClassId) {
      return;
    }
    handleClassSwitchRequest(classId);
  }
}

async function handleClassSwitchRequest(classId) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("class_switch", { class_id: classId });
    applyAppState(response.state);
    render();
    closeModal();
    showToast(`已切换至 ${state.currentClassName}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function handleClassDeleteRequest(classId) {
  if (state.busy) {
    return;
  }
  const meta = state.classMap.get(classId);
  if (!meta) {
    showToast("未找到指定班级");
    return;
  }
  const confirmed = await openConfirmModal({
    title: "删除班级",
    message: `确认删除「${meta.name}」吗？该班级的所有数据都将被移除。`,
    confirmLabel: "删除",
    confirmTone: "danger",
  });
  if (!confirmed) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("class_delete", { class_id: classId });
    applyAppState(response.state);
    render();
    showToast("班级已删除");
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function openClassAddLayer() {
  const layer = dom.modalRoot.querySelector("#class-add-layer");
  if (!layer) {
    return;
  }
  layer.classList.remove("d-none");
  const input = layer.querySelector("#class-add-name");
  if (input) {
    input.value = "";
    input.focus();
    input.select();
  }
}

function closeClassAddLayer() {
  const layer = dom.modalRoot.querySelector("#class-add-layer");
  if (!layer) {
    return;
  }
  layer.classList.add("d-none");
  const form = layer.querySelector("#class-add-form");
  if (form) {
    form.reset();
  }
}

async function handleClassAddSubmit(event) {
  event.preventDefault();
  if (state.busy) {
    return;
  }
  const form = event.currentTarget;
  const input = form.querySelector("#class-add-name");
  const name = input ? input.value.trim() : "";
  if (!name) {
    if (input) {
      input.focus();
      input.select();
    }
    showToast("班级名称不能为空");
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("class_create", { name });
    applyAppState(response.state);
    render();
    closeModal();
    showToast(`已创建班级「${state.currentClassName}」`);
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function handleClassDragStart(event) {
  const item = event.currentTarget;
  const classId = item ? item.dataset.classId : "";
  if (!classId) {
    return;
  }
  state.classDragSource = classId;
  item.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", classId);
    } catch {
      /* ignore */
    }
  }
}

function handleClassDragEnd(event) {
  const item = event.currentTarget;
  if (item) {
    item.classList.remove("is-dragging");
  }
  state.classDragSource = null;
}

function handleClassDragOver(event) {
  event.preventDefault();
  const list = event.currentTarget;
  const draggingId = state.classDragSource;
  if (!draggingId) {
    return;
  }
  const draggingItem = list.querySelector(".class-item.is-dragging");
  if (!draggingItem) {
    return;
  }
  const targetItem = event.target.closest(".class-item");
  if (!targetItem || targetItem === draggingItem) {
    return;
  }
  const rect = targetItem.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  const shouldInsertBefore = offset < rect.height / 2;
  if (shouldInsertBefore) {
    list.insertBefore(draggingItem, targetItem);
  } else {
    list.insertBefore(draggingItem, targetItem.nextElementSibling);
  }
}

async function handleClassDrop(event) {
  event.preventDefault();
  const list = event.currentTarget;
  const order = getClassOrderFromDom(list);
  const currentOrder = state.classes.map(item => item.id);
  state.classDragSource = null;
  if (!order.length || classOrderEquals(order, currentOrder)) {
    updateClassModal();
    return;
  }
  await submitClassReorder(order);
}

async function submitClassReorder(order) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("class_reorder", { order });
    applyAppState(response.state);
    render();
    showToast("班级排序已更新");
  } catch (error) {
    showToast(error.message);
    updateClassModal();
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function getClassOrderFromDom(list) {
  return Array.from(list.querySelectorAll(".class-item"))
    .map(item => item.dataset.classId)
    .filter(Boolean);
}

function classOrderEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

async function handleCooldownSave(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    showToast("\u51b7\u5374\u5929\u6570\u5fc5\u987b\u662f\u6b63\u6574\u6570");
    const input = dom.modalRoot.querySelector("#cooldown-days");
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }
  const target = Math.max(1, Math.round(numeric));
  if (target === state.payload.cooldown_days) {
    closeModal();
    return;
  }
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("set_cooldown", { days: target });
    applyAppState(response.state);
    render();
    showToast("\u51b7\u5374\u65f6\u95f4\u5df2\u66f4\u65b0");
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function handleClearCooldown() {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  const confirmed = await openConfirmModal({
    title: "\u6e05\u9664\u51b7\u5374\u72b6\u6001",
    message: "\u786e\u8ba4\u8981\u5c06\u5f53\u524d\u6240\u6709\u5b66\u751f\u79fb\u51fa\u51b7\u5374\u5217\u8868\u5e76\u7acb\u5373\u53ef\u62bd\u53d6\u5417\uff1f",
    confirmLabel: "\u6e05\u9664\u51b7\u5374",
    confirmTone: "danger",
  });
  if (!confirmed) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("clear_cooldown");
    applyAppState(response.state);
    render();
    showToast("\u51b7\u5374\u5217\u8868\u5df2\u6e05\u7a7a");
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function handleContextTrigger(event) {
  const item = event.target.closest("li[data-id]");
  if (!item) {
    return;
  }
  event.preventDefault();
  if (state.busy || state.isAnimating) {
    return;
  }
  const id = item.dataset.id;
  const student = state.studentsMap.get(id);
  if (!student) {
    return;
  }
  openStudentContextMenu(student, event.clientX, event.clientY);
}

function openStudentContextMenu(student, x, y) {
  const items = [
    { action: "edit", label: "\u67e5\u770b\u8be6\u60c5" },
    student.is_cooling
      ? { action: "release", label: "\u89e3\u9664\u51b7\u5374" }
      : { action: "force", label: "\u5f3a\u5236\u51b7\u5374" },
  ];
  openContextMenu({ type: "student", id: student.id }, items, x, y);
}

function handleHistoryContextTrigger(event) {
  const item = event.target.closest("[data-entry-id]");
  if (!item) {
    return;
  }
  event.preventDefault();
  if (state.busy || state.isAnimating) {
    return;
  }
  const entryId = item.dataset.entryId;
  const entry = getHistoryEntryById(entryId);
  if (!entry) {
    return;
  }
  openHistoryContextMenu(entry, event.clientX, event.clientY);
}

function handleHistoryClick(event) {
  const button = event.target.closest("[data-history-menu]");
  if (!button) {
    return;
  }
  event.preventDefault();
  if (state.busy || state.isAnimating) {
    return;
  }
  const entryId = button.dataset.historyMenu;
  const entry = getHistoryEntryById(entryId);
  if (!entry) {
    return;
  }
  const rect = button.getBoundingClientRect();
  openHistoryContextMenu(entry, rect.left + rect.width / 2, rect.bottom + 6);
}

function openHistoryContextMenu(entry, x, y) {
  const items = [
    {
      action: "history-note",
      label: entry.note ? "\u7f16\u8f91\u5907\u6ce8" : "\u6dfb\u52a0\u5907\u6ce8",
    },
    { action: "history-delete", label: "\u5220\u9664\u8bb0\u5f55", tone: "danger" },
  ];
  openContextMenu({ type: "history", id: entry.id }, items, x, y);
}

function handleGlobalClick(event) {
  if (
    !dom.contextMenu.classList.contains("d-none") &&
    !dom.contextMenu.contains(event.target)
  ) {
    closeContextMenu();
  }
}

function handleContextSelection(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const target = state.contextTarget;
  closeContextMenu();
  if (!target) {
    return;
  }
  if (target.type === "student") {
    const id = target.id;
    if (!id) {
      return;
    }
    if (action === "edit") {
      openStudentModal("edit", id);
      return;
    }
    if (action === "force") {
      runSimpleAction("student_force_cooldown", { student_id: id }, "\u5df2\u6807\u8bb0\u51b7\u5374");
      return;
    }
    if (action === "release") {
      runSimpleAction(
        "student_release_cooldown",
        { student_id: id },
        "\u5df2\u89e3\u9664\u51b7\u5374"
      );
    }
    return;
  }
  if (target.type === "history") {
    const entry = getHistoryEntryById(target.id);
    if (!entry) {
      return;
    }
    if (action === "history-note") {
      openHistoryNoteModal(entry);
      return;
    }
    if (action === "history-delete") {
      handleHistoryDelete(entry);
    }
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    const addLayer = dom.modalRoot.querySelector("#class-add-layer:not(.d-none)");
    if (addLayer) {
      event.preventDefault();
      closeClassAddLayer();
      return;
    }
    if (!dom.modalRoot.classList.contains("d-none")) {
      closeModal();
      return;
    }
    if (!dom.contextMenu.classList.contains("d-none")) {
      closeContextMenu();
    }
  }
}

async function runSimpleAction(action, payload, message) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction(action, payload);
    applyAppState(response.state);
    render();
    if (message) {
      showToast(message);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function openContextMenu(target, items, x, y) {
  if (!items || !items.length) {
    return;
  }
  closeContextMenu();
  dom.contextMenu.innerHTML = items
    .map(item => {
      const toneClass = item.tone === "danger" ? " is-danger" : "";
      return `<button type="button" class="context-item${toneClass}" data-action="${item.action}">${item.label}</button>`;
    })
    .join("");
  dom.contextMenu.style.left = "0px";
  dom.contextMenu.style.top = "0px";
  dom.contextMenu.style.opacity = "0";
  dom.contextMenu.classList.remove("d-none");
  requestAnimationFrame(() => {
    const rect = dom.contextMenu.getBoundingClientRect();
    const posX = Math.min(x, window.innerWidth - rect.width - 12);
    const posY = Math.min(y, window.innerHeight - rect.height - 12);
    dom.contextMenu.style.left = `${posX}px`;
    dom.contextMenu.style.top = `${posY}px`;
    dom.contextMenu.style.opacity = "1";
  });
  state.contextTarget = target;
}

function closeContextMenu() {
  state.contextTarget = null;
  dom.contextMenu.classList.add("d-none");
  dom.contextMenu.style.opacity = "";
}

function openStudentModal(mode, studentId) {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  let student = null;
  if (mode === "edit") {
    student = state.studentsMap.get(studentId);
    if (!student) {
      showToast("\u672a\u627e\u5230\u8be5\u5b66\u751f");
      return;
    }
  }
  const content = buildStudentModal(mode, student);
  showModal(content);
  const form = dom.modalRoot.querySelector("#student-form");
  const idInput = form.querySelector("[name='student_id']");
  const nameInput = form.querySelector("[name='name']");
  const groupInput = form.querySelector("[name='group']");
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  form.addEventListener("submit", event => {
    event.preventDefault();
    handleStudentFormSubmit(mode, {
      student,
      idInput,
      nameInput,
      groupInput,
    });
  });
  if (mode === "edit") {
    const deleteButton = dom.modalRoot.querySelector("#delete-student");
    if (deleteButton) {
      deleteButton.addEventListener("click", async () => {
        if (state.busy) {
          return;
        }
        const confirmed = await openConfirmModal({
          title: "\u5220\u9664\u5b66\u751f",
          message: `\u786e\u5b9a\u8981\u5220\u9664 ${student.name} \u5417\uff1f\u8be5\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002`,
          confirmLabel: "\u5220\u9664",
          cancelLabel: "\u4fdd\u7559",
          confirmTone: "danger",
        });
        if (!confirmed) {
          return;
        }
        await handleStudentDelete(student);
      });
    }
  }
  if (nameInput) {
    nameInput.focus();
    nameInput.select();
  } else if (idInput) {
    idInput.focus();
    idInput.select();
  }
}

function openHistoryNoteModal(entry) {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  const content = buildHistoryNoteModal(entry);
  showModal(content);
  const form = dom.modalRoot.querySelector("#history-note-form");
  const textarea = dom.modalRoot.querySelector("#history-note-text");
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = textarea ? textarea.value.trim() : "";
      if (value.length > 200) {
        showToast("备注最多 200 字");
        if (textarea) {
          textarea.focus();
        }
        return;
      }
      submitHistoryNote(entry.id, value);
    });
  }
  if (textarea) {
    textarea.focus();
    textarea.select();
  }
}

function buildHistoryNoteModal(entry) {
  const title = entry.note ? "编辑备注" : "添加备注";
  const noteValue = entry.note ? escapeHtml(entry.note) : "";
  return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <form id="history-note-form">
        <div class="modal-body slim-scroll">
          <p class="text-muted">备注仅用于记录课堂细节，不会影响统计结果。</p>
          <div class="mb-3">
            <label class="form-label" for="history-note-text">备注内容</label>
            <textarea id="history-note-text" class="form-control" rows="4" maxlength="200" placeholder="写点想说的话..." autocomplete="off">${noteValue}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-light" data-modal-close>取消</button>
          <button type="submit" class="btn btn-accent">保存</button>
        </div>
      </form>
    </div>
  </div>`;
}

async function submitHistoryNote(entryId, note) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("history_entry_note", {
      entry_id: entryId,
      note,
    });
    applyAppState(response.state);
    state.historyHighlightId = entryId;
    render();
    closeModal();
    showToast("备注已保存");
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function handleHistoryDelete(entry) {
  const names = formatHistoryNames(entry);
  const message = names && names !== "--"
    ? `确定删除「${names}」的记录吗？`
    : "确定删除这条记录吗？";
  const confirmed = await openConfirmModal({
    title: "删除历史记录",
    message,
    confirmLabel: "删除",
    confirmTone: "danger",
  });
  if (!confirmed || state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("history_entry_delete", { entry_id: entry.id });
    applyAppState(response.state);
    render();
    showToast("已删除历史记录");
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function openBatchModal() {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  const available = state.ignoreCooldown
    ? state.students.length
    : state.students.filter(student => !student.is_cooling).length;
  if (!available) {
    showToast("当前没有可抽取的学生");
    return;
  }
  const content = buildBatchModal(available, state.ignoreCooldown);
  showModal(content);
  const form = dom.modalRoot.querySelector("#batch-form");
  const input = dom.modalRoot.querySelector("#batch-count");
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input) {
        return;
      }
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 1) {
        showToast("请输入正确的抽取人数");
        input.focus();
        input.select();
        return;
      }
      if (value > available) {
        showToast("人数超过可抽取范围");
        input.focus();
        input.select();
        return;
      }
      closeModal();
      handleRandom("batch", { count: value });
    });
  }
  if (input) {
    const lastCount =
      state.lastSelection && state.lastSelection.type === "batch"
        ? state.lastSelection.ids.length
        : 2;
    const defaultValue = Math.min(available, Math.max(1, lastCount));
    input.value = defaultValue;
    input.focus();
    input.select();
  }
}

function buildBatchModal(available, ignoringCooldown) {
  const hint = ignoringCooldown
    ? `当前忽略冷却，共 ${available} 人可抽取。`
    : `当前有 ${available} 人符合冷却规则。`;
  return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>批量抽取</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <form id="batch-form">
        <div class="modal-body slim-scroll">
          <p class="text-muted">${escapeHtml(hint)}</p>
          <div class="mb-3">
            <label class="form-label" for="batch-count">抽取人数</label>
            <input id="batch-count" name="count" type="number" min="1" max="${available}" class="form-control" required autocomplete="off">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-light" data-modal-close>取消</button>
          <button type="submit" class="btn btn-accent">开始抽取</button>
        </div>
      </form>
    </div>
  </div>`;
}


function bindModalBackdrop(onClose) {
  unbindModalBackdrop();
  if (!dom.modalRoot) {
    return;
  }
  const backdrop = dom.modalRoot;
  const handlePointerDown = event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      modalPointerDownOnBackdrop = false;
      return;
    }
    const panel = backdrop.querySelector(".modal-panel");
    const target = event.target;
    const insidePanel =
      panel && target instanceof Node ? panel.contains(target) : false;
    modalPointerDownOnBackdrop = !insidePanel;
  };
  const handlePointerUp = event => {
    if (!modalPointerDownOnBackdrop) {
      return;
    }
    modalPointerDownOnBackdrop = false;
    const panel = backdrop.querySelector(".modal-panel");
    const target = event.target;
    const insidePanel =
      panel && target instanceof Node ? panel.contains(target) : false;
    if (!insidePanel) {
      onClose();
    }
  };
  const handlePointerCancel = () => {
    modalPointerDownOnBackdrop = false;
  };
  const handleClick = event => {
    if (event.detail === 0) {
      const panel = backdrop.querySelector(".modal-panel");
      if (!panel || !panel.contains(event.target)) {
        onClose();
      }
    }
  };
  backdrop.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", handlePointerCancel, true);
  backdrop.addEventListener("click", handleClick, true);
  modalBackdropTeardown = () => {
    backdrop.removeEventListener("pointerdown", handlePointerDown, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", handlePointerCancel, true);
    backdrop.removeEventListener("click", handleClick, true);
    modalPointerDownOnBackdrop = false;
    modalBackdropTeardown = null;
  };
}

function unbindModalBackdrop() {
  if (typeof modalBackdropTeardown === "function") {
    modalBackdropTeardown();
  }
}

function showModal(content, options = {}) {
  state.historyStudentId = null;
  delete dom.modalRoot.dataset.historyStudentId;
  dom.modalRoot.innerHTML = content;
  dom.modalRoot.classList.remove("d-none");
  document.body.classList.add("modal-open");
  const closeHandler =
    options && typeof options.onBackdropClose === "function"
      ? options.onBackdropClose
      : closeModal;
  bindModalBackdrop(closeHandler);
}

function closeModal() {
  unbindModalBackdrop();
  dom.modalRoot.classList.add("d-none");
  dom.modalRoot.innerHTML = "";
  delete dom.modalRoot.dataset.historyStudentId;
  state.historyStudentId = null;
  document.body.classList.remove("modal-open");
}
function openConfirmModal(options) {
  const config = {
    title: options && options.title ? options.title : "\u786e\u8ba4\u64cd\u4f5c",
    message: options && options.message ? options.message : "",
    confirmLabel: options && options.confirmLabel ? options.confirmLabel : "\u786e\u8ba4",
    cancelLabel: options && options.cancelLabel ? options.cancelLabel : "\u53d6\u6d88",
    confirmTone: options && options.confirmTone ? options.confirmTone : "accent",
  };
  return new Promise(resolve => {
    let settled = false;
    const cleanup = () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
    const finish = value => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      closeModal();
      resolve(value);
    };
    const handleEscape = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    };
    document.addEventListener("keydown", handleEscape, true);
    showModal(buildConfirmModal(config), {
      onBackdropClose: () => finish(false),
    });
    const confirmButton = dom.modalRoot.querySelector("[data-confirm]");
    const cancelButtons = dom.modalRoot.querySelectorAll("[data-modal-close]");
    cancelButtons.forEach(button =>
      button.addEventListener(
        "click",
        () => finish(false),
        { once: true }
      )
    );
    if (confirmButton) {
      confirmButton.addEventListener(
        "click",
        () => finish(true),
        { once: true }
      );
    }
  });
}


function openHistoryModal(studentId) {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  const student = state.studentsMap.get(studentId);
  if (!student) {
    showToast("\u672a\u627e\u5230\u8be5\u5b66\u751f");
    return;
  }
  const content = buildHistoryModal(student);
  showModal(content);
  state.historyStudentId = student.id;
  dom.modalRoot.dataset.historyStudentId = student.id;
  const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
  closers.forEach(button => button.addEventListener("click", closeModal));
  const list = dom.modalRoot.querySelector(".history-list");
  if (list) {
    list.addEventListener("click", handleHistoryListClick);
  }
  const clearButton = dom.modalRoot.querySelector("#history-clear");
  if (clearButton) {
    clearButton.addEventListener("click", () => handleHistoryClear(student.id));
    clearButton.disabled = state.busy || !student.pick_history.length;
  }
  updateHistoryModal(student.id);
  updateControls();
}

function handleHistoryListClick(event) {
  const button = event.target.closest("[data-history-remove]");
  if (!button || button.disabled || state.busy) {
    return;
  }
  const value = Number(button.dataset.historyRemove);
  if (!Number.isFinite(value)) {
    return;
  }
  const studentId = dom.modalRoot.dataset.historyStudentId;
  if (!studentId) {
    return;
  }
  const confirmed = window.confirm("\u786e\u8ba4\u5220\u9664\u8be5\u6761\u8bb0\u5f55\uff1f");
  if (!confirmed) {
    return;
  }
  handleHistoryRemove(studentId, value);
}

async function handleHistoryClear(studentId) {
  if (state.busy) {
    return;
  }
  const student = state.studentsMap.get(studentId);
  if (!student) {
    showToast("\u672a\u627e\u5230\u8be5\u5b66\u751f");
    return;
  }
  if (!student.pick_history.length) {
    showToast("\u6682\u65e0\u8bb0\u5f55");
    return;
  }
  const confirmed = window.confirm(`\u786e\u8ba4\u6e05\u7a7a ${student.name} \u7684\u5386\u53f2\u8bb0\u5f55\uff1f`);
  if (!confirmed) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("student_history_clear", { student_id: studentId });
    applyAppState(response.state);
    render();
    showToast("\u5df2\u6e05\u7a7a\u5386\u53f2");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function handleHistoryRemove(studentId, timestamp) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("student_history_remove", {
      student_id: studentId,
      timestamp,
    });
    applyAppState(response.state);
    render();
    showToast("\u5df2\u5220\u9664\u8bb0\u5f55");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function buildHistoryModal(student) {
  const hasHistory =
    Array.isArray(student.pick_history) && student.pick_history.length > 0;
  const lastTime = student.last_pick ? formatTime(student.last_pick) : "\u6682\u65e0\u8bb0\u5f55";
  const lastSince = student.last_pick ? formatSince(student.last_pick) : "";
  const historyList = buildHistoryList(student.pick_history, { withActions: true });
  const sinceMarkup = student.last_pick
    ? ` \u00b7 <small class="history-since-tag" data-history-last-since>${escapeHtml(lastSince)}</small>`
    : "";
  return `<div class="modal-backdrop" data-history-root data-history-student="${escapeHtml(student.id)}">
    <div class="modal-panel glass history-modal">
      <div class="modal-header">
        <h3>\u5386\u53f2\u70b9\u540d</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">\u00d7</button>
      </div>
      <div class="modal-body slim-scroll">
        <div class="history-summary">
          <div class="summary-name">${escapeHtml(student.name)}</div>
          <div class="summary-meta">
            <span class="summary-tag">\u7ec4 <strong data-history-group>${escapeHtml(String(student.group))}</strong></span>
            <span class="summary-tag">\u70b9\u540d <strong data-history-count>${student.pick_count}</strong> \u6b21</span>
            <span class="summary-tag">\u6700\u8fd1 <strong data-history-last>${escapeHtml(lastTime)}</strong>${sinceMarkup}</span>
          </div>
        </div>
        <div class="history-box">
          <div class="history-title">\u8bb0\u5f55\u5217\u8868</div>
          <ul class="history-list slim-scroll history-list-actions">${historyList}</ul>
        </div>
      </div>
      <div class="modal-footer history-footer">
        <button type="button" class="btn btn-outline-danger" id="history-clear" data-history-action${hasHistory ? "" : " disabled"}>\u6e05\u7a7a\u5386\u53f2</button>
        <button type="button" class="btn btn-outline-light" data-modal-close>\u5173\u95ed</button>
      </div>
    </div>
  </div>`;
}
function updateHistoryModal(studentId) {
  if (!studentId) {
    return;
  }
  const container = dom.modalRoot.querySelector("[data-history-root]");
  if (!container) {
    return;
  }
  const student = state.studentsMap.get(studentId);
  if (!student) {
    closeModal();
    return;
  }
  container.dataset.historyStudent = student.id;
  const list = container.querySelector(".history-list");
  if (list) {
    list.innerHTML = buildHistoryList(student.pick_history, { withActions: true });
  }
  const group = container.querySelector("[data-history-group]");
  if (group) {
    group.textContent = String(student.group);
  }
  const count = container.querySelector("[data-history-count]");
  if (count) {
    count.textContent = String(student.pick_count);
  }
  const last = container.querySelector("[data-history-last]");
  const since = container.querySelector("[data-history-last-since]");
  if (student.last_pick) {
    if (last) {
      last.textContent = formatTime(student.last_pick);
    }
    if (since) {
      since.textContent = formatSince(student.last_pick);
    }
  } else {
    if (last) {
      last.textContent = "\u6682\u65e0\u8bb0\u5f55";
    }
    if (since) {
      since.textContent = "";
    }
  }
  const clearButton = container.querySelector("#history-clear");
  if (clearButton) {
    clearButton.disabled = state.busy || !student.pick_history.length;
  }
}

function buildCooldownModal(currentDays) {
  const value = Math.max(1, Number(currentDays) || 1);
  return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>\u8bbe\u7f6e\u51b7\u5374\u5929\u6570</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">\u00d7</button>
      </div>
      <form id="cooldown-form">
        <div class="modal-body slim-scroll">
          <p class="text-muted">\u8c03\u6574\u5168\u5458\u62bd\u53d6\u540e\u7684\u51b7\u5374\u65f6\u957f\uff0c\u9632\u6b62\u77ed\u65f6\u95f4\u5185\u91cd\u590d\u70b9\u540d\u3002</p>
          <div class="mb-3">
            <label class="form-label">\u51b7\u5374\u5929\u6570</label>
            <input id="cooldown-days" type="number" min="1" class="form-control" value="${escapeHtml(String(value))}" required autocomplete="off">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-light" data-modal-close>\u53d6\u6d88</button>
          <button type="submit" class="btn btn-accent">\u4fdd\u5b58</button>
        </div>
      </form>
    </div>
  </div>`;
}

function buildConfirmModal(options) {
  const {
    title = "\u786e\u8ba4\u64cd\u4f5c",
    message = "",
    confirmLabel = "\u786e\u8ba4",
    cancelLabel = "\u53d6\u6d88",
    confirmTone = "accent",
  } = options || {};
  const confirmClass = confirmTone === "danger" ? "btn btn-danger" : "btn btn-accent";
  return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">\u00d7</button>
      </div>
      <div class="modal-body slim-scroll">
        <p class="text-muted">${escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-light" data-modal-close>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="${confirmClass}" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  </div>`;
}

function buildStudentModal(mode, student) {
  if (mode === "create") {
    return `<div class="modal-backdrop">
      <div class="modal-panel glass">
        <div class="modal-header">
          <h3>\u6dfb\u52a0\u5b66\u751f</h3>
          <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">\u00d7</button>
        </div>
        <form id="student-form">
          <div class="modal-body slim-scroll">
            <div class="mb-3">
              <label class="form-label">\u5b66\u53f7</label>
              <input name="student_id" type="text" class="form-control" placeholder="\u7559\u7a7a\u5c06\u81ea\u52a8\u751f\u6210" autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label">\u59d3\u540d</label>
              <input name="name" type="text" class="form-control" required autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label">\u5c0f\u7ec4</label>
              <input name="group" type="number" class="form-control" min="0" step="1" value="0">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-light" data-modal-close>\u53d6\u6d88</button>
            <button type="submit" class="btn btn-accent">\u65b0\u589e</button>
          </div>
        </form>
      </div>
    </div>`;
  }
  const historyItems = buildHistoryList(student.pick_history);
  const lastPick = student.last_pick ? formatTime(student.last_pick) : "\u6682\u65e0\u8bb0\u5f55";
  return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>\u7f16\u8f91\u5b66\u751f</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">\u00d7</button>
      </div>
      <form id="student-form">
        <div class="modal-body slim-scroll">
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label">\u5b66\u53f7</label>
              <input name="student_id" type="text" class="form-control" value="${escapeHtml(student.id)}" autocomplete="off">
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label">\u5c0f\u7ec4</label>
              <input name="group" type="number" class="form-control" min="0" step="1" value="${escapeHtml(String(student.group))}">
            </div>
            <div class="col-12">
              <label class="form-label">\u59d3\u540d</label>
              <input name="name" type="text" class="form-control" value="${escapeHtml(student.name)}" required autocomplete="off">
            </div>
          </div>
          <div class="student-info-grid mt-3">
            <div>
              <span class="info-label">\u7d2f\u8ba1\u70b9\u540d</span>
              <span class="info-value">${student.pick_count}</span>
            </div>
            <div>
              <span class="info-label">\u6700\u8fd1\u4e00\u6b21</span>
              <span class="info-value">${escapeHtml(lastPick)}</span>
            </div>
          </div>
          <div class="history-box mt-4">
            <div class="history-title">\u5386\u53f2\u8bb0\u5f55</div>
            <ul class="history-list slim-scroll">${historyItems}</ul>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" id="delete-student" class="btn btn-outline-danger">\u5220\u9664\u5b66\u751f</button>
          <button type="button" class="btn btn-outline-light" data-modal-close>\u53d6\u6d88</button>
          <button type="submit" class="btn btn-accent">\u4fdd\u5b58\u4fee\u6539</button>
        </div>
      </form>
    </div>
  </div>`;
}
function buildHistoryList(history, options = {}) {
  const { withActions = false } = options;
  if (!Array.isArray(history) || !history.length) {
    return '<li class="history-empty">\u6682\u65e0\u8bb0\u5f55</li>';
  }
  const sorted = history
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
    .sort((a, b) => b - a);
  const items = sorted.map((timestamp, index) => {
    const order = sorted.length - index;
    const timeLabel = escapeHtml(formatTime(timestamp));
    const sinceLabel = escapeHtml(formatSince(timestamp));
    const action = withActions
      ? `<button type="button" class="history-delete" data-history-remove="${escapeHtml(String(timestamp))}" data-history-action>\u5220\u9664</button>`
      : "";
    return `<li>
      <span class="history-index">${order}.</span>
      <span class="history-time">${timeLabel}</span>
      <span class="history-since">${sinceLabel}</span>
      ${action}
    </li>`;
  });
  return items.join("");
}
async function handleStudentFormSubmit(mode, context) {
  if (state.busy) {
    return;
  }
  const idInput = context.idInput;
  const nameInput = context.nameInput;
  const groupInput = context.groupInput;
  const idValue = idInput ? idInput.value.trim() : "";
  const nameValue = nameInput.value.trim();
  if (!nameValue) {
    showToast("\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a");
    nameInput.focus();
    nameInput.select();
    return;
  }
  const groupValue = sanitizeGroup(groupInput.value);
  if (groupValue < 0) {
    showToast("\u7ec4\u522b\u9700\u4e3a\u975e\u8d1f\u6574\u6570");
    groupInput.focus();
    groupInput.select();
    return;
  }
  if (mode === "create") {
    if (idValue && state.studentsMap.has(idValue)) {
      showToast("\u7f16\u53f7\u5df2\u5b58\u5728");
      if (idInput) {
        idInput.focus();
        idInput.select();
      }
      return;
    }
    if (studentNameExists(nameValue)) {
      showToast("\u59d3\u540d\u5df2\u5b58\u5728");
      nameInput.focus();
      nameInput.select();
      return;
    }
    await submitStudentCreate({
      student_id: idValue,
      name: nameValue,
      group: groupValue,
    });
    return;
  }
  const currentId = context.student.id;
  const targetId = idValue || currentId;
  if (targetId !== currentId && state.studentsMap.has(targetId)) {
    showToast("\u7f16\u53f7\u5df2\u5b58\u5728");
    if (idInput) {
      idInput.focus();
      idInput.select();
    }
    return;
  }
  if (studentNameExists(nameValue, currentId)) {
    showToast("\u59d3\u540d\u5df2\u5b58\u5728");
    nameInput.focus();
    nameInput.select();
    return;
  }
  await submitStudentUpdate({
    student_id: currentId,
    new_id: targetId,
    name: nameValue,
    group: groupValue,
  });
}

async function submitStudentCreate(payload) {
  setBusy(true);
  try {
    const response = await sendAction("student_create", payload);
    applyAppState(response.state);
    render();
    showToast("\u5df2\u65b0\u589e\u5b66\u751f");
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function submitStudentUpdate(payload) {
  setBusy(true);
  try {
    const response = await sendAction("student_update", payload);
    applyAppState(response.state);
    render();
    showToast("\u5df2\u4fdd\u5b58\u4fee\u6539");
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function handleStudentDelete(student) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  try {
    const response = await sendAction("student_delete", {
      student_id: student.id,
    });
    applyAppState(response.state);
    render();
    showToast("\u5df2\u5220\u9664\u5b66\u751f");
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

async function handleRandom(mode, extra = {}) {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  setBusy(true);
  try {
    const response = await sendAction("random_pick", {
      mode,
      ignore_cooldown: state.ignoreCooldown,
      ...extra,
    });
    const historyEntryId =
      response && response.result && response.result.history_entry_id
        ? String(response.result.history_entry_id)
        : "";
    await runSelectionAnimation(response.result);
    applyAppState(response.state);
    if (historyEntryId) {
      state.historyHighlightId = historyEntryId;
    }
    render();
  } catch (error) {
    showToast(error.message);
    resetSelection();
  } finally {
    if (!state.isAnimating) {
      setBusy(false);
    }
  }
}

function runSelectionAnimation(result) {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  if (animationTimeout) {
    clearTimeout(animationTimeout);
    animationTimeout = null;
  }
  if (!result) {
    resetSelection();
    return Promise.resolve();
  }
  const type = result.type || "single";
  let finalIds = [];
  if (type === "group") {
    finalIds = Array.isArray(result.student_ids)
      ? result.student_ids.filter(Boolean)
      : [];
  } else if (type === "batch") {
    finalIds = Array.isArray(result.student_ids)
      ? result.student_ids.filter(Boolean)
      : [];
  } else if (result.student_id) {
    finalIds = [result.student_id];
  }
  if (!finalIds.length) {
    resetSelection();
    return Promise.resolve();
  }
  const pool = Array.isArray(result.pool_ids)
    ? result.pool_ids.filter(Boolean)
    : [];
  const rawGroup = Number(result.group);
  const finalGroup =
    type === "group"
      ? Number.isFinite(rawGroup)
        ? rawGroup
        : inferGroupFromIds(finalIds)
      : null;
  const frames =
    type === "group"
      ? buildGroupAnimationSequence(getGroupPool(), finalGroup)
      : buildAnimationSequence(pool, finalIds);
  state.isAnimating = true;
  updateControls();
  dom.resultCard.classList.add("is-animating");
  dom.resultNote.textContent = "正在抽取...";
  let index = 0;
  let showFrame;
  if (type === "group") {
    showFrame = value => {
      const numeric = Number(value);
      dom.resultName.textContent = Number.isFinite(numeric)
        ? `第 ${numeric} 组`
        : "--";
    };
  } else {
    showFrame = id => {
      const student = state.studentsMap.get(id);
      dom.resultName.textContent = student ? student.name : "--";
    };
  }
  const finishDelay = 140;
  const interval = 95;
  return new Promise(resolve => {
    const finish = () => {
      finalizeSelection(type, finalIds, result);
      dom.resultCard.classList.remove("is-animating");
      state.isAnimating = false;
      updateControls();
      renderSelection();
      resolve();
    };
    if (!frames.length) {
      finish();
      return;
    }
    showFrame(frames[0]);
    index = 1;
    if (frames.length === 1) {
      animationTimeout = setTimeout(() => {
        animationTimeout = null;
        finish();
      }, finishDelay);
      return;
    }
    animationInterval = setInterval(() => {
      showFrame(frames[index]);
      index += 1;
      if (index >= frames.length) {
        clearInterval(animationInterval);
        animationInterval = null;
        animationTimeout = setTimeout(() => {
          animationTimeout = null;
          finish();
        }, finishDelay);
      }
    }, interval);
  });
}

function finalizeSelection(type, finalIds, result) {
  if (type === "group") {
    const names = [];
    let groupValue = Number.isFinite(result.group) ? result.group : null;
    for (const id of finalIds) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
        groupValue = student.group;
      }
    }
    state.lastSelection = {
      type: "group",
      ids: finalIds,
      group: groupValue,
      names,
    };
    return;
  }
  if (type === "batch") {
    const names = [];
    for (const id of finalIds) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
      }
    }
    state.lastSelection = {
      type: "batch",
      ids: finalIds,
      names,
      count: finalIds.length,
    };
    return;
  }
  const id = finalIds[0];
  const student = state.studentsMap.get(id);
  state.lastSelection = {
    type: "single",
    ids: finalIds,
    name: student ? student.name : "",
    group: student ? student.group : null,
  };
}


function buildAnimationSequence(pool, finalIds) {
  const base = Array.from(new Set([...pool.filter(Boolean), ...finalIds]));
  if (!base.length) {
    return finalIds.filter(Boolean);
  }
  const shuffled = shuffle(base);
  const previewCount = Math.min(6, Math.max(3, shuffled.length));
  const frames = [];
  for (let i = 0; i < previewCount; i += 1) {
    frames.push(shuffled[i % shuffled.length]);
  }
  for (const id of finalIds) {
    frames.push(id);
  }
  return frames;
}

function buildGroupAnimationSequence(pool, finalGroup) {
  const base = Array.isArray(pool)
    ? pool
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
    : [];
  if (Number.isFinite(finalGroup)) {
    base.push(finalGroup);
  }
  const unique = Array.from(new Set(base));
  if (!unique.length) {
    return Number.isFinite(finalGroup) ? [finalGroup] : [];
  }
  const shuffled = shuffle(unique);
  const previewCount = Math.min(6, Math.max(3, shuffled.length));
  const frames = [];
  for (let i = 0; i < previewCount; i += 1) {
    frames.push(shuffled[i % shuffled.length]);
  }
  if (Number.isFinite(finalGroup)) {
    frames.push(finalGroup);
  }
  return frames;
}

function getGroupPool() {
  const groups = new Set();
  for (const student of state.students) {
    const value = Number(student.group);
    if (Number.isFinite(value)) {
      groups.add(value);
    }
  }
  return Array.from(groups);
}

function inferGroupFromIds(ids) {
  if (!Array.isArray(ids)) {
    return null;
  }
  for (const id of ids) {
    const student = state.studentsMap.get(id);
    if (student) {
      const value = Number(student.group);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

function shuffle(list) {
  const array = list.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function studentNameExists(name, excludeId) {
  const lowered = name.toLowerCase();
  for (const [id, student] of state.studentsMap.entries()) {
    if (excludeId && id === excludeId) {
      continue;
    }
    if (student.name.toLowerCase() === lowered) {
      return true;
    }
  }
  return false;
}

function sanitizeGroup(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.round(number));
}

function setBusy(value) {
  state.busy = value;
  updateControls();
}

function syncSelection() {
  if (!state.lastSelection) {
    return;
  }
  const selection = state.lastSelection;
  if (selection.type === "single") {
    const id = selection.ids[0];
    if (!state.studentsMap.has(id)) {
      return;
    }
    const student = state.studentsMap.get(id);
    selection.name = student.name;
    selection.group = student.group;
    return;
  }
  if (selection.type === "batch") {
    const names = [];
    for (const id of selection.ids) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
      }
    }
    selection.names = names;
    return;
  }
  if (selection.type === "group") {
    const names = [];
    let groupValue = Number.isFinite(selection.group) ? selection.group : null;
    for (const id of selection.ids) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
        groupValue = student.group;
      }
    }
    selection.names = names;
    selection.group = groupValue;
  }
}


function getSortedStudents(students) {
  const list = students.slice();
  list.sort((a, b) => {
    const count = b.pick_count - a.pick_count;
    if (count !== 0) {
      return count;
    }
    const groupDiff = a.group - b.group;
    if (groupDiff !== 0) {
      return groupDiff;
    }
    const nameDiff = a.name.localeCompare(b.name, "zh-CN");
    if (nameDiff !== 0) {
      return nameDiff;
    }
    return a.id.localeCompare(b.id, "zh-CN");
  });
  return list;
}

async function sendAction(action, data) {
  const payload = { action, ...data };
  if (USE_BROWSER_STORAGE) {
    payload.payload = state.app;
  }
  let response;
  try {
    response = await fetch("/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("\u7f51\u7edc\u8bf7\u6c42\u5931\u8d25");
  }
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) {
    throw new Error(result.message || "\u64cd\u4f5c\u5931\u8d25");
  }
  return result;
}

function normalizeAppState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const classes = Array.isArray(source.classes) ? source.classes : [];
  const normalizedClasses = classes
    .map((item, index) => normalizeClassMeta(item, index))
    .sort((a, b) => a.order - b.order);
  let currentId =
    typeof source.current_class_id === "string" ? source.current_class_id : "";
  if (currentId && !normalizedClasses.some(item => item.id === currentId)) {
    currentId = "";
  }
  const fallbackId =
    currentId || (normalizedClasses.length ? normalizedClasses[0].id : "");
  const currentClass =
    source.current_class && typeof source.current_class === "object"
      ? { ...source.current_class }
      : {};
  currentClass.id = typeof currentClass.id === "string" ? currentClass.id : fallbackId;
  currentClass.name =
    typeof currentClass.name === "string" && currentClass.name.trim()
      ? currentClass.name.trim()
      : "";
  if (!currentClass.name) {
    const metaMatch = normalizedClasses.find(item => item.id === currentClass.id);
    currentClass.name = metaMatch ? metaMatch.name : "默认班级";
  }
  let payloadCandidate = currentClass.payload;
  if (!payloadCandidate || typeof payloadCandidate !== "object") {
    payloadCandidate = source.payload;
  }
  if (
    !payloadCandidate ||
    typeof payloadCandidate !== "object" ||
    (!Array.isArray(payloadCandidate.students) &&
      !Array.isArray(source.students) &&
      source.cooldown_days === undefined)
  ) {
    payloadCandidate = {};
  }
  if (
    (!Array.isArray(payloadCandidate.students) || payloadCandidate.students.length === 0) &&
    Array.isArray(source.students)
  ) {
    payloadCandidate = {
      cooldown_days: source.cooldown_days,
      students: source.students,
      generated_at: source.generated_at,
    };
  }
  currentClass.payload = payloadCandidate;
  if (!normalizedClasses.length) {
    const synthesizedId = currentClass.id || "default";
    normalizedClasses.push({
      id: synthesizedId,
      name: currentClass.name || "默认班级",
      order: 0,
      student_count: Array.isArray(payloadCandidate.students)
        ? payloadCandidate.students.length
        : 0,
      cooldown_days: Number(payloadCandidate.cooldown_days) || Number(source.cooldown_days) || 3,
      created_at: Number(source.created_at) || 0,
      updated_at: Number(source.updated_at) || 0,
      last_used_at: Number(source.last_used_at) || 0,
    });
    currentId = synthesizedId;
    currentClass.id = synthesizedId;
  }
  return {
    version: Number.isFinite(Number(source.version))
      ? Number(source.version)
      : 0,
    current_class_id:
      currentId || (normalizedClasses.length ? normalizedClasses[0].id : ""),
    current_class: currentClass,
    classes: normalizedClasses,
  };
}

function normalizeClassMeta(entry, index) {
  const item = entry && typeof entry === "object" ? entry : {};
  const id =
    typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : `class-${index + 1}`;
  const name =
    typeof item.name === "string" && item.name.trim()
      ? item.name.trim()
      : "默认班级";
  const toNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    id,
    name,
    order: toNumber(item.order, index),
    student_count: Math.max(0, toNumber(item.student_count, 0)),
    cooldown_days: Math.max(1, toNumber(item.cooldown_days, 3)),
    created_at: toNumber(item.created_at, 0),
    updated_at: toNumber(item.updated_at, 0),
    last_used_at: toNumber(item.last_used_at, 0),
  };
}

function normalizePayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const students = Array.isArray(source.students)
    ? source.students.map(normalizeStudent)
    : [];
  const history = normalizeHistoryData(source.history);
  return {
    cooldown_days: Math.max(1, Number(source.cooldown_days) || 1),
    students,
    generated_at: Number(source.generated_at) || Date.now() / 1000,
    history,
  };
}

function normalizeHistoryData(raw) {
  const container = raw && typeof raw === "object" ? raw : {};
  let entriesSource = container.entries;
  if (!Array.isArray(entriesSource) && Array.isArray(raw)) {
    entriesSource = raw;
  }
  const entries = Array.isArray(entriesSource)
    ? entriesSource
        .map(normalizeHistoryEntry)
        .filter(entry => entry !== null)
    : [];
  let updatedAt = Number(container.updated_at);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    updatedAt = Date.now() / 1000;
  }
  return {
    entries,
    updated_at: updatedAt,
  };
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id = entry.id || entry.entry_id;
  const timestamp = Number(entry.timestamp);
  if (!id || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  const mode = typeof entry.mode === "string" ? entry.mode.toLowerCase() : "single";
  const students = Array.isArray(entry.students)
    ? entry.students
        .map(normalizeHistoryStudent)
        .filter(student => student !== null)
    : [];
  let group = Number(entry.group);
  if (!Number.isFinite(group)) {
    group = null;
  }
  const count = Number(entry.count);
  const requested = Number(entry.requested_count);
  const note = typeof entry.note === "string" ? entry.note.trim() : "";
  return {
    id: String(id),
    timestamp,
    mode,
    students,
    group,
    count: Number.isFinite(count) ? count : students.length,
    requested_count: Number.isFinite(requested) ? requested : null,
    ignore_cooldown: Boolean(entry.ignore_cooldown),
    note,
  };
}

function normalizeHistoryStudent(student) {
  if (!student || typeof student !== "object") {
    return null;
  }
  const id = String(student.id || student.student_id || "");
  const name = String(student.name || "").trim();
  let group = Number(student.group);
  if (!Number.isFinite(group)) {
    group = null;
  }
  return {
    id,
    name,
    group,
  };
}

function normalizeStudent(student) {
  const history = Array.isArray(student.pick_history)
    ? student.pick_history
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
    : [];
  const remaining = Number(student.remaining_cooldown);
  const lastPick = Number(student.last_pick);
  const pickCount = Number(student.pick_count);
  return {
    id: String(student.id || ""),
    name: String(student.name || ""),
    group: Number(student.group) || 0,
    last_pick: Number.isFinite(lastPick) ? lastPick : 0,
    remaining_cooldown: Number.isFinite(remaining) ? remaining : 0,
    pick_count: Number.isFinite(pickCount) ? pickCount : history.length,
    pick_history: history,
    is_cooling:
      student.is_cooling !== undefined
        ? Boolean(student.is_cooling)
        : Number.isFinite(remaining)
        ? remaining > 0
        : false,
  };
}

function groupColor(value) {
  const group = Math.max(0, Number(value) || 0);
  const hue = (group * 137 + 53) % 360;
  const saturation = 65;
  const lightness = 58 - (group % 4) * 6;
  const alpha = 0.4 + ((group % 5) * 6) / 100;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

function formatDate(timestamp) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "--";
  }
  return dateFormatter.format(new Date(numeric * 1000));
}

function formatTime(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return timeFormatter.format(date);
}

function formatDuration(seconds) {
  let value = Math.floor(Number(seconds));
  if (!Number.isFinite(value) || value <= 0) {
    return "\u5c11\u4e8e 1 \u5206\u949f";
  }
  const days = Math.floor(value / 86400);
  value %= 86400;
  const hours = Math.floor(value / 3600);
  value %= 3600;
  const minutes = Math.floor(value / 60);
  const parts = [];
  if (days) {
    parts.push(`${days} \u5929`);
  }
  if (hours) {
    parts.push(`${hours} \u5c0f\u65f6`);
  }
  if (!days && minutes) {
    parts.push(`${minutes} \u5206\u949f`);
  }
  if (!parts.length) {
    parts.push("\u5c11\u4e8e 1 \u5206\u949f");
  }
  return parts.join(" ");
}

function formatSince(timestamp) {
  const now = Date.now() / 1000;
  const diff = Math.max(0, Math.floor(now - Number(timestamp)));
  if (diff < 60) {
    return "\u521a\u521a";
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)} \u5206\u949f\u524d`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)} \u5c0f\u65f6\u524d`;
  }
  return `${Math.floor(diff / 86400)} \u5929\u524d`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssIdentifier(value) {
  const source = String(value || "");
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(source);
  }
  return source.replace(/[^a-zA-Z0-9_-]/g, match => `\\${match}`);
}

function startOfDay(date) {
  const target = date instanceof Date ? date : new Date(date);
  return new Date(target.getFullYear(), target.getMonth(), target.getDate());
}

function buildDomId(prefix, value) {
  const segment = encodeURIComponent(String(value));
  return `${prefix}-${segment}`;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2400);
}















