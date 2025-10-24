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
    pickAction: $("pick-action"),
    pickModeToggle: $("pick-mode-toggle"),
    resultModeMenu: $("result-mode-menu"),
    resultModeDisplay: $("result-mode-display"),
    batchField: document.querySelector("[data-batch-field]"),
    batchCount: $("batch-count"),
    resultModeControl: document.querySelector("[data-mode-control]"),
    ignoreCooldown: $("ignore-cooldown"),
    classSwitcher: $("class-switcher"),
    classSwitcherLabel: $("class-switcher-label"),
    settingsButton: $("settings-button"),
    contextMenu: $("context-menu"),
    modalRoot: $("modal-root"),
    toastStack: $("toast-stack"),
    resultCard: document.querySelector(".result-card"),
    historyList: $("history-list"),
    historyGroups: $("history-groups"),
    historyEmpty: document.querySelector("[data-history-empty]"),
    resultControlsShell: document.querySelector('.result-controls-shell'),
};

const DRAW_MODES = Object.freeze({
    SINGLE: "single",
    BATCH: "batch",
    GROUP: "group",
});

const ACTIONS = Object.freeze({
    CLASS_SWITCH: "class_switch",
    CLASS_DELETE: "class_delete",
    CLASS_CREATE: "class_create",
    CLASS_REORDER: "class_reorder",
    SET_COOLDOWN: "set_cooldown",
    CLEAR_COOLDOWN: "clear_cooldown",
    HISTORY_NOTE: "history_entry_note",
    HISTORY_DELETE: "history_entry_delete",
    STUDENT_HISTORY_CLEAR: "student_history_clear",
    STUDENT_HISTORY_REMOVE: "student_history_remove",
    STUDENT_CREATE: "student_create",
    STUDENT_UPDATE: "student_update",
    STUDENT_DELETE: "student_delete",
    RANDOM_PICK: "random_pick",
    STUDENT_FORCE_COOLDOWN: "student_force_cooldown",
    STUDENT_RELEASE_COOLDOWN: "student_release_cooldown",
});

let resultNameFitFrame = 0;

function scheduleResultNameFit(opts = {}) {
    const { immediate = false } = opts;
    if (immediate) {
        if (resultNameFitFrame) {
        cancelAnimationFrame(resultNameFitFrame);
        resultNameFitFrame = 0;
        }
        fitResultNameContent();
        return;
    }
    if (resultNameFitFrame) cancelAnimationFrame(resultNameFitFrame);
    resultNameFitFrame = requestAnimationFrame(() => {
        resultNameFitFrame = 0;
        fitResultNameContent();
    });
}

function setupResultNameObserver() {
    if (typeof ResizeObserver !== "function") return;
    if (resultNameObserver) resultNameObserver.disconnect();
    const element = dom.resultName;
    if (!element) return;
    const observer = new ResizeObserver(() => {
        scheduleResultNameFit();
    });
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    if (dom.resultCard) observer.observe(dom.resultCard);
    resultNameObserver = observer;
}

function fitResultNameContent() {
    const element = dom.resultName;
    if (!element) {
        return;
    }
    if (element.classList.contains("is-placeholder")) {
        element.style.removeProperty("font-size");
        return;
    }
    const container = element.parentElement;
    const availableHeight = container ? container.clientHeight : element.clientHeight;
    if (!availableHeight) {
        return;
    }
    element.style.removeProperty("font-size");
    const computed = window.getComputedStyle(element);
    let baseSize = parseFloat(computed.fontSize);
    if (!Number.isFinite(baseSize) || baseSize <= 0) {
        baseSize = 32;
    }
    const minSize = Math.min(baseSize, 16);
    let low = minSize;
    let high = Math.max(baseSize, minSize);
    let best = minSize;
    const fits = size => {
        element.style.fontSize = `${size}px`;
        return element.scrollHeight <= availableHeight;
    };
    if (fits(high)) {
        best = high;
    } else {
        let iteration = 0;
        const maxIterations = 8;
        while (iteration < maxIterations && high - low > 0.5) {
            const mid = (low + high) / 2;
            if (fits(mid)) {
                best = mid;
                low = mid;
            } else {
                high = mid;
            }
            iteration += 1;
        }
    }
    const finalSize = Math.max(minSize, Math.min(best, high));
    if (Math.abs(finalSize - baseSize) < 0.5) {
        element.style.removeProperty("font-size");
    } else {
        element.style.fontSize = `${finalSize}px`;
    }
}

function applyResultName(value, kind) {
    const element = dom.resultName;
    if (!element) return;
    element.classList.remove("is-placeholder", "is-text", "is-names");
    element.innerHTML = "";
    element.style.removeProperty("font-size");
    if (kind === "names") {
        const list = Array.isArray(value) ? value : [];
        if (!list.length) {
        element.classList.add("is-placeholder");
        element.textContent = "--";
        element.style.removeProperty("font-size");
        return;
        }
        element.classList.add("is-names");
        const fragment = document.createDocumentFragment();
        for (const item of list) {
        const span = document.createElement("span");
        span.className = "result-name-item";
        span.textContent = item;
        fragment.appendChild(span);
        }
        element.appendChild(fragment);
        scheduleResultNameFit({ immediate: true });
        return;
    }
    const text = typeof value === "string" ? value : String(value || "");
    if (kind === "placeholder" || !text.trim() || text === "--") {
        element.classList.add("is-placeholder");
        element.textContent = "--";
        element.style.removeProperty("font-size");
        return;
    }
    element.classList.add("is-text");
    element.textContent = text;
    scheduleResultNameFit({ immediate: true });
}

function setResultNamePlaceholder() {
    applyResultName("--", "placeholder");
}

function setResultNameText(value) {
    const text = value === undefined || value === null ? "" : String(value);
    if (!text.trim() || text === "--") {
        setResultNamePlaceholder();
        return;
    }
    applyResultName(text, "text");
}

function setResultNameNames(values) {
    const list = Array.isArray(values) ? values.map(item => String(item)).filter(item => item.trim() !== "") : [];
    if (!list.length) {
        setResultNamePlaceholder();
        return;
    }
    applyResultName(list, "names");
}

const DRAW_MODE_ALIASES = {
    [DRAW_MODES.SINGLE]: DRAW_MODES.SINGLE,
    any: DRAW_MODES.SINGLE,
    student: DRAW_MODES.SINGLE,
    [DRAW_MODES.BATCH]: DRAW_MODES.BATCH,
    [DRAW_MODES.GROUP]: DRAW_MODES.GROUP,
};

function normalizeDrawMode(value) {
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return DRAW_MODE_ALIASES[key] || DRAW_MODES.SINGLE;
}

function normalizeResultStudents(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }
    const normalized = [];
    for (const item of entries) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const id = item.id ?? item.student_id ?? item.studentId;
        if (!id) {
            continue;
        }
        const name = typeof item.name === "string" ? item.name : String(item.name || "");
        const groupValue = toFiniteNumber(item.group ?? item.group_id ?? item.groupId);
        normalized.push({
            id: String(id),
            name,
            group: groupValue,
        });
    }
    return normalized;
}

function normalizeIdList(source) {
    if (!Array.isArray(source)) {
        return [];
    }
    const list = [];
    for (const item of source) {
        if (item === undefined || item === null) {
            continue;
        }
        const id = String(item).trim();
        if (id) {
            list.push(id);
        }
    }
    return list;
}

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

const STORAGE_MODE = window.__APP_STORAGE_MODE__ || "filesystem";
const USE_BROWSER_STORAGE = STORAGE_MODE === "browser";
const STORAGE_LOCATION = window.__APP_STORAGE_LOCATION__ || "";
const APP_META = window.__APP_META__ && typeof window.__APP_META__ === "object" ? window.__APP_META__ : {};
const RUNTIME_LABELS = {
    browser: "\u7f51\u9875\u7248",
    filesystem: "\u5ba2\u6237\u7aef",
};
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
    pickMode: DRAW_MODES.SINGLE,
    isModeMenuOpen: false
};

const TOAST_DEFAULT_DURATION = 2400;
const toastStates = new Map();
let toastPauseDepth = 0;
let animationInterval = null;
let animationTimeout = null;
let renderFrameId = 0;
let renderQueued = false;
let resultNameObserver = null;
const pendingRequests = new Map();
const modalStack = [];
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
});
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});
const timeShortFormatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
});
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const PICK_MODE_LABELS = {
    [DRAW_MODES.SINGLE]: "抽取一人",
    [DRAW_MODES.BATCH]: "抽取多人",
    [DRAW_MODES.GROUP]: "抽取小组",
};

window.addEventListener("resize", scheduleResultNameFit, { passive: true });

init();

function init() {
    state.ignoreCooldown = dom.ignoreCooldown.checked;
    const initialState = loadInitialState();
    applyAppState(initialState);
    bindEvents();
    setupResultNameObserver();
    scheduleResultNameFit();
    setPickMode(state.pickMode || DRAW_MODES.SINGLE, { silent: true, skipControls: true });
    requestRender({ immediate: true });
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
        } catch {}
        console.warn("读取浏览器存档失败", error);
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
        console.warn("写入浏览器存档失败", error);
    }
}

function buildPersistableState(normalized) {
    const classesData = {};
    state.classData.forEach((payload, classId) => {
        classesData[classId] = payload;
    });
    const classes = state.classes.map(item => ({
        ...item,
        data: classesData[item.id] || null
    }));
    return {
        version: normalized.version,
        current_class_id: state.currentClassId,
        current_class: {
            id: state.currentClassId,
            name: state.currentClassName,
            payload: state.payload
        },
        classes,
        classes_data: classesData
    };
}

