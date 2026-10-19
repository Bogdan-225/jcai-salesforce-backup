// flows/check_flows.js — asserts the generated flows against the spec. Exit 1 on any failure.
const fs = require('fs');
const dir = __dirname + '/out/flows/';
const must = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); };
const read = f => fs.readFileSync(dir + f, 'utf8');

const A = read('SellSideConflict_AutoTerminate.flow-meta.xml');
const B = read('SellSideConflict_AutoReactivate.flow-meta.xml');
const C = read('Matching_AfterSave_TerminateNewOnSellSideConflict.flow-meta.xml');

// literal buyer-side tokens that must not survive anywhere in a generated flow
const LEFTOVER = ['DealConflict__c', '<field>AutoTerminated__c</field>', '.AutoTerminated__c', 'DealConflictWarned__c',
  'Is_DealConflictSource__c', 'Deal_Is_TopStage__c', 'DealName__c', 'Get_ConflictSrc', '他案件進行中のため', 'Deal Conflict'];
// ConflictSrcId (Sato's source-Matching formula) must be gone; B's own local variable ConflictSrcIdSaved is legitimate
const leftoverFormula = s => /ConflictSrcId(?!Saved)/.test(s);

for (const [n, s] of [['A', A], ['B', B], ['C', C]]) {
  must((s.match(/<status>Draft<\/status>/g) || []).length === 1 && !s.includes('<status>Active</status>'), n + ' ships Draft');
  const hits = LEFTOVER.filter(t => s.includes(t));
  must(hits.length === 0, n + ' has no leftover buyer-side tokens' + (hits.length ? ' (found: ' + hits.join(', ') + ')' : ''));
  must(!leftoverFormula(s), n + ' has no leftover ConflictSrcId formula references');
  must(!/\$Record\.ConflictSource/.test(s), n + ' has no $Record.ConflictSource* references');
  must(s.includes('SellSideConflict__c') && s.includes('SellSideConflictSourceName__c'), n + ' references SellSide* names');
  must(!s.includes('<name>ConflictSourceId__c</name>') && !/<field>ConflictSource(Id|Name)__c<\/field>/.test(s) && !/[.>]ConflictSource(Id|Name)__c/.test(s), n + ' uses only SellSide* source fields');
}
must(A.includes('ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = TRUE'), 'A entry formula');
must(B.includes('ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = FALSE'), 'B entry formula');
must(C.includes('{!$Record.Buy_Company__r.SellSideConflict__c} = TRUE'), 'C entry formula');
must((A.match(/<name>Get_SourceOpp<\/name>/g) || []).length === 1 && A.includes('<object>Opportunity</object>') && A.includes('<field>SellSideSellerParentId__c</field>'), 'A source lookup is the Opportunity lookup');
must((C.match(/<name>Get_SourceOpp<\/name>/g) || []).length === 1 && C.includes('<object>Opportunity</object>') && C.includes('<field>SellSideSellerParentId__c</field>'), 'C source lookup is the Opportunity lookup');
must(A.includes('<targetReference>Get_SourceOpp</targetReference>') && C.includes('<targetReference>Get_SourceOpp</targetReference>'), 'A and C start on Get_SourceOpp');
must(A.includes('<elementReference>$Record.Id</elementReference>') && C.includes('<elementReference>$Record.Buy_Company__c</elementReference>'), 'lookup keys');
must(A.includes('売り手として進行中のため') && C.includes('売り手として進行中のため'), 'termination text');
must(A.includes('Seller Conflict: ') && B.includes('Seller Conflict Cleared: ') && C.includes('Seller Conflict: '), 'memo subjects');
must(A.includes('<field>SellSideConflictWarned__c</field>') && (A.match(/SellSideConflictWarned__c/g) || []).length >= 4, 'A survivors keyed on SellSideConflictWarned__c');
must(!A.includes('Is_DealConflictSource__c'), 'A survivors no longer exclude a source Matching');
must(B.includes('<field>SellSideAutoTerminated__c</field>'), 'B revives on SellSideAutoTerminated__c');
must(A.includes('<label>SellSideConflict AutoTerminate</label>') && B.includes('<label>SellSideConflict AutoReactivate</label>') && C.includes('<label>Matching AfterSave Terminate New On SellSideConflict</label>'), 'labels');
// the Account-side field names collide with the Matching-side ones on purpose (same API name on both objects)
must(A.includes('<field>SellSideConflictSourceId__c</field>') && B.includes('$Record.SellSideConflictSourceId__c') && B.includes('$Record.SellSideConflictSourceName__c'), 'Account source fields');
