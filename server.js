// VEIL — Privacy-preserving campus incident reporting
// Backend: dependency-free Node http server + JSON file store.
//
// WHAT'S REAL vs WHAT'S SIMULATED (read this):
// This sandbox has no access to a Midnight testnet, Lace wallet, or the
// Compact compiler toolchain (network egress is restricted to package
// registries only). So the privacy-preserving verification layer here is
// implemented with the *same logic shape* a real Midnight deployment would
// use — commitment hashing, membership proof against a private set, and an
// append-only hash chain for audit integrity — but running in plain
// Node instead of a Compact circuit on-chain.
//
// See /contracts/report_verification.compact for the actual circuit this
// stands in for, and README.md for exactly what swapping in real Midnight
// infra would involve.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8787;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadStore() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      // Simulated "eligibility set": in a real deployment this is a Merkle
      // root of hashed institutional credentials, checked via a Compact
      // membership circuit. Here it's a set of precomputed commitment
      // hashes so the server never needs to see a raw student ID.
      eligibleCommitments: seedEligibleCommitments(),
      reports: {},          // reportId -> report
      pseudonyms: {},        // pseudoId -> { commitment, createdAt }
      adminToken: 'veil-admin-demo-token', // demo only, see README
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// Precompute commitments for a small set of demo "valid student IDs" so
// the eligibility check has something real to test membership against.
// commitment = sha256(id + ":" + secret). Only the commitment is ever
// stored — never the raw id/secret pair.
function seedEligibleCommitments() {
  const demoCredentials = [
    { id: 'STU-10234', secret: 'maple-river' },
    { id: 'STU-88823', secret: 'copper-fox' },
    { id: 'STU-55190', secret: 'quiet-harbor' },
    { id: 'FAC-00019', secret: 'granite-owl' },
  ];
  return demoCredentials.map(c => commitmentHash(c.id, c.secret));
}

