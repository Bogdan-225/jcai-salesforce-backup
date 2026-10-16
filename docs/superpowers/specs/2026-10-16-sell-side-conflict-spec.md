# Sell-Side Conflict flag — spec (2026-10-16)

Source: colleague's request (Japanese, pasted 2026-10-16) + decisions taken with Bogdan the same day.

## Decisions that override the colleague's text

| Topic | Colleague's spec | Decision (Bogdan, 2026-10-16) |
|---|---|---|
| API rename DealConflict__c → BuySideConflict__c, DealConflict_M__c → BuySideConflict_M__c | required | **Not done.** Labels, descriptions and help text only. API names stay. Reason: users only see labels; rename is blocked by Apex and would need a detach/rename/reattach cycle for zero user benefit. Recorded as a deliberate deviation in the manual and tracker. |
| Recompute timing | formula first; else daily scheduled flow / Apex | **Hybrid**: record-triggered Opportunity flow → invocable Apex (instant ON/OFF on stage / account change) + daily scheduled Apex (90-day expiry + safety net). Formula/roll-up confirmed impossible (relative date filter, max of 3 dates, parent propagation). |
| English labels | Buy-Side Conflict (Caution) / Sell-Side Conflict (Caution) | **Buyer Conflict (Caution) / Seller Conflict (Caution)** (Bogdan wants the word Buyer/Seller). Japanese labels as in the spec. |
| /sf-change skill | follow it | skill does not exist in this repo; follow its described steps manually: snapshot → impact analysis → approval → execute → snapshot → diff. |
| Help translations | "retrieve cannot fetch them, use Translation Workbench" | en_US help IS deployable via CustomObjectTranslation (done 2026-09-02 for 7 objects). Deploy, then verify on screen. |

## Field definitions

### Account.SellSideConflict__c (new)
- Type Checkbox, default false. Not editable by users (FLS read-only everywhere; value set by Apex in system context).
- Label ja: 進行中売り手(接触注意) / en_US: Seller Conflict (Caution)
- Description ja: 別の譲渡案件で売り手として進行中の会社（またはその親会社）。Apex(SellSideConflictRecalculator)が商談の保存時と毎日05:00(JST)に自動でON/OFF。判定: 譲渡案件(Opportunity、Sourcing以外)のフェーズが進行中かつ基準日(最終フェーズ変更日・最終更新日・最終活動更新日時の最大)が90日以内。案件終了・Converted to Buyer・Ongoing・On Hold・リード反響・長期フォロー・トスアップ・IS戻しは対象外。手動編集不可。
- Help ja: 別の譲渡案件で売り手として進行中の会社（またはその親会社）です。買い手としての案内は送らないでください。案件終了・Converted to Buyer・Ongoing の案件は対象外です。※商談の保存時と毎日自動でON/OFFされます（手動で変更しないでください）
- Help en_US: This company (or its parent) is currently a seller in another active project. Do not send buyer-side proposals to it. Projects at 案件終了 / Converted to Buyer / Ongoing are excluded. *Set automatically when a project is saved and once a day — do not edit manually.

### Account.DealConflict__c (existing, relabel only)
- Label ja: 進行中買い手(接触注意) / en_US: Buyer Conflict (Caution)
- Description ja (existing text kept, prefixed): 【進行中買い手】 + existing description.
- Help ja: 別の案件で買い手としてトップ面談以降まで進んでおり、かつ他の案件にもつながっている会社です。重複提案に注意してください。※自動でON/OFFされます（手動で変更しないでください）
- Help en_US: This company is a buyer in another deal at Top Meeting stage or later and is also connected to a further deal = beware of duplicate proposals. *Set automatically on/off — do not edit manually.

### Matching__c.DealConflict_M__c (existing mirror, relabel only)
- Same labels/help as Account.DealConflict__c.

### Matching__c.SellSideConflict_M__c (new mirror, optional — confirm with Bogdan before prod)
- Formula Checkbox: `Buy_Company__r.SellSideConflict__c`
- Same labels/help as Account.SellSideConflict__c. Purpose: long-list reports / Matching list views can exclude active sellers the same way they exclude DealConflict buyers today.

