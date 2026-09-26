const test = require('node:test');
const assert = require('node:assert/strict');
const { appendAuditEvent, verifyAuditChain } = require('../server.js');

function makeReport() {
  const report = { genesisHash: 'genesis-hash', auditChain: [] };
  appendAuditEvent(report, 'report_submitted', { category: 'Other', descriptionLength: 42 });
  appendAuditEvent(report, 'status_updated', { status: 'under_review' });
  appendAuditEvent(report, 'admin_message', { length: 12 });
  return report;
}

test('an untouched chain verifies', () => {
  assert.equal(verifyAuditChain(makeReport()), true);
});

test('an empty chain verifies', () => {
  assert.equal(verifyAuditChain({ genesisHash: 'genesis-hash', auditChain: [] }), true);
});

test('editing an event type is detected', () => {
  const report = makeReport();
  report.auditChain[1].type = 'report_submitted';
  assert.equal(verifyAuditChain(report), false);
});

test('editing an event timestamp is detected', () => {
  const report = makeReport();
  report.auditChain[1].timestamp = '2000-01-01T00:00:00.000Z';
  assert.equal(verifyAuditChain(report), false);
});

test('removing an event from the middle is detected', () => {
  const report = makeReport();
  report.auditChain.splice(1, 1);
  assert.equal(verifyAuditChain(report), false);
});

test('reordering events is detected', () => {
  const report = makeReport();
  [report.auditChain[1], report.auditChain[2]] = [report.auditChain[2], report.auditChain[1]];
  assert.equal(verifyAuditChain(report), false);
});

test('a chain moved onto a different genesis hash is detected', () => {
  const report = makeReport();
  report.genesisHash = 'some-other-report';
  assert.equal(verifyAuditChain(report), false);
});

test('events without stored link data fail instead of passing blindly', () => {
  const report = makeReport();
  const { type, timestamp, hash } = report.auditChain[0];
  report.auditChain[0] = { type, timestamp, hash };
  assert.equal(verifyAuditChain(report), false);
});
