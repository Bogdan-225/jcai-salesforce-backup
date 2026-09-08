// Adds/replaces two sheets ("India - SEBI", "India - CCI") in the M&A data providers workbook, IN PLACE.
// Source: deep/india_regulators/sebi.json, deep/india_regulators/cci.json (written by research subagents 2026-09-08).
// Usage (from ma-data-research/): node build_india_regulator_sheets.js "../MA_Data_Providers_Research_2026-09-03.xlsx"
// Makes a timestamped backup in archive/ before writing. Never rebuilds other sheets.
const fs = require('fs');
const path = require('path');
const ExcelJS = require(process.env.EXCELJS_PATH || 'C:/Users/BogdanBrezeanu/.claude/tools/node_modules/exceljs');

const xlsxPath = process.argv[2];
if (!xlsxPath) { console.error('usage: node build_india_regulator_sheets.js <workbook.xlsx>'); process.exit(1); }

const FONT = { name: 'ＭＳ Ｐゴシック', family: 3, charset: 128, size: 11 };
const HEAD = { font: { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }, alignment: { vertical: 'middle', wrapText: true } };
const SITEHEAD = { font: { ...FONT, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }, alignment: { vertical: 'middle', wrapText: true } };
const EXAMPLE = { font: FONT, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }, alignment: { vertical: 'top', wrapText: true } };
const LABEL = { font: { ...FONT, bold: true }, alignment: { vertical: 'top', wrapText: true } };
const BODY = { font: FONT, alignment: { vertical: 'top', wrapText: true } };
const TITLE = { font: { ...FONT, bold: true, size: 14 } };
const SUB = { font: { ...FONT, bold: true, size: 12, color: { argb: 'FF1F3864' } } };
const CONF_FILL = { CONFIRMED: 'FFC6EFCE', 'PARTLY CONFIRMED': 'FFFFEB9C', INFERRED: 'FFF8CBAD' };
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const NCOLS = 14;                 // A + 13 data columns; site tables may extend further
const COLW_A = 30, COLW = 24;     // uniform widths so the per-section site tables look regular
const OVERVIEW_HEADERS = ['#', 'Section / dataset', 'URL', 'Form of data', 'History from', 'Volume (approx.)', 'Formats', 'Access test (2026-09-08)', 'Confidence'];
const BAND = { font: { ...FONT, bold: true, size: 12, color: { argb: 'FF1F3864' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }, alignment: { vertical: 'middle', wrapText: true } };

function style(cell, s) { Object.assign(cell, s); }
function link(cell, url) {
  if (!url) return;
  cell.value = { text: url, hyperlink: url };
  cell.font = { ...FONT, color: { argb: 'FF0563C1' }, underline: true };
}
function text(v) { return v == null ? '' : (Array.isArray(v) ? v.join('\n') : String(v)); }
// approximate row height for wrapped text in a cell/merged range of the given total width (chars)
function heightFor(str, widthChars, min = 18, max = 300) {
  const lines = text(str).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / (widthChars * 1.05))), 0);
  return Math.min(max, Math.max(min, lines * 15 + 4));
}

