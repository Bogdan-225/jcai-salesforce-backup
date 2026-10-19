# Sweep rehearsal in `partial` (2026-10-19)

Ids and counts only. Runner: Bogdan's admin user in `partial` (Admin profile; reads the hidden fields via Task 1's Admin FLS).

## Preconditions (Tasks 1-2 deployed to partial)

| Package | Deploy Id | Result |
|---|---|---|
| fields (6) | 0AfBK00000CyNe00AF | Succeeded 6/6 |
| labels (en_US) | 0AfBK00000Cyfm90AB | Succeeded 3/3 |
| access (Admin profile) | 0AfBK00000CydkM0AR | Succeeded 1/1 |
| access_partial (perm set DealConflict_Access, +30/-0 vs fresh retrieve) | 0AfBK00000Cyfvp0AB | Succeeded 1/1 |
| flows/out (3 flows, Draft) | 0AfBK00000CyfxR0AR | Succeeded 3/3 |

Flows activated with the Tooling PATCH (activeVersionNumber 1):

| FlowDefinition Id | DeveloperName | ActiveVersionId |
|---|---|---|
| 300BK00000YHuLbYAL | SellSideConflict_AutoTerminate (A) | 301BK000015iWoqYAE |
| 300BK00000YHuLaYAL | SellSideConflict_AutoReactivate (B) | 301BK000015iWopYAE |
| 300BK00000YHuLZYA1 | Matching_AfterSave_TerminateNewOnSellSideConflict (C) | 301BK000015iWooYAE |

## 1. Backup (17:20 JST)

```
matchings: 1  accounts: 75
```
(75 flagged, not 74 as the brief assumed.) The single row: `a00RA00001f7iQuYAI`, phase アプローチ, status `-`, record type
MatchingMaster, Deal_Is_Dead__c false, markers all blank. 75 Opportunities had SellSideActive__c = true before the sweep.

## 2. Report before

```
terminated 0 | warned 0 | flagged with source 0 / without 75 | memo events today 0 | live アプローチ on flagged buyer 1
```

## 3. Refusal test (B still active)

```
== check: SellSideConflict_AutoReactivate must be inactive in partial
FlowDefinition Id,ActiveVersionId: 300BK00000YHuLaYAL,301BK000015iWopYAE
REFUSED: flow B is ACTIVE (ActiveVersionId 301BK000015iWopYAE); deactivate it first (README.md step 2)
exit=3
```

## 4. Deactivate B (PATCH activeVersionNumber 0)

```
Matching_AfterSave_TerminateNewOnSellSideConflict  301BK000015iWooYAE  1
SellSideConflict_AutoReactivate                    null                1
SellSideConflict_AutoTerminate                     301BK000015iWoqYAE  1
```

## 5. `run_sweep.sh partial`

```
OK: flow B inactive
1: swept 25, remaining: 50 (17:22:48)
2: swept 25, remaining: 25 (17:25:14)
3: swept 25, remaining: 0 (17:27:28)
== report after sweep
terminated 1 | warned 0 | flagged with source 75 / without 0 | memo events today 75 | live アプローチ on flagged buyer 0
exit=0
```

## 6. Reactivate B (PATCH activeVersionNumber 1)

```
Matching_AfterSave_TerminateNewOnSellSideConflict  301BK000015iWooYAE  1
SellSideConflict_AutoReactivate                    301BK000015iWopYAE  1
SellSideConflict_AutoTerminate                     301BK000015iWoqYAE  1
```

## 7. Report after

```
terminated 1 | warned 0 | flagged with source 75 / without 0 | memo events today 75 | live アプローチ on flagged buyer 0
```

## Per-matching outcome

| Matching Id | Phase before | Outcome | After |
|---|---|---|---|
| a00RA00001f7iQuYAI | アプローチ (MatchingMaster, live deal) | terminated | マッチ終了 / アプローチ>終了 / リスト除外 / 売り手として進行中のため; SellSideAutoTerminated__c = true, SellSideConflictWarned__c = true; 1 Task created on it |

Warned: none (no other live rows in the backup).

## Reconciliation

- terminated (1) + warned (0) + untouched (0) = backup rows (1).
- terminated = backup rows with phase アプローチ, non-Target record type, live deal = 1.
- flagged accounts with source stored = 75 = flagged accounts; stale flag, no source: none.
- Memo events: 75 = one account-level Event per flagged account (flow A's `Get_SourceOpp -> Create_Account_Event`
  runs for every account it fires on, whether or not it touched any matching). In prod this means one memo per flagged
  seller (~337) on sweep day.
- Flow B re-enabled after the sweep did not revive anything (terminated count unchanged).
