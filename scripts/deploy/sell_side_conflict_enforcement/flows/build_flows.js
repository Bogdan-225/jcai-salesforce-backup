// flows/build_flows.js — generates the three seller-side flows from Sato's buyer-side flow XML.
// Usage: node build_flows.js   (reads scratch_dc/full/..., writes ./out/flows/)
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '../../../../scratch_dc/full/unpackaged/unpackaged/flows');
const OUT = path.resolve(__dirname, 'out/flows');
fs.mkdirSync(OUT, { recursive: true });

function removeBlock(xml, tag, mustContain) {
  // remove the single <tag>...</tag> block (non-nested) that contains mustContain; throw if not exactly one
  const re = new RegExp('\\n?[ \\t]*<' + tag + '>[\\s\\S]*?</' + tag + '>', 'g');
  let hits = 0;
  const out = xml.replace(re, m => (m.includes(mustContain) ? (hits++, '') : m));
  if (hits !== 1) throw new Error('expected exactly 1 ' + tag + ' block containing ' + mustContain + ' to remove, got ' + hits);
  return out;
}
function replaceBlock(xml, tag, mustContain, replacement) {
  const re = new RegExp('[ \\t]*<' + tag + '>[\\s\\S]*?</' + tag + '>', 'g');
  let hits = 0;
  const out = xml.replace(re, m => (m.includes(mustContain) ? (hits++, replacement) : m));
  if (hits !== 1) throw new Error('expected exactly 1 ' + tag + ' block containing ' + mustContain + ', got ' + hits);
  return out;
}
function must1(xml, needle) { const n = xml.split(needle).length - 1; if (n !== 1) throw new Error('expected exactly 1 of ' + needle + ', got ' + n); }
function replaceN(xml, re, repl, expected, what) {
  const n = (xml.match(re) || []).length;
  if (n !== expected) throw new Error('expected ' + expected + ' ' + what + ', got ' + n);
  return xml.replace(re, repl);
}

// replace the whole <text> of the textTemplate named `name`; throw unless exactly one such template exists
function replaceTemplate(xml, name, text) {
  const re = new RegExp('(<textTemplates>\\s*<name>' + name + '</name>[\\s\\S]*?<text>)[\\s\\S]*?(</text>)', 'g');
  return replaceN(xml, re, (m, a, b) => a + text + b, 1, 'textTemplate ' + name);
}
// seller-side memo bodies (same layout as the source: reference line, English line, Japanese line)
const OPP_REF = '{!Get_SourceOpp.Name}: {!Get_SourceOpp.Id}';
const TERM_BODY = OPP_REF
  + '\nThis buyer is currently a seller in another active project ({!Get_SourceOpp.Name}); buyer-side approach stopped automatically.'
  + '\nこの買い手は売り手として別案件で進行中（{!Get_SourceOpp.Name}）のため、買い手としての案内を自動停止しました。';
const SURVIVOR_BODY = OPP_REF
  + '\nThis buyer is currently a seller in another active project ({!Get_SourceOpp.Name}). Do not send buyer-side proposals.'
  + '\nこの買い手は売り手として別案件で進行中（{!Get_SourceOpp.Name}）です。買い手としての案内は送らないでください。';
const clearedBody = (nameRef, idRef) => '{!' + nameRef + '}: {!' + idRef + '}'
  + "\nThe buyer's own sell-side project is no longer active; seller conflict cleared ({!" + nameRef + '}).'
  + '\n売り手としての案件が終了したため、売り手重複が解消されました（{!' + nameRef + '}）。';

