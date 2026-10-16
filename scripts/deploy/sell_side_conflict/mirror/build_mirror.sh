#!/bin/bash
# usage: build_mirror.sh <mdapi unpackaged dir (with layouts/ flexipages/)> <output dir>
# Writes source-format files (*.layout-meta.xml, *.flexipage-meta.xml) with SellSideConflict_M__c inserted after DealConflict_M__c.
set -e
IN="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/layouts" "$OUT/flexipages"
for f in "$IN"/layouts/*.layout; do
  b=$(basename "$f" .layout)
  node "$HERE/transform_matching.js" --layout "$f" "$OUT/layouts/$b.layout-meta.xml" DealConflict_M__c SellSideConflict_M__c
done
for f in "$IN"/flexipages/*.flexipage; do
  b=$(basename "$f" .flexipage)
  node "$HERE/transform_matching.js" "$f" "$OUT/flexipages/$b.flexipage-meta.xml" Record.DealConflict_M__c Record.SellSideConflict_M__c
done
