// Rollback of the sell-side sweep: null both Account source fields everywhere (about 339 rows, one transaction).
// Run only with flows A, B, C inactive. Rerun until "remaining 0".
List<Account> accs = [SELECT Id FROM Account
                      WHERE SellSideConflictSourceId__c != null OR SellSideConflictSourceName__c != null
                      LIMIT 2000];
for (Account a : accs) {
    a.SellSideConflictSourceId__c = null;
    a.SellSideConflictSourceName__c = null;
}
update accs;
Integer remaining = [SELECT COUNT() FROM Account
                     WHERE SellSideConflictSourceId__c != null OR SellSideConflictSourceName__c != null];
System.debug('cleared ' + accs.size() + ', remaining ' + remaining);