function bindEvents() {
    if (dom.pickAction) {
        dom.pickAction.addEventListener("click", handlePickAction);
    }
    if (dom.pickModeToggle) {
        dom.pickModeToggle.addEventListener("click", handleModeToggle);
    }
    if (dom.resultModeMenu) {
        dom.resultModeMenu.addEventListener("click", handleModeSelection);
    }
    if (dom.batchCount) {
        dom.batchCount.addEventListener("change", handleBatchInputCommit);
        dom.batchCount.addEventListener("focus", closeModeMenu);
    }
    dom.ignoreCooldown.addEventListener("change", event => {
        state.ignoreCooldown = event.target.checked;
        syncBatchInput();
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
    if (dom.settingsButton) {
        dom.settingsButton.addEventListener("click", openSettingsModal);
    }
    dom.studentList.addEventListener("contextmenu", handleContextTrigger);
    dom.cooldownList.addEventListener("contextmenu", handleContextTrigger);
    if (dom.historyList) {
        dom.historyList.addEventListener("contextmenu", handleHistoryContextTrigger);
        dom.historyList.addEventListener("scroll", closeContextMenu);
        dom.historyList.addEventListener("click", handleHistoryTap);
    }
    document.addEventListener("click", handleGlobalClick);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("resize", closeModeMenu);
    dom.contextMenu.addEventListener("click", handleContextSelection);
    dom.studentList.addEventListener("scroll", closeContextMenu);
    dom.cooldownList.addEventListener("scroll", closeContextMenu);
    window.addEventListener("keydown", handleKeydown);
    if (dom.modalRoot) {
        dom.modalRoot.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-modal-close]");
            if (!btn) return;
            const backdrop = btn.closest(".modal-backdrop");
            closeModal(backdrop || undefined);
        });
    }
}

function applyAppState(rawState) {
    const normalized = normalizeAppState(rawState);
    if (!(state.classData instanceof Map)) {
        state.classData = new Map();
    }
    state.classes = normalized.classes;
    state.classMap = new Map(state.classes.map(item => [item.id, item]));
    state.currentClassId = normalized.current_class_id || (state.classes.length ? state.classes[0].id : "");
    const currentMeta = state.classMap.get(state.currentClassId) || state.classes.find(item => item.id === state.currentClassId) || null;
    state.currentClassName = currentMeta ? currentMeta.name : DEFAULT_CLASS_NAME;
    const classesData = normalized.classes_data || {};
    Object.entries(classesData).forEach(([classId, payload]) => {
        if (payload && typeof payload === "object") {
            state.classData.set(classId, normalizePayload(payload));
        }
    });
    const rawCurrent = normalized.current_class && typeof normalized.current_class === "object" ? normalized.current_class : {};
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
    state.studentsMap = new Map(state.payload.students.map(student => [student.id, student]));
    state.students = getSortedStudents(state.payload.students);
    const historyData = state.payload.history || { entries: [] };
    state.history = Array.isArray(historyData.entries) ? historyData.entries : [];
    state.historyIndex = new Map(state.history.map(entry => [entry.id, entry]));
    syncSelection();
    const persistable = buildPersistableState(normalized);
    state.app = persistable;
    persistState(persistable);
    renderClassSwitcher();
    updateClassModal();
}

function requestRender(options = {}) {
    const immediate = !!(options && options.immediate);
    if (immediate) {
        if (renderFrameId) {
            cancelAnimationFrame(renderFrameId);
            renderFrameId = 0;
        }
        renderQueued = false;
        performRender();
        return;
    }
    if (renderQueued) {
        return;
    }
    renderQueued = true;
    renderFrameId = requestAnimationFrame(() => {
        renderFrameId = 0;
        renderQueued = false;
        performRender();
    });
}

function performRender() {
    renderStats();
    renderLists();
    renderHistory();
    renderSelection();
    dom.ignoreCooldown.checked = state.ignoreCooldown;
    renderClassSwitcher();
    updateControls();
    syncPickModeUI();
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
    const filtered = keyword ? base.filter(student => matchesKeyword(student, keyword)) : base;
    dom.studentList.innerHTML = filtered.length ? filtered.map(renderStudentItem).join("") : '<li class="empty-message">未找到匹配的学生</li>';
    const coolingStudents = base.filter(student => student.is_cooling);
    dom.cooldownList.innerHTML = coolingStudents.length ? coolingStudents.map(renderCooldownItem).join("") : '<li class="empty-message">当前没有学生处于冷却</li>';
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
                subgroups: new Map()
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
                return { key: group.key, label: group.label, entries: entriesList, subgroups: [] };
            }
            return { key: group.key, label: group.label, entries: [], subgroups };
        });
}

function renderHistoryGroup(group) {
    const content = group.subgroups.length ? group.subgroups.map(renderHistorySubgroup).join("") : `<div class="history-entries">${group.entries.map(renderHistoryEntry).join("")}</div>`;
    return `<section class="history-group" data-history-group="${escapeHtml(group.key)}">
    <div class="history-group-label">${escapeHtml(group.label)}</div>
    ${content}
  </section>`;
}

function renderHistorySubgroup(subgroup) {
    return `<div class="history-subgroup" data-history-period="${escapeHtml(subgroup.key)}">
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
    const noteMarkup = entry.note ? `<div class="history-entry-note">${escapeHtml(entry.note)}</div>` : "";
    return `<article class="history-entry" data-entry-id="${escapeHtml(entry.id)}" data-history-mode="${escapeHtml(entry.mode)}">
    <div class="history-entry-header">
      <div class="history-entry-title">
        <div class="history-entry-mode">${escapeHtml(modeLabel)}</div>
        <div class="history-entry-names">${escapeHtml(names)}</div>
      </div>
    </div>
    ${metaMarkup}
    ${noteMarkup}
  </article>`;
}

function renderStudentItem(student) {
    const color = groupColor(student.group);
    const remaining = `冷却 ${formatDuration(student.remaining_cooldown)}`;
    const domId = buildDomId("student", student.id);
    return `<li id="${domId}" class="student-item${student.is_cooling ? " is-cooling" : ""}" data-id="${escapeHtml(String(student.id))}" data-cooling="${student.is_cooling ? "1" : "0"}" style="--group-color:${color}">
    <div class="student-item-main">
      <div class="student-line">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="student-badge">组 ${escapeHtml(String(student.group))}</span>
      </div>
      <div class="student-meta">
        <span>共 ${student.pick_count} 次</span>
        ${student.is_cooling ? `<span class="student-cooldown">${escapeHtml(remaining)}</span>` : ''}
      </div>
    </div>
  </li>`;
}

function describeHistoryMode(entry) {
    const mode = normalizeDrawMode(entry && entry.mode);
    switch (mode) {
        case DRAW_MODES.GROUP:
            return "抽取小组";
        case DRAW_MODES.BATCH:
            return "抽取多人";
        default:
            return "抽取一人";
    }
}

function formatHistoryNames(entry) {
    const students = Array.isArray(entry.students) ? entry.students : [];
    const names = students.map(student => (student && student.name ? student.name : "")).filter(Boolean);
    if (!names.length) {
        return "--";
    }
    return names.join("、");
}

function buildHistoryEntryMeta(entry) {
    const meta = [];
    const absolute = formatTime(entry.timestamp);
    const shortTime = timeShortFormatter.format(new Date(entry.timestamp * 1000));
    const relative = formatSince(entry.timestamp);
    meta.push(`<span class="history-entry-tag" title="${escapeHtml(absolute)}">${escapeHtml(relative)} · ${escapeHtml(shortTime)}</span>`);
    const mode = normalizeDrawMode(entry && entry.mode);
    if (mode === DRAW_MODES.GROUP && Number.isFinite(entry.group)) {
        meta.push(`<span class="history-entry-tag">第 ${escapeHtml(String(entry.group))} 组</span>`);
    }
    if (mode === DRAW_MODES.BATCH) {
        const count = Number.isFinite(entry.count) && entry.count > 0 ? entry.count : entry.students.length;
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

function highlightHistoryEntry() {
    if (!state.historyHighlightId || !dom.historyList) {
        return;
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
    const remaining = `剩余 ${formatDuration(student.remaining_cooldown)}`;
    const domId = buildDomId("cooling", student.id);
    return `<li id="${domId}" class="student-item is-cooling" data-id="${escapeHtml(String(student.id))}" data-cooling="1" style="--group-color:${color}">
    <div class="student-item-main">
      <div class="student-line">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="student-badge">组 ${escapeHtml(String(student.group))}</span>
      </div>
      <div class="student-meta">
        <span class="student-cooldown">${escapeHtml(remaining)}</span>
      </div>
    </div>
  </li>`;
}

function renderSelection() {
    if (!state.lastSelection) {
        setResultNamePlaceholder();
        dom.resultNote.textContent = "等待抽取";
        return;
    }
    const selection = state.lastSelection;
    const students = resolveSelectionStudents(selection);
    selection.students = students;
    const mode = selection.mode || DRAW_MODES.SINGLE;
    if (mode === DRAW_MODES.BATCH) {
        const names = students.map(student => student.name).filter(Boolean);
        setResultNameNames(names);
        const count = selection.studentIds ? selection.studentIds.length : names.length;
        dom.resultNote.textContent = count ? `抽取多人 · 共 ${count} 人` : "抽取多人";
        return;
    }
    if (mode === DRAW_MODES.GROUP) {
        const names = students.map(student => student.name).filter(Boolean);
        setResultNameNames(names);
        const groupValue = toFiniteNumber(selection.group);
        if (names.length) {
            dom.resultNote.textContent = groupValue !== null ? `第 ${groupValue} 组` : "小组抽取";
        } else if (groupValue !== null) {
            dom.resultNote.textContent = `第 ${groupValue} 组 · 成员待载入`;
        } else {
            dom.resultNote.textContent = "小组抽取";
        }
        return;
    }
    const student = students[0];
    if (student) {
        setResultNameText(student.name || "--");
        const groupValue = toFiniteNumber(student.group ?? selection.group);
        dom.resultNote.textContent = groupValue !== null ? `来自第 ${groupValue} 组` : "抽取一人";
        return;
    }
    setResultNamePlaceholder();
    dom.resultNote.textContent = "抽取一人";
    return;
}

function resetSelection() {
    state.lastSelection = null;
    renderSelection();
}

function updateControls() {
    const disabled = state.busy || state.isAnimating;
    if (dom.pickAction) {
        dom.pickAction.disabled = disabled;
    }
    if (dom.pickModeToggle) {
        dom.pickModeToggle.disabled = disabled;
    }
    if (dom.batchCount) {
        dom.batchCount.disabled = disabled || state.pickMode !== DRAW_MODES.BATCH;
    }
    dom.clearCooldown.disabled = disabled;
    dom.addStudent.disabled = disabled;
    dom.cooldownDisplay.disabled = disabled;
    dom.ignoreCooldown.disabled = disabled;
    if (dom.classSwitcher) {
        dom.classSwitcher.disabled = disabled;
    }
    if (dom.settingsButton) {
        dom.settingsButton.disabled = disabled;
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
  <div class="modal-panel class-modal-panel glass">
    <div class="modal-header">
      <h2 class="modal-title">班级管理</h2>
      <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
    </div>
    <div class="class-modal-body">
      <div class="class-toolbar">
        <button type="button" class="btn btn-accent class-toolbar-btn" id="class-add-btn">添加班级</button>
        <span class="class-toolbar-note">拖拽列表可调整班级顺序</span>
      </div>
      <ul id="class-list" class="class-list">
        ${buildClassListItems()}
      </ul>
    </div>
  </div>
</div>`;
}

