// Sandbox bogdan test data for the Sell-Side Conflict ENFORCEMENT manual test plan (2026-10-19). Re-runnable.
// NEVER run against prod. Running user needs perm set DealConflict_Access (AutoTerminated__c on M7).
// Matching__c.Name is an auto-number in this org: Matchings are identified by Buy_Company__r.Name + Sell__r.Name.
Id sellingRt = Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('SellingOpp').getRecordTypeId();
Id matchRt   = Schema.SObjectType.Matching__c.getRecordTypeInfosByDeveloperName().get('MatchingMaster').getRecordTypeId();

// ---- clean previous SSE-T* records (Tasks/Events on test Matchings, Opps and Accounts first) ----
Set<Id> oldMatchings = new Map<Id, Matching__c>([SELECT Id FROM Matching__c WHERE Buy_Company__r.Name LIKE 'SSE-T%' OR Sell__r.Name LIKE 'SSE-T%']).keySet();
delete [SELECT Id FROM Task  WHERE WhatId IN :oldMatchings OR What.Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Event WHERE WhatId IN :oldMatchings OR What.Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Matching__c WHERE Id IN :oldMatchings];
delete [SELECT Id FROM Opportunity WHERE Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Account WHERE Name LIKE 'SSE-T%' AND ParentId != null];
delete [SELECT Id FROM Account WHERE Name LIKE 'SSE-T%'];

Integer n = 200;
Account acc(String name, Id parentId) { n++; return new Account(Name = name, Website = 'None', CorporateNumber__c = '9980000000' + String.valueOf(n), ParentId = parentId); }
Opportunity opp(String name, Id accId, String stage) {
    Opportunity o = new Opportunity(Name = name, AccountId = accId, StageName = stage, CloseDate = Date.today().addMonths(6), RecordTypeId = sellingRt, Check_ActivitiesByStage__c = true,
                                    Check_DocUploaded_Teaser__c = true,  // VR Required_Teaser_MatchingStage blocks later stage moves (NDA締結, トップ面談) without it
                                    Check_DocUploaded_IM__c = true);     // VR Required_IM blocks the move to トップ面談 (T5) without it
    if (stage == '案件終了') o.termination_reason__c = 'その他';
    return o;
}
// status__c '-' satisfies the Status_required validation rule on Matching__c
Matching__c mt(Id oppId, Id buyerId, String phase, Id rt) { return new Matching__c(RecordTypeId = rt, Sell__c = oppId, Buy_Company__c = buyerId, phase_match__c = phase, status__c = '-'); }

// sellers of the "other" deals (live and dead) - these must NOT be flagged, so their opps stay at リード反響 or 案件終了
Account sD1 = acc('SSE-T Seller D1', null), sD2 = acc('SSE-T Seller D2', null), sDead = acc('SSE-T Seller Dead', null);
// buyers under test
Account b1 = acc('SSE-T1 Buyer', null), b3 = acc('SSE-T3 Buyer', null), b4 = acc('SSE-T4 Buyer', null), b6 = acc('SSE-T6 Buyer', null);
Account p5 = acc('SSE-T5 Parent', null);
insert new List<Account>{ sD1, sD2, sDead, b1, b3, b4, b6, p5 };
Account c5 = acc('SSE-T5 Child', p5.Id);
insert c5;

Opportunity d1 = opp('SSE-T Deal D1', sD1.Id, 'リード反響');   // live deal (Deal_Is_Dead__c false: not 成約/案件終了/On Hold/Converted to Buyer)
Opportunity d2 = opp('SSE-T Deal D2', sD2.Id, 'リード反響');
Opportunity dDead = opp('SSE-T Deal Dead', sDead.Id, '案件終了');
Opportunity o1 = opp('SSE-T1 Own Opp', b1.Id, 'リード反響');   // flag OFF until the tester moves it to NDA締結
Opportunity o3 = opp('SSE-T3 Own Opp', b3.Id, '面談前');        // flag ON at insert
Opportunity o4 = opp('SSE-T4 Own Opp', b4.Id, '面談前');        // flag ON at insert
Opportunity o6 = opp('SSE-T6 Own Opp', b6.Id, 'リード反響');   // flag OFF until the tester moves it
Opportunity o5 = opp('SSE-T5 Child Opp', c5.Id, 'リード反響'); // flag OFF until the tester moves it to トップ面談
insert new List<Opportunity>{ d1, d2, dDead, o1, o3, o4, o6, o5 };

Matching__c m1 = mt(d1.Id, b1.Id, 'アプローチ', matchRt);  // "SSE-T1 M1"
Matching__c m2 = mt(d2.Id, b1.Id, 'MG対応', matchRt);      // "SSE-T1 M2"
Matching__c m6 = mt(d1.Id, p5.Id, 'アプローチ', matchRt);  // "SSE-T5 M6"
Matching__c m7 = mt(d1.Id, b6.Id, 'アプローチ', matchRt);  // "SSE-T6 M7"
insert new List<Matching__c>{ m1, m2, m6, m7 };
// T6: pretend M7 was auto-terminated by the BUYER mechanism
m7.phase_match__c = 'マッチ終了'; m7.status__c = 'アプローチ>終了'; m7.termination_reason__c = 'リスト除外'; m7.other_termination_reason__c = '他案件進行中のため'; m7.AutoTerminated__c = true;
update m7;
System.debug('SSE test data ready. Flags ON now: ' + [SELECT COUNT() FROM Account WHERE Name LIKE 'SSE-T%' AND SellSideConflict__c = true] + ' (expect 2: T3, T4 buyers)'
    + ' | M1=' + m1.Id + ' M2=' + m2.Id + ' M6=' + m6.Id + ' M7=' + m7.Id + ' D1=' + d1.Id + ' Dead=' + dDead.Id + ' B3=' + b3.Id + ' B4=' + b4.Id);
