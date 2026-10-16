// Sandbox bogdan test data for the Sell-Side Conflict manual test plan (2026-10-16)
Id sellingRt  = Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('SellingOpp').getRecordTypeId();
Id sourcingRt = Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('CB_Sourcing_Path').getRecordTypeId();
Id matchRt    = Schema.SObjectType.Matching__c.getRecordTypeInfosByDeveloperName().get('MatchingMaster').getRecordTypeId();

// clean previous SSC-T* records
delete [SELECT Id FROM Matching__c WHERE Name LIKE 'SSC-T%' OR Buy_Company__r.Name LIKE 'SSC-T%'];
delete [SELECT Id FROM Opportunity WHERE Name LIKE 'SSC-T%'];
delete [SELECT Id FROM Account WHERE Name LIKE 'SSC-T%'];

Integer n = 100;
Account acc(String name, Id parentId) {
    n++;
    return new Account(Name = name, Website = 'None', CorporateNumber__c = '9990000000' + String.valueOf(n), ParentId = parentId);
}
Opportunity opp(String name, Id accId, String stage, Id rt) {
    return new Opportunity(Name = name, AccountId = accId, StageName = stage, CloseDate = Date.today().addMonths(6),
                           RecordTypeId = rt, Check_ActivitiesByStage__c = true);
}

// parents first
Account t1p = acc('SSC-T1 Parent', null);
Account t2p = acc('SSC-T2 Parent', null);
insert new List<Account>{ t1p, t2p };

Account t1s = acc('SSC-T1 Seller', t1p.Id);
Account t2a = acc('SSC-T2 Child A', t2p.Id);
Account t2b = acc('SSC-T2 Child B', t2p.Id);
Account t3s = acc('SSC-T3 Sourcing', null);
Account t3l = acc('SSC-T3 LongTerm', null);
Account t3h = acc('SSC-T3 OnHold', null);
Account t3c = acc('SSC-T3 Closed', null);
Account t4a = acc('SSC-T4 Seller A', null);
Account t4b = acc('SSC-T4 Seller B', null);
Account t5b = acc('SSC-T5 Buyer', null);
Account t6  = acc('SSC-T6 Stale', null);
insert new List<Account>{ t1s, t2a, t2b, t3s, t3l, t3h, t3c, t4a, t4b, t5b, t6 };

Opportunity o1 = opp('SSC-T1 Opp', t1s.Id, 'リード反響', sellingRt);
Opportunity o2 = opp('SSC-T2 Opp A', t2a.Id, '案件化', sellingRt);
Opportunity o3s = opp('SSC-T3 Sourcing Opp', t3s.Id, '成約', sourcingRt);
o3s.Confirm_BuyersBank_POC__c = true; o3s.Confirm_SellersBank_POC__c = true;
o3s.UpdateShareholderRegistry__c = true; o3s.VerifyWireTransferPayment__c = true;
Opportunity o3l = opp('SSC-T3 LongTerm Opp', t3l.Id, '長期フォロー', sellingRt);
Opportunity o3h = opp('SSC-T3 OnHold Opp', t3h.Id, 'On Hold', sellingRt);
o3h.OnHoldReason__c = 'テスト';
Opportunity o3c = opp('SSC-T3 Closed Opp', t3c.Id, '案件終了', sellingRt);
o3c.termination_reason__c = 'その他';
Opportunity o4 = opp('SSC-T4 Opp', t4a.Id, '資料作成', sellingRt);
insert new List<Opportunity>{ o1, o2, o3s, o3l, o3h, o3c, o4 };

// T5: a Matching on SSC-T2 Opp A whose buyer is SSC-T4 Seller A (an active seller elsewhere)
Matching__c m = new Matching__c(RecordTypeId = matchRt, Sell__c = o2.Id, Buy_Company__c = t4a.Id,
                                phase_match__c = 'アプローチ', status__c = '-');
insert m;

// T6: stale flag with no opportunity (simulates a leftover) — cleared only by the daily job
t6.SellSideConflict__c = true;
update t6;

System.debug('DONE T1 seller=' + t1s.Id + ' T2 parent=' + t2p.Id + ' T4 opp=' + o4.Id + ' matching=' + m.Id);