function buildClassAddModal() {
    return `
<div class="modal-backdrop">
  <div class="modal-panel glass">
    <div class="modal-header">
      <h3 class="modal-title">添加班级</h3>
      <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
    </div>
    <form id="class-add-form">
      <div class="modal-body slim-scroll">
        <label for="class-add-name" class="form-label">班级名称</label>
        <input id="class-add-name" name="name" type="text" class="form-control" maxlength="40" autocomplete="off" required>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-light" data-modal-close>取消</button>
        <button type="submit" class="btn btn-accent">确认添加</button>
      </div>
    </form>
  </div>
</div>`;
}

function buildSettingsModal() {
    const meta = APP_META && typeof APP_META === "object" ? APP_META : {};
    const appName = escapeHtml(String(meta.name || "Pick Me"));
    const appVersion = escapeHtml(String(meta.version || "v1.0.0"));
    const appDeveloper = escapeHtml(String(meta.developer || "KARPED1EM"));
    const appLicense = escapeHtml(String(meta.license || "MIT License"));
    const repositoryValue = typeof meta.repository === "string" ? meta.repository.trim() : "";
    const repositoryLink = repositoryValue
        ? `<a class="settings-chip-link" href="${escapeHtml(repositoryValue)}" target="_blank" rel="noopener noreferrer">\u8bbf\u95ee\u4ed3\u5e93</a>`
        : '<span class="settings-chip is-muted">\u6682\u65e0</span>';
    const runtimeLabel = escapeHtml(RUNTIME_LABELS[STORAGE_MODE] || "\u5ba2\u6237\u7aef");
    const locationHint = STORAGE_LOCATION || (USE_BROWSER_STORAGE ? "\u6d4f\u89c8\u5668 localStorage" : "\u672a\u63d0\u4f9b");
    const locationValue = escapeHtml(locationHint);
    const locationTitle = escapeHtml(locationHint);
    return `
<div class="modal-backdrop settings-modal-backdrop">
  <div class="modal-panel glass settings-modal">
    <div class="modal-header settings-modal-header">
      <h2 class="modal-title">\u8bbe\u7f6e\u4e2d\u5fc3</h2>
      <button type="button" class="btn btn-icon" data-modal-close aria-label="\u5173\u95ed">&times;</button>
    </div>
    <div class="modal-body slim-scroll settings-modal-body">
      <div class="settings-grid">
        <section class="settings-card settings-about-card">
          <h3 class="settings-card-title">\u8f6f\u4ef6\u4fe1\u606f</h3>
          <dl class="settings-data-grid">
            <div class="settings-data-row">
              <dt>\u540d\u79f0</dt>
              <dd>${appName}</dd>
            </div>
            <div class="settings-data-row">
              <dt>\u7248\u672c</dt>
              <dd>${appVersion}</dd>
            </div>
            <div class="settings-data-row">
              <dt>\u8f6f\u4ef6\u73af\u5883</dt>
              <dd>${runtimeLabel}</dd>
            </div>
            <div class="settings-data-row">
              <dt>\u5f00\u53d1\u8005</dt>
              <dd>${appDeveloper}</dd>
            </div>
            <div class="settings-data-row">
              <dt>\u5f00\u6e90\u534f\u8bae</dt>
              <dd>${appLicense}</dd>
            </div>
            <div class="settings-data-row">
              <dt>GitHub</dt>
              <dd>${repositoryLink}</dd>
            </div>
          </dl>
        </section>
        <section class="settings-card settings-runtime-card">
          <h3 class="settings-card-title">\u7528\u6237\u6570\u636e</h3>
          <p class="settings-description">\u5bfc\u5165 / \u5bfc\u51fa\u4f1a\u8986\u76d6\u5168\u90e8\u73ed\u7ea7\u3001\u5b66\u751f\u4e0e\u5386\u53f2\u8bb0\u5f55\uff0c\u9002\u7528\u4e8e\u8de8\u8bbe\u5907\u8fc1\u79fb\u6216\u5907\u4efd\u3002</p>
          <div class="settings-location-card" title="${locationTitle}">
            <span class="settings-location-label">\u5f53\u524d\u6570\u636e\u8def\u5f84</span>
            <span class="settings-location-value">${locationValue}</span>
          </div>
          <div class="settings-actions-row">
            <button id="settings-export" type="button" class="btn btn-outline-light settings-action">\u5bfc\u51fa\u6570\u636e</button>
            <button id="settings-import" type="button" class="btn btn-outline-light settings-action">\u5bfc\u5165\u6570\u636e</button>
          </div>
          <input id="settings-import-input" type="file" accept="application/json,.json" class="d-none">
        </section>
      </div>
    </div>
  </div>
</div>`;
}

function openSettingsModal() {
    if (state.busy || state.isAnimating) {
        return;
    }
    const content = buildSettingsModal();
    const backdrop = showModal(content);
    if (!backdrop) {
        return;
    }
    const exportButton = dom.modalRoot.querySelector("#settings-export");
    if (exportButton) {
        exportButton.addEventListener("click", handleSettingsExport);
    }
    const importButton = dom.modalRoot.querySelector("#settings-import");
    const importInput = dom.modalRoot.querySelector("#settings-import-input");
    if (importButton && importInput) {
        importButton.addEventListener("click", () => {
            if (importButton.disabled) {
                return;
            }
            importInput.value = "";
            importInput.click();
        });
        importInput.addEventListener("change", handleSettingsImportSelect);
    }
}

function openClassAddModal() {
    const content = buildClassAddModal();
    const el = showModal(content);
    const form = dom.modalRoot.querySelector("#class-add-form");
    const input = dom.modalRoot.querySelector("#class-add-name");
    const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
    closers.forEach(b => b.addEventListener("click", () => closeModal(el)));
    if (form) {
        form.addEventListener("submit", handleClassAddSubmit);
    }
    if (input) {
        input.value = "";
        input.focus();
        input.select();
    }
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
    const lastUsedText = meta.last_used_at > 0 ? `最近${formatSince(meta.last_used_at)}使用` : "尚未使用";
    const createdText = meta.created_at > 0 ? `创建于 ${formatDate(meta.created_at)}` : "";
    const metaSegments = [
        `${meta.student_count} 人`,
        `冷却 ${meta.cooldown_days} 天`,
        lastUsedText,
        createdText
    ].filter(Boolean);
    const metaHtml = metaSegments.map((segment, index) => {
        const separator = index === 0 ? "" : '<span class="class-item-meta-separator">·</span>';
        return `${separator}<span class="class-item-meta-entry">${escapeHtml(segment)}</span>`;
    }).join("");
    return `
  <li class="class-item${isActive ? " is-active" : ""}" draggable="true" data-class-id="${escapeHtml(id)}">
    <div class="class-item-handle" aria-hidden="true" data-class-handle>
      <span class="visually-hidden">拖拽排序</span>
    </div>
    <div class="class-item-main" data-class-switch>
      <div class="class-item-name">${escapeHtml(meta.name)}</div>
      <div class="class-item-meta">${metaHtml}</div>
    </div>
    <div class="class-item-actions">
      <button type="button" class="btn btn-danger" data-class-delete${deleteDisabled}>删除</button>
    </div>
  </li>`;
}

function bindClassModalEvents() {
    const closers = dom.modalRoot.querySelectorAll("[data-modal-close]");
    closers.forEach(button => button.addEventListener("click", closeModal));
    const addButton = dom.modalRoot.querySelector("#class-add-btn");
    if (addButton) {
        addButton.addEventListener("click", openClassAddModal);
    }
    const list = dom.modalRoot.querySelector("#class-list");
    if (list) {
        list.addEventListener("click", handleClassListClick);
        list.addEventListener("dragover", handleClassDragOver);
        list.addEventListener("drop", handleClassDrop);
        attachClassListHandlers(list);
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
        const response = await sendAction(ACTIONS.CLASS_SWITCH, { class_id: classId });
        applyAppState(response.state);
        requestRender();
        closeModal();
        showToast(`已切换至 ${state.currentClassName}`, "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
        showToast("未找到指定班级", "warning");
        return;
    }
    const confirmed = await openConfirmModal({
        title: "删除班级",
        message: `确认删除「${meta.name}」吗？该班级的所有数据都将被移除。`,
        confirmLabel: "删除",
        confirmTone: "danger"
    });
    if (!confirmed) {
        return;
    }
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.CLASS_DELETE, { class_id: classId });
        applyAppState(response.state);
        requestRender();
        showToast("班级已删除", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
        } catch {}
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

async function handleClassAddSubmit(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const input = form.querySelector("#class-add-name");
    const name = (input?.value || "").trim();
    if (!name) {
        showToast("班级名称不能为空", "warning");
        input?.focus();
        return;
    }
    const duplicated = state.classes.some(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicated) {
        showToast("班级名称已存在", "warning");
        input.focus();
        input.select();
        return;
    }
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.CLASS_CREATE, { name });
        applyAppState(response.state);
        requestRender();
        showToast("班级已添加", "success");
        closeModal();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message || "添加失败", error.status || "error");
    } finally {
        if (!state.isAnimating) setBusy(false);
    }
}

async function submitClassReorder(order) {
    if (state.busy) {
        return;
    }
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.CLASS_REORDER, { order });
        applyAppState(response.state);
        requestRender();
        showToast("班级排序已更新", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
        updateClassModal();
    } finally {
        if (!state.isAnimating) {
            setBusy(false);
        }
    }
}

