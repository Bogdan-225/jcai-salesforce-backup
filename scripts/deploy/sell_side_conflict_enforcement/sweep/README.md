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

`<org>_before/accounts_flagged.csv` is the Id list the sweep works through. `matchings_before.csv` also carries
record type and both deal stages (to derive the expected terminated/warned counts), plus deal names
(`SellSideConflictSourceName__c`) and free text (`other_termination_reason__c`): it must stay local. The folder is
git-ignored (`sweep/partial_before*/`, `sweep/prod_before/`); never commit, attach or share it.

## 4. Sweep

```bash
bash $P/sweep/run_sweep.sh <org> $P/sweep/<org>_before            # optional 3rd arg = start_chunk (default 1)
```

Each slice of 25 Ids prints `chunk i/n: swept N`; no sleep between slices. Accounts cleared (e.g. by the nightly job)
between backup and their slice are skipped. Then the report is printed. Temp Apex files go to `mktemp -d` and are
deleted on exit.

Exit codes: 4 = Id file missing/empty, a line that is not a 15/18-char Id, or bad start_chunk; 3 = B is active;
2 = flow B not found; 6 = flow A is not active; 5 = an Apex chunk failed.

On exit 5 the script prints the failed chunk and `resume with: run_sweep.sh <org> <backup_dir> <k>`, and reminds you
that flow B is still INACTIVE (nothing revives while it is off).
If the chunk output shows `UNABLE_TO_LOCK_ROW` (someone was editing one of the records), simply rerun the printed resume line unchanged; do not remove the Id. The steps below are for validation errors:
1. Copy `accounts_flagged.csv` to `accounts_flagged.orig.csv` (keep the original).
2. Fix the offending Account (from the error lines) or remove its Id from `accounts_flagged.csv`.
   Remove only Ids in chunk k or later (removal shifts later Ids up by one; chunk k still starts at the same position, so earlier
   chunks are not repeated).
3. Resume with the printed command. Never restart from chunk 1: flow A would re-fire on already-swept accounts and
   duplicate their memo Events.
4. Only after the sweep finishes (or you decide to stop), reactivate B (step 5).
5. An Id you removed is flipped later by hand, with B active (after step 5): create a one-Id file from the template and run it, e.g.
```bash
! sed "s/{{IDS}}/'<AccountId>'/" scripts/deploy/sell_side_conflict_enforcement/sweep/sweep_chunk.apex.tmpl > /tmp/flip_one.apex && sf apex run -o <org> --file /tmp/flip_one.apex
```
   Expected effect: A fires for that account; B then does nothing for it because the flag ends true.

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
