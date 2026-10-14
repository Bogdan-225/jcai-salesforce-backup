# IS profiles: hide Opportunities from Pre Top MTG onward

Date: 2026-10-13. Decided with Bogdan and a colleague: users in the IS roles (IS_Buy, IS_Sell)
must not see deals once they reach Pre Top MTG. Applies to all record types (domestic and
cross-border share the same stage set). Closed stages (成約, 案件終了, Converted to Buyer, On Hold)
are hidden too.

## Why this shape

* Opportunity OWD is Private. IS_Buy profile has Read only (no View All).
* Their access came from Account owner-based sharing rules whose `opportunityAccessLevel` was Read,
  shared to "role and subordinates" groups that include the IS roles. Not stage-aware.
* Salesforce has no deny rule for Opportunity (Restriction Rules unsupported), so the fix is:
  remove the blanket grant, re-grant only early stages with a criteria-based rule.
* Record type is NOT accepted as a criterion on Opportunity SharingCriteriaRule in this org
  ("Picklist value does not exist" for label, API name, Id, qualified name). Rule is stage-only;
  `Ongoing` is included so CB_Sourcing_Path deals stay visible as before.

## Package (`pkg/`, deploy with `--metadata-dir`)

| Component | Change |
|---|---|
| 9 Account SharingOwnerRule | `opportunityAccessLevel` Read -> None (Read_Advisor_Advisor, Read_Apprach_Manager_Apprach_Manager, Read_IS_Buy_Advisor, Read_IS_Sell_Advisor, Read_System_Admin_System_Admin, Write_Inactive_All, Write_Advisor_IS_Sell, Write_Apprach_Manager_IS_Sell, Write_System_Admin_IS_Sell) |
| 1 Opportunity SharingCriteriaRule (new) | IS_Buy_PreTopMtg_Read: Read to role IS_Buy when StageName in the 12 stages before Pre Top MTG + Ongoing |
| Role IS_Buy, IS_Sell | `opportunityAccessLevel` -> None (no access to opps on accounts they own) |

Profiles untouched. Decision 2026-10-13: IS_Sell must see no Opportunities at all; their profile has no
Opportunity CRUD and no criteria rule is created for the IS_Sell role (an IS_Sell rule was tested in the
sandbox and then dropped from the package).
西尾 大 (IS_Buy role, Active_アドバイザー profile with View All): Bogdan moves them to the IS_Buy profile in Setup.
鈴木 翔 (Read Only, 無効ユーザー role) would lose all opp access: Bogdan deactivates that user.
IS users own/created 0 of 5,595 Opportunities and IS profiles have no Create/Edit, so ownership never bypasses the rule.

`retrieve_prod/` = live prod copy retrieved 2026-10-13 before editing (prod has one extra temp rule
TEMP_Write_System_Admin_Intern, opp access None, untouched).

## Sandbox test (partial, deploy 0AfBK00000CrYhP0AV, 13/13)

Per-user `UserRecordAccess` sample (74 deals, 15 per stage), IS_Buy user:
early stages read 100%, Pre Top MTG / Post Top MTG / closed stages read 0%.
IS_Sell user 0% before and after (profile). Advisor-profile user 100% before and after.
Recalculation finished within ~2 minutes in the sandbox.

## Prod deploy (user runs, off-hours)

```
sf project deploy start -o prod --metadata-dir scripts/deploy/is_opp_stage_sharing/pkg --wait 30
```

Editing Account sharing rules triggers a full sharing recalculation over ~1.87M accounts.
Expect it to run in the background for a while after the deploy returns; Setup > Sharing Settings
shows a recalculation banner while it runs, and other sharing-rule edits are locked meanwhile.

Verify afterwards (repeat until recalculation is done):

```
bash scripts/deploy/is_opp_stage_sharing/access_test.sh prod prod
```

Expected: IS_Buy user reads 100% of 面談前/資料作成/ISマッチング中/MGマッチング中/リード反響/Ongoing rows and 0% of Pre Top MTG and later (incl. 成約, 案件終了). Baseline in `prod_before.txt` (everything 100%). Prod dry-run validated 2026-10-13 (0AfRA0000031Qun0AE, 15/15).

## Rollback

Deploy `retrieve_prod/` (Account rules back to Read, roles back) and delete the two
Opportunity criteria rules in Setup or via a destructiveChanges deploy.
