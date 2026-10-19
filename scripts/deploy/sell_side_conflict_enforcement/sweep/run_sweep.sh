#!/usr/bin/env bash
# usage: run_sweep.sh <org> <backup_dir> [start_chunk=1]
# 1) reads <backup_dir>/accounts_flagged.csv (Ids only, written by backup_before_sweep.sh); every data line must be a 15/18-char Id
# 2) refuses to start unless flow SellSideConflict_AutoReactivate (B) is INACTIVE (deactivate it by hand first, see README.md)
# 3) per slice of 25 Ids, renders sweep_chunk.apex.tmpl ({{IDS}} -> 'id1','id2',...) and runs it: flag off then on, so
#    flow A fires once each. Accounts no longer flagged when their slice runs are skipped by the template's WHERE.
#    On a failed chunk it stops (exit 5) and prints the resume command; start_chunk resumes there.
# 4) prints report_sweep.sh. Reactivating B afterwards is a manual step (README.md).
set -euo pipefail
usage="usage: run_sweep.sh <org> <backup_dir> [start_chunk]"
org=${1:?$usage}; dir=${2:?$usage}; start=${3:-1}
[[ "$start" =~ ^[1-9][0-9]*$ ]] || { echo "REFUSED: start_chunk must be a positive integer ($usage)"; exit 4; }
here=$(cd "$(dirname "$0")" && pwd)
csv="$dir/accounts_flagged.csv"

[[ -f "$csv" ]] || { echo "REFUSED: $csv missing (run backup_before_sweep.sh first)"; exit 4; }
lines=$(tail -n +2 "$csv" | tr -d '\r' | grep -c . || true)
mapfile -t ids < <( tail -n +2 "$csv" | tr -d '\r"' | grep -E '^([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})$' || true )
if [[ ${#ids[@]} -eq 0 ]]; then echo "REFUSED: $csv has no Ids"; exit 4; fi
if [[ ${#ids[@]} -ne $lines ]]; then echo "REFUSED: $csv has $lines data lines but only ${#ids[@]} valid Ids"; exit 4; fi
size=25; n=$(( (${#ids[@]} + size - 1) / size ))
if (( start > n )); then echo "REFUSED: start_chunk $start > $n chunks"; exit 4; fi
echo "== $csv: ${#ids[@]} account Ids, $n chunks, starting at chunk $start"

echo "== check: SellSideConflict_AutoReactivate must be inactive in $org"
row=$(sf data query -o "$org" --use-tooling-api -r csv -q "SELECT Id, ActiveVersionId FROM FlowDefinition WHERE DeveloperName = 'SellSideConflict_AutoReactivate'" | tail -n +2 | tr -d '\r')
echo "FlowDefinition Id,ActiveVersionId: ${row:-<none>}"
if [[ -z "$row" ]]; then echo "REFUSED: flow SellSideConflict_AutoReactivate not found in $org"; exit 2; fi
if [[ -n "${row#*,}" ]]; then echo "REFUSED: flow B is ACTIVE (ActiveVersionId ${row#*,}); deactivate it first (README.md step 2)"; exit 3; fi
echo "OK: flow B inactive"

fail() { # $1 = chunk number, $2 = output
  echo "chunk $1/$n: FAILED"
  echo "$2" | grep -E "Error|error|FIELD_|EXCEPTION|VALIDATION" | head -20 || true
  echo "resume with: run_sweep.sh $org $dir $1"
  echo "(fix or remove the offending Account Id in $csv first, keep a copy of the original; never restart from chunk 1)"
  echo "== flow B is still INACTIVE — reactivate it after you resolve this (README.md step 5)"
  exit 5
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
total=0
for (( i=start-1; i<n; i++ )); do
  c=$((i+1))
  slice=("${ids[@]:i*size:size}")
  list=$(printf "'%s'," "${slice[@]}"); list=${list%,}
  f="$tmp/chunk_$c.apex"
  sed "s/{{IDS}}/$list/" "$here/sweep_chunk.apex.tmpl" > "$f"
  outp=$(sf apex run -o "$org" --file "$f" 2>&1) || fail "$c" "$outp"
  r=$(echo "$outp" | grep -oE "swept [0-9]+" | tail -1 || true)
  [[ -n "$r" ]] || fail "$c" "$outp"
  echo "chunk $c/$n: $r ($(date +%H:%M:%S))"
  total=$(( total + ${r#swept } ))
done
echo "== swept total this run: $total (chunks $start-$n; Ids not swept = no longer flagged, skipped)"

echo "== report after sweep"
bash "$here/report_sweep.sh" "$org"
echo "== reminder: reactivate SellSideConflict_AutoReactivate now (README.md step 5)"
