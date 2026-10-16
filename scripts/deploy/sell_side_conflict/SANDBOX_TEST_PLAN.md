# Sell-Side Conflict — sandbox test plan (bogdan), 2026-10-16

Org: https://idealpartners--bogdan.sandbox.my.salesforce.com  
Test records were created by Claude with anonymous Apex (names start with `SSC-T`). Find them with the global search box.  
Field names as they appear in Japanese: 進行中売り手(接触注意) = seller flag, 進行中買い手(接触注意) = buyer flag (old "Deal Conflict").  
Rule under test: an account (and its direct parent) is ON when it is the seller on an Opportunity that is not Sourcing, whose stage is NDA締結〜成約, and whose base date (stage change / last modified / last activity) is within 90 days. ON/OFF happens in the same save when a stage, account or record type changes; a daily 05:00 job handles the 90-day expiry and leftovers.

Tip for stage changes: this org requires an activity before every stage change (入力規則 Required_ActivitiesByStage). Before each stage change below, open the Opportunity, click 新規ToDo / New Task in the activity panel, give it any subject, save. Then change the stage. If the save is still refused, read the message: 案件終了 needs Drop Reason (termination_reason__c), On Hold needs On-Hold Reason.

Mark each line ✅ / ❌. Report any ❌ with the account name and what you saw.

---

## 0. Starting state (nothing to change, just confirm)

Open each account and look at 進行中売り手(接触注意) in the アカウント情報 section.

| # | Account | Expected seller flag | Why |
|---|---|---|---|
| 0.1 | SSC-T1 Seller | ☐ OFF | its Opp is at リード反響 (not active) |
| 0.2 | SSC-T1 Parent | ☐ OFF | child not active |
| 0.3 | SSC-T2 Child A | ☑ ON | Opp "SSC-T2 Opp A" at 案件化 |
| 0.4 | SSC-T2 Parent | ☑ ON | parent of Child A |
| 0.5 | SSC-T2 Child B | ☐ OFF | no Opp; sibling of A |
| 0.6 | SSC-T3 Sourcing | ☐ OFF | Opp at 成約 but record type Sourcing → excluded |
| 0.7 | SSC-T3 LongTerm | ☐ OFF | 長期フォロー is not active |
| 0.8 | SSC-T3 OnHold | ☐ OFF | On Hold is not active |
| 0.9 | SSC-T3 Closed | ☐ OFF | 案件終了 is not active |
| 0.10 | SSC-T4 Seller A | ☑ ON | Opp "SSC-T4 Opp" at 資料作成 |
| 0.11 | SSC-T4 Seller B | ☐ OFF | no Opp yet |
| 0.12 | SSC-T6 Stale | ☑ ON | deliberately wrong (no Opp) — the daily job must clear it in step 6 |

Also on SSC-T2 Child A: confirm the field is read-only (no pencil icon, and hovering the value does not offer inline edit), and the "i" bubble shows the help text ending with 手動で変更しないでください.

## 1. Instant ON, with parent propagation

1. Open Opportunity "SSC-T1 Opp" (account SSC-T1 Seller, stage リード反響).
2. Log a ToDo on it (see tip), then change the stage to 案件化 and save.
3. Open account SSC-T1 Seller → seller flag ☑ ON. (No waiting, no page refresh trick needed beyond reopening the record.)
4. Open account SSC-T1 Parent → seller flag ☑ ON.
5. Open the Opportunity again: the two helper fields are not on the page, which is expected (they exist for reports and for the Apex only).

## 2. Instant OFF

1. On "SSC-T1 Opp": log a ToDo, change the stage to 案件終了, fill Drop Reason with その他, save.
2. SSC-T1 Seller → ☐ OFF. SSC-T1 Parent → ☐ OFF.
3. Change the stage back to 面談前 (log a ToDo first) → both ☑ ON again. Leave it like this.

## 3. Sibling keeps the parent ON, closing the last child turns it OFF

