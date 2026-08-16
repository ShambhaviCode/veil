// VEIL frontend — vanilla JS, no build step.

const app = document.getElementById('app');

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// Local (client-only) session state — a real deployment would rely on the
// wallet extension to hold this; here it's kept in a JS variable so nothing
// touches localStorage and it's gone on refresh (mirrors "you must save your
// pseudonym token" being the reporter's responsibility, same as a real
// unlinkable credential).
const session = { pseudoId: null, pseudoToken: null };
const adminSession = { token: null };

const Router = {
  go(view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    const renderers = { home: renderHome, reporter: renderReporter, admin: renderAdmin, verify: renderVerify };
    (renderers[view] || renderHome)();
  },
};
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => Router.go(t.dataset.view)));

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function statusLabel(s) {
  return { submitted: 'Submitted', under_review: 'Under Review', info_requested: 'Info Requested',
    resolved: 'Resolved', closed: 'Closed' }[s] || s;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function renderHome() {
  app.innerHTML = '';
  app.appendChild(el(`
    <div>
      <h1>VEIL</h1>
      <div class="tagline">Speak up. Stay private.</div>
      <p class="lede">Prove that you are eligible to report without unnecessarily revealing who you are.
      A reporter verifies eligibility once, receives a pseudonymous identity, and uses it to submit and
      track a report — separated from the identity that proved eligibility in the first place.</p>
      <div class="grid-3">
        <div class="card" data-go="reporter">
          <h3>I'm a reporter</h3>
          <p>Verify eligibility, submit a report, and communicate with administrators under a pseudonym.</p>
        </div>
        <div class="card" data-go="admin">
          <h3>I'm an administrator</h3>
          <p>Review incoming reports, request more information, and update case status.</p>
        </div>
        <div class="card" data-go="verify">
          <h3>Verify a report</h3>
          <p>Publicly check that a report's audit trail is intact — no content, no identity exposed.</p>
        </div>
      </div>
      <div class="divider"></div>
      <h2>How the pieces separate</h2>
      <p class="lede"><b>Identity</b> — a real student/faculty credential, never sent to the server in raw form.<br>
      <b>Eligibility</b> — a commitment hash checked for set membership, proving legitimacy without exposing identity.<br>
      <b>Report</b> — filed under a pseudonym unlinkable to the credential.<br>
      <b>Verification</b> — a hash-chained audit trail anyone can check, without seeing report content.</p>
    </div>
  `));
  app.querySelectorAll('[data-go]').forEach(c => c.addEventListener('click', () => Router.go(c.dataset.go)));
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function renderReporter() {
  app.innerHTML = '';
  if (!session.pseudoId) return renderReporterVerify();
  return renderReporterDashboard();
}

function renderReporterVerify() {
  app.appendChild(el(`
    <div>
      <h1>Verify Eligibility</h1>
      <p class="lede">Enter your institutional ID and secret. Your browser hashes them together before anything
      is sent — the server only ever sees the resulting commitment, never your raw credential.</p>
      <div class="panel">
        <label>Institutional ID</label>
        <input id="r-id" placeholder="e.g. STU-10234">
        <label>Secret</label>
        <input id="r-secret" type="password" placeholder="your credential secret">
        <p class="hint">Demo credentials: <code class="inline">STU-10234 / maple-river</code>,
        <code class="inline">STU-88823 / copper-fox</code>, <code class="inline">STU-55190 / quiet-harbor</code>,
        <code class="inline">FAC-00019 / granite-owl</code></p>
        <button class="btn" id="r-verify-btn">Verify &amp; Get Pseudonym</button>
        <div id="r-verify-msg"></div>
      </div>
    </div>
  `));
  document.getElementById('r-verify-btn').addEventListener('click', async () => {
    const id = document.getElementById('r-id').value.trim();
    const secret = document.getElementById('r-secret').value;
    const msgBox = document.getElementById('r-verify-msg');
    msgBox.innerHTML = '';
    if (!id || !secret) return;
    const commitment = await sha256Hex(`${id}:${secret}`);
    try {
      const { pseudoId, pseudoToken } = await api('/api/verify-eligibility', {
        method: 'POST', body: JSON.stringify({ commitment }),
      });
      session.pseudoId = pseudoId;
      session.pseudoToken = pseudoToken;
      msgBox.appendChild(el(`<div class="msg success">Verified. Your pseudonym is <span class="pseudo-badge">${pseudoId}</span> — save it and your session token to track this report later (this demo keeps them in memory only; they clear on refresh).</div>`));
      setTimeout(renderReporter, 900);
    } catch (e) {
      msgBox.appendChild(el(`<div class="msg error">${e.message}</div>`));
    }
  });
}

function renderReporterDashboard() {
  app.appendChild(el(`
    <div>
      <h1>Reporter Dashboard</h1>
      <p class="lede">Signed in as <span class="pseudo-badge">${session.pseudoId}</span>
      <button class="btn secondary" id="r-logout" style="margin-left:10px;padding:4px 10px;font-size:0.75rem;">Sign out</button></p>

      <div class="panel">
        <h2 style="margin-top:0;">Submit a new report</h2>
        <label>Category</label>
        <select id="r-category">
          <option>Safety Concern</option>
          <option>Harassment</option>
          <option>Bullying</option>
          <option>Academic Misconduct</option>
          <option>Other</option>
        </select>
        <label>Description</label>
        <textarea id="r-desc" placeholder="Describe what happened. No identifying details required."></textarea>
        <label>Evidence note (optional)</label>
        <input id="r-evidence" placeholder="e.g. 'screenshots available on request'">
        <button class="btn" id="r-submit-btn">Submit Report</button>
        <div id="r-submit-msg"></div>
      </div>

      <h2>Your reports</h2>
      <div id="r-reports-list"><p class="lede">Loading…</p></div>
    </div>
  `));

  document.getElementById('r-logout').addEventListener('click', () => {
    session.pseudoId = null; session.pseudoToken = null; renderReporter();
  });

  document.getElementById('r-submit-btn').addEventListener('click', async () => {
    const category = document.getElementById('r-category').value;
    const description = document.getElementById('r-desc').value.trim();
    const evidenceNote = document.getElementById('r-evidence').value.trim();
    const msgBox = document.getElementById('r-submit-msg');
    msgBox.innerHTML = '';
    try {
      const { reportId } = await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ pseudoId: session.pseudoId, pseudoToken: session.pseudoToken, category, description, evidenceNote }),
      });
      msgBox.appendChild(el(`<div class="msg success">Report ${reportId} submitted.</div>`));
      document.getElementById('r-desc').value = '';
      document.getElementById('r-evidence').value = '';
      loadReporterReports();
    } catch (e) {
      msgBox.appendChild(el(`<div class="msg error">${e.message}</div>`));
    }
  });

  loadReporterReports();
}