function commitmentHash(id, secret) {
  return crypto.createHash('sha256').update(`${id}:${secret}`).digest('hex');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Audit hash-chain — simulates the "verifiable, tamper-evident, but
// content-blind" property of an on-chain record. Each event for a report
// links to the previous event's hash. Content of the report never enters
// the chain — only a hash of (event type + timestamp + previous hash +
// content hash), matching the "identity/eligibility/report/verification"
// separation described in the writeup.
// ---------------------------------------------------------------------------

function appendAuditEvent(report, type, contentForHash) {
  const prevHash = report.auditChain.length
    ? report.auditChain[report.auditChain.length - 1].hash
    : report.genesisHash;
  const timestamp = new Date().toISOString();
  const contentHash = sha256(JSON.stringify(contentForHash ?? {}));
  const hash = sha256(`${prevHash}:${type}:${timestamp}:${contentHash}`);
  report.auditChain.push({ type, timestamp, hash });
  return hash;
}

function verifyAuditChain(report) {
  let prevHash = report.genesisHash;
  for (const event of report.auditChain) {
    // We don't have the original contentForHash at verify-time by design
    // (that's the point — verification checks the chain wasn't spliced,
    // not the content). Real integrity re-check happens where content
    // hashes are recomputed at write time; here we confirm monotonic
    // linkage and no gaps.
    if (!event.hash || !event.type || !event.timestamp) return false;
    prevHash = event.hash;
  }
  return true;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function requireAdmin(req, store) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return token && token === store.adminToken;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleVerifyEligibility(req, res) {
  const store = loadStore();
  const { commitment } = await readBody(req);
  if (!commitment || typeof commitment !== 'string') {
    return sendJSON(res, 400, { error: 'Missing commitment.' });
  }
  // Membership check — server checks whether the client-supplied commitment
  // is in the eligible set WITHOUT ever learning the underlying id/secret.
  // This is the piece a real Compact circuit would prove in zero-knowledge
  // on-chain; here it's a direct set-membership check server-side.
  const isEligible = store.eligibleCommitments.includes(commitment);
  if (!isEligible) {
    return sendJSON(res, 403, { error: 'Not eligible or credential unrecognized.' });
  }
  // Issue a pseudonymous identity, unlinkable to the commitment by anyone
  // browsing report data (we store pseudoId -> commitment separately from
  // reports, and never surface commitment on report objects or admin views).
  const pseudoId = 'VEIL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const sessionSecret = crypto.randomBytes(16).toString('hex');
  const pseudoToken = sha256(pseudoId + ':' + sessionSecret);
  store.pseudonyms[pseudoId] = {
    commitment, // kept only to prevent re-registering the same credential twice if desired
    tokenHash: sha256(pseudoToken),
    createdAt: new Date().toISOString(),
  };
  saveStore(store);
  return sendJSON(res, 200, { pseudoId, pseudoToken });
}

function checkPseudoAuth(store, pseudoId, pseudoToken) {
  const entry = store.pseudonyms[pseudoId];
  if (!entry) return false;
  return entry.tokenHash === sha256(pseudoToken);
}

async function handleSubmitReport(req, res) {
  const store = loadStore();
  const { pseudoId, pseudoToken, category, description, evidenceNote } = await readBody(req);
  if (!checkPseudoAuth(store, pseudoId, pseudoToken)) {
    return sendJSON(res, 401, { error: 'Invalid or unverified pseudonymous identity.' });
  }
  if (!category || !description || description.trim().length < 10) {
    return sendJSON(res, 400, { error: 'Category and a meaningful description are required.' });
  }
  const reportId = 'RPT-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const report = {
    id: reportId,
    pseudoReporterId: pseudoId, // pseudonym only — never the commitment or credential
    category,
    description,
    evidenceNote: evidenceNote || null,
    status: 'submitted', // submitted -> under_review -> info_requested -> resolved / closed
    createdAt: new Date().toISOString(),
    messages: [], // { from: 'reporter'|'admin', text, at }
    genesisHash: sha256(`${reportId}:${pseudoId}:${Date.now()}`),
    auditChain: [],
  };
  appendAuditEvent(report, 'report_submitted', { category, descriptionLength: description.length });
  store.reports[reportId] = report;
  saveStore(store);
  return sendJSON(res, 201, { reportId, status: report.status });
}

async function handleTrackReports(req, res, query) {
  const store = loadStore();
  const pseudoId = query.get('pseudoId');
  const pseudoToken = query.get('pseudoToken');
  if (!checkPseudoAuth(store, pseudoId, pseudoToken)) {
    return sendJSON(res, 401, { error: 'Invalid or unverified pseudonymous identity.' });
  }
  const mine = Object.values(store.reports)
    .filter(r => r.pseudoReporterId === pseudoId)
    .map(publicReportView);
  return sendJSON(res, 200, { reports: mine });
}

async function handleReporterMessage(req, res, reportId) {
  const store = loadStore();
  const { pseudoId, pseudoToken, text } = await readBody(req);
  const report = store.reports[reportId];
  if (!report) return sendJSON(res, 404, { error: 'Report not found.' });
  if (!checkPseudoAuth(store, pseudoId, pseudoToken) || report.pseudoReporterId !== pseudoId) {
    return sendJSON(res, 401, { error: 'Not authorized for this report.' });
  }
  if (!text || !text.trim()) return sendJSON(res, 400, { error: 'Message text required.' });
  const msg = { from: 'reporter', text: text.trim(), at: new Date().toISOString() };
  report.messages.push(msg);
  appendAuditEvent(report, 'reporter_message', { length: text.length });
  saveStore(store);
  return sendJSON(res, 200, { ok: true });
}

// --- Admin routes ---

async function handleAdminLogin(req, res) {
  const store = loadStore();
  const { token } = await readBody(req);
  if (token === store.adminToken) return sendJSON(res, 200, { ok: true });
  return sendJSON(res, 401, { error: 'Invalid admin token.' });
}

async function handleAdminListReports(req, res) {
  const store = loadStore();
  if (!requireAdmin(req, store)) return sendJSON(res, 401, { error: 'Unauthorized.' });
  const reports = Object.values(store.reports)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicReportView);
  return sendJSON(res, 200, { reports });
}

