// Where server.js keeps its JSON store. Each test runs the real server in a
// child process from a throwaway copy of the app, with its own temp directory,
// so the repository's data/ folder is never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Preloaded into the server to make writes under READONLY_ROOT fail with
// EROFS, like a serverless deployment bundle.
const READ_ONLY_PRELOAD = `
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.env.READONLY_ROOT);
const inRoot = p => {
  const full = path.resolve(String(p));
  return full === root || full.startsWith(root + path.sep);
};
for (const name of ['mkdirSync', 'writeFileSync']) {
  const original = fs[name];
  fs[name] = function (p, ...rest) {
    if (inRoot(p)) {
      const err = new Error("EROFS: read-only file system, " + name + " '" + p + "'");
      err.code = 'EROFS';
      throw err;
    }
    return original.call(this, p, ...rest);
  };
}
`;

// Per-test cleanup: stop servers first, then remove their directories
// (Windows won't delete a directory a running process is using).
const cleanups = new WeakMap();
function cleanup(t) {
  if (!cleanups.has(t)) {
    const state = { children: [], dirs: [] };
    cleanups.set(t, state);
    t.after(async () => {
      for (const { child, exited } of state.children) {
        child.kill();
        await exited;
      }
      for (const dir of state.dirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    });
  }
  return cleanups.get(t);
}

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanup(t).dirs.push(dir);
  return dir;
}

function makeApp(t) {
  const dir = tempDir(t, 'veil-app-');
  fs.copyFileSync(path.join(ROOT, 'server.js'), path.join(dir, 'server.js'));
  fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function spawnServer(t, { appDir, tmp, env = {}, readOnlyRoot }) {
  const port = await freePort();
  const childEnv = { ...process.env, PORT: String(port), TMPDIR: tmp, TMP: tmp, TEMP: tmp };
  delete childEnv.VERCEL;
  delete childEnv.VEIL_DATA_DIR;
  Object.assign(childEnv, env);

  const args = [];
  if (readOnlyRoot) {
    const preload = path.join(tempDir(t, 'veil-preload-'), 'read-only.js');
    fs.writeFileSync(preload, READ_ONLY_PRELOAD);
    args.push('--require', preload);
    childEnv.READONLY_ROOT = readOnlyRoot;
  }
  args.push('server.js');

  const child = spawn(process.execPath, args, { cwd: appDir, env: childEnv });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  cleanup(t).children.push({ child, exited });

  return { port, child, exited, output: () => output };
}

async function waitForServer(server) {
  for (let i = 0; i < 100; i++) {
    if (server.child.exitCode !== null) break;
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${server.output()}`);
}

async function startServer(t, options) {
  const server = await spawnServer(t, options);
  await waitForServer(server);
  return server;
}

// Any API call loads (and on first use creates) the store.
async function touchStore(server) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/verify/RPT-NONE`);
  return { status: res.status, body: await res.json() };
}

test('stores data in ./data next to server.js by default', async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  const server = await startServer(t, { appDir, tmp });

  assert.deepEqual(await touchStore(server), { status: 404, body: { error: 'No such report.' } });
  assert.ok(fs.existsSync(path.join(appDir, 'data', 'store.json')));
  assert.ok(!fs.existsSync(path.join(tmp, 'veil')));
});

test('VEIL_DATA_DIR takes precedence, even on Vercel', async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  const custom = path.join(tempDir(t, 'veil-custom-'), 'store-dir');
  const server = await startServer(t, { appDir, tmp, env: { VEIL_DATA_DIR: custom, VERCEL: '1' } });

  assert.equal((await touchStore(server)).status, 404);
  assert.ok(fs.existsSync(path.join(custom, 'store.json')));
  assert.ok(!fs.existsSync(path.join(appDir, 'data')));
  assert.ok(!fs.existsSync(path.join(tmp, 'veil')));
});

test('uses the temp directory when VERCEL is set', async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  const server = await startServer(t, { appDir, tmp, env: { VERCEL: '1' } });

  assert.equal((await touchStore(server)).status, 404);
  assert.ok(fs.existsSync(path.join(tmp, 'veil', 'store.json')));
  assert.ok(!fs.existsSync(path.join(appDir, 'data')));
});

test('falls back to the temp directory when the app directory is read-only (regression: live demo 500)', async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  // No VERCEL variable: the fallback must not depend on it.
  const server = await startServer(t, { appDir, tmp, readOnlyRoot: appDir });

  assert.deepEqual(await touchStore(server), { status: 404, body: { error: 'No such report.' } });
  assert.ok(fs.existsSync(path.join(tmp, 'veil', 'store.json')));
  assert.ok(!fs.existsSync(path.join(appDir, 'data')));
  assert.match(server.output(), /is not writable \(EROFS\); storing data in/);

  // Later writes (report submission) go to the same fallback store.
  const res = await fetch(`http://127.0.0.1:${server.port}/api/admin/reports`, {
    headers: { Authorization: 'Bearer veil-admin-demo-token' },
  });
  assert.equal(res.status, 200);
});

test('an unwritable VEIL_DATA_DIR fails loudly instead of falling back', async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  const server = await spawnServer(t, {
    appDir,
    tmp,
    env: { VEIL_DATA_DIR: path.join(appDir, 'configured') },
    readOnlyRoot: appDir,
  });

  // The startup banner loads the store, so the misconfiguration surfaces immediately.
  assert.notEqual(await server.exited, 0);
  assert.match(server.output(), /EROFS/);
  assert.ok(!fs.existsSync(path.join(tmp, 'veil')));
});

test('falls back when the app directory is genuinely read-only (POSIX)', {
  skip: process.platform === 'win32' || process.getuid?.() === 0
    ? 'needs POSIX permissions and a non-root user'
    : false,
}, async t => {
  const appDir = makeApp(t);
  const tmp = tempDir(t, 'veil-tmp-');
  fs.chmodSync(appDir, 0o555);
  const server = await startServer(t, { appDir, tmp });

  assert.equal((await touchStore(server)).status, 404);
  assert.ok(fs.existsSync(path.join(tmp, 'veil', 'store.json')));
});
