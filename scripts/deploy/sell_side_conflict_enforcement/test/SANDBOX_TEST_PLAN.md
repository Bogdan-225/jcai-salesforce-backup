# Sell-Side Conflict enforcement: sandbox test plan (`bogdan`)

Tests the three flows from Task 2 (`SellSideConflict_AutoTerminate`, `SellSideConflict_AutoReactivate`,
`Matching_AfterSave_TerminateNewOnSellSideConflict`) on top of the live recalculator
(`Opportunity_AfterSave_RecomputeSellSideConflict` → `SellSideConflictRecalculator` → `Account.SellSideConflict__c`).

**Sandbox only. Never run any of this against `prod`.** All test records start with `SSE-T`.

## 0. Before you start

1. The running user needs perm set `DealConflict_Access` (the hidden fields `AutoTerminated__c` and
   `Deal_Is_Dead__c` are unreadable without it; the data script and verify script fail otherwise):
   `sf org assign permset -o bogdan -n DealConflict_Access` (assigned to bogdan.brezeanu@jcai.co.jp.bogdan on 2026-10-19).
2. `Matching__c.Name` is an auto-number (e.g. `081028-202610`). Test Matchings cannot be named, so this plan
   refers to them by **buyer + deal**:

   | Label | Buyer (Buy_Company__c) | Deal (Sell__c) | Record type | Start phase |
   |---|---|---|---|---|
   | M1 | SSE-T1 Buyer | SSE-T Deal D1 | MatchingMaster | アプローチ |
   | M2 | SSE-T1 Buyer | SSE-T Deal D2 | MatchingMaster | MG対応 |
   | M3 | SSE-T3 Buyer | SSE-T Deal D1 | MatchingMaster | アプローチ (created in T3) |
   | M4 | SSE-T4 Buyer | SSE-T Deal D1 | CB_Target | アプローチ (created in T4) |
   | M5 | SSE-T4 Buyer | SSE-T Deal Dead | MatchingMaster | アプローチ (created in T4) |
   | M6 | SSE-T5 Parent | SSE-T Deal D1 | MatchingMaster | アプローチ |
   | M7 | SSE-T6 Buyer | SSE-T Deal D1 | MatchingMaster | マッチ終了 + AutoTerminated__c (buyer mechanism, set by script) |

   In the UI, open the buyer Account → Matching related list, and pick the row by deal name.
3. Validation rules the test data must satisfy (handled by the data script; repeat them if you edit by hand):
   - Matching__c: `status__c` required (`'-'` is fine).
   - Opportunity insert: `Website='None'` + unique `CorporateNumber__c` on the Account (duplicate rules).
   - `Required_ActivitiesByStage`: a stage change needs the **prior** value of `Check_ActivitiesByStage__c` = true.
     A flow resets it to false after every stage change, so before each **second** stage move on the same Opp,
     save `Check_ActivitiesByStage__c = true` first (UI: log an activity; CLI: separate update, see T2/T6).
   - `Required_Teaser_MatchingStage` / `Required_IM`: test Opps are created with `Check_DocUploaded_Teaser__c` and
     `Check_DocUploaded_IM__c` = true so they can move to NDA締結 / トップ面談 without uploading files.
   - Moving to 案件終了 needs `termination_reason__c` (use その他).

## 1. Create the data (re-runnable: deletes all SSE-T* records first)

```
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/sandbox_testdata_enforcement.apex | grep -E "ready|FATAL|Exception"
```
Expect `SSE test data ready. Flags ON now: 2 (expect 2: T3, T4 buyers)`.