### Opportunity helper formulas (new, read-only, for transparency and as the single place the rule lives)
- `SellSideBaseDate__c` — Formula DateTime, label ja 進行中判定基準日 / en Seller-Active Base Date. Max of LastStageChangeDate, LastModifiedDate, LastActivityUpdate__c (blanks treated as LastModifiedDate).
- `SellSideActive__c` — Formula Checkbox, label ja 進行中売り手判定(自動) / en Seller Active (auto). TRUE when RecordType.DeveloperName <> "CB_Sourcing_Path" AND StageName in the ACTIVE list AND SellSideBaseDate__c >= NOW() - 90.

## ACTIVE stage list (union over record types, from business-process definitions + legacy data values)
NDA締結, FS Request, バリュエーション済み, 面談前, 案件化, 資料作成, ISマッチング中, MGマッチング中, Pre Top MTG, トップ面談, Post Top MTG, MOU/LOI, DD, SPA, CP, 成約

Excluded: 案件終了, Converted to Buyer, Ongoing, On Hold, リード反響, 長期フォロー, トスアップ, IS戻し, and record type Sourcing (CB_Sourcing_Path). Project__c (old object, 3 records) is out of scope.

Findings on picklists (2026-10-16): business processes 国内プロセス and CB_Project contain no value outside this list. Data contains legacy values outside each record type's process: Project RT has 面談前 (63), 資料作成 (1), Ongoing (1); 国内案件 RT has Post Top MTG (2). All covered by the union list.

## Rule
Account A gets SellSideConflict__c = TRUE iff there exists an Opportunity O with O.SellSideActive__c = TRUE and (O.AccountId = A or O.Account.ParentId = A). Otherwise FALSE. Only the direct parent propagates.

## Recompute
1. Instant: flow `Opportunity_AfterSave_RecomputeSellSideConflict` (after save, create+update, entry: ISNEW() OR ISCHANGED(StageName) OR ISCHANGED(AccountId) OR ISCHANGED(RecordTypeId)) calls invocable `SellSideConflictRecalculator.recalculateForAccounts` with $Record.AccountId and $Record__Prior.AccountId.
2. Daily: `SellSideConflictScheduler` (Schedulable) at 20:00 UTC = 05:00 JST calls `SellSideConflictRecalculator.recalculateAll()`.
3. Apex is `without sharing` so the result does not depend on the saving user's record visibility (T-002 hides opportunities from IS users).

## Access
Read-only on the 7 Active_ profiles (Active__IS_Buy, Active_インターン, Active_アプローチ管理者, Active_アドバイザー, Active_アドバイザー_pf, Active_IS_Sell, Active_IS_Sell_pf) + System Administrator (Admin) for Account.SellSideConflict__c, Opportunity.SellSideBaseDate__c, Opportunity.SellSideActive__c (and Matching__c.SellSideConflict_M__c if built). Also add them to permission set DealConflict_Access. Apex class access for SellSideConflictRecalculator on the same profiles (flow-invoked Apex needs no class access, but keep parity with the buyer side).

## UI
Account record pages Japan and International: SellSideConflict__c read-only directly after DealConflict__c. Account compact layout: add after DealConflict__c. Matching layouts/pages: only if the mirror is built, next to DealConflict_M__c.

## Backfill (prod, by Bogdan with `!`)
Before: export `SELECT Id, SellSideConflict__c FROM Account WHERE SellSideConflict__c = true` (expected 0 rows) to JSON. Run `SellSideConflictRecalculator.recalculateAll()` once via anonymous Apex. After: report count ON, split by Account record type and seller-self vs parent-only. Expectation from 2026-10-16 sizing: ~337 (334 sellers + 3 parents).

## Verification after change (Task 2 of the request)
Check nothing referencing DealConflict__c broke: 4+2 flows, Apex DealConflictRecalculator(+Test), Account pages Japan/International + compact layout, 5 Matching layouts + 4 Matching flexipages, report type Account_Matching, 18 reports in SatoMizuki/MatchingTest + LongList, Account/Matching en_US translations, profiles. Since API names do not change, the expected result is "no change"; verify by opening each and by re-running DealConflictRecalculatorTest.

## Manual (Task 3)
Update the Salesforce manual section on 他案件進行中 → describe both flags, the rule, timing, and the "do not edit" note. Location to be confirmed with Bogdan (Google Doc / docx).
