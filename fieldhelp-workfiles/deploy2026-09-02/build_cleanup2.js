// Cleanup v2 (user decision 2026-09-02): REMOVE inlineHelpText from the 4 standard fields that have it;
// add en_US help translations for the custom fields still showing Japanese to EN users.
const fs = require('fs');
const path = require('path');
const RET = path.join(__dirname, 'retrieved', 'unpackaged');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const removeHelp = {
  Account: ['Website'],
  Opportunity: ['Name', 'CloseDate', 'Probability'],
};
const trans = {
  Account: {
    DomesticFreeDescription_BuyNeeds__c: 'For past-data reference only. Going forward, manage this in the M&A Needs object.',
    InternationalFreeDescription_BuyNeeds__c: 'For past-data reference only. Going forward, manage this in the M&A Needs object.',
    Field_memo__c: 'Memo field for notes such as group-company business relationships or cautionary buyers.',
  },
  Opportunity: {
    Comment__c: 'Entering a value here also creates an activity linked to this sell-side project.',
    Subject__c: 'Entering a value here also creates an activity linked to this sell-side project.',
    AD__c: 'Enter the rough advisory (AD) agreement timing, e.g. "early September".',
    TeaserURL__c: 'Insert the shared URL from the [Share] button in Google Drive or Box. (For Box: remove the link expiration under [Link Settings] > [Link Expiration] by unchecking the box.)',
  },
};

const HDR = '<?xml version="1.0" encoding="UTF-8"?>\n';
const dir = path.join(__dirname, 'pkg_Cleanup2');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
fs.mkdirSync(path.join(dir, 'objectTranslations'), { recursive: true });

const members = [];
for (const obj of ['Account', 'Opportunity']) {
  const xml = fs.readFileSync(path.join(RET, 'objects', obj + '.object'), 'utf8');
  const raw = {};
  for (const m of xml.matchAll(/<fields>[\s\S]*?<\/fields>/g)) {
    const fn = (m[0].match(/<fullName>([^<]*)<\/fullName>/) || [])[1];
    if (fn) raw[fn] = m[0];
  }
  const blocks = [];
  for (const api of removeHelp[obj]) {
    let blk = raw[api];
    if (!blk) { console.log('NO RETRIEVED BLOCK for', obj + '.' + api, '- skipping'); continue; }
    if (!/<inlineHelpText>/.test(blk)) { console.log('NO HELP in retrieved block', obj + '.' + api, '- skipping'); continue; }
    console.log('BEFORE', obj + '.' + api + ':', blk.replace(/\s+/g, ' ').slice(0, 160));
    blk = blk.replace(/\s*<inlineHelpText>[\s\S]*?<\/inlineHelpText>/, '');
    console.log('AFTER ', obj + '.' + api + ':', blk.replace(/\s+/g, ' ').slice(0, 160));
    blocks.push(blk);
    members.push(obj + '.' + api);
  }
  if (blocks.length) {
    fs.writeFileSync(path.join(dir, 'objects', obj + '.object'),
      HDR + '<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">\n    ' + blocks.join('\n    ') + '\n</CustomObject>\n');
  }
  const entries = Object.entries(trans[obj]).map(([api, en]) =>
    `    <fields>\n        <help>${esc(en)}</help>\n        <name>${api}</name>\n    </fields>`);
  fs.writeFileSync(path.join(dir, 'objectTranslations', obj + '-en_US.objectTranslation'),
    HDR + '<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">\n' + entries.join('\n') + '\n</CustomObjectTranslation>\n');
}

const pkg = [HDR + '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
  '    <types>', ...members.sort().map(m => `        <members>${m}</members>`), '        <name>CustomField</name>', '    </types>',
  '    <types>', '        <members>Account-en_US</members>', '        <members>Opportunity-en_US</members>', '        <name>CustomObjectTranslation</name>', '    </types>',
  '    <version>62.0</version>', '</Package>'];
fs.writeFileSync(path.join(dir, 'package.xml'), pkg.join('\n') + '\n');
console.log('pkg_Cleanup2:', members.length, 'help removals + 7 en_US translations');
