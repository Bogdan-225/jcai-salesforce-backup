#!/usr/bin/env bash
# usage: run_sweep.sh <org> [max_chunks=30]
# 1) refuses to start unless flow SellSideConflict_AutoReactivate (B) is INACTIVE (deactivate it by hand first, see README.md)
# 2) runs sweep_chunk.apex until it prints "remaining: 0" (sleep 130 s between chunks for the 2-minute LastModifiedDate guard)
# 3) prints report_sweep.sh. Reactivating B afterwards is a manual step (README.md).
set -euo pipefail
org=$1; max=${2:-30}
here=$(cd "$(dirname "$0")" && pwd)

echo "== check: SellSideConflict_AutoReactivate must be inactive in $org"
row=$(sf data query -o "$org" --use-tooling-api -r csv -q "SELECT Id, ActiveVersionId FROM FlowDefinition WHERE DeveloperName = 'SellSideConflict_AutoReactivate'" 2>/dev/null | tail -n +2 | tr -d '\r')
echo "FlowDefinition Id,ActiveVersionId: ${row:-<none>}"
if [[ -z "$row" ]]; then echo "REFUSED: flow SellSideConflict_AutoReactivate not found in $org"; exit 2; fi
if [[ -n "${row#*,}" ]]; then echo "REFUSED: flow B is ACTIVE (ActiveVersionId ${row#*,}); deactivate it first (README.md step 2)"; exit 3; fi
echo "OK: flow B inactive"

for i in $(seq 1 "$max"); do
  outp=$(sf apex run -o "$org" --file "$here/sweep_chunk.apex" 2>&1) || { echo "$i: apex run FAILED"; echo "$outp" | grep -E "Error|error|FIELD_|EXCEPTION" | head -20; exit 4; }
  r=$(echo "$outp" | grep -oE "swept [0-9]+, remaining: [0-9]+" | tail -1 || true)
  if [[ -z "$r" ]]; then echo "$i: no 'swept' line in output"; echo "$outp" | grep -E "Error|error|EXCEPTION|Compiled|Executed" | head -20; exit 4; fi
  echo "$i: $r ($(date +%H:%M:%S))"
  [[ "$r" == *"remaining: 0" ]] && break
  if [[ "$i" == "$max" ]]; then echo "STOPPED: max_chunks=$max reached without remaining: 0"; exit 5; fi
  sleep 130
done

echo "== report after sweep"
bash "$here/report_sweep.sh" "$org"
echo "== reminder: reactivate SellSideConflict_AutoReactivate now (README.md step 4)"
