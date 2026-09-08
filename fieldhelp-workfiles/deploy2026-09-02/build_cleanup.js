// Cleanup batch: (1) en_US help translations for fields still showing Japanese to EN users,
// (2) Japanese master help for the 5 standard fields that have none (test — validated by dry-run).
const fs = require('fs');
const path = require('path');
const RET = path.join(__dirname, 'retrieved', 'unpackaged');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// masters to ADD (standard fields, currently no help): api -> ja text (from workbook column D)
const masters = {
  Account: {
    ParentId: '親会社の取引先ID。企業階層の構築に使用します。',
    TickerSymbol: '株式コード（ティッカーシンボル）。',
    AccountSource: 'この取引先の獲得元（ソース）。',
  },
  Opportunity: {
    StageName: '案件の現在のパイプラインステージ。',
    Probability: '確度は現在のステージに基づいて自動設定されます。',
  },
};

// en_US help translations: api -> en text
// (leftover JA-only helps translated from their org masters + the 5 standard adds from column B)
const trans = {
  Account: {
    Website: 'Enter "None" if the company has no website.',
    DomesticFreeDescription_BuyNeeds__c: 'For past-data reference only. Going forward, manage this in the M&A Needs object.',
    InternationalFreeDescription_BuyNeeds__c: 'For past-data reference only. Going forward, manage this in the M&A Needs object.',
    Field_memo__c: 'Memo field for notes such as group-company business relationships or cautionary buyers.',
    ParentId: 'Parent company account ID, used to build the corporate hierarchy.',
    TickerSymbol: 'Stock code identifier',
    AccountSource: 'From which source',
  },
  Opportunity: {
    Name: 'Like a Slack channel name, use "PJ Name_Prefecture+Business" or "CompanyName_Prefecture_Business".',
    CloseDate: 'Not used - required by Salesforce and cannot be removed. Enter any date (today is fine); it is automatically overwritten to 2037-05-01.',
    Comment__c: 'Entering a value here also creates an activity linked to this sell-side project.',
    Subject__c: 'Entering a value here also creates an activity linked to this sell-side project.',
    AD__c: 'Enter the rough advisory (AD) agreement timing, e.g. "early September".',
    TeaserURL__c: 'Insert the shared URL from the [Share] button in Google Drive or Box. (For Box: remove the link expiration under [Link Settings] > [Link Expiration] by unchecking the box.)',
    StageName: 'Current pipeline stage of the project',
    Probability: 'Probability is automatically set based on the current Stage.',
  },
};

// raw retrieved blocks (standard fields appear only if customized)
const rawBlocks = {};
for (const obj of ['Account', 'Opportunity']) {
  const xml = fs.readFileSync(path.join(RET, 'objects', obj + '.object'), 'utf8');
  rawBlocks[obj] = {};
  for (const m of xml.matchAll(/<fields>[\s\S]*?<\/fields>/g)) {
    const fn = (m[0].match(/<fullName>([^<]*)<\/fullName>/) || [])[1];
    if (fn) rawBlocks[obj][fn] = m[0];
  }
}

const HDR = '<?xml version="1.0" encoding="UTF-8"?>\n';
const dir = path.join(__dirname, 'pkg_Cleanup');
fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
fs.mkdirSync(path.join(dir, 'objectTranslations'), { recursive: true });

const pkgTypes = [];
for (const obj of ['Account', 'Opportunity']) {
  const blocks = [], members = [];
  for (const [api, ja] of Object.entries(masters[obj] || {})) {
    let blk = rawBlocks[obj][api];
    const tag = `<inlineHelpText>${esc(ja)}</inlineHelpText>`;
    if (blk) {
      if (/<inlineHelpText>/.test(blk)) { console.log('SKIP (already has help):', obj, api); continue; }
      blk = /^\s*<label>/m.test(blk)
        ? blk.replace(/^(\s*)<label>/m, `$1${tag}\n$1<label>`)
        : blk.replace(/<\/fields>$/, `    ${tag}\n    </fields>`);
    } else {
      blk = `<fields>\n        <fullName>${api}</fullName>\n        ${tag}\n    </fields>`;
    }
    blocks.push(blk);
    members.push(`${obj}.${api}`);
    console.log('master ADD:', obj, api, blk.includes('<fullName>' + api) ? '(block ok)' : '(?)', rawBlocks[obj][api] ? '[from retrieved]' : '[minimal]');
  }
  if (blocks.length) {
    fs.writeFileSync(path.join(dir, 'objects', obj + '.object'),
      HDR + '<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">\n    ' + blocks.join('\n    ') + '\n</CustomObject>\n');
    pkgTypes.push({ name: 'CustomField', members });
  }
  const entries = Object.entries(trans[obj] || {}).map(([api, en]) =>
    `    <fields>\n        <help>${esc(en)}</help>\n        <name>${api}</name>\n    </fields>`);
  fs.writeFileSync(path.join(dir, 'objectTranslations', obj + '-en_US.objectTranslation'),
    HDR + '<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">\n' + entries.join('\n') + '\n</CustomObjectTranslation>\n');
  console.log('translations:', obj, entries.length);
}

const cf = pkgTypes.flatMap(t => t.members).sort();
const pkg = [HDR + '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
  '    <types>', ...cf.map(m => `        <members>${m}</members>`), '        <name>CustomField</name>', '    </types>',
  '    <types>', '        <members>Account-en_US</members>', '        <members>Opportunity-en_US</members>', '        <name>CustomObjectTranslation</name>', '    </types>',
  '    <version>62.0</version>', '</Package>'];
fs.writeFileSync(path.join(dir, 'package.xml'), pkg.join('\n') + '\n');
console.log('package.xml written:', cf.length, 'CustomField members + 2 COT');