function getClassOrderFromDom(list) {
    return Array.from(list.querySelectorAll(".class-item")).map(item => item.dataset.classId).filter(Boolean);
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
        showToast("冷却天数必须是整数", "warning");
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
        const response = await sendAction(ACTIONS.SET_COOLDOWN, { days: target });
        applyAppState(response.state);
        requestRender();
        showToast("冷却时间已更新", "success");
        closeModal();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
        title: "清除冷却状态",
        message: "确认要将当前所有学生移出冷却列表并立即可抽取吗？",
        confirmLabel: "清除冷却",
        confirmTone: "danger"
    });
    if (!confirmed) {
        return;
    }
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.CLEAR_COOLDOWN);
        applyAppState(response.state);
        requestRender();
        showToast("冷却列表已清空", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
    closeModeMenu();
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
        { action: "edit", label: "查看详情" },
        student.is_cooling ? { action: "release", label: "解除冷却" } : { action: "force", label: "强制冷却" }
    ];
    openContextMenu({ type: "student", id: student.id }, items, x, y);
}

function handleHistoryContextTrigger(event) {
    const item = event.target.closest("[data-entry-id]");
    if (!item) {
        return;
    }
    event.preventDefault();
    closeModeMenu();
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

function handleHistoryTap(event) {
    if (event.defaultPrevented || state.busy || state.isAnimating) {
        return;
    }
    if (event.type === "click" && "button" in event && event.button !== 0) {
        return;
    }
    closeModeMenu();
    const entryElement = event.target.closest("[data-entry-id]");
    if (!entryElement) {
        return;
    }
    const selection = window.getSelection ? window.getSelection() : null;
    if (selection && typeof selection.toString === "function" && selection.toString()) {
        return;
    }
    const entryId = entryElement.dataset.entryId;
    const entry = getHistoryEntryById(entryId);
    if (!entry) {
        return;
    }
    const rect = entryElement.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    openHistoryContextMenu(entry, x, y);
}

function openHistoryContextMenu(entry, x, y) {
    const items = [
        { action: "history-note", label: entry.note ? "编辑备注" : "添加备注" },
        { action: "history-delete", label: "删除记录", tone: "danger" }
    ];
    openContextMenu({ type: "history", id: entry.id }, items, x, y);
}

function handleGlobalClick(event) {
    if (!dom.contextMenu.classList.contains("d-none") && !dom.contextMenu.contains(event.target)) {
        closeContextMenu();
    }
    if (state.isModeMenuOpen && dom.resultModeControl && !dom.resultModeControl.contains(event.target)) {
        closeModeMenu();
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
            runSimpleAction(ACTIONS.STUDENT_FORCE_COOLDOWN, { student_id: id }, "已标记冷却");
            return;
        }
        if (action === "release") {
            runSimpleAction(ACTIONS.STUDENT_RELEASE_COOLDOWN, { student_id: id }, "已解除冷却");
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
        if (state.isModeMenuOpen) {
            event.preventDefault();
            closeModeMenu();
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
        requestRender();
        if (message) {
            showToast(message, "success");
        }
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
    dom.contextMenu.innerHTML = items.map(item => {
        const toneClass = item.tone === "danger" ? " is-danger" : "";
        return `<button type="button" class="context-item${toneClass}" data-action="${item.action}">${item.label}</button>`;
    }).join("");
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
            showToast("未找到该学生", "warning");
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
        handleStudentFormSubmit(mode, { student, idInput, nameInput, groupInput });
    });
    if (mode === "edit") {
        const deleteButton = dom.modalRoot.querySelector("#delete-student");
        if (deleteButton) {
            deleteButton.addEventListener("click", async () => {
                if (state.busy) {
                    return;
                }
                const confirmed = await openConfirmModal({
                    title: "删除学生",
                    message: `确认删除 ${student.name} 吗？该操作无法撤销。`,
                    confirmLabel: "删除",
                    cancelLabel: "取消",
                    confirmTone: "danger"
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
                showToast("备注最多 200 字", "warning");
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
        const response = await sendAction(ACTIONS.HISTORY_NOTE, { entry_id: entryId, note });
        applyAppState(response.state);
        state.historyHighlightId = entryId;
        requestRender();
        closeModal();
        showToast("备注已保存", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
    } finally {
        if (!state.isAnimating) {
            setBusy(false);
        }
    }
}

async function handleHistoryDelete(entry) {
    const names = formatHistoryNames(entry);
    const message = names && names !== "--" ? `确定删除「${names}」的记录吗？` : "确定删除这条记录吗？";
    const confirmed = await openConfirmModal({
        title: "删除历史记录",
        message,
        confirmLabel: "删除",
        confirmTone: "danger"
    });
    if (!confirmed || state.busy) {
        return;
    }
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.HISTORY_DELETE, { entry_id: entry.id });
        applyAppState(response.state);
        requestRender();
        showToast("已删除历史记录", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
    } finally {
        if (!state.isAnimating) {
            setBusy(false);
        }
    }
}

function handlePickAction() {
    if (state.busy || state.isAnimating) {
        return;
    }
    closeContextMenu();
    closeModeMenu();
    if (state.pickMode === DRAW_MODES.BATCH) {
        handleBatchPick();
        return;
    }
    if (state.pickMode === DRAW_MODES.GROUP) {
        handleRandom(DRAW_MODES.GROUP);
        return;
    }
    handleRandom(DRAW_MODES.SINGLE);
}

function handleBatchPick() {
    const available = getAvailableStudentCount();
    if (!available) {
        showToast('当前没有可抽取的学生', "warning");
        syncBatchInput();
        return;
    }
    if (!dom.batchCount) {
        const fallback = getSuggestedBatchCount(available);
        handleRandom(DRAW_MODES.BATCH, { count: fallback });
        return;
    }
    const raw = Number(dom.batchCount.value);
    if (!Number.isFinite(raw) || raw < 1 || raw > 20) {
        showToast('请输入正确的抽取人数（1-20）', "warning");
        dom.batchCount.focus();
        dom.batchCount.select();
        return;
    }
    const count = Math.floor(raw);
    if (count > available) {
        showToast('超出可抽取范围', "warning");
        dom.batchCount.value = String(available);
        dom.batchCount.focus();
        dom.batchCount.select();
        return;
    }
    dom.batchCount.value = String(count);
    handleRandom(DRAW_MODES.BATCH, { count });
}

function handleModeToggle(event) {
    event.preventDefault();
    if (!dom.resultModeMenu || state.busy || state.isAnimating) {
        return;
    }
    if (state.isModeMenuOpen) {
        closeModeMenu();
    } else {
        openModeMenu();
    }
}

function handleModeSelection(event) {
    const button = event.target.closest('.result-mode-option');
    if (!button) {
        return;
    }
    event.preventDefault();
    const mode = button.dataset.modeValue;
    setPickMode(mode);
    if (dom.pickAction) {
        dom.pickAction.focus();
    }
}

function openModeMenu() {
    if (!dom.resultModeMenu || state.isModeMenuOpen) {
        return;
    }
    syncPickModeUI();
    dom.resultModeMenu.hidden = false;
    state.isModeMenuOpen = true;
    if (dom.pickModeToggle) {
        dom.pickModeToggle.setAttribute('aria-expanded', 'true');
    }
    if (dom.resultModeControl) {
        dom.resultModeControl.classList.add('is-open');
    }
}

function closeModeMenu() {
    if (dom.resultModeMenu) {
        dom.resultModeMenu.hidden = true;
    }
    state.isModeMenuOpen = false;
    if (dom.pickModeToggle) {
        dom.pickModeToggle.setAttribute('aria-expanded', 'false');
    }
    if (dom.resultModeControl) {
        dom.resultModeControl.classList.remove('is-open');
    }
}

function setPickMode(mode, options = {}) {
    const normalized = normalizeDrawMode(mode);
    const changed = normalized !== state.pickMode;
    state.pickMode = normalized;
    syncPickModeUI();
    if (!options.skipControls) {
        updateControls();
    }
    if (!options.silent) {
        closeModeMenu();
    }
    if (changed && normalized === DRAW_MODES.BATCH && dom.batchCount && !options.silent) {
        dom.batchCount.focus();
        dom.batchCount.select();
    }
}

function syncPickModeUI() {
    if (dom.resultModeDisplay) {
        const label = PICK_MODE_LABELS[state.pickMode] || PICK_MODE_LABELS[DRAW_MODES.SINGLE];
        dom.resultModeDisplay.textContent = label;
    }
    if (dom.batchField) {
        dom.batchField.classList.toggle('d-none', state.pickMode !== DRAW_MODES.BATCH);
    }
    if (dom.resultModeMenu) {
        const options = dom.resultModeMenu.querySelectorAll('.result-mode-option');
        options.forEach(option => {
            const value = option.dataset.modeValue;
            const isActive = value === state.pickMode;
            option.classList.toggle('is-active', isActive);
            if (isActive) {
                option.setAttribute('aria-current', 'true');
            } else {
                option.removeAttribute('aria-current');
            }
        });
    }
    syncBatchInput();
    if (dom.resultControlsShell) {
    dom.resultControlsShell.classList.toggle('has-batch', state.pickMode === DRAW_MODES.BATCH);
    }
}

function syncBatchInput() {
    if (!dom.batchCount) {
        return;
    }
    const available = getAvailableStudentCount();
    dom.batchCount.setAttribute('max', Math.max(available, 1).toString());
    if (state.pickMode !== DRAW_MODES.BATCH) {
        return;
    }
    if (!available) {
        dom.batchCount.value = '';
        return;
    }
    const current = Number(dom.batchCount.value);
    if (!Number.isFinite(current) || current < 1) {
        dom.batchCount.value = String(getSuggestedBatchCount(available));
        return;
    }
    if (current > available) {
        dom.batchCount.value = String(available);
    } else {
        dom.batchCount.value = String(Math.floor(current));
    }
}

function handleBatchInputCommit() {
    if (!dom.batchCount) {
        return;
    }
    const available = getAvailableStudentCount();
    if (!available) {
        dom.batchCount.value = '';
        return;
    }
    const value = Number(dom.batchCount.value);
    if (!Number.isFinite(value) || value < 1) {
        dom.batchCount.value = String(getSuggestedBatchCount(available));
        return;
    }
    const clamped = Math.min(Math.floor(value), available);
    dom.batchCount.value = String(clamped);
}

function getAvailableStudentCount() {
    if (state.ignoreCooldown) {
        return state.students.length;
    }
    let available = 0;
    for (const student of state.students) {
        if (!student.is_cooling) {
            available += 1;
        }
    }
    return available;
}

function getSuggestedBatchCount(available) {
    if (!available) {
        return 0;
    }
    let last = 3;
    if (state.lastSelection && state.lastSelection.mode === DRAW_MODES.BATCH) {
        const idsLength = Array.isArray(state.lastSelection.studentIds) ? state.lastSelection.studentIds.length : 0;
        if (idsLength) {
            last = idsLength;
        } else if (Number.isFinite(state.lastSelection.requestedCount)) {
            last = Number(state.lastSelection.requestedCount);
        }
    }
    const fallback = Number.isFinite(last) && last > 0 ? Math.floor(last) : 2;
    return Math.min(available, Math.max(1, fallback));
}

function attachModalBackdrop(entry) {
    const backdrop = entry.element;
    const handlePointerDown = event => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            entry.pointerDown = false;
            return;
        }
        const panel = backdrop.querySelector(".modal-panel");
        const target = event.target;
        entry.pointerDown = !(panel && target instanceof Node && panel.contains(target));
    };
    const handlePointerUp = event => {
        if (!entry.pointerDown) {
            return;
        }
        entry.pointerDown = false;
        const panel = backdrop.querySelector(".modal-panel");
        const target = event.target;
        const insidePanel = panel && target instanceof Node && panel.contains(target);
        if (insidePanel) {
            return;
        }
        if (typeof entry.onBackdrop === "function") {
            entry.onBackdrop();
            if (modalStack.includes(entry)) {
                closeModal(backdrop);
            }
        } else {
            closeModal(backdrop);
        }
    };
    backdrop.addEventListener("pointerdown", handlePointerDown, true);
    backdrop.addEventListener("pointerup", handlePointerUp, true);
    entry.handlePointerDown = handlePointerDown;
    entry.handlePointerUp = handlePointerUp;
    entry.pointerDown = false;
}

function detachModalBackdrop(entry) {
    const { element, handlePointerDown, handlePointerUp } = entry;
    if (element && handlePointerDown) {
        element.removeEventListener("pointerdown", handlePointerDown, true);
    }
    if (element && handlePointerUp) {
        element.removeEventListener("pointerup", handlePointerUp, true);
    }
    entry.handlePointerDown = null;
    entry.handlePointerUp = null;
    entry.pointerDown = false;
}

function showModal(content, options = {}) {
    if (!dom.modalRoot) {
        return null;
    }
    const wrapper = document.createElement("div");
    wrapper.innerHTML = content;
    const backdrop = wrapper.firstElementChild;
    if (!backdrop) {
        return null;
    }
    dom.modalRoot.appendChild(backdrop);
    const z = 200 + modalStack.length;
    backdrop.style.zIndex = String(z);
    dom.modalRoot.classList.remove("d-none");
    document.body.classList.add("modal-open");
    const onBackdropClose = options && typeof options.onBackdropClose === "function" ? options.onBackdropClose : null;
    const entry = {
        element: backdrop,
        pointerDown: false,
        onBackdrop: () => {
            if (onBackdropClose) {
                onBackdropClose();
                if (modalStack.includes(entry)) {
                    closeModal(backdrop);
                }
            } else {
                closeModal(backdrop);
            }
        },
        handlePointerDown: null,
        handlePointerUp: null
    };
    attachModalBackdrop(entry);
    modalStack.push(entry);
    backdrop.dataset.modalLevel = String(modalStack.length);
    dom.activeModal = backdrop;
    return backdrop;
}

function closeModal(target) {
    if (!modalStack.length) {
        return;
    }
    let index = modalStack.length - 1;
    if (target) {
        index = modalStack.findIndex(entry => {
            const element = entry.element;
            if (!element) {
                return false;
            }
            if (element === target) {
                return true;
            }
            return target instanceof Node ? element.contains(target) : false;
        });
        if (index === -1) {
            return;
        }
    }
    const [entry] = modalStack.splice(index, 1);
    detachModalBackdrop(entry);
    if (entry.element && entry.element.parentNode === dom.modalRoot) {
        dom.modalRoot.removeChild(entry.element);
    }
    if (!modalStack.length) {
        dom.modalRoot.classList.add("d-none");
        dom.modalRoot.innerHTML = "";
        document.body.classList.remove("modal-open");
        delete dom.modalRoot.dataset.historyStudentId;
        state.historyStudentId = null;
        state.historyModalElement = null;
        dom.activeModal = null;
        return;
    }
    const topEntry = modalStack[modalStack.length - 1];
    dom.activeModal = topEntry.element;
}

function openConfirmModal(options) {
    const config = {
        title: options && options.title ? options.title : "确认操作",
        message: options && options.message ? options.message : "",
        confirmLabel: options && options.confirmLabel ? options.confirmLabel : "确认",
        cancelLabel: options && options.cancelLabel ? options.cancelLabel : "取消",
        confirmTone: options && options.confirmTone ? options.confirmTone : "accent"
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
        showModal(buildConfirmModal(config), { onBackdropClose: () => finish(false) });
        const confirmButton = dom.modalRoot.querySelector("[data-confirm]");
        const cancelButtons = dom.modalRoot.querySelectorAll("[data-modal-close]");
        cancelButtons.forEach(button => button.addEventListener("click", () => finish(false), { once: true }));
        if (confirmButton) {
            confirmButton.addEventListener("click", () => finish(true), { once: true });
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
        showToast("未找到该学生", "warning");
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

async function handleHistoryListClick(event) {
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
    const confirmed = await openConfirmModal({
        title: "删除记录",
        message: "确定删除该条记录吗？",
        confirmLabel: "删除",
        confirmTone: "danger"
    });
    if (!confirmed) return;
    handleHistoryRemove(studentId, value);
}

async function handleHistoryClear(studentId) {
    if (state.busy) {
        return;
    }
    const student = state.studentsMap.get(studentId);
    if (!student) {
        showToast("未找到该学生", "warning");
        return;
    }
    if (!student.pick_history.length) {
        showToast("暂无记录", "info");
        return;
    }
    const confirmed = await openConfirmModal({
        title: "清空历史记录",
        message: `确认清空 ${student.name} 的历史记录吗？`,
        confirmLabel: "清空",
        confirmTone: "danger"
    });
    if (!confirmed) return;
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.STUDENT_HISTORY_CLEAR, { student_id: studentId });
        applyAppState(response.state);
        requestRender();
        showToast("已清空历史记录", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
        const response = await sendAction(ACTIONS.STUDENT_HISTORY_REMOVE, { student_id: studentId, timestamp });
        applyAppState(response.state);
        requestRender();
        showToast("已删除记录", "success");
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
    } finally {
        setBusy(false);
    }
}

function buildHistoryModal(student) {
    const hasHistory = Array.isArray(student.pick_history) && student.pick_history.length > 0;
    const lastTime = student.last_pick ? formatTime(student.last_pick) : "暂无记录";
    const lastSince = student.last_pick ? formatSince(student.last_pick) : "";
    const historyList = buildHistoryList(student.pick_history, { withActions: true });
    const sinceMarkup = student.last_pick ? ` · <small class="history-since-tag" data-history-last-since>${escapeHtml(lastSince)}</small>` : "";
    return `<div class="modal-backdrop" data-history-root data-history-student="${escapeHtml(student.id)}">
    <div class="modal-panel glass history-modal">
      <div class="modal-header">
        <h3>历史点名</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <div class="modal-body slim-scroll">
        <div class="history-summary">
          <div class="summary-name">${escapeHtml(student.name)}</div>
          <div class="summary-meta">
            <span class="summary-tag">组 <strong data-history-group>${escapeHtml(String(student.group))}</strong></span>
            <span class="summary-tag">点名 <strong data-history-count>${student.pick_count}</strong> 次</span>
            <span class="summary-tag">最近 <strong data-history-last>${escapeHtml(lastTime)}</strong>${sinceMarkup}</span>
          </div>
        </div>
        <div class="history-box">
          <div class="history-title">记录列表</div>
          <ul class="history-list slim-scroll history-list-actions">${historyList}</ul>
        </div>
      </div>
      <div class="modal-footer history-footer">
        <button type="button" class="btn btn-outline-danger" id="history-clear" data-history-action${hasHistory ? "" : " disabled"}>清空记录</button>
        <button type="button" class="btn btn-outline-light" data-modal-close>关闭</button>
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
            last.textContent = "暂无记录";
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
        <h3>设置冷却天数</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <form id="cooldown-form">
        <div class="modal-body slim-scroll">
          <p class="text-muted">调整全员抽取后的冷却时长，避免短时间内重复点名。</p>
          <div class="mb-3">
            <label class="form-label">冷却天数</label>
            <input id="cooldown-days" type="number" min="1" class="form-control" value="${escapeHtml(String(value))}" required autocomplete="off">
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

function buildConfirmModal(options) {
    const { title = "确认操作", message = "", confirmLabel = "确认", cancelLabel = "取消", confirmTone = "accent" } = options || {};
    const confirmClass = confirmTone === "danger" ? "btn btn-danger" : "btn btn-accent";
    const headerToneClass = confirmTone === "danger" ? "modal-header confirm-modal-header is-danger" : "modal-header confirm-modal-header";
    return `<div class="modal-backdrop">
    <div class="modal-panel glass confirm-modal">
      <div class="${headerToneClass}">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <div class="modal-body slim-scroll confirm-modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="modal-footer confirm-modal-footer">
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
          <h3>添加学生</h3>
          <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
        </div>
        <form id="student-form">
          <div class="modal-body slim-scroll">
            <div class="mb-3">
              <label class="form-label">学号</label>
              <input name="student_id" type="text" class="form-control" placeholder="留空将自动生成" autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label">姓名</label>
              <input name="name" type="text" class="form-control" required autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label">小组</label>
              <input name="group" type="number" class="form-control" min="0" step="1" value="0">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-light" data-modal-close>取消</button>
            <button type="submit" class="btn btn-accent">新增</button>
          </div>
        </form>
      </div>
    </div>`;
    }
    const historyItems = buildHistoryList(student.pick_history);
    const lastPick = student.last_pick ? formatTime(student.last_pick) : "暂无记录";
    return `<div class="modal-backdrop">
    <div class="modal-panel glass">
      <div class="modal-header">
        <h3>编辑学生</h3>
        <button type="button" class="btn btn-icon" data-modal-close aria-label="关闭">×</button>
      </div>
      <form id="student-form">
        <div class="modal-body slim-scroll">
          <div class="row g-3">
            <div class="col-12 col-md-3">
              <label class="form-label">学号</label>
                <input name="student_id" type="text" class="form-control"
                  value="${escapeHtml(student.id)}" autocomplete="off">
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label">小组</label>
              <input name="group" type="number" class="form-control"
                min="0" step="1" value="${escapeHtml(String(student.group))}">
            </div>
            <div class="col-12 col-md-6">
               <label class="form-label">姓名</label>
              <input name="name" type="text" class="form-control"
                value="${escapeHtml(student.name)}" required autocomplete="off">
            </div>
            </div>
          <div class="student-info-grid mt-3">
            <div>
              <span class="info-label">累计点名</span>
              <span class="info-value">${student.pick_count}</span>
            </div>
            <div>
              <span class="info-label">最近一次</span>
              <span class="info-value">${escapeHtml(lastPick)}</span>
            </div>
          </div>
          <div class="history-box mt-4">
            <div class="history-title">历史记录</div>
            <ul class="history-list slim-scroll">${historyItems}</ul>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" id="delete-student" class="btn btn-outline-danger">删除学生</button>
          <button type="button" class="btn btn-outline-light" data-modal-close>取消</button>
          <button type="submit" class="btn btn-accent">保存修改</button>
        </div>
      </form>
    </div>
  </div>`;
}

function buildHistoryList(history, options = {}) {
    const { withActions = false } = options;
    if (!Array.isArray(history) || !history.length) {
        return '<li class="history-empty">暂无记录</li>';
    }
    const sorted = history.map(value => Number(value)).filter(value => Number.isFinite(value)).sort((a, b) => b - a);
    const items = sorted.map((timestamp, index) => {
        const order = sorted.length - index;
        const timeLabel = escapeHtml(formatTime(timestamp));
        const sinceLabel = escapeHtml(formatSince(timestamp));
        const action = withActions ? `<button type="button" class="history-delete" data-history-remove="${escapeHtml(String(timestamp))}" data-history-action>删除</button>` : "";
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
        showToast("姓名不能为空", "warning");
        nameInput.focus();
        nameInput.select();
        return;
    }
    const groupValue = sanitizeGroup(groupInput.value);
    if (groupValue < 0) {
        showToast("小组必须为非负整数", "warning");
        groupInput.focus();
        groupInput.select();
        return;
    }
    if (mode === "create") {
        if (idValue && state.studentsMap.has(idValue)) {
            showToast("学号已存在", "warning");
            if (idInput) {
                idInput.focus();
                idInput.select();
            }
            return;
        }
        if (studentNameExists(nameValue)) {
            showToast("姓名已存在", "warning");
            nameInput.focus();
            nameInput.select();
            return;
        }
        await submitStudentCreate({ student_id: idValue, name: nameValue, group: groupValue });
        return;
    }
    const currentId = context.student.id;
    const targetId = idValue || currentId;
    if (targetId !== currentId && state.studentsMap.has(targetId)) {
        showToast("学号已存在", "warning");
        if (idInput) {
            idInput.focus();
            idInput.select();
        }
        return;
    }
    if (studentNameExists(nameValue, currentId)) {
        showToast("姓名已存在", "warning");
        nameInput.focus();
        nameInput.select();
        return;
    }
    await submitStudentUpdate({ student_id: currentId, new_id: targetId, name: nameValue, group: groupValue });
}

async function submitStudentCreate(payload) {
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.STUDENT_CREATE, payload);
        applyAppState(response.state);
        requestRender();
        showToast("已添加学生", "success");
        closeModal();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
    } finally {
        if (!state.isAnimating) {
            setBusy(false);
        }
    }
}

async function submitStudentUpdate(payload) {
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.STUDENT_UPDATE, payload);
        applyAppState(response.state);
        requestRender();
        showToast("已保存修改", "success");
        closeModal();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
        const response = await sendAction(ACTIONS.STUDENT_DELETE, { student_id: student.id });
        applyAppState(response.state);
        requestRender();
        showToast("已删除学生", "success");
        closeModal();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
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
    const normalizedMode = normalizeDrawMode(mode);
    setBusy(true);
    try {
        const response = await sendAction(ACTIONS.RANDOM_PICK, {
            mode: normalizedMode,
            ignore_cooldown: state.ignoreCooldown,
            ...extra,
        });
        const result = response && typeof response === "object" ? response.result : null;
        const historyEntryId = result && result.history_entry_id ? String(result.history_entry_id) : "";
        await runSelectionAnimation(result);
        applyAppState(response.state);
        if (historyEntryId) {
            state.historyHighlightId = historyEntryId;
        }
        requestRender();
    } catch (error) {
        if (isAbortError(error)) {
            return;
        }
        showToast(error.message, error.status);
        resetSelection();
    } finally {
        if (!state.isAnimating) {
            setBusy(false);
        }
    }
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
    const base = Array.isArray(pool) ? pool.map(value => Number(value)).filter(value => Number.isFinite(value)) : [];
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
    if (value) {
        closeModeMenu();
    }
    updateControls();
}

async function handleSettingsExport(event) {
    const button = event.currentTarget;
    if (!button || button.disabled) {
        return;
    }
    button.disabled = true;
    button.classList.add("is-busy");
    try {
        if (USE_BROWSER_STORAGE) {
            await exportDataInBrowser();
        } else {
            await exportDataFromServer();
        }
        showToast("\u5bfc\u51fa\u6210\u529f", "success");
    } catch (error) {
        const message = error && error.message ? error.message : "\u5bfc\u51fa\u5931\u8d25";
        showToast(message, "error");
    } finally {
        button.disabled = false;
        button.classList.remove("is-busy");
    }
}

async function handleSettingsImportSelect(event) {
    const input = event.currentTarget;
    if (!input || !input.files || !input.files.length) {
        return;
    }
    const file = input.files[0];
    const importButton = dom.modalRoot.querySelector("#settings-import");
    if (importButton) {
        importButton.disabled = true;
        importButton.classList.add("is-busy");
    }
    let busyManaged = false;
    try {
        const payload = await readImportFile(file);
        const validated = validateImportPayload(payload);
        if (USE_BROWSER_STORAGE) {
            applyAppState(validated);
            requestRender({ immediate: true });
            showToast("\u5bfc\u5165\u6210\u529f", "success");
            closeModal();
        } else {
            setBusy(true);
            busyManaged = true;
            await submitImportPayload(validated);
            requestRender({ immediate: true });
            showToast("\u5bfc\u5165\u6210\u529f", "success");
            closeModal();
        }
    } catch (error) {
        const message = error && error.message ? error.message : "\u5bfc\u5165\u5931\u8d25";
        showToast(message, "error");
    } finally {
        if (busyManaged) {
            setBusy(false);
        }
        if (importButton) {
            importButton.disabled = false;
            importButton.classList.remove("is-busy");
        }
        input.value = "";
    }
}

async function exportDataInBrowser() {
    const snapshot = createPersistableSnapshot();
    if (!snapshot) {
        throw new Error("\u6682\u65e0\u53ef\u5bfc\u51fa\u7684\u6570\u636e");
    }
    state.app = snapshot;
    persistState(snapshot);
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const filename = generateDataFilename();
    downloadBlob(blob, filename);
}

async function exportDataFromServer() {
    let response;
    try {
        response = await fetch("/data/export");
    } catch {
        throw new Error("\u5bfc\u51fa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
    }
    if (!response.ok) {
        let message = "\u5bfc\u51fa\u5931\u8d25";
        try {
            const data = await response.json();
            if (data && data.message) {
                message = data.message;
            }
        } catch {
            // ignore JSON parse failure
        }
        throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    const filename = parseContentDisposition(disposition) || generateDataFilename();
    downloadBlob(blob, filename);
}

async function submitImportPayload(payload) {
    let response;
    try {
        response = await fetch("/data/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: payload })
        });
    } catch {
        throw new Error("\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
    }
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (!response.ok) {
        const message = body && body.message ? body.message : "\u5bfc\u5165\u5931\u8d25";
        throw new Error(message);
    }
    if (body && body.state) {
        applyAppState(body.state);
    }
}

function validateImportPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("\u5bfc\u5165\u6587\u4ef6\u683c\u5f0f\u4e0d\u6b63\u786e");
    }
    if (!Array.isArray(payload.classes)) {
        throw new Error("\u5bfc\u5165\u6587\u4ef6\u683c\u5f0f\u4e0d\u652f\u6301");
    }
    return payload;
}

function createPersistableSnapshot() {
    const classesData = {};
    state.classData.forEach((value, key) => {
        classesData[key] = value;
    });
    const classesMeta = state.classes.map(item => ({
        id: item.id,
        name: item.name,
        order: item.order,
        student_count: item.student_count,
        cooldown_days: item.cooldown_days,
        created_at: item.created_at,
        updated_at: item.updated_at,
        last_used_at: item.last_used_at
    }));
    const normalized = {
        version: state.app && Number.isFinite(Number(state.app.version)) ? Number(state.app.version) : 0,
        current_class_id: state.currentClassId,
        current_class: {
            id: state.currentClassId,
            name: state.currentClassName,
            payload: state.payload
        },
        classes: classesMeta,
        classes_data: classesData
    };
    return buildPersistableState(normalized);
}

function generateDataFilename(prefix = "pickme-data") {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${prefix}-${stamp}.json`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "pickme-data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseContentDisposition(value) {
    if (!value) {
        return "";
    }
    const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch && utfMatch[1]) {
        try {
            return decodeURIComponent(utfMatch[1]);
        } catch {
            return utfMatch[1];
        }
    }
    const asciiMatch = value.match(/filename="?([^";]+)"?/i);
    if (asciiMatch && asciiMatch[1]) {
        return asciiMatch[1];
    }
    return "";
}

async function readImportFile(file) {
    const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(typeof reader.result === "string" ? reader.result : "");
        };
        reader.onerror = () => {
            reject(new Error("\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25"));
        };
        reader.readAsText(file, "utf-8");
    });
    if (!text.trim()) {
        throw new Error("\u5bfc\u5165\u6587\u4ef6\u4e3a\u7a7a");
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("\u5bfc\u5165\u6587\u4ef6\u683c\u5f0f\u4e0d\u6b63\u786e");
    }
}

function syncSelection() {
    if (!state.lastSelection) {
        return;
    }
    const selection = state.lastSelection;
    const students = resolveSelectionStudents(selection);
    selection.students = students;
    if (selection.mode === DRAW_MODES.SINGLE && students.length) {
        selection.group = toFiniteNumber(students[0].group);
    } else if (selection.mode === DRAW_MODES.GROUP) {
        const withGroup = students.find(item => toFiniteNumber(item.group) !== null);
        if (withGroup) {
            selection.group = toFiniteNumber(withGroup.group);
        } else {
            selection.group = toFiniteNumber(selection.group);
            if (selection.group === null) {
                selection.group = toFiniteNumber(inferGroupFromIds(selection.studentIds || []));
            }
        }
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

async function sendAction(action, data, options = {}) {
    const payload = { action, ...(data || {}) };
    if (USE_BROWSER_STORAGE) {
        payload.payload = state.app;
    }
    const { cancelPrevious = true, signal } = options;
    const controller = new AbortController();
    let abortExternal;
    if (cancelPrevious) {
        const previous = pendingRequests.get(action);
        if (previous && previous.controller) {
            previous.controller.abort();
        }
        pendingRequests.set(action, { controller });
    }
    if (signal && typeof signal === "object") {
        if (signal.aborted) {
            controller.abort();
        } else if (typeof signal.addEventListener === "function") {
            abortExternal = () => controller.abort();
            signal.addEventListener("abort", abortExternal, { once: true });
        }
    }
    let response;
    try {
        response = await fetch("/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (error) {
        if (controller.signal.aborted || (error && error.name === "AbortError")) {
            const abortError = new Error("操作已取消");
            abortError.name = "AbortError";
            throw abortError;
        }
        throw new Error("网络请求失败");
    } finally {
        if (cancelPrevious) {
            const current = pendingRequests.get(action);
            if (current && current.controller === controller) {
                pendingRequests.delete(action);
            }
        }
        if (signal && abortExternal && typeof signal.removeEventListener === "function") {
            signal.removeEventListener("abort", abortExternal);
        }
    }
    let result = {};
    try {
        result = await response.json();
    } catch {
        result = {};
    }
    if (!response.ok) {
        const error = new Error(result.message || "操作失败");
        error.status = response.status;
        throw error;
    }
    return result;
}

function isAbortError(error) {
    return !!(error && error.name === "AbortError");
}

function normalizeAppState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const classes = Array.isArray(source.classes) ? source.classes : [];
    const normalizedClasses = classes.map((item, index) => normalizeClassMeta(item, index)).sort((a, b) => a.order - b.order);
    let currentId = typeof source.current_class_id === "string" ? source.current_class_id : "";
    if (currentId && !normalizedClasses.some(item => item.id === currentId)) {
        currentId = "";
    }
    const fallbackId = currentId || (normalizedClasses.length ? normalizedClasses[0].id : "");
    const currentClass = source.current_class && typeof source.current_class === "object" ? { ...source.current_class } : {};
    currentClass.id = typeof currentClass.id === "string" ? currentClass.id : fallbackId;
    currentClass.name = typeof currentClass.name === "string" && currentClass.name.trim() ? currentClass.name.trim() : "";
    if (!currentClass.name) {
        const metaMatch = normalizedClasses.find(item => item.id === currentClass.id);
        currentClass.name = metaMatch ? metaMatch.name : "默认班级";
    }
    let payloadCandidate = currentClass.payload;
    if (!payloadCandidate || typeof payloadCandidate !== "object") {
        payloadCandidate = source.payload;
    }
    if (!payloadCandidate || typeof payloadCandidate !== "object" || (!Array.isArray(payloadCandidate.students) && !Array.isArray(source.students) && source.cooldown_days === undefined)) {
        payloadCandidate = {};
    }
    if ((!Array.isArray(payloadCandidate.students) || payloadCandidate.students.length === 0) && Array.isArray(source.students)) {
        payloadCandidate = { cooldown_days: source.cooldown_days, students: source.students, generated_at: source.generated_at };
    }
    currentClass.payload = payloadCandidate;
    if (!normalizedClasses.length) {
        const synthesizedId = currentClass.id || "default";
        normalizedClasses.push({
            id: synthesizedId,
            name: currentClass.name || "默认班级",
            order: 0,
            student_count: Array.isArray(payloadCandidate.students) ? payloadCandidate.students.length : 0,
            cooldown_days: Number(payloadCandidate.cooldown_days) || Number(source.cooldown_days) || 3,
            created_at: Number(source.created_at) || 0,
            updated_at: Number(source.updated_at) || 0,
            last_used_at: Number(source.last_used_at) || 0
        });
        currentId = synthesizedId;
        currentClass.id = synthesizedId;
    }
    return {
        version: Number.isFinite(Number(source.version)) ? Number(source.version) : 0,
        current_class_id: currentId || (normalizedClasses.length ? normalizedClasses[0].id : ""),
        current_class: currentClass,
        classes: normalizedClasses
    };
}

function normalizeClassMeta(entry, index) {
    const item = entry && typeof entry === "object" ? entry : {};
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `class-${index + 1}`;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "默认班级";
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
        last_used_at: toNumber(item.last_used_at, 0)
    };
}

function normalizePayload(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const students = Array.isArray(source.students) ? source.students.map(normalizeStudent) : [];
    const history = normalizeHistoryData(source.history);
    return {
        cooldown_days: Math.max(1, Number(source.cooldown_days) || 1),
        students,
        generated_at: Number(source.generated_at) || Date.now() / 1000,
        history
    };
}

function normalizeHistoryData(raw) {
    const container = raw && typeof raw === "object" ? raw : {};
    let entriesSource = container.entries;
    if (!Array.isArray(entriesSource) && Array.isArray(raw)) {
        entriesSource = raw;
    }
    const entries = Array.isArray(entriesSource) ? entriesSource.map(normalizeHistoryEntry).filter(entry => entry !== null) : [];
    let updatedAt = Number(container.updated_at);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
        updatedAt = Date.now() / 1000;
    }
    return { entries, updated_at: updatedAt };
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
    const mode = normalizeDrawMode(entry && entry.mode);
    const students = Array.isArray(entry.students) ? entry.students.map(normalizeHistoryStudent).filter(student => student !== null) : [];
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
        note
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
    return { id, name, group };
}

function normalizeStudent(student) {
    const history = Array.isArray(student.pick_history) ? student.pick_history.map(value => Number(value)).filter(value => Number.isFinite(value)) : [];
    const nowSeconds = Date.now() / 1000;
    const rawRemaining = Number(student.remaining_cooldown);
    const rawLastPick = Number(student.last_pick);
    const rawPickCount = Number(student.pick_count);
    const rawCooldownStarted = Number(student.cooldown_started_at);
    const rawCooldownExpires = Number(student.cooldown_expires_at);
    const cooldownStarted = Number.isFinite(rawCooldownStarted) && rawCooldownStarted > 0 ? rawCooldownStarted : 0;
    const cooldownExpires = Number.isFinite(rawCooldownExpires) && rawCooldownExpires > 0 ? rawCooldownExpires : 0;
    let remaining = Number.isFinite(rawRemaining) ? rawRemaining : Number.isFinite(cooldownExpires) ? Math.max(0, cooldownExpires - nowSeconds) : 0;
    if (!Number.isFinite(remaining)) {
        remaining = 0;
    }
    remaining = Math.max(0, remaining);
    const lastPick = Number.isFinite(rawLastPick) ? rawLastPick : 0;
    const pickCount = Number.isFinite(rawPickCount) ? rawPickCount : history.length;
    const isCooling =
        student.is_cooling !== undefined
            ? Boolean(student.is_cooling)
            : remaining > 0 || cooldownExpires > nowSeconds;
    return {
        id: String(student.id || ""),
        name: String(student.name || ""),
        group: Number(student.group) || 0,
        last_pick: lastPick,
        remaining_cooldown: remaining,
        cooldown_started_at: cooldownStarted,
        cooldown_expires_at: cooldownExpires,
        pick_count: pickCount,
        pick_history: history,
        is_cooling: isCooling
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
        return "少于 1 分钟";
    }
    const days = Math.floor(value / 86400);
    value %= 86400;
    const hours = Math.floor(value / 3600);
    value %= 3600;
    const minutes = Math.floor(value / 60);
    const parts = [];
    if (days) {
        parts.push(`${days} 天`);
    }
    if (hours) {
        parts.push(`${hours} 小时`);
    }
    if (!days && minutes) {
        parts.push(`${minutes} 分钟`);
    }
    if (!parts.length) {
        parts.push("少于 1 分钟");
    }
    return parts.join(" ");
}

function formatRelativeValue(value, unit) {
    if (value === 1) {
        if (unit === "分钟") {
            return "一分钟";
        }
        if (unit === "小时") {
            return "一小时";
        }
        if (unit === "天") {
            return "一天";
        }
    }
    return `${value}${unit}`;
}

function formatSince(timestamp) {
    const now = Date.now() / 1000;
    const diff = Math.max(0, Math.floor(now - Number(timestamp)));
    if (diff < 60) {
        return "刚刚";
    }
    if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return `${formatRelativeValue(minutes, "分钟")}前`;
    }
    if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return `${formatRelativeValue(hours, "小时")}前`;
    }
    const days = Math.floor(diff / 86400);
    return `${formatRelativeValue(days, "天")}前`;
}

