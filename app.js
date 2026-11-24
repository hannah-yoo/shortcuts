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
let deviceSnapshot = null;
let backupDownloaded = false;
let deviceBusy = false;

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
  readButton: document.querySelector("#read-button"),
  backupButton: document.querySelector("#backup-button"),
  restoreButton: document.querySelector("#restore-button"),
  applyButton: document.querySelector("#apply-button"),
  knobTarget: document.querySelector("#knob-target"),
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

function updateDeviceButtons() {
  const connected = Boolean(connectedDevice?.opened);
  elements.connectButton.disabled = deviceBusy;
  elements.connectButton.textContent = connected ? "연결 해제" : "USB 연결";
  elements.readButton.disabled = deviceBusy || !connected;
  elements.backupButton.disabled = deviceBusy || !deviceSnapshot;
  elements.restoreButton.disabled = deviceBusy || !connected || !deviceSnapshot;
  elements.applyButton.disabled = deviceBusy || !connected || !deviceSnapshot || !backupDownloaded;
}

function deviceError(error) {
  console.error("USB device operation failed.", error);
  elements.connectionMessage.textContent = error.message || "USB 작업에 실패했습니다.";
  showToast(elements.connectionMessage.textContent);
}

elements.connectButton.addEventListener("click", async () => {
  if (deviceBusy) return;
  if (connectedDevice?.opened) {
    deviceBusy = true;
    updateDeviceButtons();
    try {
      await connectedDevice.close();
      connectedDevice = null;
      deviceSnapshot = null;
      backupDownloaded = false;
      elements.connectionTitle.textContent = "USB-C로 키패드 연결하기";
      elements.connectionMessage.textContent = "연결을 해제했습니다. 편집 내용은 브라우저에 남아 있습니다.";
    } catch (error) {
      deviceError(error);
    } finally {
      deviceBusy = false;
      updateDeviceButtons();
    }
    return;
  }
  if (!window.isSecureContext || !navigator.hid) {
    showToast("WebHID를 지원하는 Chrome 또는 Edge에서 HTTPS나 localhost로 열어 주세요.");
    return;
  }
  deviceBusy = true;
  updateDeviceButtons();
  let device;
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: 0x514c, productId: 0x8850, usagePage: 0xff00, usage: 1 }],
    });
    if (devices.length === 0) return;
    device = devices.find(KnobProtocol.isConfigDevice);
    if (!device) throw new Error("설정용 HID 인터페이스를 찾지 못했습니다. 호환되지 않는 기기일 수 있습니다.");
    await device.open();
    const acknowledged = await KnobProtocol.initialize(device);
    connectedDevice = device;
    deviceSnapshot = null;
    backupDownloaded = false;
    elements.connectionTitle.textContent = `${device.productName || "키패드"} USB 연결됨`;
    elements.connectionMessage.textContent = acknowledged
      ? "초기 응답 확인됨. 기기 읽기 후 원본 백업을 먼저 저장해 주세요."
      : "초기 응답을 확인하지 못했습니다. 기기 읽기로 호환성을 확인해 주세요. 읽기에 실패하면 기기에 적용할 수 없습니다.";
  } catch (error) {
    if (device?.opened && device !== connectedDevice) {
      try { await device.close(); } catch (closeError) { console.error("Could not close the HID device.", closeError); }
    }
    deviceError(error);
  } finally {
    deviceBusy = false;
    updateDeviceButtons();
  }
});

if (navigator.hid) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (event.device !== connectedDevice) return;
    connectedDevice = null;
    deviceSnapshot = null;
    backupDownloaded = false;
    elements.connectionTitle.textContent = "USB 연결이 해제됐어요";
    elements.connectionMessage.textContent = "기기 상태는 확인되지 않았습니다. 다시 연결하고 읽어 주세요.";
    updateDeviceButtons();
  });
}

elements.readButton.addEventListener("click", async () => {
  if (deviceBusy || !connectedDevice?.opened) return;
  deviceBusy = true;
  deviceSnapshot = null;
  backupDownloaded = false;
  updateDeviceButtons();
  try {
    const layers = [];
    for (let layer = 0; layer < 3; layer++) {
      elements.connectionMessage.textContent = `기기의 레이어 ${layer + 1} 읽는 중…`;
      layers.push(await KnobProtocol.readLayer(connectedDevice, layer));
    }
    deviceSnapshot = layers;
    const count = layers.reduce((sum, records) => sum + records.size, 0);
    elements.connectionMessage.textContent = `${count}개 원본 매핑을 읽었습니다. 원본 백업을 저장한 뒤 선택한 동작을 적용할 수 있어요.`;
  } catch (error) {
    deviceError(error);
  } finally {
    deviceBusy = false;
    updateDeviceButtons();
  }
});

