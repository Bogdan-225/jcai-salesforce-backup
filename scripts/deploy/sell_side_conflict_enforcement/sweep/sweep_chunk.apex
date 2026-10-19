// Flips SellSideConflict__c off then on for up to 25 flagged accounts that have no stored source yet,
// so SellSideConflict_AutoTerminate runs for them. Run with SellSideConflict_AutoReactivate DEACTIVATED
// (Apex cannot read FlowDefinition; run_sweep.sh checks that B is inactive before it calls this file).
// Accounts whose flow run finds no source opp keep a blank name and would be re-selected: the WHERE excludes
// accounts touched in the last 2 minutes via LastModifiedDate, so each run moves forward. Rerun until remaining = 0.
List<Account> chunk = [SELECT Id FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null
                       AND LastModifiedDate < :Datetime.now().addMinutes(-2) ORDER BY Id LIMIT 25];
for (Account a : chunk) a.SellSideConflict__c = false;
update chunk;                                   // no flow reacts: B is deactivated, Sato's flows key on DealConflict__c
for (Account a : chunk) a.SellSideConflict__c = true;
update chunk;                                   // A fires once per account
Integer remaining = [SELECT COUNT() FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null
                     AND LastModifiedDate < :Datetime.now().addMinutes(-2)];
System.debug('swept ' + chunk.size() + ', remaining: ' + remaining);