// Opportunity lookup replacing Sato's "Get_ConflictSrc" (source Matching). keyRef = $Record.Id (Account flows) or $Record.Buy_Company__c (Matching flow)
const sourceOpp = (keyRef, next) => `    <recordLookups>
        <name>Get_SourceOpp</name>
        <label>Get Source Opportunity (seller's active deal)</label>
        <locationX>176</locationX>
        <locationY>134</locationY>
        <assignNullValuesIfNoRecordsFound>false</assignNullValuesIfNoRecordsFound>
        <connector>
            <targetReference>${next}</targetReference>
        </connector>
        <filterLogic>1 AND (2 OR 3)</filterLogic>
        <filters>
            <field>SellSideActive__c</field>
            <operator>EqualTo</operator>
            <value>
                <booleanValue>true</booleanValue>
            </value>
        </filters>
        <filters>
            <field>AccountId</field>
            <operator>EqualTo</operator>
            <value>
                <elementReference>${keyRef}</elementReference>
            </value>
        </filters>
        <filters>
            <field>SellSideSellerParentId__c</field>
            <operator>EqualTo</operator>
            <value>
                <elementReference>${keyRef}</elementReference>
            </value>
        </filters>
        <getFirstRecordOnly>true</getFirstRecordOnly>
        <object>Opportunity</object>
        <queriedFields>Id</queriedFields>
        <queriedFields>Name</queriedFields>
        <sortField>SellSideBaseDate__c</sortField>
        <sortOrder>Desc</sortOrder>
        <storeOutputAutomatically>true</storeOutputAutomatically>
    </recordLookups>`;

const common = xml => xml
  // flag + marker fields (Account ConflictSourceId/Name and Matching ConflictSourceName share the SellSide* names on purpose)
  .replace(/\$Record\.DealConflict__c/g, '$Record.SellSideConflict__c')
  .replace(/Buy_Company__r\.DealConflict__c/g, 'Buy_Company__r.SellSideConflict__c')
  .replace(/\bAutoTerminated__c\b/g, 'SellSideAutoTerminated__c')
  .replace(/\bDealConflictWarned__c\b/g, 'SellSideConflictWarned__c')
  .replace(/\bConflictSourceName__c\b/g, 'SellSideConflictSourceName__c')
  .replace(/\bConflictSourceId__c\b/g, 'SellSideConflictSourceId__c')
  // source references: Sato's Get_ConflictSrc.DealName__c / formula ConflictSrcId -> our lookup
  .replace(/\{!Get_ConflictSrc\.DealName__c\}/g, '{!Get_SourceOpp.Name}')
  .replace(/<elementReference>Get_ConflictSrc\.DealName__c<\/elementReference>/g, '<elementReference>Get_SourceOpp.Name</elementReference>')
  .replace(/<targetReference>Get_ConflictSrc<\/targetReference>/g, '<targetReference>Get_SourceOpp</targetReference>')
  .replace(/\{!ConflictSrcId\}/g, '{!Get_SourceOpp.Id}')
  .replace(/<elementReference>ConflictSrcId<\/elementReference>/g, '<elementReference>Get_SourceOpp.Id</elementReference>')
  // texts
  .replace(/他案件進行中のため/g, '売り手として進行中のため')
  .replace(/Deal Conflict Cleared: /g, 'Seller Conflict Cleared: ')
  .replace(/Deal Conflict: /g, 'Seller Conflict: ')
  // element labels "(Deal Conflict)" / "(Deal Conflict Cleared)"
  .replace(/(<label>[^<]*)\(Deal Conflict( Cleared)?\)/g, '$1(Seller Conflict$2)')
  // ship inactive
  .replace(/<status>Active<\/status>/, '<status>Draft</status>');

