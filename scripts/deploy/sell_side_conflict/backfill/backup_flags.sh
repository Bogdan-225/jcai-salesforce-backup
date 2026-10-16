#!/usr/bin/env bash
# usage: backup_flags.sh <org> <outfile.json>
# Never saves an error as a backup; never overwrites an existing snapshot.
# SSC_BACKUP_FIELD overrides the second flag field (test hook for failure simulation only).
org="$1"; out="$2"
[ -n "$org" ] && [ -n "$out" ] || { echo "usage: backup_flags.sh <org> <outfile.json>"; exit 1; }
[ ! -e "$out" ] || { echo "refusing to overwrite existing $out"; exit 1; }
f2="${SSC_BACKUP_FIELD:-DealConflict__c}"
tmp="$(mktemp)"
sf data query -o "$org" -q "SELECT Id, SellSideConflict__c, $f2 FROM Account WHERE SellSideConflict__c = true OR $f2 = true" --json > "$tmp" 2>/dev/null
if n=$(node -e '
const fs=require("fs");let j;
try{j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));}catch(e){console.error("unparseable output");process.exit(1);}
if(j.status===0&&j.result&&Array.isArray(j.result.records)){console.log(j.result.records.length);}
else{console.error("query failed: "+(j.message||JSON.stringify(j)));process.exit(1);}
' "$tmp"); then
  mv "$tmp" "$out"; echo "saved $n rows to $out"
else
  rm -f "$tmp"; echo "BACKUP FAILED, nothing saved"; exit 1
fi
