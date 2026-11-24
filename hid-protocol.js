(function (root) {
  const REPORT_ID = 3;
  const SIZE = 64;
  const MEDIA = {
    playPause: 0xcd, next: 0xb5, previous: 0xb6, mute: 0xe2,
    volumeUp: 0xe9, volumeDown: 0xea, nextTrack: 0xb5, previousTrack: 0xb6,
    brightnessUp: 0x6f, brightnessDown: 0x70,
  };
  const SPECIAL_KEYS = {
    enter: 40, return: 40, escape: 41, esc: 41, backspace: 42, delete: 42,
    tab: 43, space: 44, "-": 45, "=": 46, "[": 47, "]": 48, "\\": 49,
    ";": 51, "'": 52, "`": 53, ",": 54, ".": 55, "/": 56,
    left: 80, right: 79, up: 82, down: 81,
  };
  const MODIFIERS = { "⌃": 1, ctrl: 1, control: 1, "⇧": 2, shift: 2, "⌥": 4, alt: 4, option: 4, "⌘": 8, cmd: 8, command: 8, meta: 8 };

  function report(bytes) {
    if (bytes.length > SIZE) throw new Error("동작이 너무 깁니다.");
    const output = new Uint8Array(SIZE);
    output.set(bytes);
    return output;
  }

  function shortcut(value) {
    const text = value.trim().replace(/([⌘⌥⌃⇧])/g, " $1 ").trim();
    const tokens = text.split(/\s+/);
    let modifiers = 0;
    let code;
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (Object.hasOwn(MODIFIERS, lower)) {
        modifiers |= MODIFIERS[lower];
      } else {
        if (code !== undefined) throw new Error("단축키에는 일반 키를 하나만 입력해 주세요.");
        if (/^[a-z]$/.test(lower)) code = lower.charCodeAt(0) - 97 + 4;
        else if (/^[1-9]$/.test(lower)) code = Number(lower) + 29;
        else if (lower === "0") code = 39;
        else if (/^f([1-9]|1[0-2])$/.test(lower)) code = 57 + Number(lower.slice(1));
        else if (lower === "+") { code = 46; modifiers |= 2; }
        else code = SPECIAL_KEYS[lower];
        if (code === undefined) throw new Error(`지원하지 않는 키: ${token}`);
      }
    }
    if (code === undefined) throw new Error("단축키의 일반 키를 입력해 주세요.");
    return [modifiers, code];
  }

  function binding(layer, id, action) {
    if (!Number.isInteger(layer) || layer < 0 || layer > 2 || !Number.isInteger(id) || id < 1 || id > 18) {
      throw new Error("유효하지 않은 레이어 또는 동작입니다.");
    }
    let kind;
    let payload;
    if (action.type === "shortcut") {
      kind = 1;
      payload = [1, ...shortcut(action.value)];
    } else if (action.type === "media" && Object.hasOwn(MEDIA, action.value)) {
      kind = 2;
      const code = MEDIA[action.value];
      payload = [2, code & 255, code >> 8];
    } else if (action.type === "wheel" && Number.isInteger(action.value) && action.value !== 0 && Math.abs(action.value) <= 10) {
      kind = 3;
      payload = [1, 0, 0, 0, 0, action.value & 255];
    } else {
      throw new Error("이 동작은 기기 전송을 지원하지 않습니다. 단축키 또는 미디어 동작을 선택해 주세요.");
    }
    return report([0xfd, id, layer + 1, kind, 0, 0, 0, 0, 0, ...payload]);
  }

  function knobAction(value, sensitivity) {
    if (value === "scrollUp") return { type: "wheel", value: sensitivity };
    if (value === "scrollDown") return { type: "wheel", value: -sensitivity };
    if (value === "zoomIn") return { type: "shortcut", value: "⌘ +" };
    if (value === "zoomOut") return { type: "shortcut", value: "⌘ -" };
    return { type: "media", value };
  }

  function matches(expected, actual) {
    if (!actual || actual.length < 12 || actual[0] !== 0xfa ||
        actual[1] !== expected[1] || actual[2] !== expected[2] ||
        actual[3] !== expected[3] || actual[9] !== expected[9]) return false;
    const size = expected[3] === 1 ? expected[9] * 2 : expected[3] === 2 ? 2 : 5;
    return actual.length >= 10 + size &&
      expected.slice(10, 10 + size).every((byte, index) => byte === actual[10 + index]);
  }

  function restoreBinding(layer, id, bytes) {
    if (!Array.isArray(bytes) || bytes.length < 15 || bytes.length > SIZE ||
        !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ||
        bytes[0] !== 0xfa || bytes[1] !== id || bytes[2] !== layer + 1) {
      throw new Error("선택한 동작의 백업 보고서가 올바르지 않습니다.");
    }
    const [kind, count] = [bytes[3], bytes[9]];
    const size = kind === 1 && count <= 25 ? count * 2 :
      kind === 2 && count === 2 ? 2 : kind === 3 && count === 1 ? 5 : -1;
    if (size < 0 || bytes.length < 10 + size) {
      throw new Error("이 원본 동작은 안전하게 복원할 수 없는 형식입니다.");
    }
    const payload = report(bytes);
    payload[0] = 0xfd;
    return payload;
  }

  function isConfigDevice(device) {
    return device.vendorId === 0x514c && device.productId === 0x8850 &&
      device.collections.some((collection) =>
        collection.usagePage === 0xff00 && collection.usage === 1 &&
        collection.outputReports.some((entry) => entry.reportId === REPORT_ID) &&
        collection.inputReports.some((entry) => entry.reportId === REPORT_ID));
  }

  async function send(device, payload) {
    await device.sendReport(REPORT_ID, payload);
  }

  async function initialize(device, timeoutMs = 3000) {
    let timer;
    let onReport;
    const reply = new Promise((resolve) => {
      onReport = (event) => {
        if (event.reportId === REPORT_ID && event.data.byteLength >= 3 &&
            event.data.getUint8(0) === 0xfb && event.data.getUint8(1) === 0 &&
            event.data.getUint8(2) === 1) resolve(true);
      };
      device.addEventListener("inputreport", onReport);
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      await send(device, report([0xfb, 0xfb, 0xfb, 1]));
      return await reply;
    } finally {
      clearTimeout(timer);
      device.removeEventListener("inputreport", onReport);
    }
  }

  async function readLayer(device, layer) {
    if (!device.opened) throw new Error("기기 연결이 해제됐습니다.");
    const records = new Map();
    let quietTimer;
    let deadlineTimer;
    let complete;
    let fail;
    const done = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    const cleanup = () => {
      clearTimeout(quietTimer);
      clearTimeout(deadlineTimer);
      device.removeEventListener("inputreport", receive);
    };
    const finish = () => {
      cleanup();
      if (records.size === 0) fail(new Error("기기에서 매핑 응답이 없습니다. 이 모델은 읽기를 지원하지 않을 수 있습니다."));
      else complete(records);
    };
    const receive = (event) => {
      if (event.reportId !== REPORT_ID) return;
      const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      if (bytes.length < 12 || bytes[0] !== 0xfa || bytes[2] !== layer + 1 || bytes[1] < 1) return;
      records.set(bytes[1], Uint8Array.from(bytes));
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, 400);
    };
    device.addEventListener("inputreport", receive);
    deadlineTimer = setTimeout(finish, 3000);
    try {
      await send(device, report([0xfa, 0x0f, 3, layer + 1]));
    } catch (error) {
      cleanup();
      throw error;
    }
    return done;
  }

  const api = { REPORT_ID, report, binding, knobAction, matches, restoreBinding, isConfigDevice, initialize, readLayer, send };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.KnobProtocol = api;
})(globalThis);