function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

function normalizeToastType(value) {
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!text) {
        return "info";
    }
    if (["error", "danger", "fail", "failed"].includes(text)) {
        return "error";
    }
    if (["warn", "warning", "caution", "alert"].includes(text)) {
        return "warning";
    }
    if (["success", "ok", "done", "passed"].includes(text)) {
        return "success";
    }
    return "info";
}

function handleToastHover(entering) {
    const now = performance.now();
    if (entering) {
        toastPauseDepth += 1;
    } else {
        toastPauseDepth = Math.max(0, toastPauseDepth - 1);
    }
    toastStates.forEach(state => {
        state.lastTimestamp = now;
        if (!entering && toastPauseDepth === 0 && !state.raf) {
            state.raf = requestAnimationFrame(timestamp => advanceToast(state, timestamp));
        }
    });
}

function startToastLoop(state) {
    if (!state) {
        return;
    }
    if (state.raf) {
        cancelAnimationFrame(state.raf);
    }
    state.lastTimestamp = performance.now();
    state.raf = requestAnimationFrame(timestamp => advanceToast(state, timestamp));
}

function advanceToast(state, timestamp) {
    if (!state || !toastStates.has(state.toast)) {
        return;
    }
    if (toastPauseDepth > 0) {
        state.lastTimestamp = timestamp;
        state.raf = requestAnimationFrame(next => advanceToast(state, next));
        return;
    }
    const delta = Math.max(0, timestamp - state.lastTimestamp);
    state.lastTimestamp = timestamp;
    state.remaining = Math.max(0, state.remaining - delta);
    const progress = state.remaining / state.duration;
    state.progressBar.style.setProperty("--progress", progress.toFixed(4));
    if (state.remaining <= 0) {
        dismissToast(state.toast);
        return;
    }
    state.raf = requestAnimationFrame(next => advanceToast(state, next));
}

