// server.js must start listening as soon as it is loaded, whether it is run
// directly (`node server.js`) or loaded by a wrapper, because Vercel detects
// the server through that listen() call. Each test runs a throwaway copy of
// the app so the repository's data/ folder is never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

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

function makeApp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-app-'));
  for (const file of fs.readdirSync(ROOT)) {
    if (file.endsWith('.js')) fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'));
  cleanup(t).dirs.push(dir);
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

async function start(t, appDir, args) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port) };
  delete env.VERCEL;
  delete env.VEIL_DATA_DIR;
  const child = spawn(process.execPath, args, { cwd: appDir, env });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  cleanup(t).children.push({ child, exited });

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) return base;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${output}`);
}

async function post(base, route, body) {
  const res = await fetch(base + route, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

// Submit a report and check its audit chain through the public API, which
// exercises server.js's use of the audit helpers.
async function assertReportFlow(base) {
  const commitment = crypto.createHash('sha256').update('STU-10234:maple-river').digest('hex');
  const { pseudoId, pseudoToken } = await post(base, '/api/verify-eligibility', { commitment });
  const { reportId } = await post(base, '/api/reports', {
    pseudoId, pseudoToken, category: 'Other', description: 'Startup test report description',
  });
  const verify = await (await fetch(`${base}/api/verify/${reportId}`)).json();
  assert.equal(verify.chainIntact, true);
  assert.equal(verify.eventCount, 1);
  assert.deepEqual(Object.keys(verify.events[0]), ['type', 'timestamp', 'hash']);
}

test('listens when run directly', async t => {
  const appDir = makeApp(t);
  const base = await start(t, appDir, ['server.js']);
  await assertReportFlow(base);
});

test('listens when loaded by another module, as a platform wrapper would', async t => {
  const appDir = makeApp(t);
  const base = await start(t, appDir, ['-e', `require(${JSON.stringify(path.join(appDir, 'server.js'))})`]);
  await assertReportFlow(base);
});