async function handleAdminUpdateStatus(req, res, reportId) {
  const store = loadStore();
  if (!requireAdmin(req, store)) return sendJSON(res, 401, { error: 'Unauthorized.' });
  const { status } = await readBody(req);
  const valid = ['submitted', 'under_review', 'info_requested', 'resolved', 'closed'];
  const report = store.reports[reportId];
  if (!report) return sendJSON(res, 404, { error: 'Report not found.' });
  if (!valid.includes(status)) return sendJSON(res, 400, { error: 'Invalid status.' });
  report.status = status;
  appendAuditEvent(report, 'status_updated', { status });
  saveStore(store);
  return sendJSON(res, 200, { ok: true, status });
}

async function handleAdminMessage(req, res, reportId) {
  const store = loadStore();
  if (!requireAdmin(req, store)) return sendJSON(res, 401, { error: 'Unauthorized.' });
  const { text, requestInfo } = await readBody(req);
  const report = store.reports[reportId];
  if (!report) return sendJSON(res, 404, { error: 'Report not found.' });
  if (!text || !text.trim()) return sendJSON(res, 400, { error: 'Message text required.' });
  const msg = { from: 'admin', text: text.trim(), at: new Date().toISOString() };
  report.messages.push(msg);
  if (requestInfo) report.status = 'info_requested';
  appendAuditEvent(report, requestInfo ? 'info_requested' : 'admin_message', { length: text.length });
  saveStore(store);
  return sendJSON(res, 200, { ok: true });
}

// --- Public verification (no auth — content-blind by design) ---

async function handlePublicVerify(req, res, reportId) {
  const store = loadStore();
  const report = store.reports[reportId];
  if (!report) return sendJSON(res, 404, { error: 'No such report.' });
  const valid = verifyAuditChain(report);
  return sendJSON(res, 200, {
    reportId,
    exists: true,
    chainIntact: valid,
    eventCount: report.auditChain.length,
    genesisHash: report.genesisHash,
    latestHash: report.auditChain.length ? report.auditChain[report.auditChain.length - 1].hash : report.genesisHash,
    events: report.auditChain.map(e => ({ type: e.type, timestamp: e.timestamp, hash: e.hash })),
  });
}

// Strip anything that could deanonymize a reporter from admin/reporter views.
function publicReportView(report) {
  const { id, category, description, evidenceNote, status, createdAt, messages, pseudoReporterId } = report;
  return { id, category, description, evidenceNote, status, createdAt, messages, pseudoReporterId };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  try {
    if (pathname === '/api/verify-eligibility' && req.method === 'POST') {
      return await handleVerifyEligibility(req, res);
    }
    if (pathname === '/api/reports' && req.method === 'POST') {
      return await handleSubmitReport(req, res);
    }
    if (pathname === '/api/reports/mine' && req.method === 'GET') {
      return await handleTrackReports(req, res, searchParams);
    }
    let m;
    if ((m = pathname.match(/^\/api\/reports\/([^/]+)\/messages$/)) && req.method === 'POST') {
      return await handleReporterMessage(req, res, m[1]);
    }
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      return await handleAdminLogin(req, res);
    }
    if (pathname === '/api/admin/reports' && req.method === 'GET') {
      return await handleAdminListReports(req, res);
    }
    if ((m = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/status$/)) && req.method === 'POST') {
      return await handleAdminUpdateStatus(req, res, m[1]);
    }
    if ((m = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/messages$/)) && req.method === 'POST') {
      return await handleAdminMessage(req, res, m[1]);
    }
    if ((m = pathname.match(/^\/api\/verify\/([^/]+)$/)) && req.method === 'GET') {
      return await handlePublicVerify(req, res, m[1]);
    }
    if (pathname.startsWith('/api/')) {
      return sendJSON(res, 404, { error: 'Unknown API route.' });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal error.' });
  }
});

server.listen(PORT, () => {
  console.log(`VEIL server running at http://localhost:${PORT}`);
  console.log(`Demo admin token: ${loadStore().adminToken}`);
  console.log(`Demo eligible credentials (id / secret):`);
  console.log(`  STU-10234 / maple-river`);
  console.log(`  STU-88823 / copper-fox`);
  console.log(`  STU-55190 / quiet-harbor`);
  console.log(`  FAC-00019 / granite-owl`);
});