function dismissToast(toast) {
    if (!toast) {
        return;
    }
    if (toast.matches(":hover")) {
        handleToastHover(false);
    }
    const state = toastStates.get(toast);
    if (state) {
        if (state.raf) {
            cancelAnimationFrame(state.raf);
        }
        toastStates.delete(toast);
        state.progressBar.style.setProperty("--progress", "0");
    }
    if (toast.classList.contains("is-leaving")) {
        return;
    }
    toast.classList.add("is-leaving");
    let removed = false;
    const removeToast = () => {
        if (removed) {
            return;
        }
        removed = true;
        toast.removeEventListener("animationend", removeToast);
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    };
    toast.addEventListener("animationend", removeToast);
    setTimeout(removeToast, 420);
}

function showToast(message, options) {
    const stack = dom.toastStack;
    if (!stack) {
        return null;
    }

    let config;
    if (typeof options === "number") {
        config = { type: options === 400 ? "warning" : "error" };
    } 
    else if (typeof options === "string") {
        config = { type: options };
    } 
    else {
        config = options || { type: "error"};
    }

    const type = normalizeToastType(config.type);
    const duration = Math.max(2400, Number(config.duration) || TOAST_DEFAULT_DURATION);
    const text = message === undefined || message === null ? "" : String(message);

    const toast = document.createElement("div");
    toast.className = "toast-item";
    toast.dataset.type = type;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    toast.setAttribute("aria-atomic", "true");

    const body = document.createElement("div");
    body.className = "toast-body";

    const pip = document.createElement("div");
    pip.className = "toast-pip";
    body.appendChild(pip);

    const messageElement = document.createElement("div");
    messageElement.className = "toast-message";
    messageElement.textContent = text || "提示";
    body.appendChild(messageElement);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "toast-close";
    closeButton.setAttribute("aria-label", "关闭提示");
    const closeIcon = document.createElement("span");
    closeIcon.setAttribute("aria-hidden", "true");
    closeIcon.textContent = "×";
    closeButton.appendChild(closeIcon);
    body.appendChild(closeButton);

    toast.appendChild(body);

    const progress = document.createElement("div");
    progress.className = "toast-progress";
    const progressBar = document.createElement("div");
    progressBar.className = "toast-progress-bar";
    progressBar.style.setProperty("--progress", "1");
    progress.appendChild(progressBar);
    toast.appendChild(progress);

    closeButton.addEventListener("click", () => dismissToast(toast));
    toast.addEventListener("mouseenter", () => handleToastHover(true));
    toast.addEventListener("mouseleave", () => handleToastHover(false));

    stack.prepend(toast);

    const state = {
        toast,
        duration,
        remaining: duration,
        lastTimestamp: performance.now(),
        progressBar,
        raf: 0
    };

    toastStates.set(toast, state);
    startToastLoop(state);

    return toast;
}
function resolveSelectionStudents(selection) {
    if (!selection) {
        return [];
    }
    const source = Array.isArray(selection.students) ? selection.students : [];
    const snapshotMap = new Map(source.map(item => [String(item.id), {
        id: String(item.id),
        name: typeof item.name === "string" ? item.name : String(item.name || ""),
        group: toFiniteNumber(item.group),
    }]));
    const resolved = [];
    const ids = Array.isArray(selection.studentIds) ? selection.studentIds : [];
    for (const rawId of ids) {
        const id = String(rawId);
        if (!id) {
            continue;
        }
        const student = state.studentsMap.get(id);
        if (student) {
            resolved.push({
                id: student.id,
                name: student.name,
                group: toFiniteNumber(student.group),
            });
            continue;
        }
        const fallback = snapshotMap.get(id);
        if (fallback) {
            resolved.push({ ...fallback });
        }
    }
    if (!resolved.length) {
        resolved.push(...snapshotMap.values());
    }
    return resolved;
}

