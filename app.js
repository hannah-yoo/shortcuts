const STORAGE_KEY = "knob-studio-config-v1";

const KEY_NAMES = ["01", "02", "03", "04", "05", "06"];
const LAYER_NAMES = ["일상", "크리에이티브", "미디어"];
const MEDIA_LABELS = {
  playPause: "재생 / 일시 정지",
  next: "다음 트랙",
  previous: "이전 트랙",
  mute: "음소거",
};
const KNOB_LABELS = {
  volumeUp: "볼륨 높이기",
  volumeDown: "볼륨 낮추기",
  scrollDown: "아래로 스크롤",
  scrollUp: "위로 스크롤",
  zoomIn: "확대하기",
  zoomOut: "축소하기",
  nextTrack: "다음 트랙",
  previousTrack: "이전 트랙",
  brightnessUp: "밝기 높이기",
  brightnessDown: "밝기 낮추기",
  playPause: "재생 / 일시 정지",
  mute: "음소거",
  none: "사용 안 함",
};
const DEFAULT_CONFIG = {
  version: 1,
  layers: [
    {
      name: "일상",
      keys: [
        { type: "shortcut", value: "⌘ C" },
        { type: "shortcut", value: "⌘ V" },
        { type: "shortcut", value: "⌘ Z" },
        { type: "shortcut", value: "⌘ ⇧ Z" },
        { type: "shortcut", value: "⌘ T" },
        { type: "shortcut", value: "⌘ F" },
      ],
      knob: { sensitivity: 3, clockwise: "volumeUp", counterclockwise: "volumeDown", press: "playPause" },
    },
    {
      name: "크리에이티브",
      keys: [
        { type: "shortcut", value: "⌘ Z" },
        { type: "shortcut", value: "⌘ ⇧ Z" },
        { type: "shortcut", value: "⌘ S" },
        { type: "shortcut", value: "⌘ ⇧ S" },
        { type: "shortcut", value: "⌘ +" },
        { type: "shortcut", value: "⌘ -" },
      ],
      knob: { sensitivity: 2, clockwise: "zoomIn", counterclockwise: "zoomOut", press: "none" },
    },
    {
      name: "미디어",
      keys: [
        { type: "media", value: "playPause" },
        { type: "media", value: "previous" },
        { type: "media", value: "next" },
        { type: "media", value: "mute" },
        { type: "shortcut", value: "⌘ ⇧ [" },
        { type: "shortcut", value: "⌘ ⇧ ]" },
      ],
      knob: { sensitivity: 4, clockwise: "nextTrack", counterclockwise: "previousTrack", press: "playPause" },
    },
  ],
};

let config = loadConfig();
let activeLayer = 0;
let selectedControl = { type: "key", index: 0 };
let toastTimer;
let connectedDevice = null;

const elements = {
  grid: document.querySelector("#keys-grid"),
  layerTabs: [...document.querySelectorAll(".layer-tab")],
  keyEditor: document.querySelector("#key-editor"),
  knobEditor: document.querySelector("#knob-editor"),
  actionType: document.querySelector("#action-type"),
  actionFields: document.querySelector("#action-fields"),
  sensitivity: document.querySelector("#sensitivity"),
  sensitivityValue: document.querySelector("#sensitivity-value"),
  clockwise: document.querySelector("#clockwise"),
  counterclockwise: document.querySelector("#counterclockwise"),
  knobPress: document.querySelector("#knob-press"),
  selectionIcon: document.querySelector("#selection-icon"),
  selectionType: document.querySelector("#selection-type"),
  selectionTitle: document.querySelector("#selection-title"),
  selectionHint: document.querySelector("#selection-hint"),
  summary: document.querySelector("#key-summary"),
  saveStatus: document.querySelector("#save-status"),
  toast: document.querySelector("#toast"),
  connectButton: document.querySelector("#connect-button"),
  connectionTitle: document.querySelector("#connection-title"),
  connectionMessage: document.querySelector("#connection-message"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidConfig(value) {
  return value && value.version === 1 && Array.isArray(value.layers) &&
    value.layers.length === 3 && value.layers.every((layer) =>
      layer && typeof layer.name === "string" && Array.isArray(layer.keys) &&
      layer.keys.length === 6 && layer.keys.every((key) =>
        key && ["shortcut", "text", "media", "disabled"].includes(key.type) &&
        typeof key.value === "string" &&
        (key.type !== "media" || Object.hasOwn(MEDIA_LABELS, key.value))) &&
      layer.knob && Number.isInteger(layer.knob.sensitivity) &&
      layer.knob.sensitivity >= 1 && layer.knob.sensitivity <= 10 &&
      Object.hasOwn(KNOB_LABELS, layer.knob.clockwise) &&
      Object.hasOwn(KNOB_LABELS, layer.knob.counterclockwise) &&
      Object.hasOwn(KNOB_LABELS, layer.knob.press));
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isValidConfig(parsed)) return parsed;
      console.warn("The saved knob profile is invalid; defaults were loaded.");
    }
  } catch (error) {
    console.warn("Could not load the saved knob profile.", error);
  }
  return clone(DEFAULT_CONFIG);
}

