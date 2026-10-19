# Sell-side conflict sweep (one-time)

Flows A/B/C only react when `Account.SellSideConflict__c` changes. Accounts that were already flagged before the
flows went live are swept once: each one is flipped off and on so `SellSideConflict_AutoTerminate` (A) runs for it.
`SellSideConflict_AutoReactivate` (B) must be inactive during the sweep, otherwise the "off" half would revive matchings.

Files: `backup_before_sweep.sh` (Ids only, output git-ignored), `sweep_chunk.apex.tmpl` (anonymous Apex for one slice of
Ids, `{{IDS}}` placeholder), `run_sweep.sh` (B-inactive check -> slices of 25 Ids from the backup -> report),
`report_sweep.sh` (counts). Rehearsal: `REHEARSAL_partial.md`.

Run from the repo root in Git Bash. `<org>` = `partial` for rehearsal, `prod` for the real run (Bogdan types the prod lines with `!`).

```bash
P=scripts/deploy/sell_side_conflict_enforcement
```

## 1. Baseline report

```bash
bash $P/sweep/report_sweep.sh <org>       # terminated/warned/source counts expected 0
```

## 2. Deactivate flow B (manual)

Get the FlowDefinition Ids (A and C must already be active):

```bash
sf data query -o <org> --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```

Note B's active version number first (`SELECT VersionNumber FROM Flow WHERE Id = '<ActiveVersionId>'` with `--use-tooling-api`),
then deactivate (path has no leading slash):

```bash
sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B FlowDefinition Id>" --body '{"Metadata":{"activeVersionNumber":0}}'
```

Re-run the FlowDefinition query: B's `ActiveVersionId` must be null; A and C must stay active.

## 3. Backup (right before the sweep, with A active and B inactive)

```bash
bash $P/sweep/backup_before_sweep.sh <org> $P/sweep/<org>_before    # prints "matchings: N  accounts: M"
```

`<org>_before/accounts_flagged.csv` is the Id list the sweep works through.

## 4. Sweep

```bash
bash $P/sweep/run_sweep.sh <org> $P/sweep/<org>_before
```

Exit codes: 4 = Id file missing/empty, 3 = B is active, 2 = flow B not found, 5 = an Apex chunk failed (stop, keep
the output; B is still off so nothing revives). Each slice prints `chunk i/n: swept N`; no sleep between slices. Accounts
cleared (e.g. by the nightly job) between backup and their slice are skipped. Then the report is printed.
Temp Apex files go to `mktemp -d` and are deleted on exit.

## 5. Reactivate flow B (manual)

```bash
sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B FlowDefinition Id>" --body '{"Metadata":{"activeVersionNumber":<version noted in step 2>}}'
```

In `partial` the version is 1; in `bogdan` 2; in prod use the number from step 2. Re-run the FlowDefinition query: all three active.

## 6. Report after

```bash
bash $P/sweep/report_sweep.sh <org>
```

Expect: terminated = live アプローチ rows (non-Target) in `matchings_before.csv`; warned = the other live rows;
"flagged accounts without source" = 0 (anything else = stale flag or no source opp; list, do not fix; the nightly job
clears stale flags); last count 0. Flow A writes one account-level "Seller Conflict" Event per swept account (by design).