function finalizeSelection(mode, finalIds, result, snapshots) {
    const normalizedMode = normalizeDrawMode(mode);
    const snapshotMap = new Map((Array.isArray(snapshots) ? snapshots : []).map(item => [String(item.id), {
        id: String(item.id),
        name: typeof item.name === "string" ? item.name : String(item.name || ""),
        group: toFiniteNumber(item.group),
    }]));
    const students = [];
    for (const rawId of finalIds) {
        const id = String(rawId);
        if (!id) {
            continue;
        }
        const student = state.studentsMap.get(id);
        if (student) {
            students.push({
                id: student.id,
                name: student.name,
                group: toFiniteNumber(student.group),
            });
            continue;
        }
        const fallback = snapshotMap.get(id);
        if (fallback) {
            students.push({ ...fallback });
        }
    }
    if (!students.length) {
        students.push(...snapshotMap.values());
    }
    let groupValue = null;
    if (normalizedMode === DRAW_MODES.GROUP) {
        const direct = toFiniteNumber(result && result.group);
        if (direct !== null) {
            groupValue = direct;
        } else {
            const withGroup = students.find(item => toFiniteNumber(item.group) !== null);
            if (withGroup) {
                groupValue = toFiniteNumber(withGroup.group);
            } else {
                for (const value of snapshotMap.values()) {
                    const numeric = toFiniteNumber(value.group);
                    if (numeric !== null) {
                        groupValue = numeric;
                        break;
                    }
                }
                if (groupValue === null) {
                    groupValue = toFiniteNumber(inferGroupFromIds(finalIds));
                }
            }
        }
    } else if (students.length) {
        groupValue = toFiniteNumber(students[0].group);
        if (groupValue === null) {
            const fallback = snapshotMap.get(String(finalIds[0]));
            if (fallback) {
                groupValue = toFiniteNumber(fallback.group);
            }
        }
    }
    const requested = Number(result && result.requested_count);
    const requestedCount = Number.isFinite(requested) && requested > 0
        ? Math.floor(requested)
        : students.length || finalIds.length || 1;
    state.lastSelection = {
        mode: normalizedMode,
        studentIds: finalIds.slice(),
        students,
        group: groupValue,
        requestedCount,
        ignoreCooldown: !!(result && result.ignore_cooldown),
        historyEntryId: result && result.history_entry_id ? String(result.history_entry_id) : "",
    };
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
    const mode = normalizeDrawMode(result.mode || result.type);
    const snapshotStudents = normalizeResultStudents(result.students);
    let finalIds = snapshotStudents.map(student => student.id);
    if (!finalIds.length) {
        if (Array.isArray(result.student_ids)) {
            finalIds = normalizeIdList(result.student_ids);
        } else if (result.student_id) {
            finalIds = normalizeIdList([result.student_id]);
        }
    }
    if (!finalIds.length) {
        resetSelection();
        return Promise.resolve();
    }
    const poolStudents = [];
    if (result.pool && typeof result.pool === "object") {
        poolStudents.push(...normalizeIdList(result.pool.students));
    }
    if (!poolStudents.length && Array.isArray(result.pool_ids)) {
        poolStudents.push(...normalizeIdList(result.pool_ids));
    }
    if (!poolStudents.length && Array.isArray(result.student_ids)) {
        poolStudents.push(...normalizeIdList(result.student_ids));
    }
    const poolGroups = [];
    if (result.pool && typeof result.pool === "object" && Array.isArray(result.pool.groups)) {
        for (const value of result.pool.groups) {
            const number = toFiniteNumber(value);
            if (number !== null) {
                poolGroups.push(number);
            }
        }
    }
    const finalGroup = mode === DRAW_MODES.GROUP
        ? (() => {
            const direct = toFiniteNumber(result.group);
            if (direct !== null) {
                return direct;
            }
            for (const item of snapshotStudents) {
                const groupValue = toFiniteNumber(item.group);
                if (groupValue !== null) {
                    return groupValue;
                }
            }
            return toFiniteNumber(inferGroupFromIds(finalIds));
        })()
        : null;
    const frames = mode === DRAW_MODES.GROUP
        ? buildGroupAnimationSequence(poolGroups.length ? poolGroups : getGroupPool(), finalGroup)
        : buildAnimationSequence(poolStudents.length ? poolStudents : finalIds, finalIds);
    const snapshotMap = new Map(snapshotStudents.map(student => [student.id, student]));
    state.isAnimating = true;
    updateControls();
    dom.resultCard.classList.add("is-animating");
    dom.resultNote.textContent = "正在抽取...";
    let index = 0;
    const finishDelay = 140;
    const interval = 95;
    const showFrame = mode === DRAW_MODES.GROUP
        ? value => {
            const numeric = Number(value);
            setResultNameText(Number.isFinite(numeric) ? `第 ${numeric} 组` : "--");
        }
        : id => {
            const student = state.studentsMap.get(id) || snapshotMap.get(id);
            setResultNameText(student ? student.name : "--");
        };
    return new Promise(resolve => {
        const finish = () => {
            finalizeSelection(mode, finalIds, result, snapshotStudents);
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
