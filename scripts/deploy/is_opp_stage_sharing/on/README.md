# T-002 ON switch
Re-deploys only the criteria rule Opportunity.IS_Buy_PreTopMtg_Read with the original 13 early stages
(IS_Buy loses Pre Top MTG and later). Account rules and roles are not in this package, so no Account recalc.
  sf project deploy start -o prod --metadata-dir scripts/deploy/is_opp_stage_sharing/on --wait 10
Verify a few minutes later: bash scripts/deploy/is_opp_stage_sharing/access_test.sh prod prod
