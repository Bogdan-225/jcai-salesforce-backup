// One-off (2026-09-04): plain-language rewrite of the INDIA free-row verdict (EN + JA), in plan.json and in the user's xlsx in place.
// Run from ma-data-research/: node archive/rewrite_india_verdict_2026-09-04.js ../MA_Data_Providers_Research_2026-09-03.xlsx
const fs = require('fs'); const path = require('path');
const EX = require(process.env.EXCELJS_PATH || 'C:/Users/BogdanBrezeanu/.claude/tools/node_modules/exceljs');
const here = path.resolve(__dirname, '..');

const EN = [
  'ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04: scraping is now allowed where a site\'s terms do not forbid it).',
  'India has no official free API. The free route means 4 separate websites, each with its own rules:',
  '• BSE (Bombay Stock Exchange) - stock exchange; publishes listed-company announcements (acquisitions, schemes, open offers). Terms have no scraping clause, but the disclaimer forbids copying or redistributing content without BSE\'s written consent. -> Ask BSE for consent before storing its announcements.',
  '• NSE (National Stock Exchange) - the other, larger stock exchange; same kind of announcements. Terms explicitly ban scraping and automated data collection. -> Do not scrape. Use the paid NSE feed (PAID Option A) instead.',
  '• CCI (Competition Commission of India) - merger-control regulator. Its Combination register lists every notified merger or acquisition above the thresholds, with party names and orders. Terms say nothing about automated access. -> OK to harvest. Cleanest free M&A list in India.',
  '• SEBI (Securities and Exchange Board of India) - securities regulator. Publishes takeover filings (open offers, 5%+ stake disclosures). Terms say nothing about automated access. -> OK to harvest.',
  'Caveats: CCI and SEBI use the standard Indian government copyright policy (e-mail permission + source credit if we republish content; internal analysis is not addressed). BSE and NSE block server requests (HTTP 403), so even permitted access would need browser emulation; CCI and SEBI are plain websites.',
  '[Terms check 2026-09-04: deep/scraping_tos]',
].join('\n');

const JA = [
  '条件付きで可（2026-09-04再評価：規約で禁止されていないサイトはスクレイピング可に）。',
  'インドに公式の無料APIはない。無料ルートは4つの別々のサイトで、それぞれルールが異なる：',
  '• BSE（ボンベイ証券取引所）：上場企業の開示（買収、スキーム、公開買付）。規約にスクレイピング条項はないが、書面同意なしの複製・再配布を禁止 → 保存前にBSEへ同意を求める。',
  '• NSE（ナショナル証券取引所）：もう一つの、より大きな取引所。同種の開示。規約がスクレイピング・自動収集を明示的に禁止 → 取得しない。有料NSEフィード（有料Option A）を使う。',
  '• CCI（インド競争委員会）：企業結合規制当局。基準を超える全ての合併・買収届出を当事者名・命令付きで掲載。規約に自動アクセスの記載なし → 収集OK。インドで最もきれいな無料M&Aリスト。',
  '• SEBI（インド証券取引委員会）：証券規制当局。公開買付関連の届出（公開買付、5%以上の持分開示）。規約に自動アクセスの記載なし → 収集OK。',
  '注意：CCIとSEBIはインド政府標準の著作権ポリシー（再公表時はメール許可＋出典明記、社内分析は言及なし）。BSE/NSEはサーバーからのアクセスを遮断（HTTP 403）するため、許可があってもブラウザエミュレーションが必要。CCI/SEBIは通常のサイト。',
  '[規約確認 2026-09-04: deep/scraping_tos]',
].join('\n');

const planFile = path.join(here, 'plan.json');
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const india = plan.find(p => p.region === 'INDIA'); const t = india.tiers.find(t => t.label.startsWith('FREE'));
if (!t.verdict.startsWith('ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04, scraping route)')) throw new Error('unexpected current verdict: ' + t.verdict.slice(0, 60));
t.verdict = EN; t.verdict_ja = JA;
fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8');
// keep plan_verdict_ja.json (index 10 = INDIA FREE) in sync
const jaFile = path.join(here, 'plan_verdict_ja.json'); const jaArr = JSON.parse(fs.readFileSync(jaFile, 'utf8'));
if (!jaArr[10].startsWith('条件付きで可（2026-09-04再評価・スクレイピング経路）：公式無料API')) throw new Error('plan_verdict_ja.json index 10 unexpected');
jaArr[10] = JA; fs.writeFileSync(jaFile, JSON.stringify(jaArr, null, 0).replace(/","/g, '",\n"').replace(/^\["/, '[\n"').replace(/"\]$/, '"\n]\n'), 'utf8');
console.log('plan.json + plan_verdict_ja.json updated');

const xlsx = process.argv[2]; if (!xlsx) throw new Error('xlsx path required');
(async () => {
  const wb = new EX.Workbook(); await wb.xlsx.readFile(xlsx);
  const ws = wb.getWorksheet('Implementation plan');
  let hit = 0;
  ws.eachRow((r, i) => { if (i === 1) return; const v = String(r.getCell(3).value || ''); if (v.startsWith('ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04, scraping route): no official free API')) { r.getCell(3).value = EN; r.getCell(4).value = JA; hit++; console.log('row', i, 'rewritten'); } });
  if (hit !== 1) throw new Error('expected exactly 1 matching row, found ' + hit + ' - nothing saved');
  await wb.xlsx.writeFile(xlsx); console.log('xlsx updated in place');
})().catch(e => { console.error(e); process.exit(1); });