function buildA() {
  let x = fs.readFileSync(path.join(SRC, 'DealConflict_AutoTerminate.flow'), 'utf8');
  must1(x, '<name>Get_ConflictSrc</name>'); must1(x, '<name>ConflictSrcId</name>'); must1(x, '<name>Create_Account_Event</name>');
  x = replaceBlock(x, 'recordLookups', '<name>Get_ConflictSrc</name>', sourceOpp('$Record.Id', 'Create_Account_Event'));
  x = removeBlock(x, 'formulas', '<name>ConflictSrcId</name>');
  // survivors: drop the "not the source Matching" filter (seller source is an Opportunity), add "not yet warned"
  const srcFilter = /[ \t]*<filters>\s*<field>Is_DealConflictSource__c<\/field>\s*<operator>EqualTo<\/operator>\s*<value>\s*<booleanValue>false<\/booleanValue>\s*<\/value>\s*<\/filters>\n?/g;
  x = replaceN(x, srcFilter, `        <filters>
            <field>SellSideConflictWarned__c</field>
            <operator>EqualTo</operator>
            <value>
                <booleanValue>false</booleanValue>
            </value>
        </filters>
`, 2, 'Is_DealConflictSource__c filters');
  x = common(x);
  x = replaceTemplate(x, 'AcctTermDesc', TERM_BODY);
  x = replaceTemplate(x, 'TermDesc', TERM_BODY);
  x = replaceTemplate(x, 'SurvivorDesc', SURVIVOR_BODY);
  x = replaceN(x, /<label>Get Survivor Matchings \(non-source, active\)<\/label>/g, '<label>Get Survivor Matchings (active, not yet warned)</label>', 1, 'survivor lookup label');
  x = replaceN(x, /<label>DealConflict AutoTerminate<\/label>/g, '<label>SellSideConflict AutoTerminate</label>', 1, 'flow label');
  x = replaceN(x, /<interviewLabel>DealConflict AutoTerminate /g, '<interviewLabel>SellSideConflict AutoTerminate ', 1, 'interviewLabel');
  x = replaceN(x, /<description>[\s\S]*?<\/description>/g, '<description>買い手(譲受希望会社)が進行中売り手(Account.SellSideConflict__c)になった時、その買い手の生きている「アプローチ」マッチングを自動終了(マッチ終了/アプローチ&gt;終了/リスト除外/売り手として進行中のため)し、それ以外の生きているマッチングには警告メモを作成する。Sato作 DealConflict_AutoTerminate のミラー(2026-10-19)。</description>', 1, 'description');
  fs.writeFileSync(path.join(OUT, 'SellSideConflict_AutoTerminate.flow-meta.xml'), x);
}
function buildB() {
  let x = fs.readFileSync(path.join(SRC, 'DealConflict_AutoReactivate.flow'), 'utf8');
  x = common(x);
  x = replaceTemplate(x, 'AcctReactDesc', clearedBody('$Record.SellSideConflictSourceName__c', '$Record.SellSideConflictSourceId__c'));
  x = replaceTemplate(x, 'ReactDesc', clearedBody('ConflictSrcNameSaved', 'ConflictSrcIdSaved'));
  x = replaceN(x, /<label>DealConflict AutoReactivate<\/label>/g, '<label>SellSideConflict AutoReactivate</label>', 1, 'flow label');
  x = replaceN(x, /<interviewLabel>DealConflict AutoReactivate /g, '<interviewLabel>SellSideConflict AutoReactivate ', 1, 'interviewLabel');
  x = replaceN(x, /<description>[\s\S]*?<\/description>/g, '<description>買い手の進行中売り手フラグ(Account.SellSideConflict__c)がtrue→falseになった時、売り手重複で自動終了したマッチング(SellSideAutoTerminated__c)を MG対応/未確認 に戻し、警告済みマッチングに解消メモを作成する。Sato作 DealConflict_AutoReactivate のミラー(2026-10-19)。</description>', 1, 'description');
  fs.writeFileSync(path.join(OUT, 'SellSideConflict_AutoReactivate.flow-meta.xml'), x);
}
function buildC() {
  let x = fs.readFileSync(path.join(SRC, 'Matching_AfterSave_TerminateNewOnConflict.flow'), 'utf8');
  must1(x, '<name>Get_ConflictSrc</name>'); must1(x, '<name>Terminate_Self</name>');
  x = replaceBlock(x, 'recordLookups', '<name>Get_ConflictSrc</name>', sourceOpp('$Record.Buy_Company__c', 'Terminate_Self'));
  x = removeBlock(x, 'formulas', '<name>ConflictSrcId</name>');
  x = common(x);
  x = replaceTemplate(x, 'TermDesc', TERM_BODY);
  x = replaceN(x, /<label>Matching AfterSave Terminate New On Conflict<\/label>/g, '<label>Matching AfterSave Terminate New On SellSideConflict</label>', 1, 'flow label');
  x = replaceN(x, /<interviewLabel>Matching AfterSave Terminate New On Conflict /g, '<interviewLabel>Matching AfterSave Terminate New On SellSideConflict ', 1, 'interviewLabel');
  x = replaceN(x, /<description>[\s\S]*?<\/description>/g, '<description>新規マッチングがアプローチ段階で、買い手が既に進行中売り手(Account.SellSideConflict__c)の時、そのマッチングを自動終了する。Sato作 Matching_AfterSave_TerminateNewOnConflict のミラー(2026-10-19)。</description>', 1, 'description');
  fs.writeFileSync(path.join(OUT, 'Matching_AfterSave_TerminateNewOnSellSideConflict.flow-meta.xml'), x);
}
buildA(); buildB(); buildC();
console.log('written to ' + OUT);