function currentLayer() {
  return config.layers[activeLayer];
}

function keyDisplay(key) {
  if (key.type === "disabled") return "—";
  if (key.type === "text") return key.value || "텍스트";
  if (key.type === "media") return MEDIA_LABELS[key.value] || "미디어";
  return key.value || "단축키";
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    elements.saveStatus.textContent = "이 브라우저에 저장됨";
  } catch (error) {
    elements.saveStatus.textContent = "저장 실패";
    showToast("브라우저 저장 공간에 기록하지 못했어요. JSON으로 내보내 백업해 주세요.");
    console.error("Could not save the knob profile.", error);
  }
}

function render() {
  renderLayerTabs();
  renderKeys();
  renderEditor();
  renderSummary();
}

function renderLayerTabs() {
  elements.layerTabs.forEach((tab, index) => {
    tab.classList.toggle("active", index === activeLayer);
    tab.setAttribute("aria-selected", String(index === activeLayer));
    tab.querySelector(".layer-name").textContent = config.layers[index].name || LAYER_NAMES[index];
  });
}

function renderKeys() {
  elements.grid.replaceChildren();
  currentLayer().keys.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `keycap${selectedControl.type === "key" && selectedControl.index === index ? " selected" : ""}`;
    button.setAttribute("aria-label", `키 ${KEY_NAMES[index]}: ${keyDisplay(key)}`);
    const number = document.createElement("span");
    number.className = "key-number";
    number.textContent = KEY_NAMES[index];
    const name = document.createElement("span");
    name.className = "key-name";
    name.textContent = keyDisplay(key);
    button.append(number, name);
    button.addEventListener("click", () => selectKey(index));
    elements.grid.append(button);
  });
  document.querySelector("#knob-select").classList.toggle("selected", selectedControl.type === "knob");
}

function renderEditor() {
  const isKnob = selectedControl.type === "knob";
  elements.keyEditor.hidden = isKnob;
  elements.knobEditor.hidden = !isKnob;
  elements.selectionIcon.textContent = isKnob ? "↻" : KEY_NAMES[selectedControl.index];
  elements.selectionType.textContent = isKnob ? "ROTARY SETTINGS" : "KEY MAPPING";
  elements.selectionTitle.textContent = isKnob ? "노브 설정" : `키 ${KEY_NAMES[selectedControl.index]}`;
  elements.selectionHint.textContent = isKnob ? "방향별 동작과 이동량을 설정하세요" : "키를 선택해 기능을 설정하세요";

  if (isKnob) {
    const knob = currentLayer().knob;
    elements.sensitivity.value = knob.sensitivity;
    elements.sensitivityValue.textContent = knob.sensitivity;
    updateRangeStyle();
    elements.clockwise.value = knob.clockwise;
    elements.counterclockwise.value = knob.counterclockwise;
    elements.knobPress.value = knob.press;
    return;
  }

  const key = currentLayer().keys[selectedControl.index];
  elements.actionType.value = key.type;
  renderActionField(key);
}

function renderActionField(key) {
  elements.actionFields.replaceChildren();
  if (key.type === "disabled") return;
  const wrapper = document.createElement("div");
  wrapper.className = "action-detail";
  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = "action-value";
  const input = document.createElement(key.type === "media" ? "select" : "input");
  input.id = "action-value";

  if (key.type === "media") {
    label.textContent = "미디어 기능";
    for (const [value, text] of Object.entries(MEDIA_LABELS)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      input.append(option);
    }
    input.value = Object.hasOwn(MEDIA_LABELS, key.value) ? key.value : "playPause";
    input.addEventListener("change", () => updateSelectedKey(input.value));
    const selectWrap = document.createElement("div");
    selectWrap.className = "select-wrap";
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    selectWrap.append(input, arrow);
    wrapper.append(label, selectWrap);
  } else {
    label.textContent = key.type === "text" ? "입력할 텍스트" : "단축키 입력";
    input.type = "text";
    input.value = key.value;
    input.maxLength = key.type === "text" ? 120 : 60;
    input.placeholder = key.type === "text" ? "예: 안녕하세요!" : "예: ⌘ ⇧ P";
    if (key.type === "shortcut") input.className = "shortcut-input";
    input.addEventListener("input", () => updateSelectedKey(input.value));
    wrapper.append(label, input);
  }
  elements.actionFields.append(wrapper);
}

function summaryText(key) {
  if (key.type === "shortcut") return key.value || "단축키";
  if (key.type === "text") return key.value || "텍스트";
  if (key.type === "media") return MEDIA_LABELS[key.value] || "미디어";
  return "사용 안 함";
}

function renderSummary() {
  elements.summary.replaceChildren();
  currentLayer().keys.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `summary-item${selectedControl.type === "key" && selectedControl.index === index ? " active" : ""}`;
    button.setAttribute("aria-label", `키 ${KEY_NAMES[index]} 편집`);
    const number = document.createElement("span");
    number.className = "summary-key";
    number.textContent = KEY_NAMES[index];
    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = summaryText(key);
    button.append(number, label);
    button.addEventListener("click", () => selectKey(index));
    elements.summary.append(button);
  });
}

