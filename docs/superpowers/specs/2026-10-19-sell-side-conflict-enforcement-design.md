# Sell-Side Conflict enforcement (mirror of the buyer-side auto-terminate) — design

Date: 2026-10-19. Decided with Bogdan after talking to Sato: "mirror his build, keep it the same for our sell part".

## 1. Goal

`Account.SellSideConflict__c` (進行中売り手(接触注意), live since 2026-10-19) is a flag only. Make it behave like Sato's buyer flag `DealConflict__c`: when a company becomes an active seller, its open アプローチ Matchings as a **buyer** are terminated automatically, its other live Matchings as a buyer are marked "warned" with a memo, and when the seller flag drops the terminated ones are revived. A new アプローチ Matching created for a flagged seller is terminated on save.

Not in scope: notifications, page banners, changes to Sato's buyer-side flows, changes to the flag rule itself (`Opportunity.SellSideActive__c`).

## 2. Reference: Sato's buyer-side build (prod, unchanged since 2026-07-07)

Local copies: `scratch_dc/full/unpackaged/unpackaged/flows/` (retrieved 2026-10-16; prod FlowDefinition LastModifiedDate 2026-07-07 confirmed 2026-10-19).

| Flow | Trigger | Does |
|---|---|---|
| `DealConflict_AutoTerminate` v15 | Account after-save, `AND(ISCHANGED(DealConflict__c), DealConflict__c = TRUE)` | Get source Matching (buyer's top-stage Matching) → create Account Event memo → write `ConflictSourceId__c`/`ConflictSourceName__c` on Account → Get アプローチ Matchings (`Buy_Company__c = acct`, `phase_match__c = アプローチ`, `RecordTypeId <> CB_Target`, `Deal_Is_Dead__c = false`) → set phase マッチ終了, status アプローチ>終了, `termination_reason__c` リスト除外, `other_termination_reason__c` 他案件進行中のため, `AutoTerminated__c` true, `ConflictSourceName__c`, `DealConflictWarned__c` true → update → one memo Task per terminated Matching → Get survivors (`Buy_Company__c = acct`, `Deal_Is_Dead__c = false`, phase ≠ マッチ終了, `Is_DealConflictSource__c = false`) → one memo Task each → set `DealConflictWarned__c` true on them |
| `DealConflict_AutoReactivate` v15 | Account after-save, `AND(ISCHANGED(DealConflict__c), DealConflict__c = FALSE)` | Account Event memo "cleared" → save then clear `ConflictSourceId__c`/`Name__c` → Get Matchings `AutoTerminated__c = true`, phase マッチ終了, `Deal_Is_Dead__c = false` → set phase MG対応, status 未確認, clear both reason fields, `AutoTerminated__c` false, clear `ConflictSourceName__c` → update → Get warned (`DealConflictWarned__c = true`) → memo Task each → set `DealConflictWarned__c` false |
| `Matching_AfterSave_TerminateNewOnConflict` v11 | Matching after-save on create, `ISNEW() && phase = アプローチ && Buy_Company__r.DealConflict__c && RT <> CB_Target && deal not in (成約, 案件終了, On Hold, Converted to Buyer)` | Get source Matching → update self with the terminate values → memo Task on self → memo Event on buyer Account |

Memo records (both flows): Task `WhatId` = Matching, `Subject` "Deal Conflict: {DealName}", `Description` "{DealName}: {sourceId}", `activity_type__c` メモ, `ActivityDate` today, `call_date_and_time__c` now, `Status` 完了. Event `WhatId` = Account, same Subject/Description, `activity_type__c` メモ, `StartDateTime` now, `IsAllDayEvent` false, `DurationInMinutes` as in the source flow. Cleared variants use "Deal Conflict Cleared: {DealName}".

Helper fields (all FLS via perm set `DealConflict_Access` only; Admin profile cannot read them): Matching `AutoTerminated__c` (checkbox), `ConflictSourceName__c` (text 255), `DealConflictWarned__c` (checkbox), formulas `Deal_Is_Dead__c`, `Deal_Is_TopStage__c`, `Is_DealConflictSource__c`; Account `ConflictSourceId__c` (text 18), `ConflictSourceName__c` (text 255).

## 3. Design

### 3.1 Principle
Clone, do not share. Each of the three flows is a copy of Sato's XML with (a) the trigger keyed on `SellSideConflict__c`, (b) the "source" being the seller's own active Opportunity instead of a top-stage Matching, (c) seller-specific marker fields, (d) seller-specific memo texts. Sato's flows and fields are not modified. Shared read-only formulas `Deal_Is_Dead__c` and the `CB_Target` exclusion are reused as-is.

Separate markers are required: Sato's reactivate flow revives anything with `AutoTerminated__c = true`; if the seller flow set the same marker, a buyer-flag drop would revive seller-terminated Matchings and vice versa.

### 3.2 New fields

| Object | API name | Type | Label (ja / en_US) | Notes |
|---|---|---|---|---|
| Matching__c | `SellSideAutoTerminated__c` | Checkbox, default false | 売り手重複_自動終了(内部制御) / Seller Conflict Auto-Terminated (internal) | revive marker |
| Matching__c | `SellSideConflictWarned__c` | Checkbox, default false | 売り手重複_警告済み(内部) / Seller Conflict Warned (internal) | prevents duplicate memos; cleared on flag drop |
| Matching__c | `SellSideConflictSourceName__c` | Text(255) | 売り手重複元案件名(内部) / Seller Conflict Source Deal (internal) | seller's deal name at termination |
| Account | `SellSideConflictSourceId__c` | Text(18) | 売り手重複元案件ID(内部) / Seller Conflict Source Deal Id (internal) | |
| Account | `SellSideConflictSourceName__c` | Text(255) | 売り手重複元案件名(内部) / Seller Conflict Source Deal (internal) | used by the "cleared" memo |
| Opportunity | `SellSideSellerParentId__c` | Formula (Text) `Account.ParentId` | 売り手親取引先ID(自動) / Seller Parent Account Id (auto) | lets a flow Get Records find the subsidiary's deal for a flagged parent (flows cannot filter on `Account.ParentId`) |

Help text ja + en_US on all six, same style as the existing internal fields ("自動設定・編集不可").

Access: read on perm set `DealConflict_Access` (mirror) **plus read on the System Administrator profile** (deviation, so Bogdan can verify and sweep from the admin account; today's deploy showed admin-hidden fields cost time). No other profiles. Not on any layout or page.

### 3.3 Flow A — `SellSideConflict_AutoTerminate` (Account after-save)
Entry: `AND(ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = TRUE)`.
1. **Get_SourceOpp**: Opportunity, first record, `SellSideActive__c = true AND (AccountId = $Record.Id OR SellSideSellerParentId__c = $Record.Id)`, fields Id, Name. (If none, continue with blank name — same tolerance as Sato's flow.)
2. **Create_Account_Event**: Subject `Seller Conflict: {SourceOpp.Name}`, Description `{SourceOpp.Name}: {SourceOpp.Id}`, other fields as Sato's.
3. **Update_Account_Source**: `SellSideConflictSourceId__c` = SourceOpp.Id, `SellSideConflictSourceName__c` = SourceOpp.Name.
4. **Get_Approach**: Matching, `Buy_Company__c = $Record.Id`, `phase_match__c = アプローチ`, `RecordTypeId <> 012RA00000A1BTVYA3` (CB_Target), `Deal_Is_Dead__c = false`.
5. Loop → assign: phase マッチ終了, status アプローチ>終了, `termination_reason__c` リスト除外, `other_termination_reason__c` **売り手として進行中のため**, `SellSideAutoTerminated__c` true, `SellSideConflictSourceName__c` = SourceOpp.Name, `SellSideConflictWarned__c` true; build memo Task (Subject `Seller Conflict: {name}`). Update collection, create Tasks.
6. **Get_Survivors**: `Buy_Company__c = $Record.Id`, `Deal_Is_Dead__c = false`, `phase_match__c <> マッチ終了`, `SellSideConflictWarned__c = false`. (No "source Matching" exclusion: the seller source is an Opportunity, not a Matching.) One memo Task each, then update `SellSideConflictWarned__c = true` via the same filter.

### 3.4 Flow B — `SellSideConflict_AutoReactivate` (Account after-save)
Entry: `AND(ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = FALSE)`.
1. Account Event `Seller Conflict Cleared: {$Record.SellSideConflictSourceName__c}`, Description `{name}: {id}`.
2. Save name/id to variables, clear both Account fields.
3. **Get_Terminated**: `Buy_Company__c = $Record.Id`, `phase_match__c = マッチ終了`, `SellSideAutoTerminated__c = true`, `Deal_Is_Dead__c = false` → phase MG対応, status 未確認, both reason fields blank, `SellSideAutoTerminated__c` false, `SellSideConflictSourceName__c` blank → update.
4. **Get_Warned**: `Buy_Company__c = $Record.Id`, `SellSideConflictWarned__c = true` → memo Task `Seller Conflict Cleared: {saved name}` each → update `SellSideConflictWarned__c = false`.

### 3.5 Flow C — `Matching_AfterSave_TerminateNewOnSellSideConflict` (Matching after-save, create only)
Entry: Sato's formula with `{!$Record.Buy_Company__r.SellSideConflict__c} = TRUE` in place of `DealConflict__c`.
1. **Get_SourceOpp** as in A, keyed on `$Record.Buy_Company__c` (own or parent).
2. Update self with the terminate values (same as A step 5).
3. Memo Task on self, memo Event on `$Record.Buy_Company__c`.

### 3.6 Interactions
- Terminating or reviving a Matching changes `phase_match__c`, so Sato's `Matching_AfterSave_RecomputeDealConflict` runs and keeps the buyer flag right. Intended.
- A Matching already terminated by the buyer mechanism is マッチ終了 and is skipped by A (not アプローチ, excluded from survivors). A Matching terminated by A is skipped by Sato's revive (his marker is false).
- Known gap, same shape as Sato's: if Sato's revive brings a Matching back while its buyer is still a flagged seller, nothing warns it. Accepted.
- Flag changes are written by `SellSideConflictRecalculator` (Apex, `Database.update(..., false)`), from the Opportunity flow and the 05:00 JST job. Flows A/B run inside that update. If A or B throws, that one account's update fails, is logged, and is retried by the next run. Same exposure Sato's flows have had since July; the field values written are identical to his, so the Matching-side validation path is proven.
- No fault connectors, to stay a faithful mirror.

### 3.7 Go-live sweep (prod data as of 2026-10-19)
338 accounts are already ON; the flows only react to a change. Sweep = deactivate B → for each flagged account, in chunks of 25 per anonymous-Apex run: set `SellSideConflict__c` false then true (two DMLs) so A fires → reactivate B. Expected: 6 Matchings terminated (Vibrant Group ×2, カキノキ薬局, ソシオネクスト, Sato Test inc., TEST_S5検証_買い手01), 6 warned (Great Pyramid, PT Sarana Mitra Luas, さわやか薬局, ディライト, テンダー, Sato Test inc.), 9 live Matchings on dead deals or Target untouched, a memo Event and stored source on every flagged account. Before the sweep: CSV backup of the 12 affected Matchings (Id, phase, status, both reasons) and of all 338 account Ids.

Toggling the flag does not re-trigger our Opportunity flow or Sato's buyer flows (different fields); it does run the Account trigger and Account flows, which the 338-row backfill already exercised.

### 3.8 Rollback
Deactivate A, B, C (Tooling PATCH `activeVersionNumber 0`). Restore the 12 Matchings from the backup CSV (phase/status/reasons; clear the three markers). Clear the two Account source fields. Fields can stay (harmless) or be deleted.

### 3.9 Testing
Sandbox `bogdan` (no data): extend `scripts/deploy/sell_side_conflict/sandbox_testdata.apex` with Matchings so the manual plan covers: terminate at アプローチ; warn at MG対応; leave dead-deal and Target Matchings alone; revive to MG対応/未確認 when the seller deal closes; "cleared" memo on warned; new アプローチ Matching for a flagged seller terminated on save; parent-company flag (source via `SellSideSellerParentId__c`); buyer+seller both flagged on one account (no cross-revive). Sandbox `partial` (real-shaped data): rehearse the sweep script and compare counts. Prod: runbook in the style of `scripts/deploy/sell_side_conflict/prod/README.md`; Bogdan runs each line with `!`; activation and sweep gated on his go.

## 4. Deliverables
- `scripts/deploy/sell_side_conflict_enforcement/` with `fields/`, `labels/`, `access/`, `flows/`, `sweep/`, `prod/README.md` (+ snapshot_before for whole-file components: perm set, Admin profile partial, 3 objectTranslations).
- Memory + tracker row (new ID) after prod.
