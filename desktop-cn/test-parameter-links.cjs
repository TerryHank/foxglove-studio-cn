const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../integrations/omnifleet-t2/foxglove/nav2_permanent_panel/Nav2PermanentPanel.js'), 'utf8');
const linkFunction = source.slice(source.indexOf('  async function openParameterLink('), source.indexOf('  function configAnchor('));
const target = { path: '/home/iecme/nav2.yaml', line: 23, column: 7 };
const url = 'https://docs.nav2.org/jazzy/configuration_and_development/configuration_guide/core_servers/costmap_2d/costmap_plugins/inflation/#inflation-layerinflation_radius';
function panel(window, call = async () => { throw new Error('Remote open must not be called'); }) {
  const status = [];
  const open = vm.runInNewContext('(' + linkFunction.trim() + ')', {
    window, parameterLinks: { radius: { targets: [target], docs: { url } } },
    location: { href: 'file:///index.html?ds.url=ws://192.168.3.113:8765' }, URL,
    call, robotPath: p => p, setStatus: (...args) => status.push(args),
  });
  return { open, status };
}
test('Windows documentation opens locally without a remote service call', async () => {
  const opened = [];
  const p = panel({ foxgloveParameterLinks: { openDocs: async value => opened.push(value) } });
  await p.open('radius', 0, true);
  assert.deepEqual(opened, [url]);
  assert.equal(p.status.at(-1)[1], 'ok');
});
test('Windows config uses current connection and exact catalog position', async () => {
  let received;
  const p = panel({ foxgloveDemoControl: { status: () => ({ source: 'ws://192.168.3.104:8765/' }) },
    foxgloveParameterLinks: { openConfig: async (...args) => {
      received = args; return { localPath: 'C:/config/nav2.yaml', line: 23, column: 7, editor: 'VS Code' };
    } } });
  await p.open('radius');
  assert.equal(received[0], target);
  assert.equal(received[1], 'ws://192.168.3.104:8765/');
  assert.match(p.status.at(-1)[0], /C:\/config\/nav2.yaml:23:7/);
});
test('Download errors are shown and do not report success', async () => {
  const p = panel({ foxgloveParameterLinks: { openConfig: async () => { throw new Error('SSH unavailable'); } } });
  await p.open('radius');
  assert.equal(p.status.at(-1)[1], 'error');
  assert.match(p.status.at(-1)[0], /SSH unavailable/);
});
test('Linux client retains remote opener', async () => {
  let request;
  const p = panel({}, async (_service, body) => { request = body; return { results: [{ successful: true, reason: url }] }; });
  await p.open('radius', 0, true);
  assert.equal(request.parameters[0].name, '__open_docs');
});

test('Downloader quotes remote paths, preserves bytes and opens exact line locally', async () => {
  const calls = [], writes = [];
  const context = { URL, module: { exports: {} }, process: { env: { LOCALAPPDATA: 'C:/User', PATH: '', ELECTRON_RUN_AS_NODE: '1' } },
    require: name => {
      if (name === 'node:fs') return {
        existsSync: p => /Code\.exe|code\.cmd|cli\.js$/.test(p), readFileSync: () => '"%~dp0..\\Code.exe" "%~dp0..\\version\\resources\\app\\out\\cli.js" %*', mkdirSync: () => {}, mkdtempSync: p => p + 'unique',
        writeFileSync: (p, bytes) => writes.push([p, bytes]),
      };
      if (name === 'node:child_process') return { execFile: async (...args) => {
        calls.push(args); return { stdout: Buffer.from('inflation_radius: 0.01\n') };
      }, spawn: (...args) => {
        calls.push(args); const child = new (require('node:events').EventEmitter)();
        child.unref = () => {}; setImmediate(() => child.emit('spawn')); return child;
      } };
      if (name === 'node:util') return { promisify: fn => fn };
      return require(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'parameter-links.cjs'), 'utf8'), context);
  const result = await context.module.exports.openConfig({ app: { getPath: () => 'C:/User/Foxglove' }, shell: {} },
    { path: "/home/iecme/a'b/nav2.yaml", line: 23, column: 7 }, 'ws://192.168.3.104:8765/');
  assert.equal(calls[0][0], 'ssh');
  assert.equal(calls[0][1].at(-1), "cat -- '/home/iecme/a'\\''b/nav2.yaml'");
  assert.equal(calls[0][1].at(-2), '192.168.3.104');
  assert.equal(writes[0][1].toString(), 'inflation_radius: 0.01\n');
  assert.equal(calls[1][1].at(-1), result.localPath + ':23:7');
  assert.equal(calls[1][2].env.ELECTRON_RUN_AS_NODE, '1');
  assert.match(calls[1][1][0], /version[\\/]resources[\\/]app[\\/]out[\\/]cli\.js$/);
});


test('Browser launch failure is visible instead of reporting success', async () => {
  const p = panel({ foxgloveParameterLinks: { openDocs: async () => { throw new Error('No browser handler'); } } });
  await p.open('radius', 0, true);
  assert.equal(p.status.at(-1)[1], 'error');
  assert.match(p.status.at(-1)[0], /No browser handler/);
});
