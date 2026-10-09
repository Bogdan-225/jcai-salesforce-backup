// Test matrix: MOU/LOI -> DD for SellingOpp and XBorderType with every Teaser/LOI/MOU combination.
// Everything is rolled back at the end; nothing persists.
Savepoint sp = Database.setSavepoint();
try {
    Account acc = new Account(Name = 'PJ VR Matrix Test Account', Website = 'https://example.com');
    insert acc;

    Map<String, Id> rtIds = new Map<String, Id>();
    for (RecordType rt : [SELECT Id, DeveloperName FROM RecordType WHERE SobjectType = 'Opportunity' AND DeveloperName IN ('SellingOpp','XBorderType')]) {
        rtIds.put(rt.DeveloperName, rt.Id);
    }

    List<Opportunity> opps = new List<Opportunity>();
    List<String> labels = new List<String>();
    for (String rtName : new List<String>{'SellingOpp','XBorderType'}) {
        for (Boolean teaser : new List<Boolean>{false, true}) {
            for (Integer combo = 0; combo < 4; combo++) {
                Boolean loi = (combo == 1 || combo == 3);
                Boolean mou = (combo == 2 || combo == 3);
                Opportunity o = new Opportunity(
                    Name = 'PJ Matrix ' + rtName + ' T' + (teaser ? '1' : '0') + ' L' + (loi ? '1' : '0') + ' M' + (mou ? '1' : '0'),
                    AccountId = acc.Id,
                    RecordTypeId = rtIds.get(rtName),
                    StageName = 'MOU/LOI',
                    CloseDate = Date.today().addDays(90),
                    Check_DocUploaded_Teaser__c = teaser,
                    Check_DocUploaded_LOI__c = loi,
                    Check_DocUploaded_MOU__c = mou,
                    Check_MatchingStage__c = true,
                    Check_ActivitiesByStage__c = true
                );
                opps.add(o);
                labels.add(rtName + ' | Teaser=' + teaser + ' LOI=' + loi + ' MOU=' + mou + ' MatchingStage=true');
            }
        }
    }
    // Extra case: XBorderType, Teaser+LOI but buyer phase check unticked.
    opps.add(new Opportunity(
        Name = 'PJ Matrix XBorderType T1 L1 M0 MS0', AccountId = acc.Id, RecordTypeId = rtIds.get('XBorderType'),
        StageName = 'MOU/LOI', CloseDate = Date.today().addDays(90),
        Check_DocUploaded_Teaser__c = true, Check_DocUploaded_LOI__c = true, Check_DocUploaded_MOU__c = false,
        Check_MatchingStage__c = false, Check_ActivitiesByStage__c = true));
    labels.add('XBorderType | Teaser=true LOI=true MOU=false MatchingStage=false');

    List<Database.SaveResult> ins = Database.insert(opps, false);
    for (Integer i = 0; i < ins.size(); i++) {
        if (!ins[i].isSuccess()) {
            System.debug('INSERT FAIL ' + labels[i] + ' -> ' + ins[i].getErrors()[0].getMessage());
        }
    }

    // Re-assert the activity checkbox in case an after-save flow reset it on insert.
    List<Opportunity> inserted = new List<Opportunity>();
    for (Opportunity o : opps) if (o.Id != null) inserted.add(new Opportunity(Id = o.Id, Check_ActivitiesByStage__c = true));
    update inserted;

    List<Opportunity> toDD = new List<Opportunity>();
    List<String> ddLabels = new List<String>();
    for (Integer i = 0; i < opps.size(); i++) {
        if (opps[i].Id != null) { toDD.add(new Opportunity(Id = opps[i].Id, StageName = 'DD')); ddLabels.add(labels[i]); }
    }
    List<Database.SaveResult> res = Database.update(toDD, false);
    for (Integer i = 0; i < res.size(); i++) {
        String out = res[i].isSuccess() ? 'PASS' : 'BLOCK';
        String msgs = '';
        if (!res[i].isSuccess()) for (Database.Error e : res[i].getErrors()) msgs += ' [' + e.getMessage() + ']';
        System.debug('RESULT ' + out + ' | ' + ddLabels[i] + msgs);
    }
} finally {
    Database.rollback(sp);
    System.debug('ROLLED BACK');
}
