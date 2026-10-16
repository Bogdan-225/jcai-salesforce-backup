// FlexiPage: node transform_matching.js <in> <out> Record.DealConflict_M__c Record.SellSideConflict_M__c
// Layout:    node transform_matching.js --layout <in> <out> DealConflict_M__c SellSideConflict_M__c
const fs = require('fs');
const args = process.argv.slice(2);
const layoutMode = args[0] === '--layout';
if (layoutMode) args.shift();
const [inPath, outPath, src, dst] = args;
let xml = fs.readFileSync(inPath, 'utf8');
if (xml.includes(dst)) { fs.writeFileSync(outPath, xml); console.log('already present'); process.exit(0); }
let re, clone;
const esc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (layoutMode) {
  re = new RegExp('<layoutItems>(?:(?!<\\/layoutItems>)[\\s\\S])*?<field>' + esc + '<\\/field>[\\s\\S]*?<\\/layoutItems>');
} else {
  re = new RegExp('<itemInstances>(?:(?!<\\/itemInstances>)[\\s\\S])*?<fieldItem>' + esc + '<\\/fieldItem>[\\s\\S]*?<\\/itemInstances>');
}
const m = re.exec(xml);
if (!m) { console.error(src + ' not found in ' + inPath); process.exit(1); }
const block = m[0];
clone = block.split(src).join(dst);
if (!layoutMode) {
  const srcId = 'Record' + src.replace('Record.', '').replace(/__c$/, '_cField');
  const dstId = 'Record' + dst.replace('Record.', '').replace(/__c$/, '_cField');
  clone = clone.split(srcId).join(dstId);
  clone = clone.replace(/(<name>uiBehavior<\/name>\s*<value>\s*(?:<stringValue>)?)[^<]*/, '$1readonly');
}
// indent of the block's first line = whitespace immediately before it in the file
const before = xml.slice(0, m.index);
const indent = (before.match(/[ \t]*$/) || [''])[0];
xml = xml.slice(0, m.index) + block + '\n' + indent + clone.trim() + xml.slice(m.index + block.length);
fs.writeFileSync(outPath, xml);
console.log('inserted ' + dst + ' after ' + src + (layoutMode ? ' (layout)' : ' (flexipage)'));
