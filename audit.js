// VEIL audit hash-chain helpers, shared by server.js and the tests.

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Audit hash-chain — simulates the "verifiable, tamper-evident, but
// content-blind" property of an on-chain record. Each event for a report
// links to the previous event's hash. Content of the report never enters
// the chain — only a hash of (event type + timestamp + previous hash +
// content hash), matching the "identity/eligibility/report/verification"
// separation described in the writeup.
// ---------------------------------------------------------------------------

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function appendAuditEvent(report, type, contentForHash) {
  const prevHash = report.auditChain.length
    ? report.auditChain[report.auditChain.length - 1].hash
    : report.genesisHash;
  const timestamp = new Date().toISOString();
  const contentHash = sha256(JSON.stringify(contentForHash ?? {}));
  const hash = auditEventHash(prevHash, type, timestamp, contentHash);
  // prevHash and contentHash are stored so the link can be recomputed at
  // verify time. contentHash is never exposed by the public verify route.
  report.auditChain.push({ type, timestamp, prevHash, contentHash, hash });
  return hash;
}

function auditEventHash(prevHash, type, timestamp, contentHash) {
  return sha256(`${prevHash}:${type}:${timestamp}:${contentHash}`);
}

function verifyAuditChain(report) {
  let prevHash = report.genesisHash;
  for (const event of report.auditChain) {
    // The original content isn't needed: each event commits to a hash of
    // it, so recomputing the event hash detects edits, reordering, and
    // removed or inserted events without revealing report content.
    // Events written before prevHash/contentHash were stored can't be
    // recomputed, so they fail verification rather than passing blindly.
    if (!event.hash || !event.type || !event.timestamp || !event.contentHash) return false;
    if (event.prevHash !== prevHash) return false;
    if (auditEventHash(prevHash, event.type, event.timestamp, event.contentHash) !== event.hash) return false;
    prevHash = event.hash;
  }
  return true;
}

module.exports = { appendAuditEvent, auditEventHash, verifyAuditChain };
