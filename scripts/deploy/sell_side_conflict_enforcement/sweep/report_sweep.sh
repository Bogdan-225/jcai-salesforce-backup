#!/usr/bin/env bash
# usage: report_sweep.sh <org>
# Counts only. The last query uses stage filters instead of Deal_Is_Dead__c because the prod admin cannot read that field.
set -euo pipefail
org=$1
echo "== terminated by seller sweep"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideAutoTerminated__c = true"
echo "== warned (live)";              sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideConflictWarned__c = true AND SellSideAutoTerminated__c = false"
echo "== flagged accounts with source stored"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c != null"
echo "== flagged accounts without source (post-sweep: stale flag or no source opp; expect 0)"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null"
echo "== memo events today";          sf data query -o "$org" -q "SELECT COUNT(Id) FROM Event WHERE Subject LIKE 'Seller Conflict: %' AND CreatedDate = TODAY"
echo "== live アプローチ matchings whose buyer is still a flagged seller (expect 0 after sweep, excluding Target/dead)"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideConflict_M__c = true AND phase_match__c = 'アプローチ' AND RecordType.DeveloperName != 'CB_Target' AND (NOT Sell__r.StageName IN ('成約','案件終了','On Hold','Converted to Buyer')) AND (NOT Sell_New__r.StageName__c IN ('成約','案件終了','On Hold','Converted to Buyer'))"
