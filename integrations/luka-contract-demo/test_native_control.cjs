const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../packages/studio-base/src/panels/LukaConsole/holdControl.ts"), "utf8");
function setup() {
  const callbacks = new Set();
  const exports = {};
  let now = 0, ready = true;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, setInterval: f => { callbacks.add(f); return f; }, clearInterval: f => callbacks.delete(f) });
  const messages = [];
  const controller = new exports.HoldControl(m => messages.push(JSON.parse(JSON.stringify(m))), () => ready, () => now);
  return { exports, controller, messages, tick: t => { now = t; for (const f of [...callbacks]) f(); }, offline: () => { ready = false; } };
}
test("all six directions are bounded; explicit release emits zero", () => {
  const s = setup();
  for (const direction of ["forward", "back", "left", "right", "ccw", "cw"]) {
    assert.equal(s.controller.start(direction), true);
    const command = s.messages.at(-1);
    assert.ok(Math.abs(command.linear.x) <= .1 && Math.abs(command.linear.y) <= .1 && Math.abs(command.angular.z) <= .2);
    assert.ok(Math.abs(command.linear.x) + Math.abs(command.linear.y) + Math.abs(command.angular.z) > 0);
    s.controller.stop(); assert.deepEqual(s.messages.at(-1), JSON.parse(JSON.stringify(s.exports.twist())));
  }
});
test("offline refuses motion without sending a command", () => {
  const s = setup(); s.offline(); assert.equal(s.controller.start("forward"), false); assert.equal(s.messages.length, 0);
});
test("freshness loss stops rather than repeating the previous command", () => {
  const s = setup(); s.controller.start("forward"); s.offline(); s.tick(100);
  assert.equal(s.messages.at(-1).linear.x, 0); const count = s.messages.length; s.tick(200); assert.equal(s.messages.length, count);
});
test("lost release cannot move indefinitely; 2s limit requires a new press", () => {
  const s = setup(); s.controller.start("forward"); s.tick(1900); assert.equal(s.messages.at(-1).linear.x, .1);
  s.tick(2000); assert.equal(s.messages.at(-1).linear.x, 0); const count = s.messages.length; s.tick(3000); assert.equal(s.messages.length, count);
  assert.equal(s.controller.start("back"), true); s.controller.stop();
});
test("switching direction explicitly ends the previous hold", () => {
  const s = setup(); s.controller.start("forward"); s.controller.start("left");
  assert.equal(s.messages[1].linear.x, 0); assert.equal(s.messages[2].linear.y, .1); s.controller.stop();
});
