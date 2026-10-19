// T4 helper (sandbox bogdan only): insert M4 = CB_Target Matching at アプローチ, buyer SSE-T4 Buyer, deal SSE-T Deal D1.
// Needed because the CB_Target record type is not assigned to the System Administrator profile in bogdan,
// so `sf data create record` / the UI reject it ("Record Type ID: this ID value isn't valid for the user"); Apex DML does not check that.
Id targetRt = Schema.SObjectType.Matching__c.getRecordTypeInfosByDeveloperName().get('CB_Target').getRecordTypeId();
Matching__c m4 = new Matching__c(RecordTypeId = targetRt, phase_match__c = 'アプローチ', status__c = '-',
    Sell__c = [SELECT Id FROM Opportunity WHERE Name = 'SSE-T Deal D1'].Id,
    Buy_Company__c = [SELECT Id FROM Account WHERE Name = 'SSE-T4 Buyer'].Id);
insert m4;
m4 = [SELECT Name, RecordType.DeveloperName, phase_match__c, status__c, SellSideAutoTerminated__c, SellSideConflictWarned__c FROM Matching__c WHERE Id = :m4.Id];
System.debug('T4 M4 inserted: ' + m4.Name + ' rt=' + m4.RecordType.DeveloperName + ' phase=' + m4.phase_match__c + ' status=' + m4.status__c
    + ' SSAuto=' + m4.SellSideAutoTerminated__c + ' Warned=' + m4.SellSideConflictWarned__c);
