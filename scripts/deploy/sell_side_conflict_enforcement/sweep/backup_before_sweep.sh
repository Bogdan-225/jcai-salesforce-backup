#!/usr/bin/env bash
# usage: backup_before_sweep.sh <org> <outdir>   -> <outdir>/matchings_before.csv, <outdir>/accounts_flagged.csv
# matchings_before.csv holds deal names (SellSideConflictSourceName__c) and free text (other_termination_reason__c):
# it MUST stay local. <outdir> must be git-ignored (.gitignore: sweep/partial_before*/, sweep/prod_before/); never commit or share it.
set -euo pipefail
org=$1; out=$2; mkdir -p "$out"
sf data query -o "$org" -r csv -q "SELECT Id, phase_match__c, status__c, termination_reason__c, other_termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c, RecordType.DeveloperName, Sell__r.StageName, Sell_New__r.StageName__c FROM Matching__c WHERE SellSideConflict_M__c = true AND phase_match__c != 'マッチ終了'" > "$out/matchings_before.csv"
sf data query -o "$org" -r csv -q "SELECT Id FROM Account WHERE SellSideConflict__c = true" > "$out/accounts_flagged.csv"
echo "matchings: $(($(wc -l < "$out/matchings_before.csv")-1))  accounts: $(($(wc -l < "$out/accounts_flagged.csv")-1))"
