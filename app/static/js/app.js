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
  pickGroup: $("pick-group"),
  ignoreCooldown: $("ignore-cooldown"),
  classSwitcher: $("class-switcher"),
  classSwitcherLabel: $("class-switcher-label"),
  contextMenu: $("context-menu"),
  modalRoot: $("modal-root"),
  toast: $("toast"),
  resultCard: document.querySelector(".result-card"),
};

const STORAGE_MODE = window.__APP_STORAGE_MODE__ || "filesystem";
const USE_BROWSER_STORAGE = STORAGE_MODE === "browser";
const STORAGE_KEY = "pickme::payload";
const DEFAULT_CLASS_NAME = "未命名班级";

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
  menuTarget: null,
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

init();

function init() {
  state.ignoreCooldown = dom.ignoreCooldown.checked;
  const initialState = loadInitialState();
  applyAppState(initialState);
  bindEvents();
  render();
}

function loadInitialState() {
  if (USE_BROWSER_STORAGE) {
    const stored = readStoredState();
    if (stored) {
      return stored;
    }
  }
  return window.__APP_INITIAL_DATA__ || {};
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
  const name = state.currentClassName || "未命名班级";
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
    dom.resultNote.textContent = "\u7b49\u5f85\u62bd\u53d6";
    return;
  }
  if (state.lastSelection.type === "single") {
    const id = state.lastSelection.ids[0];
    const student = state.studentsMap.get(id);
    if (student) {
      state.lastSelection.name = student.name;
      state.lastSelection.group = student.group;
    }
    const name = state.lastSelection.name || "--";
    const groupValue = Number.isFinite(state.lastSelection.group)
      ? state.lastSelection.group
      : null;
    dom.resultName.textContent = name;
    dom.resultNote.textContent = groupValue !== null
      ? `\u6765\u81ea\u7b2c ${groupValue} \u7ec4`
      : "\u968f\u673a\u62bd\u53d6";
  } else {
    const names = [];
    let groupValue = Number.isFinite(state.lastSelection.group)
      ? state.lastSelection.group
      : null;
    for (const id of state.lastSelection.ids) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
        groupValue = student.group;
      }
    }
    if (!names.length && Array.isArray(state.lastSelection.names)) {
      names.push(...state.lastSelection.names);
    } else {
      state.lastSelection.names = names.slice();
    }
    state.lastSelection.group = groupValue;
    dom.resultName.textContent = groupValue !== null
      ? `\u7b2c ${groupValue} \u7ec4`
      : "\u5c0f\u7ec4\u62bd\u53d6";
    dom.resultNote.textContent = names.length
      ? names.join("\u3001")
      : "\u6210\u5458\u5df2\u52a0\u5165\u51b7\u5374";
  }
}

function resetSelection() {
  state.lastSelection = null;
  renderSelection();
}

function updateControls() {
  const disabled = state.busy || state.isAnimating;
  dom.pickAny.disabled = disabled;
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
  openContextMenu(student, event.clientX, event.clientY);
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
  const id = state.menuTarget;
  closeContextMenu();
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

function openContextMenu(student, x, y) {
  closeContextMenu();
  const entries = [
    { action: "edit", label: "\u67e5\u770b\u8be6\u60c5" },
    student.is_cooling
      ? { action: "release", label: "\u89e3\u9664\u51b7\u5374" }
      : { action: "force", label: "\u5f3a\u5236\u51b7\u5374" },
  ];
  dom.contextMenu.innerHTML = entries
    .map(
      item =>
        `<button type="button" class="context-item" data-action="${item.action}">${item.label}</button>`
    )
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
  state.menuTarget = student.id;
}

function closeContextMenu() {
  state.menuTarget = null;
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

async function handleRandom(mode) {
  if (state.busy || state.isAnimating) {
    return;
  }
  closeContextMenu();
  setBusy(true);
  try {
    const response = await sendAction("random_pick", {
      mode,
      ignore_cooldown: state.ignoreCooldown,
    });
    await runSelectionAnimation(response.result);
    applyAppState(response.state);
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
  const finalIds =
    type === "group"
      ? Array.isArray(result.student_ids)
        ? result.student_ids.filter(Boolean)
        : []
      : result.student_id
      ? [result.student_id]
      : [];
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
  dom.resultNote.textContent = "\u6b63\u5728\u62bd\u53d6...";
  let index = 0;
  let showFrame;
  if (type === "group") {
    showFrame = value => {
      const numeric = Number(value);
      dom.resultName.textContent = Number.isFinite(numeric)
        ? `\u7b2c ${numeric} \u7ec4`
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
  } else {
    const id = finalIds[0];
    const student = state.studentsMap.get(id);
    state.lastSelection = {
      type: "single",
      ids: [id],
      name: student ? student.name : null,
      group: student ? student.group : Number.isFinite(result.group) ? result.group : null,
    };
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
  if (state.lastSelection.type === "single") {
    const id = state.lastSelection.ids[0];
    if (!state.studentsMap.has(id)) {
      return;
    }
    const student = state.studentsMap.get(id);
    state.lastSelection.name = student.name;
    state.lastSelection.group = student.group;
  } else {
    const names = [];
    let groupValue = Number.isFinite(state.lastSelection.group)
      ? state.lastSelection.group
      : null;
    for (const id of state.lastSelection.ids) {
      const student = state.studentsMap.get(id);
      if (student) {
        names.push(student.name);
        groupValue = student.group;
      }
    }
    state.lastSelection.names = names;
    state.lastSelection.group = groupValue;
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
    currentClass.name = metaMatch ? metaMatch.name : "未命名班级";
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
      : "未命名班级";
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
  return {
    cooldown_days: Math.max(1, Number(source.cooldown_days) || 1),
    students,
    generated_at: Number(source.generated_at) || Date.now() / 1000,
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