function buildSheet(wb, data, sheetName) {
  const old = wb.getWorksheet(sheetName);
  if (old) wb.removeWorksheet(old.id);
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] }); // no frozen panes on purpose (mixed layout)
  ws.getColumn(1).width = COLW_A;
  for (let k = 2; k <= 22; k++) ws.getColumn(k).width = COLW;
  const mergedW = COLW * (NCOLS - 1);
  let r = 1;

  // helper: label in A, wrapped text merged B..NCOLS
  const kvRow = (k, v, isLink) => {
    ws.getCell(r, 1).value = k; style(ws.getCell(r, 1), LABEL);
    ws.mergeCells(r, 2, r, NCOLS);
    const c = ws.getCell(r, 2); style(c, BODY);
    if (isLink) link(c, v); else c.value = text(v);
    ws.getRow(r).height = heightFor(v, mergedW);
    r++;
  };
  const band = (t) => { ws.mergeCells(r, 1, r, NCOLS); ws.getCell(r, 1).value = t; style(ws.getCell(r, 1), BAND); ws.getRow(r).height = heightFor(t, COLW_A + mergedW, 22); r++; };

  // --- Block 1: summary ---
  ws.mergeCells(r, 1, r, NCOLS);
  ws.getCell(r, 1).value = `${data.regulator} - ${data.full_name || ''} - what M&A data is available and in what form`;
  style(ws.getCell(r, 1), TITLE); ws.getRow(r).height = 24; r++;
  kvRow('Homepage', data.homepage, true);
  kvRow('Checked on', data.checked_on);
  kvRow('Access (can we fetch it?)', data.access_summary);
  kvRow('What is there (summary)', data.overall_summary);
  kvRow('Info about the companies?', data.company_info_verdict);
  kvRow('Blockers / problems', (data.blockers || []).map(b => '- ' + b).join('\n'));
  r++;

  // --- Block 2: compact overview table (long text lives in block B) ---
  band('A. OVERVIEW - one row per section / dataset found on the site (details, filters and company info are in block B below)');
  OVERVIEW_HEADERS.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; style(c, HEAD); c.border = BORDER; });
  ws.getRow(r).height = 32; r++;
  (data.sections || []).forEach((s, i) => {
    const firstSentence = (t) => { const m = /^(.*?[.;])(s|$)/.exec(text(t)); return m ? m[1] : text(t); }; // full text is in block B
    const vals = [i + 1, s.name, s.url, s.data_form, s.history_from, s.volume_estimate, s.formats, firstSentence(s.access_test), s.confidence];
    vals.forEach((v, j) => {
      const c = ws.getCell(r, j + 1); style(c, BODY); c.border = BORDER;
      if (j === 2) link(c, v); else c.value = text(v);
      const conf = String(v).startsWith('PARTLY') ? 'PARTLY CONFIRMED' : String(v).split(/[\s(]/)[0];
      if (j === 8 && CONF_FILL[conf]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONF_FILL[conf] } };
    });
    ws.getRow(r).height = Math.max(...vals.map((v, j) => heightFor(v, j === 0 ? COLW_A : COLW, 20, 120)));
    r++;
  });
  r++;

  // --- Block 3: per-section detail ---
  band('B. DETAIL PER SECTION - site column headers exactly as displayed (blue), one real example row (yellow), then links and what a document contains');
  ws.mergeCells(r, 1, r, NCOLS);
  ws.getCell(r, 1).value = 'Sections with no table (PDF lists, articles, search forms) show the example links instead of a header row.';
  style(ws.getCell(r, 1), { font: { ...FONT, italic: true } }); r += 2;

  (data.sections || []).forEach((s, i) => {
    band(`B${i + 1}. ${s.name}   |   Form: ${text(s.data_form)}   |   ${text(s.confidence)}`);
    kvRow('URL', s.url, true);
    kvRow('What it is', s.what_it_is);
    const hdrs = s.column_headers || [];
    if (hdrs.length) {
      ws.getCell(r, 1).value = 'Column headers on the site'; style(ws.getCell(r, 1), LABEL);
      hdrs.forEach((h, j) => { const c = ws.getCell(r, j + 2); c.value = text(h); style(c, SITEHEAD); c.border = BORDER; });
      ws.getRow(r).height = Math.max(...hdrs.map(h => heightFor(h, COLW, 20, 60)));
      r++;
      ws.getCell(r, 1).value = 'Example row (real)'; style(ws.getCell(r, 1), LABEL);
      const ex = s.example_row || [];
      hdrs.forEach((h, j) => {
        const c = ws.getCell(r, j + 2); style(c, EXAMPLE); c.border = BORDER;
        const v = text(ex[j]);
        if (/^https?:\/\/\S+$/.test(v.trim())) { link(c, v.trim()); c.fill = EXAMPLE.fill; } else c.value = v;
      });
      ws.getRow(r).height = Math.max(20, ...ex.map(v => heightFor(v, COLW, 20, 200)));
      r++;
    } else {
      kvRow('Column headers on the site', '(no table on this page - see the example links below for the form the data takes)');
    }
    const rows = [
      ['Filters available', s.filters],
      ['Example links', (s.example_links || []).join('\n')],
      ['What one real document contains', s.example_document_contents],
      ['Info about the companies', s.company_info],
      ['Access test', s.access_test],
      ['Notes', s.notes],
    ];
    for (const [k, v] of rows) {
      if (!text(v)) continue;
      if (k === 'Example links' && (s.example_links || []).length === 1) kvRow(k, s.example_links[0], true); else kvRow(k, v);
    }
    r++;
  });

  // --- Sources ---
  band('C. SOURCES OPENED');
  (data.sources || []).forEach(u => { ws.mergeCells(r, 1, r, NCOLS); link(ws.getCell(r, 1), u); r++; });
  return ws;
}

(async () => {
  const here = __dirname;
  const jsonDir = process.env.INDIA_JSON_DIR || path.join(here, 'deep/india_regulators');
  const sebi = JSON.parse(fs.readFileSync(path.join(jsonDir, 'sebi.json'), 'utf8'));
  const cci = JSON.parse(fs.readFileSync(path.join(jsonDir, 'cci.json'), 'utf8'));
  const lock = path.join(path.dirname(xlsxPath), '~$' + path.basename(xlsxPath));
  if (fs.existsSync(lock)) { console.error('Workbook appears open in Excel (lock file present): ' + lock); process.exit(2); }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 13);
  const backup = path.join(process.env.INDIA_BACKUP_DIR || path.join(here, 'archive'), path.basename(xlsxPath).replace('.xlsx', `_before_india_regulators_${stamp}.xlsx`));
  fs.copyFileSync(xlsxPath, backup);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const before = wb.worksheets.map(w => w.name);
  const s1 = buildSheet(wb, sebi, 'India - SEBI');
  const s2 = buildSheet(wb, cci, 'India - CCI');
  // place the two sheets right after 国ごとのプロバイダー (plan sheet) when it exists
  const planIdx = wb.worksheets.findIndex(w => w.name === '国ごとのプロバイダー');
  if (planIdx >= 0) {
    // exceljs has no move API; reorder via orderNo
    const order = wb.worksheets.filter(w => w !== s1 && w !== s2);
    order.splice(planIdx + 1, 0, s1, s2);
    order.forEach((w, i) => { w.orderNo = i; });
  }
  await wb.xlsx.writeFile(xlsxPath);
  console.log('backup:', backup);
  console.log('sheets before:', before.join(', '));
  console.log('sheets after :', wb.worksheets.map(w => w.name).join(', '));
  console.log('India - SEBI rows:', s1.rowCount, '| India - CCI rows:', s2.rowCount);
})().catch(e => { console.error(e); process.exit(1); });
