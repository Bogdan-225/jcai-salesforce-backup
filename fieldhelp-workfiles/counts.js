// Count non-empty values for every visible field in dataset.json -> counts.json
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ds = require('./rows_current.json');
const fieldinfo = require('./fieldinfo.json');
const AUTH = JSON.parse(execSync('sf org auth show-access-token --json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const TOKEN = AUTH.result.accessToken;
const BASE = 'https://idealpartners.my.salesforce.com/services/data/v60.0/query?q=';

async function q(soql) {
  const res = await fetch(BASE + encodeURIComponent(soql), { headers: { Authorization: 'Bearer ' + TOKEN } });
  const j = await res.json();
  if (!res.ok) throw new Error((j[0] && j[0].errorCode) + ': ' + (j[0] && j[0].message||'').slice(0,120));
  return j;
}

// collect unique (obj, field, type, filterable) for visible rows
const jobs = new Map();
for (const rows of Object.values(ds))
  for (const r of rows) {
    if (!r.obj || !r.api) continue;
    const fi = fieldinfo[r.obj][r.api];
    if (!fi || !fi.vis) continue;
    if (!jobs.has(r.obj + '.' + r.api))
      jobs.set(r.obj + '.' + r.api, { obj: r.obj, f: r.api, type: fi.type, filterable: fi.filterable });
  }

const objs = [...new Set([...jobs.values()].map(j => j.obj))];
const out = { totals: {}, fields: {} };

async function countField(j) {
  const key = j.obj + '.' + j.f;
  try {
    if (j.type === 'boolean') {
      const r = await q(`SELECT COUNT(Id) c FROM ${j.obj} WHERE ${j.f} = true`);
      return { n: r.records[0].c, mode: 'true-count' };
    }
    if (j.filterable) {
      const r = await q(`SELECT COUNT(Id) c FROM ${j.obj} WHERE ${j.f} != null`);
      return { n: r.records[0].c, mode: 'exact' };
    }
    // non-filterable (long text etc): sample up to 2000 records
    const r = await q(`SELECT ${j.f} FROM ${j.obj} LIMIT 2000`);
    const n = r.records.filter(x => x[j.f] != null && String(x[j.f]).trim() !== '').length;
    return { n, mode: r.records.length >= 2000 ? 'sampled2000' : 'sampled-all' };
  } catch (e) {
    return { n: null, mode: 'error', err: e.message };
  }
}

(async () => {
  for (const o of objs) {
    try { const r = await q(`SELECT COUNT() FROM ${o}`); out.totals[o] = r.totalSize; }
    catch (e) { out.totals[o] = null; }
  }
  console.log('totals:', JSON.stringify(out.totals));
  const list = [...jobs.values()];
  let done = 0;
  const CONC = 6;
  async function worker() {
    while (list.length) {
      const j = list.shift();
      out.fields[j.obj + '.' + j.f] = await countField(j);
      if (++done % 50 === 0) console.log('done', done);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  fs.writeFileSync(path.join(__dirname, 'counts.json'), JSON.stringify(out, null, 1));
  const errs = Object.entries(out.fields).filter(([k, v]) => v.mode === 'error');
  console.log('fields counted:', done, 'errors:', errs.length);
  errs.slice(0, 20).forEach(([k, v]) => console.log('ERR', k, v.err));
})();
