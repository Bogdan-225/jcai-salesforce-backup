Savepoint sp = Database.setSavepoint();
List<String> out = new List<String>();
Account seller = new Account(Name='VRTEST Seller', Website='None'); Account other = new Account(Name='VRTEST Other', Website='None'); Account third = new Account(Name='VRTEST Third', Website='None');
insert new List<Account>{seller, other, third};
Opportunity opp = new Opportunity(Name='VRTEST Opp', AccountId=seller.Id, StageName='面談前', CloseDate=Date.today().addDays(30), RecordTypeId='0125h00000014nfAAA');
insert opp;
Project__c prj = new Project__c(Name='VRTEST Project', Account__c=seller.Id, StageName__c='IS戻し');
Database.SaveResult prjRes = Database.insert(prj, false);
out.add('project insert ok=' + prjRes.isSuccess() + (prjRes.isSuccess() ? '' : ' ' + prjRes.getErrors()[0].getMessage()));
Map<String,Id> rt = new Map<String,Id>();
for (RecordType r : [SELECT Id, DeveloperName FROM RecordType WHERE SobjectType='Matching__c' AND IsActive=true]) rt.put(r.DeveloperName, r.Id);
String[] rts = new String[]{'MatchingMaster','XBorderType','Matching_Out_Out'};
// A: seller as buyer -> must FAIL ; B: other as buyer -> must SUCCEED
for (String d : rts) {
    Matching__c a = new Matching__c(RecordTypeId=rt.get(d), Sell__c=opp.Id, Buy_Company__c=seller.Id, phase_match__c='アプローチ', status__c='-');
    Database.SaveResult ra = Database.insert(a, false);
    out.add('A ' + d + ' seller-as-buyer blocked=' + !ra.isSuccess() + ' msg=' + (ra.isSuccess() ? '-' : ra.getErrors()[0].getMessage() + ' fields=' + ra.getErrors()[0].getFields()));
    Matching__c b = new Matching__c(RecordTypeId=rt.get(d), Sell__c=opp.Id, Buy_Company__c=other.Id, phase_match__c='アプローチ', status__c='-');
    Database.SaveResult rb = Database.insert(b, false);
    out.add('B ' + d + ' other-buyer saved=' + rb.isSuccess() + (rb.isSuccess() ? '' : ' msg=' + rb.getErrors()[0].getMessage()));
}
// C: new-style project path
if (prjRes.isSuccess()) {
    Matching__c c = new Matching__c(RecordTypeId=rt.get('MatchingMaster'), Sell_New__c=prj.Id, Buy_Company__c=seller.Id, phase_match__c='アプローチ', status__c='-');
    Database.SaveResult rc = Database.insert(c, false);
    out.add('C Sell_New__c seller-as-buyer blocked=' + !rc.isSuccess());
}
// D: no project at all, buyer set -> must succeed (nothing to compare)
Matching__c d0 = new Matching__c(RecordTypeId=rt.get('XBorderType'), Buy_Company__c=seller.Id, phase_match__c='アプローチ', status__c='-');
Database.SaveResult rd = Database.insert(d0, false);
out.add('D no-project saved=' + rd.isSuccess() + (rd.isSuccess() ? '' : ' msg=' + rd.getErrors()[0].getMessage()));
// E: existing offending record (made offending by changing the Opp account afterwards) must stay editable
Matching__c e = new Matching__c(RecordTypeId=rt.get('MatchingMaster'), Sell__c=opp.Id, Buy_Company__c=other.Id, phase_match__c='アプローチ', status__c='-');
insert e;
opp.AccountId = other.Id; update opp;   // now e.Buy_Company__c == Sell__r.AccountId
e.other_termination_reason__c = 'VRTEST edit';
Database.SaveResult re1 = Database.update(e, false);
out.add('E1 existing offender, edit other field saved=' + re1.isSuccess() + (re1.isSuccess() ? '' : ' msg=' + re1.getErrors()[0].getMessage()));
e.Buy_Company__c = third.Id;
Database.SaveResult re2 = Database.update(e, false);
out.add('E2 change buyer to a valid one saved=' + re2.isSuccess() + (re2.isSuccess() ? '' : ' msg=' + re2.getErrors()[0].getMessage()));
e.Buy_Company__c = other.Id;
Database.SaveResult re3 = Database.update(e, false);
out.add('E3 change buyer back to seller blocked=' + !re3.isSuccess());
// F: change Project to one whose account is the current buyer -> blocked
Opportunity opp2 = new Opportunity(Name='VRTEST Opp2', AccountId=third.Id, StageName='面談前', CloseDate=Date.today().addDays(30), RecordTypeId='0125h00000014nfAAA');
insert opp2;
e.Buy_Company__c = third.Id; e.Sell__c = opp2.Id;  // buyer is third, opp2 account is third (reset buyer: failed E3 left 'other' in memory)
Database.SaveResult rf = Database.update(e, false);
out.add('F change project to buyer-owned one blocked=' + !rf.isSuccess());
for (String s : out) System.debug('RESULT ' + s);
Database.rollback(sp);
System.debug('RESULT rolled back');
