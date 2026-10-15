# T-002 OFF switch (2026-10-15)

Widens criteria rule Opportunity.IS_Buy_PreTopMtg_Read to all 24 active stages, so IS_Buy
reads every Opportunity again (same effective access as before T-002). Account owner rules and
roles are NOT touched: that avoids the multi-hour sharing recalc over 1.87M accounts.
Opportunity-only recalc (~5.6k records) finishes in minutes.

OFF  (this folder):  sf project deploy start -o prod --metadata-dir scripts/deploy/is_opp_stage_sharing/off --wait 10
ON   (re-enable):    sf project deploy start -o prod -m "SharingCriteriaRule:Opportunity.IS_Buy_PreTopMtg_Read" --source-dir scripts/deploy/is_opp_stage_sharing/pkg   (or deploy pkg/ as metadata-dir)
Verify:              bash scripts/deploy/is_opp_stage_sharing/access_test.sh prod prod   (expect IS_Buy 100% everywhere, IS_Sell 0%)