1. Confirm SSC-T2 Parent ☑ ON, SSC-T2 Child A ☑ ON, SSC-T2 Child B ☐ OFF.
2. Open Opportunity "SSC-T2 Opp A", log a ToDo, change the stage to 案件終了 with Drop Reason その他, save.
3. SSC-T2 Child A → ☐ OFF. SSC-T2 Parent → ☐ OFF (no active child left). SSC-T2 Child B stays ☐ OFF.

## 4. Matching mirror (buyer candidate who is an active seller elsewhere)

Do this BEFORE step 5.
1. Open account SSC-T4 Seller A → Related → Matching (or search Matching number 081019-202610). Open that Matching record.
2. In the Matching details: 進行中売り手(接触注意) ☑ checked, 進行中買い手(接触注意) ☐ unchecked, both read-only, placed next to each other.
3. Optional: Matching list view → add column 進行中売り手(接触注意); it shows ✓ for this row. (Filtering on it is not possible; it is a formula, same as the buyer mirror.)

## 5. Moving an Opportunity to another seller

1. Open Opportunity "SSC-T4 Opp" (account SSC-T4 Seller A, stage 資料作成). Edit the Account Name lookup to SSC-T4 Seller B, save (no stage change, so no ToDo needed).
2. SSC-T4 Seller A → ☐ OFF. SSC-T4 Seller B → ☑ ON.
3. Reopen the Matching from step 4: 進行中売り手(接触注意) is now ☐ unchecked (the mirror follows the buyer account).

## 6. Daily job (run it by hand; it clears leftovers and changes nothing else)

1. In this Claude session type: `! sf apex run -o bogdan --file scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex`
   Expected output contains `SellSideConflict recalculateAll updated: 1`.
2. SSC-T6 Stale → ☐ OFF.
3. Spot-check that nothing else moved: SSC-T1 Seller ☑, SSC-T1 Parent ☑, SSC-T4 Seller B ☑, SSC-T2 Parent ☐.
4. Run the same command again → `updated: 0` (nothing to do; proves it is safe to run any time).
5. The real 90-day expiry cannot be forced in a sandbox (dates cannot be back-dated). It was proven in the partial sandbox with real old records on 2026-10-16.

## 7. Advisor view (the profile your consultants use)

Log in as your advisor-profile test user (or use 代理ログイン on one of the Active_アドバイザー users in bogdan).
1. Open SSC-T1 Seller: 進行中売り手(接触注意) is visible, shows ☑, has no pencil, cannot be edited.
2. Open the Matching from step 4: both conflict fields visible, read-only.
3. Open any Account list view, add the column 進行中売り手(接触注意): it is offered and shows values.
4. Reports: new report on Accounts → the field 進行中売り手(接触注意) is available as a column and as a filter (filter works here because on Account it is a real checkbox, not a formula).

## 8. English labels and help

1. Avatar → Settings → Language & Time Zone → Language: English. Save.
2. SSC-T1 Seller: fields read "Buyer Conflict (Caution)" and "Seller Conflict (Caution)"; the "i" bubbles show the English help (the seller one ends with "do not edit manually").
3. The Matching from step 4: same two English labels side by side.
4. Opportunity "SSC-T1 Opp": not visible on the page, but Setup → Object Manager → Opportunity → Fields shows "Seller-Active Base Date" and "Seller Active (auto)".
5. Switch the language back to 日本語.

## 9. Nothing else broke

1. Open a real (non-SSC) Account on the Japan page and one on the International page: the layout looks as before, with the new field directly under 進行中買い手(接触注意).
2. Open one Matching per record type you use (国内案件, Matching(In-Out), Matching(Out-Out), Advisor/IS_Buy pages): the pages open without errors and the two conflict fields are visible.
3. Setup → Flows: "Opportunity AfterSave Recompute SellSide Conflict" is Active (version 4); the five DealConflict flows are still Active.
4. Setup → Apex Classes: SellSideConflictRecalculator, SellSideConflictScheduler, SellSideConflictRecalculatorTest exist.

## When everything is ✅

Tell Claude "sandbox plan passed" (or list the ❌ lines). The prod deploy follows `scripts/deploy/sell_side_conflict/prod/README.md` on the day you choose.
