#!/usr/bin/env bash
set -e
org="$1"; out="$2"
sf data query -o "$org" -q "SELECT Id, Name, SellSideConflict__c, DealConflict__c FROM Account WHERE SellSideConflict__c = true OR DealConflict__c = true" --json > "$out"
echo "saved $(grep -c '\"Id\"' "$out") rows to $out"
