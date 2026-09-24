# Drop-reason field cleanup: remove references + delete NNPassReason__c / IMPassReason__c (prepared 2026-09-24)

Follows scripts/data/drop_reason_migration (data already copied into other_termination_reason__c, 1,678 rows).
Bogdan 2026-09-24: fields "will no longer be used ever" -> delete them.

What the deploy does (one Metadata API deployment, mdapi/):
1. Layout Matching__c-新規作成時: both fields removed (retrieved fresh 2026-09-24; prod LastModified 2026-02-05 by 川岸).
2. ListView Matching__c.PJ_sample_aproach: both columns removed (retrieved fresh 2026-09-24).
3. destructiveChangesPost.xml (applied after 1-2):
   - ValidationRule Matching__c.MustFillNNReason, Matching__c.MustFillIMReason (dead: reference inactive Stage values NN見送り/IM見送り)
   - CustomField Matching__c.NNPassReason__c, Matching__c.IMPassReason__c

Reference scan before delete (prod, 2026-09-24): no hits in any ApexClass, ApexTrigger or Flow; no other layout/flexipage;
formulas NNEndNumber__c/IMEndNumber__c reference Stage values, not these fields. Reports are not blocked by the Metadata API.

Run (user, with !):
  sf project deploy start --metadata-dir scripts/deploy/drop_reason_field_cleanup/mdapi -o prod --wait 10

Rollback:
- original/ holds the pre-change layout, list view, VRs and field definitions.
- Deleted custom fields stay under Setup > Object Manager > Matching > Fields > "Deleted Fields" for 15 days (data restorable).
- The 45 held-back open-stage records' NN text is preserved in scripts/data/drop_reason_migration/held_back_open_stage.csv.

Not touched: formula fields NNEndNumber__c/IMEndNumber__c, phaseColor, inactive Stage picklist values (separate cleanup if wanted).

## Result
Deployed to prod 2026-09-24 by Bogdan: deploy ID 0AfRA000002wReb0AE, Succeeded, 6/6 components, 0 errors.
Verified: Matching__c describe no longer lists NNPassReason__c / IMPassReason__c; VRs MustFillNNReason / MustFillIMReason gone
(remaining VRs: FillApproachMethodWhenApproathSelected, termination_reason_required, other_reason_required, Status_required,
other_reason_List_Exclusion_required, BuyADContract_URL, DisclosureStatementURLBuy). Fields recoverable from Deleted Fields until ~2026-10-09.