Verify at any point (prints PASS/FAIL/SKIP per scenario; the T1/T2 block switches on SSE-T1 Own Opp's stage):
```
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/verify_enforcement.apex | grep -E "^(PASS|FAIL|SKIP|INFO|----)"
```
Right after the data script: T1 shows 10 FAIL (nothing triggered yet), T3/T4/T5 SKIP, T6 2 PASS.

## 2. Scenarios

### T1: flag ON terminates アプローチ Matchings and warns the rest
1. Open Opportunity **SSE-T1 Own Opp**, set Stage = **NDA締結**, save.
   CLI: `sf data update record -o bogdan -s Opportunity -w "Name='SSE-T1 Own Opp'" -v "StageName='NDA締結'"`
2. Open **SSE-T1 Buyer** → Matching related list → row on **SSE-T Deal D1** (M1). Check:
   - [ ] phase マッチ終了, status アプローチ>終了
   - [ ] 終了理由 リスト除外, その他終了理由 売り手として進行中のため
   - [ ] Activity timeline: 1 Task "Seller Conflict: SSE-T1 Own Opp"
3. Row on **SSE-T Deal D2** (M2): - [ ] phase still MG対応; - [ ] 1 Task "Seller Conflict: SSE-T1 Own Opp".
4. **SSE-T1 Buyer** Account timeline: - [ ] Event "Seller Conflict: SSE-T1 Own Opp".
5. Hidden markers (M1 SellSideAutoTerminated/Warned/SourceName, M2 Warned, Account SourceId/Name): run the verify
   script. - [ ] T1 block = 10 PASS.

### T2: flag OFF revives and clears
1. Save `Check_ActivitiesByStage__c = true` on SSE-T1 Own Opp, then set Stage = **案件終了** (終了理由 その他), save.
   ```
   sf data update record -o bogdan -s Opportunity -w "Name='SSE-T1 Own Opp'" -v "Check_ActivitiesByStage__c=true"
   sf data update record -o bogdan -s Opportunity -w "Name='SSE-T1 Own Opp'" -v "StageName='案件終了' termination_reason__c='その他'"
   ```
2. Check:
   - [ ] M1 phase MG対応, status 未確認, both reasons blank, SellSideAutoTerminated false, Warned false, SourceName blank
   - [ ] M2 Warned false; Tasks "Seller Conflict: SSE-T1 Own Opp" then "Seller Conflict Cleared: SSE-T1 Own Opp"
   - [ ] M1 also gets a "Seller Conflict Cleared: …" Task (it was warned too)
   - [ ] SSE-T1 Buyer: Events "Seller Conflict: …" then "Seller Conflict Cleared: …"; flag false; source fields blank
   - [ ] Verify script: T2 block = 9 PASS
   ```
   sf data query -o bogdan -q "SELECT Sell__r.Name, phase_match__c, status__c, termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c FROM Matching__c WHERE Buy_Company__r.Name = 'SSE-T1 Buyer'"
   sf data query -o bogdan -q "SELECT What.Name, Subject FROM Task WHERE WhatId IN (SELECT Id FROM Matching__c WHERE Buy_Company__r.Name = 'SSE-T1 Buyer') ORDER BY WhatId, CreatedDate"
   sf data query -o bogdan -q "SELECT Subject FROM Event WHERE What.Name = 'SSE-T1 Buyer' ORDER BY CreatedDate"
   ```

### T3: new アプローチ Matching on a flagged buyer is terminated on save
SSE-T3 Buyer is already flagged (its Opp is at 面談前 since the data script; that already created one Event).
1. On **SSE-T Deal D1**, create a Matching: buyer **SSE-T3 Buyer**, phase アプローチ, status `-`, record type MatchingMaster.
   CLI (Ids from the data script's debug line, or query them):
   `sf data create record -o bogdan -s Matching__c -v "RecordTypeId=<MatchingMaster> Sell__c=<D1 Id> Buy_Company__c=<B3 Id> phase_match__c='アプローチ' status__c='-'"`
2. Check: - [ ] the new Matching is マッチ終了 / アプローチ>終了 / リスト除外 / 売り手として進行中のため, SourceName SSE-T3 Own Opp;
   - [ ] 1 Task "Seller Conflict: SSE-T3 Own Opp" on it; - [ ] SSE-T3 Buyer now has 2 Events "Seller Conflict: SSE-T3 Own Opp".

### T4: CB_Target and dead-deal Matchings are left alone
SSE-T4 Buyer is flagged (Opp at 面談前).
1. M5: on **SSE-T Deal Dead** (stage 案件終了), create a Matching for buyer SSE-T4 Buyer at アプローチ (MatchingMaster).
2. M4: on **SSE-T Deal D1**, create a **CB_Target** Matching for buyer SSE-T4 Buyer at アプローチ.
   The System Administrator profile in `bogdan` does **not** have the CB_Target record type, so the UI, `sf data create record`
   and Apex all reject it (`Record Type ID: this ID value isn't valid for the user`). Either log in as a user whose profile has
   CB_Target, or give yourself record type visibility (temporary perm set with
   `<recordTypeVisibilities><recordType>Matching__c.CB_Target</recordType><visible>true</visible></recordTypeVisibilities>`),
   then run `sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/t4_insert_cb_target.apex`.
3. Check: - [ ] both stay at アプローチ, markers false, no memo Task; - [ ] SSE-T4 Buyer still has exactly 1 Event.

### T5: parent flagged through a subsidiary's Opp
1. Open **SSE-T5 Child Opp** (account SSE-T5 Child, parent SSE-T5 Parent), set Stage = **トップ面談**, save.
   `sf data update record -o bogdan -s Opportunity -w "Name='SSE-T5 Child Opp'" -v "StageName='トップ面談'"`
2. Check: - [ ] SSE-T5 Parent and SSE-T5 Child both flagged, source name SSE-T5 Child Opp;
   - [ ] M6 (SSE-T5 Parent on SSE-T Deal D1) terminated with SourceName **SSE-T5 Child Opp** (found via `SellSideSellerParentId__c`);
   - [ ] 1 Task on M6, 1 Event on SSE-T5 Parent (and 1 on SSE-T5 Child).

### T6: buyer-mechanism Matching is never touched
M7 was set by the data script to マッチ終了 / アプローチ>終了 / リスト除外 / 他案件進行中のため / AutoTerminated__c = true.
1. SSE-T6 Own Opp → **NDA締結** (flag ON). Then `Check_ActivitiesByStage__c = true`, then → **案件終了** / その他 (flag OFF).
2. Check: - [ ] M7 unchanged after each step (phase, status, reason 他案件進行中のため, AutoTerminated__c true,
   SellSide markers false, no Task, LastModifiedDate unchanged); - [ ] SSE-T6 Buyer gets Events "Seller Conflict: SSE-T6 Own Opp"
   and "Seller Conflict Cleared: SSE-T6 Own Opp".

## 3. Clean up
Rerunning the data script deletes and recreates everything. To only delete, run its first block (the `delete` lines).

---

## Results 2026-10-19 (bogdan)

Run by Claude (Task 3) against `bogdan`, flows at version 2 (active). Data script run 3x before testing (first run with
the brief's version; it was then extended twice for the Teaser and IM validation rules found below).

| # | Result | Evidence |
|---|---|---|
| T1 | PASS (10/10) | verify T1 block, see below |
| T2 | PASS (9/9) | verify T2 block + queries |
| T3 | PASS (4/4) | verify T3 block + queries |
| T4 | **partial**: M5 PASS, M4 NOT RUN | M4 blocked by record type visibility (CB_Target not on Admin profile); flow exclusion confirmed only statically |
| T5 | PASS (5/5) | parent-rule source found via SellSideSellerParentId__c |
| T6 | PASS (4/4) | M7 LastModifiedDate unchanged across ON and OFF |

Obstacles hit (all test-data only, no metadata changed):
- `Required_Teaser_MatchingStage` blocked リード反響 → NDA締結 ("please upload the Teaser"): data script now sets `Check_DocUploaded_Teaser__c = true`.
- `Required_ActivitiesByStage` blocked the second stage move (NDA締結 → 案件終了): the flag is reset after each stage change; set it true in a separate update first.
- `Required_IM` blocked リード反響 → トップ面談: data script now sets `Check_DocUploaded_IM__c = true` (for the run itself it was set by a separate update on SSE-T5 Child Opp).
- `DealConflict_Access` was not assigned to the running user in `bogdan`; assigned 2026-10-19 (needed for `Deal_Is_Dead__c`, `AutoTerminated__c`).
- CB_Target record type is not visible to the System Administrator profile in `bogdan`; M4 could not be created by CLI or Apex. A temporary perm set to grant it was not deployed (needs Bogdan's go).

### RED (before data existed)
```
Error (executeRuntimeFailure): System.QueryException: List has no rows for assignment to SObject
```
After the data script, before T1: T1 block 10 FAIL (e.g. `FAIL T1 M1 terminated phase/status: アプローチ/-`), T6 2 PASS, others SKIP.

### T1 (SSE-T1 Own Opp → NDA締結)
```
---- T1 (O1 stage NDA締結)
PASS T1 B1 flag ON
PASS T1 M1 terminated phase/status: マッチ終了/アプローチ>終了
PASS T1 M1 reasons
PASS T1 M1 markers
PASS T1 M1 source name = SSE-T1 Own Opp
PASS T1 M2 warned only
PASS T1 B1 source fields
PASS T1 M1 memo task
PASS T1 M2 memo task
PASS T1 B1 memo event
```
Account SSE-T1 Buyer: SellSideConflict__c true, SourceId 006BK00000QLs6XYAT, SourceName SSE-T1 Own Opp.

### T2 (SSE-T1 Own Opp → 案件終了)
```
SELL__R.NAME   PHASE   STATUS  TERM_REASON  OTHER_REASON  SSAUTO  WARNED  SOURCENAME
SSE-T Deal D1  MG対応  未確認  null         null          false   false   null
SSE-T Deal D2  MG対応  -       null         null          false   false   null
Tasks:  081028-202610 (M1)  Seller Conflict: SSE-T1 Own Opp
        081028-202610 (M1)  Seller Conflict Cleared: SSE-T1 Own Opp
        081029-202610 (M2)  Seller Conflict: SSE-T1 Own Opp
        081029-202610 (M2)  Seller Conflict Cleared: SSE-T1 Own Opp
Events on SSE-T1 Buyer: Seller Conflict: SSE-T1 Own Opp / Seller Conflict Cleared: SSE-T1 Own Opp
Account SSE-T1 Buyer: SellSideConflict__c false, SourceId null, SourceName null
---- T2 (O1 stage 案件終了)
PASS T2 B1 flag OFF
PASS T2 M1 revived phase/status: MG対応/未確認
PASS T2 M1 reasons blank: null/null
PASS T2 M1 markers false
PASS T2 M1 source name blank: null
PASS T2 M2 Warned false
PASS T2 M2 tasks: conflict + cleared
PASS T2 B1 events: conflict + cleared
PASS T2 B1 source fields blank
INFO T2 M1 tasks conflict=1 cleared=1
```

### T3 (insert M3 for flagged SSE-T3 Buyer)
```
NAME           PHASE       STATUS           TERM_REASON  OTHER_REASON              SSAUTO  WARNED  SOURCENAME
081032-202610  マッチ終了  アプローチ>終了  リスト除外   売り手として進行中のため  true    true    SSE-T3 Own Opp
Task on 081032-202610: Seller Conflict: SSE-T3 Own Opp
Events on SSE-T3 Buyer: Seller Conflict: SSE-T3 Own Opp (08:01:36, flag ON at data load) + Seller Conflict: SSE-T3 Own Opp (08:03:21, M3 insert)
PASS T3 B3 flag ON
PASS T3 M3 terminated on save: マッチ終了/アプローチ>終了/リスト除外/売り手として進行中のため/SSAuto=true/Warned=true/Src=SSE-T3 Own Opp
PASS T3 M3 memo task
PASS T3 B3 events (flag-on + M3) = 2
```

### T4 (M5 on dead deal; M4 CB_Target not created)
```
M4: sf data create record ... RecordTypeId=012RA00000A1BTVYA3 → Error: Record Type ID: this ID value isn't valid for the user
    t4_insert_cb_target.apex → DmlException INVALID_CROSS_REFERENCE_KEY (same message)
M5: 081033-202610  MatchingMaster  SSE-T Deal Dead  Deal_Is_Dead__c true  アプローチ  -  null  false  false  null
Tasks on SSE-T4 Buyer's Matchings: 0; Events on SSE-T4 Buyer: 1 (Seller Conflict: SSE-T4 Own Opp, from flag ON at load)
SKIP T4 M4 (CB_Target Matching not inserted yet; needs CB_Target record type visibility, see plan)
PASS T4 M5 (dead deal) untouched: アプローチ/-/null/null/SSAuto=false/Warned=false/Src=null
PASS T4 no memo task on M5
PASS T4 B4 events stay at 1 (flag-on only) = 1
```
Static check for M4: `Matching_AfterSave_TerminateNewOnSellSideConflict` start filter contains
`{!$Record.RecordType.DeveloperName} <> "CB_Target"`; `SellSideConflict_AutoTerminate` Get_Approach filters
`RecordTypeId <> 012RA00000A1BTVYA3`, which is the CB_Target Id in both `bogdan` and `prod` (queried 2026-10-19).

### T5 (SSE-T5 Child Opp → トップ面談)
```
Opp SSE-T5 Child Opp: トップ面談, SellSideActive__c true, SellSideSellerParentId__c 001BK000015i1usYAA (= SSE-T5 Parent Id, 18 chars)
Accounts: SSE-T5 Parent  true  006BK00000QLs6bYAD  SSE-T5 Child Opp
          SSE-T5 Child   true  006BK00000QLs6bYAD  SSE-T5 Child Opp
M6 081030-202610: マッチ終了 / アプローチ>終了 / リスト除外 / 売り手として進行中のため / true / true / SSE-T5 Child Opp
Task on M6: Seller Conflict: SSE-T5 Child Opp; Events: SSE-T5 Parent + SSE-T5 Child, each "Seller Conflict: SSE-T5 Child Opp"
PASS T5 parent flag ON
PASS T5 M6 terminated, source = child opp: マッチ終了/アプローチ>終了/リスト除外/売り手として進行中のため/SSAuto=true/Warned=true/Src=SSE-T5 Child Opp
PASS T5 parent source fields = SSE-T5 Child Opp
PASS T5 M6 memo task
PASS T5 parent memo event
```
The reviewer's question (18-char `CASESAFEID(Account.ParentId)` vs `$Record.Id`) is answered: the comparison matches.

### T6 (SSE-T6 Own Opp → NDA締結 → 案件終了)
```
M7 081031-202610 before, after ON, after OFF (identical each time):
  マッチ終了 / アプローチ>終了 / 他案件進行中のため / AutoTerminated__c true / SSAuto false / Warned false / null / LastModifiedDate 2026-10-19T08:01:38Z
SSE-T6 Buyer: flag true + SourceName SSE-T6 Own Opp after ON; false + null after OFF
Tasks on M7: 0; Events on SSE-T6 Buyer: Seller Conflict: SSE-T6 Own Opp / Seller Conflict Cleared: SSE-T6 Own Opp
---- T6 (O6 stage 案件終了, B6 flag false)
PASS T6 M7 untouched: マッチ終了/アプローチ>終了/リスト除外/他案件進行中のため/SSAuto=false/Warned=false/Src=null/AutoTerminated=true
PASS T6 no tasks on M7
PASS T6 B6 flag back OFF
PASS T6 B6 events: conflict + cleared
```

### Final verify run (state after T2–T6): 25 PASS, 0 FAIL, 1 SKIP (T4 M4); with T1 run earlier: 35 PASS, 0 FAIL in total
