// node transform_account_page.js <in.flexipage-meta.xml> <out.flexipage-meta.xml>
// Inserts a read-only Record.SellSideConflict__c field instance right after the
// existing Record.DealConflict__c instance (Dynamic Forms: <itemInstances><fieldInstance>). Idempotent.
const fs = require('fs');
const [,, inPath, outPath] = process.argv;
let xml = fs.readFileSync(inPath, 'utf8');
if (xml.includes('Record.SellSideConflict__c')) { fs.writeFileSync(outPath, xml); console.log('already present'); process.exit(0); }
// one complete sibling <itemInstances> block that contains the DealConflict__c fieldItem
// (tempered match so it cannot start at an earlier itemInstances)
const re = /<itemInstances>(?:(?!<\/itemInstances>)[\s\S])*?<fieldItem>Record\.DealConflict__c<\/fieldItem>[\s\S]*?<\/itemInstances>/;
const m = re.exec(xml);
if (!m) { console.error('DealConflict__c field instance not found'); process.exit(1); }
const block = m[0];
const clone = block
  .replace('Record.DealConflict__c', 'Record.SellSideConflict__c')
  .replace('RecordDealConflict_cField', 'RecordSellSideConflict_cField');
// force read-only behaviour on the clone (plain <value> or <value><stringValue>)
const cloneRO = clone.replace(/(<name>uiBehavior<\/name>\s*<value>)(?:\s*<stringValue>[^<]*<\/stringValue>\s*|[^<]*)(<\/value>)/, '$1readonly$2');
const idx = m.index + block.length;
xml = xml.slice(0, idx) + '\n        ' + cloneRO + xml.slice(idx);
fs.writeFileSync(outPath, xml);
console.log('inserted SellSideConflict__c after DealConflict__c');
