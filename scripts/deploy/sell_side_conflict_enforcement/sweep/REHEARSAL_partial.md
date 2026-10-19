# Sweep rehearsal in `partial` (2026-10-19)

Run 1 below used the first, guard-driven `sweep_chunk.apex` (since replaced). Run 2 at the end is the current Id-list driven sweep.

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

# Run 2 (Id-list driven), 17:31-17:33 JST

`sweep_chunk.apex` replaced by `sweep_chunk.apex.tmpl` (`{{IDS}}`); `run_sweep.sh <org> <backup_dir>` works through
`accounts_flagged.csv` in slices of 25, no sleep. All 75 accounts already had a source, so this run simply re-fired A.

Refusal tests (B active):
```
run_sweep.sh partial sweep/nonexistent  -> REFUSED: .../accounts_flagged.csv missing or has no Ids   exit=4
run_sweep.sh partial sweep/partial_before -> 75 account Ids; REFUSED: flow B is ACTIVE (ActiveVersionId 301BK000015iWopYAE)   exit=3
```

Report before (17:31:59):
```
terminated 1 | warned 0 | with source 75 | without source 0 | memo events today 75 | live アプローチ on flagged buyer 0
```

Deactivate B: `SellSideConflict_AutoReactivate  null  1` (A 301BK000015iWoqYAE, C 301BK000015iWooYAE active).

Backup (after B off): `matchings: 0  accounts: 75` (the only matching was already マッチ終了 from Run 1).

`run_sweep.sh partial sweep/partial_before_run2` (36 s wall clock):
```
OK: flow B inactive
chunk 1/3: swept 25 (17:32:32)
chunk 2/3: swept 25 (17:32:36)
chunk 3/3: swept 25 (17:32:40)
== swept total: 75 of 75 Ids in backup
report: terminated 1 | warned 0 | with source 75 | without source 0 | memo events today 150 | live アプローチ on flagged buyer 0
exit=0
```

Reactivate B: all three active (A 301BK000015iWoqYAE, B 301BK000015iWopYAE, C 301BK000015iWooYAE).

Report after (17:33:15): identical to the in-script report (terminated 1, warned 0, 75/0, events 150, last 0).

Reconciliation: backup rows 0 -> nothing new terminated or warned (1 from Run 1 unchanged); 75 swept = 75 flagged;
+75 Events = one account-level memo per re-fired account (expected, partial only).
Temp Apex files: created under `mktemp -d`, removed on exit (no `chunk_*.apex` left in /tmp).

# Run 3 (resume path, start_chunk=3), 17:37-17:38 JST

Refusal tests (B active): missing Id file -> exit 4; CSV with one 19-char line -> "has 3 data lines but only 2 valid Ids" exit 4;
start_chunk 9 -> "start_chunk 9 > 3 chunks" exit 4; B active -> "REFUSED: flow B is ACTIVE (ActiveVersionId 301BK000015iWopYAE)" exit 3.

Report before: terminated 1 | warned 0 | with source 75 | without 0 | events today 150 | last 0.
Deactivate B -> `SellSideConflict_AutoReactivate null`. Backup `partial_before_run3`: `matchings: 0  accounts: 75`.

Fault-path test (scratch copy of the scripts with a template that does not compile; no data written), start_chunk 2:
```
chunk 2/3: FAILED
Error (executeCompileFailure): Compilation failed at Line 1 column 9 with the error:
resume with: run_sweep.sh partial scripts/deploy/sell_side_conflict_enforcement/sweep/partial_before_run3 2
(fix or remove the offending Account Id in .../partial_before_run3/accounts_flagged.csv first, keep a copy of the original; never restart from chunk 1)
== flow B is still INACTIVE — reactivate it after you resolve this (README.md step 5)
exit=5
```

Resume run `run_sweep.sh partial sweep/partial_before_run3 3`:
```
75 account Ids, 3 chunks, starting at chunk 3
OK: flow B inactive
chunk 3/3: swept 25 (17:38:16)
== swept total this run: 25 (chunks 3-3)
report: terminated 1 | warned 0 | with 75 | without 0 | events today 175 | last 0
exit=0
```
Reactivate B -> A/B/C all active. Report after (17:38:32): same as above. +25 Events = the 25 re-fired accounts of chunk 3 only
(chunks 1-2 were not repeated). No temp `chunk_*.apex` left.

Fault-path re-test after the `|| true` fix (scratch copy, template `System.debug('no sweep line here');`, no data written, B off then back on):
```
chunk 2/3: FAILED
resume with: run_sweep.sh partial scripts/deploy/sell_side_conflict_enforcement/sweep/partial_before_run3 2
(fix or remove the offending Account Id in .../partial_before_run3/accounts_flagged.csv first, keep a copy of the original; never restart from chunk 1)
== flow B is still INACTIVE — reactivate it after you resolve this (README.md step 5)
exit=5
```
