# Sell-side conflict sweep (one-time)

Flows A/B/C only react when `Account.SellSideConflict__c` changes. Accounts that were already flagged before the
flows went live are swept once: each one is flipped off and on so `SellSideConflict_AutoTerminate` (A) runs for it.
`SellSideConflict_AutoReactivate` (B) must be inactive during the sweep, otherwise the "off" half would revive matchings.

Files: `backup_before_sweep.sh` (Ids only, output git-ignored), `sweep_chunk.apex` (25 accounts per run),
`report_sweep.sh` (counts), `run_sweep.sh` (B-inactive check -> chunk loop -> report). Rehearsal: `REHEARSAL_partial.md`.

Run from the repo root in Git Bash. `<org>` = `partial` for rehearsal, `prod` for the real run (Bogdan types the prod lines with `!`).

```bash
P=scripts/deploy/sell_side_conflict_enforcement
```

## 1. Backup + baseline report

```bash
bash $P/sweep/backup_before_sweep.sh <org> $P/sweep/<org>_before    # prints "matchings: N  accounts: M"
bash $P/sweep/report_sweep.sh <org>                                 # terminated/warned/source counts expected 0
```

## 2. Deactivate flow B (manual)

Get the FlowDefinition Ids:

```bash
sf data query -o <org> --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```

Note B's active version number first (`SELECT VersionNumber FROM Flow WHERE Id = '<ActiveVersionId>'` with `--use-tooling-api`),
then deactivate (path has no leading slash):

```bash
sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B FlowDefinition Id>" --body '{"Metadata":{"activeVersionNumber":0}}'
```

Re-run the FlowDefinition query: B's `ActiveVersionId` must be null; A and C must stay active.

## 3. Sweep

```bash
bash $P/sweep/run_sweep.sh <org>          # optional 2nd arg = max chunks (default 30)
```

It refuses to start (exit 3) while B is active. Each iteration prints `i: swept N, remaining: M (time)`; it sleeps 130 s
between chunks (the 2-minute `LastModifiedDate` guard), stops at `remaining: 0`, then prints the report.
Exit 4 = an Apex run failed (stop, keep the output, do not reactivate blindly; B is still off and nothing revives).
Exit 5 = max chunks reached without `remaining: 0`.

## 4. Reactivate flow B (manual)

```bash
sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B FlowDefinition Id>" --body '{"Metadata":{"activeVersionNumber":<version noted in step 2>}}'
```

In `partial` the version is 1; in `bogdan` 2; in prod use the number from step 2. Re-run the FlowDefinition query: all three active.

## 5. Report after

```bash
bash $P/sweep/report_sweep.sh <org>
```

Expect: terminated = live アプローチ rows (non-Target) in `matchings_before.csv`; warned = the other live rows;
flagged accounts with source = flagged accounts (an account without an active sell-side opp keeps a blank source = stale flag,
cleared by the nightly job; list, do not fix); last count 0.
