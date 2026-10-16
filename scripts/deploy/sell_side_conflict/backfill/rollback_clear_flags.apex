// Rollback: switch SellSideConflict__c OFF on every account where it is ON.
// Run only AFTER the flow is deactivated and the scheduled job aborted, otherwise they switch it back ON.
// Before-state of this flag in prod = field did not exist (all false), so "clear all" IS the restore.
List<Account> onAccts = [SELECT Id FROM Account WHERE SellSideConflict__c = true LIMIT 10000];
for (Account a : onAccts) { a.SellSideConflict__c = false; }
Database.SaveResult[] res = Database.update(onAccts, false);
Integer ok = 0;
Integer ng = 0;
for (Integer i = 0; i < res.size(); i++) {
    if (res[i].isSuccess()) { ok++; }
    else { ng++; System.debug(LoggingLevel.ERROR, 'SellSideConflict rollback failed ' + onAccts[i].Id + ': ' + res[i].getErrors()); }
}
System.debug('SellSideConflict rollback: cleared=' + ok + ' failed=' + ng);