async function loadReporterReports() {
  const list = document.getElementById('r-reports-list');
  try {
    const { reports } = await api(`/api/reports/mine?pseudoId=${encodeURIComponent(session.pseudoId)}&pseudoToken=${encodeURIComponent(session.pseudoToken)}`);
    if (!reports.length) { list.innerHTML = '<p class="lede">No reports yet.</p>'; return; }
    list.innerHTML = '';
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    for (const r of reports) list.appendChild(renderReportRow(r, true));
  } catch (e) {
    list.innerHTML = `<div class="msg error">${e.message}</div>`;
  }
}

function renderReportRow(r, reporterView) {
  const row = el(`
    <div class="report-row">
      <div class="report-row-top">
        <div><span class="report-id">${r.id}</span> — <b>${r.category}</b></div>
        <span class="status-pill status-${r.status}">${statusLabel(r.status)}</span>
      </div>
      <p style="margin:10px 0 0; font-size:0.88rem; color:var(--text-dim);">${escapeHtml(r.description)}</p>
      ${r.evidenceNote ? `<p class="hint">Evidence: ${escapeHtml(r.evidenceNote)}</p>` : ''}
      <div class="messages"></div>
      ${reporterView ? `
      <div class="row" style="margin-top:10px;">
        <input placeholder="Reply to administrators…" class="reply-input">
        <button class="btn" style="margin-top:0;" data-reply="${r.id}">Send</button>
      </div>` : ''}
    </div>
  `);
  const msgWrap = row.querySelector('.messages');
  for (const m of r.messages) {
    msgWrap.appendChild(el(`<div class="bubble ${m.from}">${escapeHtml(m.text)}<div class="bubble-meta">${m.from === 'reporter' ? 'You' : 'Administrator'} · ${new Date(m.at).toLocaleString()}</div></div>`));
  }
  if (reporterView) {
    const btn = row.querySelector('[data-reply]');
    const input = row.querySelector('.reply-input');
    btn.addEventListener('click', async () => {
      if (!input.value.trim()) return;
      try {
        await api(`/api/reports/${r.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ pseudoId: session.pseudoId, pseudoToken: session.pseudoToken, text: input.value }),
        });
        input.value = '';
        loadReporterReports();
      } catch (e) { alert(e.message); }
    });
  }
  return row;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function renderAdmin() {
  app.innerHTML = '';
  if (!adminSession.token) return renderAdminLogin();
  return renderAdminDashboard();
}

function renderAdminLogin() {
  app.appendChild(el(`
    <div>
      <h1>Administrator Login</h1>
      <p class="lede">Demo token is printed in the server console on startup (<code class="inline">veil-admin-demo-token</code>).
      In a real deployment this would be institutional SSO, not a shared token.</p>
      <div class="panel">
        <label>Admin token</label>
        <input id="a-token" type="password" placeholder="admin token">
        <button class="btn" id="a-login-btn">Sign in</button>
        <div id="a-login-msg"></div>
      </div>
    </div>
  `));
  document.getElementById('a-login-btn').addEventListener('click', async () => {
    const token = document.getElementById('a-token').value.trim();
    const msgBox = document.getElementById('a-login-msg');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token }) });
      adminSession.token = token;
      renderAdmin();
    } catch (e) {
      msgBox.innerHTML = '';
      msgBox.appendChild(el(`<div class="msg error">${e.message}</div>`));
    }
  });
}

function renderAdminDashboard() {
  app.appendChild(el(`
    <div>
      <h1>Administrator Dashboard</h1>
      <p class="lede">Reporters appear only as pseudonyms. No underlying identity is ever visible here.
      <button class="btn secondary" id="a-logout" style="margin-left:10px;padding:4px 10px;font-size:0.75rem;">Sign out</button></p>
      <div id="a-reports-list"><p class="lede">Loading…</p></div>
    </div>
  `));
  document.getElementById('a-logout').addEventListener('click', () => { adminSession.token = null; renderAdmin(); });
  loadAdminReports();
}

async function loadAdminReports() {
  const list = document.getElementById('a-reports-list');
  try {
    const { reports } = await api('/api/admin/reports', { headers: { Authorization: `Bearer ${adminSession.token}` } });
    if (!reports.length) { list.innerHTML = '<p class="lede">No reports yet.</p>'; return; }
    list.innerHTML = '';
    for (const r of reports) list.appendChild(renderAdminReportRow(r));
  } catch (e) {
    list.innerHTML = `<div class="msg error">${e.message}</div>`;
  }
}

function renderAdminReportRow(r) {
  const row = renderReportRow(r, false);
  const controls = el(`
    <div style="margin-top:12px;">
      <div class="row">
        <select class="a-status">
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="info_requested">Info Requested</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <button class="btn secondary" style="margin-top:0;" data-status-btn>Update Status</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <input placeholder="Message to reporter…" class="a-msg-input">
        <button class="btn" style="margin-top:0;" data-msg-btn>Send</button>
      </div>
      <div class="hint" data-audit-link style="cursor:pointer; text-decoration:underline; margin-top:8px;">View audit trail →</div>
      <div class="chain-list" style="display:none; margin-top:8px;"></div>
    </div>
  `);
  controls.querySelector('.a-status').value = r.status;
  controls.querySelector('[data-status-btn]').addEventListener('click', async () => {
    const status = controls.querySelector('.a-status').value;
    try {
      await api(`/api/admin/reports/${r.id}/status`, {
        method: 'POST', headers: { Authorization: `Bearer ${adminSession.token}` },
        body: JSON.stringify({ status }),
      });
      loadAdminReports();
    } catch (e) { alert(e.message); }
  });
  controls.querySelector('[data-msg-btn]').addEventListener('click', async () => {
    const input = controls.querySelector('.a-msg-input');
    if (!input.value.trim()) return;
    try {
      await api(`/api/admin/reports/${r.id}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${adminSession.token}` },
        body: JSON.stringify({ text: input.value }),
      });
      input.value = '';
      loadAdminReports();
    } catch (e) { alert(e.message); }
  });
  const chainList = controls.querySelector('.chain-list');
  const auditLink = controls.querySelector('[data-audit-link]');
  auditLink.addEventListener('click', async () => {
    if (chainList.style.display !== 'none') { chainList.style.display = 'none'; return; }
    try {
      const data = await api(`/api/verify/${r.id}`);
      chainList.innerHTML = `<p class="hint">Chain intact: ${data.chainIntact ? '✅ yes' : '❌ no'} · ${data.eventCount} events</p>`;
      for (const ev of data.events) {
        chainList.appendChild(el(`<div class="chain-event"><span class="type">${ev.type}</span> — ${new Date(ev.timestamp).toLocaleString()}<br>${ev.hash}</div>`));
      }
      chainList.style.display = 'block';
    } catch (e) { alert(e.message); }
  });
  row.appendChild(controls);
  return row;
}

// ---------------------------------------------------------------------------
// Public Verify
// ---------------------------------------------------------------------------

function renderVerify() {
  app.innerHTML = '';
  app.appendChild(el(`
    <div>
      <h1>Verify a Report</h1>
      <p class="lede">Anyone can confirm a report exists and its audit trail hasn't been tampered with —
      without seeing its content or the reporter's identity. This mirrors what a public verifier could
      check against Midnight on-chain state in a full deployment.</p>
      <div class="panel">
        <label>Report ID</label>
        <input id="v-id" placeholder="e.g. RPT-A1B2C3D4E5">
        <button class="btn" id="v-check-btn">Check</button>
        <div id="v-result"></div>
      </div>
    </div>
  `));
  document.getElementById('v-check-btn').addEventListener('click', async () => {
    const id = document.getElementById('v-id').value.trim();
    const box = document.getElementById('v-result');
    box.innerHTML = '';
    if (!id) return;
    try {
      const data = await api(`/api/verify/${encodeURIComponent(id)}`);
      box.appendChild(el(`<div class="msg ${data.chainIntact ? 'success' : 'error'}">
        Report exists. Chain intact: ${data.chainIntact ? 'yes' : 'no'}. ${data.eventCount} recorded events.
        Latest hash: <code class="inline">${data.latestHash.slice(0, 16)}…</code></div>`));
      const wrap = el('<div class="chain-list" style="margin-top:10px;"></div>');
      for (const ev of data.events) {
        wrap.appendChild(el(`<div class="chain-event"><span class="type">${ev.type}</span> — ${new Date(ev.timestamp).toLocaleString()}<br>${ev.hash}</div>`));
      }
      box.appendChild(wrap);
    } catch (e) {
      box.appendChild(el(`<div class="msg error">${e.message}</div>`));
    }
  });
}

Router.go('home');