elements.backupButton.addEventListener("click", () => {
  if (!deviceSnapshot) return;
  const backup = {
    format: "knob-studio-hid-backup-v1",
    vendorId: 0x514c,
    productId: 0x8850,
    layers: deviceSnapshot.map((records) => Object.fromEntries(
      [...records].map(([id, bytes]) => [id, Array.from(bytes)])
    )),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "knob-device-original-reports.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupDownloaded = true;
  updateDeviceButtons();
  elements.connectionMessage.textContent = "원본 보고서 백업 다운로드를 요청했어요. 파일 저장 여부를 확인한 후 적용해 주세요.";
});

function currentTarget() {
  const target = selectedControl.type === "key" ? selectedControl.index + 1 :
    { counterclockwise: 16, press: 17, clockwise: 18 }[elements.knobTarget.value];
  const targetName = selectedControl.type === "key" ? `키 ${KEY_NAMES[selectedControl.index]}` :
    { counterclockwise: "노브 반시계", press: "노브 누르기", clockwise: "노브 시계" }[elements.knobTarget.value];
  return { target, targetName };
}

async function writeAndVerify(layer, target, targetName, payload) {
  deviceBusy = true;
  updateDeviceButtons();
  try {
    elements.connectionMessage.textContent = "선택한 동작을 전송하고 있습니다…";
    await KnobProtocol.send(connectedDevice, payload);
    await KnobProtocol.send(connectedDevice, KnobProtocol.report([0xfd, 0xfe, 0xff]));
    const records = await KnobProtocol.readLayer(connectedDevice, layer);
    if (!KnobProtocol.matches(payload, records.get(target))) {
      throw new Error("전송 후 읽은 값이 일치하지 않습니다. 기기 설정이 일부 변경됐을 수 있으니 실제 동작을 확인해 주세요.");
    }
    elements.connectionMessage.textContent = `레이어 ${layer + 1} ${targetName}: 읽은 값이 전송값과 일치합니다. 실제 키 위치와 전원 재연결 후 유지 여부를 확인해 주세요.`;
  } catch (error) {
    deviceError(error);
    deviceSnapshot = null;
    backupDownloaded = false;
    elements.connectionMessage.textContent += " 기기 설정이 변경됐을 수 있습니다. 다시 읽어 확인하세요.";
  } finally {
    deviceBusy = false;
    updateDeviceButtons();
  }
}

elements.applyButton.addEventListener("click", async () => {
  if (deviceBusy || !connectedDevice?.opened || !deviceSnapshot || !backupDownloaded) return;
  const layer = activeLayer;
  const { target, targetName } = currentTarget();
  if (!deviceSnapshot[layer].has(target)) {
    showToast("이 동작의 원본 응답이 없어 적용하지 않습니다.");
    return;
  }
  let payload;
  try {
    KnobProtocol.restoreBinding(layer, target, Array.from(deviceSnapshot[layer].get(target)));
    const action = selectedControl.type === "key" ? currentLayer().keys[selectedControl.index] :
      KnobProtocol.knobAction(currentLayer().knob[elements.knobTarget.value], currentLayer().knob.sensitivity);
    payload = KnobProtocol.binding(layer, target, action);
  } catch (error) {
    deviceError(error);
    return;
  }
  if (!window.confirm(`레이어 ${layer + 1}의 ${targetName} 하나를 기기에 기록합니다. 기존 동작이 바뀌며 기기별 위치가 다를 수 있습니다. 원본 백업 파일을 저장했나요?`)) return;
  await writeAndVerify(layer, target, targetName, payload);
});

elements.restoreButton.addEventListener("click", () => document.querySelector("#restore-file").click());
document.querySelector("#restore-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file || deviceBusy || !connectedDevice?.opened || !deviceSnapshot) return;
  const layer = activeLayer;
  const { target, targetName } = currentTarget();
  try {
    const backup = JSON.parse(await file.text());
    if (backup.format !== "knob-studio-hid-backup-v1" || backup.vendorId !== 0x514c ||
        backup.productId !== 0x8850 || !Array.isArray(backup.layers) || backup.layers.length !== 3 ||
        !deviceSnapshot[layer].has(target)) {
      throw new Error("기기 원본 백업이 아니거나 선택한 동작을 기기에서 읽지 못했습니다.");
    }
    const payload = KnobProtocol.restoreBinding(layer, target, backup.layers[layer]?.[target]);
    if (!window.confirm(`레이어 ${layer + 1}의 ${targetName} 하나를 선택한 백업의 원본으로 덮어쓸까요?`)) return;
    await writeAndVerify(layer, target, targetName, payload);
  } catch (error) {
    console.error("Could not restore the device backup.", error);
    showToast(error.message || "백업 파일을 읽지 못했습니다.");
  }
});

render();
updateDeviceButtons();
