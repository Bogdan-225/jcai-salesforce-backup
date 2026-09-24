// Build update + rollback CSVs for the NN/IM pass-reason -> Drop Reason Comments migration.
// Scope: Matching__c at Stage マッチ終了 with NNPassReason__c or IMPassReason__c filled.
// Rules: termination_reason__c = その他; other_termination_reason__c = source text
//        (marker "※一括インポート" -> "理由記載なし"); Stage/Status untouched; open-stage records held back.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const snap = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot_2026-09-24.json'), 'utf8')).result.records;

const MARKER = '※一括インポート';
const NO_REASON = '理由記載なし';
const DROP_STAGE = 'マッチ終了';
const OTHER = 'その他';

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (header, rows) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const inScope = [], heldBack = [];
for (const r of snap) {
  const src = (r.IMPassReason__c || r.NNPassReason__c || '').trim();
  if (!src) continue;
  (r.phase_match__c === DROP_STAGE ? inScope : heldBack).push(r);
}

const update = [], rollback = [], skipped = [];
const stats = { nn: 0, im: 0, marker: 0, reasonChanged: 0, commentChanged: 0, byStatus: {} };
for (const r of inScope) {
  const isIM = !!r.IMPassReason__c;
  const raw = (isIM ? r.IMPassReason__c : r.NNPassReason__c).trim();
  const comment = raw === MARKER ? NO_REASON : raw;
  if (raw === MARKER) stats.marker++;
  isIM ? stats.im++ : stats.nn++;
  stats.byStatus[r.status__c] = (stats.byStatus[r.status__c] || 0) + 1;
  const reasonSame = r.termination_reason__c === OTHER;
  const commentSame = (r.other_termination_reason__c || '') === comment;
  if (reasonSame && commentSame) { skipped.push(r); continue; }
  if (!reasonSame) stats.reasonChanged++;
  if (!commentSame) stats.commentChanged++;
  update.push([r.Id, OTHER, comment]);
  rollback.push([r.Id, r.termination_reason__c || '#N/A', r.other_termination_reason__c || '#N/A']);
}

fs.writeFileSync(path.join(dir, 'matching_drop_reason_update.csv'),
  toCsv(['Id', 'termination_reason__c', 'other_termination_reason__c'], update));
fs.writeFileSync(path.join(dir, 'matching_drop_reason_rollback.csv'),
  toCsv(['Id', 'termination_reason__c', 'other_termination_reason__c'], rollback));
fs.writeFileSync(path.join(dir, 'held_back_open_stage.csv'),
  toCsv(['Id', 'Name', 'RecordType', 'Stage', 'Status', 'DropReason', 'DropComment', 'NNPassReason', 'IMPassReason', 'LastModified'],
    heldBack.map(r => [r.Id, r.Name, r.RecordType && r.RecordType.DeveloperName, r.phase_match__c, r.status__c,
      r.termination_reason__c, r.other_termination_reason__c, r.NNPassReason__c, r.IMPassReason__c, r.LastModifiedDate.slice(0, 10)])));
// canary: first 3 rows (one per source group)
const pick = (pred) => update.find(u => { const r = inScope.find(r => r.Id === u[0]); return pred(r) && u[2] !== NO_REASON; });
const canary = [pick(r => r.NNPassReason__c && r.status__c === 'NN>終了'), pick(r => r.status__c === 'アプローチ>終了'), pick(r => r.IMPassReason__c)].filter(Boolean);
fs.writeFileSync(path.join(dir, 'canary_update.csv'), toCsv(['Id', 'termination_reason__c', 'other_termination_reason__c'], canary));

console.log(JSON.stringify({ snapshot: snap.length, inScope: inScope.length, updateRows: update.length, skippedAlreadyCorrect: skipped.length,
  heldBackOpenStage: heldBack.length, ...stats, canaryIds: canary.map(c => c[0]) }, null, 1));
const maxLen = Math.max(...update.map(u => u[2].length));
console.log('max comment length', maxLen, '| any empty comment:', update.some(u => !u[2]));
