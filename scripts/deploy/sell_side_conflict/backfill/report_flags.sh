#!/usr/bin/env bash
org="$1"
echo "== ON total"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true"
echo "== ON by Account record type"; sf data query -o "$org" -q "SELECT RecordType.Name, COUNT(Id) FROM Account WHERE SellSideConflict__c = true GROUP BY RecordType.Name"
echo "== ON as seller (has own active opp)"; sf data query -o "$org" -q "SELECT COUNT_DISTINCT(AccountId) FROM Opportunity WHERE SellSideActive__c = true AND Account.SellSideConflict__c = true"
echo "== ON only as parent"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND Id NOT IN (SELECT AccountId FROM Opportunity WHERE SellSideActive__c = true)"
echo "== active opps by record type"; sf data query -o "$org" -q "SELECT RecordType.DeveloperName, COUNT(Id) FROM Opportunity WHERE SellSideActive__c = true GROUP BY RecordType.DeveloperName"
echo "== active opps by last modifier (automation check)"; sf data query -o "$org" -q "SELECT LastModifiedBy.Name, COUNT(Id) FROM Opportunity WHERE SellSideActive__c = true GROUP BY LastModifiedBy.Name ORDER BY COUNT(Id) DESC"
