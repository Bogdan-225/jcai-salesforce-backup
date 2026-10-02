// Build close/rollback/canary CSVs for the open-task backlog close (2026-10-02).
// Rule (Bogdan, 2026-10-02): close every open Task unless a date field is today or later,
// or it is a typed activity-card task (activity_type__c set or parent_activity_id__c set).
// Usage: node build_files.js <snapshot.csv> <outdir> [today=YYYY-MM-DD]
const fs = require('fs');
const path = require('path');
const [, , snap, outDir, todayArg] = process.argv;
const TODAY = todayArg || '2026-10-02';           // JST calendar day; datetimes compared from the previous UTC day for margin
const DT_FLOOR = '2026-10-01T15:00:00';          // 2026-10-02 00:00 JST in UTC

function parse(s) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c === '\r') { }
    else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const rows = parse(fs.readFileSync(snap, 'utf8'));
const hdr = rows.shift();
const ix = Object.fromEntries(hdr.map((h, i) => [h, i]));
const g = (r, k) => r[ix[k]] ?? '';

// CallStatus values that make ToDo_Account_NG / ToDo_Account_SellCallNG fire on save
const NG_ACCOUNT = new Set(['社長拒否(永久NG)', '受付拒否(永久NG)', 'クレーム', 'M&A実施済み・子会社化', 'アポ獲得', 'トスアップ']);
const NG_SELL = new Set(['社長拒否(永久NG)', '社長拒否(半年NG)', '受付拒否(永久NG)', '受付拒否(半年NG)', '新規取引拒否(1か月NG)', 'クレーム']);

const keep = [], closeA = [], closeB = [];
const keepWhy = new Map(); const bWhy = new Map();
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
let bad = 0;
for (const r of rows) {
  if (r.length < hdr.length) { bad++; continue; }
  const id = g(r, 'Id');
  if (g(r, 'Status') !== '進行中') { inc(keepWhy, 'status not 進行中: ' + g(r, 'Status')); keep.push([id, g(r, 'Status'), 'unexpected status']); continue; }
  const ad = g(r, 'ActivityDate');
  const futureDate = (ad && ad >= TODAY)
    || (g(r, 'call_date_and_time__c') >= DT_FLOOR && g(r, 'call_date_and_time__c') !== '')
    || (g(r, 'NextActionDate__c') && g(r, 'NextActionDate__c') >= TODAY)
    || (g(r, 'task_start_date__c') !== '' && g(r, 'task_start_date__c') >= DT_FLOOR)
    || (g(r, 'task_end_date__c') !== '' && g(r, 'task_end_date__c') >= DT_FLOOR);
  const typed = g(r, 'activity_type__c') !== '' || g(r, 'parent_activity_id__c') !== '';
  if (futureDate || typed) {
    const why = futureDate ? 'date today or later' : 'typed card task (' + g(r, 'activity_type__c') + ')';
    inc(keepWhy, why); keep.push([id, g(r, 'Status'), why, g(r, 'Subject').slice(0, 40), g(r, 'What.Type')]);
    continue;
  }
  const p = g(r, 'WhatId').slice(0, 3);
  const cs = g(r, 'CallStatus__c');
  const deal = p === '006' || p === 'a0r';
  const ng = NG_ACCOUNT.has(cs) || NG_SELL.has(cs);
  if (deal || ng) { inc(bWhy, deal ? 'WhatId ' + p : 'CallStatus ' + cs); closeB.push(id); }
  else closeA.push(id);
}

const CRLF = '\r\n';
const w = (name, lines) => fs.writeFileSync(path.join(outDir, name), lines.join(CRLF) + CRLF);
w('update_A_nodeal.csv', ['Id,Status', ...closeA.map(id => id + ',完了')]);
w('update_B_deal.csv', ['Id,Status', ...closeB.map(id => id + ',完了')]);
w('canary_update.csv', ['Id,Status', ...closeA.filter((_, i) => i % Math.floor(closeA.length / 200) === 0).slice(0, 200).map(id => id + ',完了')]);
w('task_open_rollback.csv', ['Id,Status', ...[...closeA, ...closeB].map(id => id + ',進行中')]);
w('kept_open.csv', ['Id,Status,Reason,Subject,WhatType', ...keep.map(k => k.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))]);

console.log('rows:', rows.length, 'malformed:', bad);
console.log('close A (no deal, no NG):', closeA.length);
console.log('close B (deal-linked or NG CallStatus):', closeB.length); for (const [k, v] of bWhy) console.log('   ', v, k);
console.log('keep open:', keep.length); for (const [k, v] of keepWhy) console.log('   ', v, k);
