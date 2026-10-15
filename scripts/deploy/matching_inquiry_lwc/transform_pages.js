// Replace the "Inquiry Message" tab content of a Matching__c FlexiPage with the matchingInquiryMessage LWC.
// Usage: node transform_pages.js <in.flexipage-meta.xml> <out.flexipage-meta.xml>
// Works on any revision of Matching_Advisor / Matching_Advisor_M_CB / Matching_IS_Buy: it locates the tab
// whose title is {!$Label.Tab_Inquiry_Message}, drops every facet reachable from its body, and puts the
// component in its place. Section titles are taken from the removed fieldSections so labels stay identical.
const fs = require('fs');
const [inFile, outFile] = process.argv.slice(2);
let xml = fs.readFileSync(inFile, 'utf8');

const regionRe = /    <flexiPageRegions>\n([\s\S]*?)\n    <\/flexiPageRegions>\n/g;
const regions = [];
let m;
while ((m = regionRe.exec(xml)) !== null) {
    const body = m[1];
    const name = (body.match(/\n        <name>([^<]+)<\/name>\n        <type>Facet<\/type>/) || [])[1];
    regions.push({ full: m[0], body, name, start: m.index, end: m.index + m[0].length });
}
const byName = Object.fromEntries(regions.filter(r => r.name).map(r => [r.name, r]));

// 1. find the tab
const tabRe = /<componentInstance>\n\s*<componentInstanceProperties>\n\s*<name>active<\/name>\n\s*<value>[a-z]+<\/value>\n\s*<\/componentInstanceProperties>\n\s*<componentInstanceProperties>\n\s*<name>body<\/name>\n\s*<value>([^<]+)<\/value>\n\s*<\/componentInstanceProperties>\n\s*<componentInstanceProperties>\n\s*<name>title<\/name>\n\s*<value>\{!\$Label\.Tab_Inquiry_Message\}<\/value>/;
const tab = xml.match(tabRe);
if (!tab) throw new Error('Inquiry Message tab not found');
const bodyName = tab[1];
if (!byName[bodyName]) throw new Error('tab body facet not found: ' + bodyName);

// 2. collect facets reachable from the tab body
const reachable = new Set();
const visit = (name) => {
    if (!byName[name] || reachable.has(name)) return;
    reachable.add(name);
    const refs = [...byName[name].body.matchAll(/<value>(Facet-[^<]+)<\/value>/g)].map(x => x[1]);
    refs.forEach(visit);
};
visit(bodyName);

// 3. section titles (keep the page's own wording)
const titles = [...byName[bodyName].body.matchAll(/<name>label<\/name>\n\s*<value>([^<]+)<\/value>/g)].map(x => x[1]);
const jaTitle = titles[0] || '問い合わせ項目(日本語)';
const enTitle = titles[1] || '問い合わせ項目(English)';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const newBody = `    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>enTitle</name>
                    <value>${esc(enTitle)}</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>jaTitle</name>
                    <value>${esc(jaTitle)}</value>
                </componentInstanceProperties>
                <componentName>matchingInquiryMessage</componentName>
                <identifier>matchingInquiryMessage</identifier>
            </componentInstance>
        </itemInstances>
        <name>${bodyName}</name>
        <type>Facet</type>
    </flexiPageRegions>
`;

// 4. rebuild: drop reachable facets, insert the new body where the old one was
let out = '';
let cursor = 0;
let inserted = false;
for (const r of regions) {
    out += xml.slice(cursor, r.start);
    if (r.name === bodyName) { out += newBody; inserted = true; }
    else if (r.name && reachable.has(r.name)) { /* drop */ }
    else out += r.full;
    cursor = r.end;
}
out += xml.slice(cursor);
if (!inserted) throw new Error('body not replaced');

// 5. drop the cosmetic "label" property on flexipage:tabset: some orgs reject it on deploy
//    ("Invalid null property [label] in component [flexipage:tabset]").
const tabsetLabelRe = /\s*<componentInstanceProperties>\n\s*<name>label<\/name>\n\s*<value>[^<]*<\/value>\n\s*<\/componentInstanceProperties>(?=\n\s*<componentInstanceProperties>\n\s*<name>tabs<\/name>\n\s*<value>[^<]+<\/value>\n\s*<\/componentInstanceProperties>\n\s*<componentName>flexipage:tabset<\/componentName>)/g;
const tabsetLabels = (out.match(tabsetLabelRe) || []).length;
out = out.replace(tabsetLabelRe, '');

const removedFieldItems = (xml.match(/Record\.Sell__r\.Inquiry_/g) || []).length;
const leftFieldItems = (out.match(/Record\.Sell__r\.Inquiry_/g) || []).length;
fs.writeFileSync(outFile, out, 'utf8');
console.log(`${inFile}\n  tab body=${bodyName} facets removed=${reachable.size - 1} inquiry field items ${removedFieldItems} -> ${leftFieldItems} tabset labels stripped=${tabsetLabels}\n  jaTitle="${jaTitle}" enTitle="${enTitle}"`);
