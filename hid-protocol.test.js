const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("./hid-protocol.js");

test("encodes Mac shortcut and media bindings with their layer and target", () => {
  const shortcut = protocol.binding(1, 2, { type: "shortcut", value: "⌘ ⇧ Z" });
  assert.deepEqual([...shortcut.slice(0, 12)], [0xfd, 2, 2, 1, 0, 0, 0, 0, 0, 1, 10, 29]);
  const media = protocol.binding(0, 18, { type: "media", value: "volumeUp" });
  assert.deepEqual([...media.slice(0, 12)], [0xfd, 18, 1, 2, 0, 0, 0, 0, 0, 2, 0xe9, 0]);
  const scroll = protocol.binding(2, 16, protocol.knobAction("scrollDown", 3));
  assert.deepEqual([...scroll.slice(9, 15)], [1, 0, 0, 0, 0, 0xfd]);
});

test("rejects unsupported, ambiguous and empty actions before any write", () => {
  assert.throws(() => protocol.binding(0, 1, { type: "text", value: "안녕" }), /지원하지/);
  assert.throws(() => protocol.binding(0, 1, { type: "shortcut", value: "⌘ A B" }), /하나만/);
  assert.throws(() => protocol.binding(0, 1, { type: "shortcut", value: "⌘" }), /일반 키/);
  assert.throws(() => protocol.binding(3, 1, { type: "shortcut", value: "A" }), /유효하지/);
});

test("only accepts a matching read-back response", () => {
  const expected = protocol.binding(0, 1, { type: "shortcut", value: "⌘ C" });
  const actual = Uint8Array.from(expected);
  actual[0] = 0xfa;
  assert.equal(protocol.matches(expected, actual), true);
  actual[11] = 4;
  assert.equal(protocol.matches(expected, actual), false);
  assert.equal(protocol.matches(expected, undefined), false);
});

test("restores only the selected, supported original report", () => {
  const binding = protocol.binding(1, 2, { type: "shortcut", value: "⌘ C" });
  const original = Array.from(binding);
  original[0] = 0xfa;
  assert.deepEqual(protocol.restoreBinding(1, 2, original), binding);
  assert.throws(() => protocol.restoreBinding(1, 3, original), /올바르지/);
  original[3] = 0xff;
  assert.throws(() => protocol.restoreBinding(1, 2, original), /복원할 수 없는/);
});

test("reads only matching reports, snapshots bytes, and sends correct query", async () => {
  const handlers = new Map();
  const expected = protocol.binding(1, 3, { type: "shortcut", value: "⌘ C" });
  const response = Uint8Array.from(expected);
  response[0] = 0xfa;
  const device = {
    opened: true,
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
    async sendReport(id, payload) {
      assert.equal(id, 3);
      assert.deepEqual([...payload.slice(0, 4)], [0xfa, 0x0f, 3, 2]);
      handlers.get("inputreport")({ reportId: 3, data: new DataView(response.buffer) });
    },
  };
  const records = await protocol.readLayer(device, 1);
  response[11] = 99;
  assert.equal(records.get(3)[11], 6);
  assert.equal(handlers.size, 0);
});

test("initialization accepts a missing acknowledgement without claiming success", async () => {
  let handler;
  const device = {
    addEventListener(name, fn) { handler = fn; },
    removeEventListener() { handler = null; },
    async sendReport(id, payload) {
      assert.equal(id, 3);
      assert.deepEqual([...payload.slice(0, 4)], [0xfb, 0xfb, 0xfb, 1]);
    },
  };
  assert.equal(await protocol.initialize(device, 5), false);
  assert.equal(handler, null);
});

test("initialization recognizes the expected acknowledgement", async () => {
  let handler;
  const device = {
    addEventListener(name, fn) { handler = fn; },
    removeEventListener() { handler = null; },
    async sendReport() {
      const bytes = Uint8Array.from([0xfb, 0, 1]);
      handler({ reportId: 3, data: new DataView(bytes.buffer) });
    },
  };
  assert.equal(await protocol.initialize(device, 50), true);
  assert.equal(handler, null);
});
