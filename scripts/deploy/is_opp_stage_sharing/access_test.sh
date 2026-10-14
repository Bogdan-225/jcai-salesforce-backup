#!/bin/bash
# usage: bash access_test.sh <org alias> <sandbox|prod>
# Prints, per record type/stage, how many sampled Opportunities each test user can read.
# Sample ids live in <set>_sample_ids.txt, stage map in <set>_sample_stage.json (same folder).
S="$(cd "$(dirname "$0")" && pwd)"
SET="${2:-sandbox}"
IDS=$(cat "$S/${SET}_sample_ids.txt")
STAGEF="$S/${SET}_sample_stage.json"
for U in 005RA00000M3rEUYAZ:IS_Buy_Matsui 005RA00000Ak9ybYAB:IS_Sell_Sano 005RA00000Hd1AZYAZ:Nishio_now_IS_Buy_profile; do
  UID_=${U%%:*}; echo "== $U"
  sf data query -o "$1" -q "SELECT RecordId, HasReadAccess FROM UserRecordAccess WHERE UserId='$UID_' AND RecordId IN ($IDS)" --json > "$S/ura_tmp.json" 2>/dev/null
  node -e '
const [stageF, uraF] = process.argv.slice(1);
const s = require(stageF); const d = require(uraF); const agg = {};
(d.result ? d.result.records : []).forEach(x => { const st = s[x.RecordId]; agg[st] = agg[st] || [0, 0]; agg[st][0]++; if (x.HasReadAccess) agg[st][1]++; });
Object.keys(agg).sort().forEach(k => console.log(k.padEnd(36), "read", agg[k][1], "/", agg[k][0]));
if (!d.result) console.log(JSON.stringify(d).slice(0, 300));
' "$STAGEF" "$S/ura_tmp.json"
done
rm -f "$S/ura_tmp.json"