function selectKey(index) {
  selectedControl = { type: "key", index };
  render();
}

function updateSelectedKey(value) {
  currentLayer().keys[selectedControl.index].value = value;
  saveConfig();
  renderKeys();
  renderSummary();
}

function updateRangeStyle() {
  const progress = ((Number(elements.sensitivity.value) - 1) / 9) * 100;
  elements.sensitivity.style.setProperty("--range-progress", `${progress}%`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function exportConfig() {
  const content = JSON.stringify(config, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "knob-studio-profile.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("설정 백업 파일을 내보냈어요.");
}

elements.layerTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeLayer = Number(tab.dataset.layer);
    selectedControl = { type: "key", index: 0 };
    render();
  });
});

document.querySelector("#knob-select").addEventListener("click", () => {
  selectedControl = { type: "knob" };
  render();
});

elements.actionType.addEventListener("change", () => {
  const type = elements.actionType.value;
  const defaultValue = type === "media" ? "playPause" : "";
  currentLayer().keys[selectedControl.index] = { type, value: defaultValue };
  saveConfig();
  render();
});

elements.sensitivity.addEventListener("input", () => {
  currentLayer().knob.sensitivity = Number(elements.sensitivity.value);
  elements.sensitivityValue.textContent = elements.sensitivity.value;
  updateRangeStyle();
  saveConfig();
});

for (const [element, property] of [
  [elements.clockwise, "clockwise"],
  [elements.counterclockwise, "counterclockwise"],
  [elements.knobPress, "press"],
]) {
  element.addEventListener("change", () => {
    currentLayer().knob[property] = element.value;
    saveConfig();
  });
}

document.querySelector("#export-button").addEventListener("click", exportConfig);
document.querySelector("#import-button").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidConfig(imported)) throw new Error("Unsupported profile shape.");
    config = imported;
    activeLayer = 0;
    selectedControl = { type: "key", index: 0 };
    saveConfig();
    render();
    showToast("설정을 가져왔어요.");
  } catch (error) {
    console.error("Could not import the selected knob profile.", error);
    showToast("올바른 knob. 설정 파일이 아니에요.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#reset-layer").addEventListener("click", () => {
  config.layers[activeLayer] = clone(DEFAULT_CONFIG.layers[activeLayer]);
  selectedControl = { type: "key", index: 0 };
  saveConfig();
  render();
  showToast(`${LAYER_NAMES[activeLayer]} 레이어를 초기화했어요.`);
});

document.querySelector("#show-all").addEventListener("click", () => {
  document.querySelector("#key-summary").scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#top-link").addEventListener("click", (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#connect-button").addEventListener("click", async () => {
  if (connectedDevice?.gatt?.connected) {
    connectedDevice.gatt.disconnect();
    connectedDevice = null;
    elements.connectionTitle.textContent = "키패드와 연결하기";
    elements.connectionMessage.textContent = "Bluetooth 연결을 확인할 수 있어요. 매핑은 이 브라우저에 저장됩니다.";
    elements.connectButton.querySelector("span").textContent = "Bluetooth 연결";
    return;
  }
  if (!("bluetooth" in navigator)) {
    showToast("이 브라우저는 Web Bluetooth를 지원하지 않아요. Chrome을 사용해 주세요.");
    return;
  }
  if (!window.isSecureContext) {
    showToast("Bluetooth 연결에는 HTTPS 또는 localhost가 필요해요.");
    return;
  }
  elements.connectButton.disabled = true;
  elements.connectButton.querySelector("span").textContent = "기기 검색 중";
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    if (!device.gatt) throw new Error("Selected device does not expose GATT.");
    device.addEventListener("gattserverdisconnected", () => {
      connectedDevice = null;
      elements.connectionTitle.textContent = "키패드 연결이 해제됐어요";
      elements.connectionMessage.textContent = "설정은 이 브라우저에 저장되어 있어요.";
      elements.connectButton.querySelector("span").textContent = "다시 연결";
    });
    await device.gatt.connect();
    connectedDevice = device;
    elements.connectionTitle.textContent = `${device.name || "키패드"} 연결됨`;
    elements.connectionMessage.textContent = "Bluetooth 연결을 확인했어요. 기기 설정 전송은 지원하지 않아요.";
    elements.connectButton.querySelector("span").textContent = "연결 해제";
  } catch (error) {
    if (error.name !== "NotFoundError") {
      console.error("Could not connect to the selected Bluetooth device.", error);
      showToast("Bluetooth 연결에 실패했어요. 브라우저 권한과 기기 상태를 확인해 주세요.");
    }
  } finally {
    elements.connectButton.disabled = false;
    if (elements.connectButton.querySelector("span").textContent === "기기 검색 중") {
      elements.connectButton.querySelector("span").textContent = "Bluetooth 연결";
    }
  }
});

render();
