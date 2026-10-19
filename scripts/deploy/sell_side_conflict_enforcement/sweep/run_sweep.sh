#!/usr/bin/env bash
# usage: run_sweep.sh <org> <backup_dir>
# 1) refuses to start unless flow SellSideConflict_AutoReactivate (B) is INACTIVE (deactivate it by hand first, see README.md)
# 2) reads <backup_dir>/accounts_flagged.csv (Ids only, written by backup_before_sweep.sh) and, per slice of 25 Ids,
#    renders sweep_chunk.apex.tmpl ({{IDS}} -> 'id1','id2',...) and runs it: flag off then on, so flow A fires once each.
#    Accounts no longer flagged when their slice runs are skipped by the template's WHERE.
# 3) prints report_sweep.sh. Reactivating B afterwards is a manual step (README.md).
set -euo pipefail
org=${1:?usage: run_sweep.sh <org> <backup_dir>}; dir=${2:?usage: run_sweep.sh <org> <backup_dir>}
here=$(cd "$(dirname "$0")" && pwd)
csv="$dir/accounts_flagged.csv"

mapfile -t ids < <( [[ -f "$csv" ]] && tail -n +2 "$csv" | tr -d '\r"' | grep -E '^[a-zA-Z0-9]{15,18}$' || true )
if [[ ${#ids[@]} -eq 0 ]]; then echo "REFUSED: $csv missing or has no Ids (run backup_before_sweep.sh first)"; exit 4; fi
echo "== $csv: ${#ids[@]} account Ids"

echo "== check: SellSideConflict_AutoReactivate must be inactive in $org"
row=$(sf data query -o "$org" --use-tooling-api -r csv -q "SELECT Id, ActiveVersionId FROM FlowDefinition WHERE DeveloperName = 'SellSideConflict_AutoReactivate'" 2>/dev/null | tail -n +2 | tr -d '\r')
echo "FlowDefinition Id,ActiveVersionId: ${row:-<none>}"
if [[ -z "$row" ]]; then echo "REFUSED: flow SellSideConflict_AutoReactivate not found in $org"; exit 2; fi
if [[ -n "${row#*,}" ]]; then echo "REFUSED: flow B is ACTIVE (ActiveVersionId ${row#*,}); deactivate it first (README.md step 2)"; exit 3; fi
echo "OK: flow B inactive"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
size=25; n=$(( (${#ids[@]} + size - 1) / size )); total=0
for (( i=0; i<n; i++ )); do
  slice=("${ids[@]:i*size:size}")
  list=$(printf "'%s'," "${slice[@]}"); list=${list%,}
  f="$tmp/chunk_$((i+1)).apex"
  sed "s/{{IDS}}/$list/" "$here/sweep_chunk.apex.tmpl" > "$f"
  outp=$(sf apex run -o "$org" --file "$f" 2>&1) || { echo "chunk $((i+1))/$n: apex run FAILED"; echo "$outp" | grep -E "Error|error|FIELD_|EXCEPTION" | head -20; exit 5; }
  r=$(echo "$outp" | grep -oE "swept [0-9]+" | tail -1 || true)
  if [[ -z "$r" ]]; then echo "chunk $((i+1))/$n: no 'swept' line in output"; echo "$outp" | grep -E "Error|error|EXCEPTION|Compiled|Executed" | head -20; exit 5; fi
  echo "chunk $((i+1))/$n: $r ($(date +%H:%M:%S))"
  total=$(( total + ${r#swept } ))
done
echo "== swept total: $total of ${#ids[@]} Ids in backup (difference = no longer flagged, skipped)"

echo "== report after sweep"
bash "$here/report_sweep.sh" "$org"
echo "== reminder: reactivate SellSideConflict_AutoReactivate now (README.md step 5)"
