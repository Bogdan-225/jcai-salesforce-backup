# Sell-Side Conflict Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Account.SellSideConflict__c` enforce like Sato's buyer flag: auto-terminate a flagged seller's アプローチ Matchings as a buyer, warn its other live Matchings, revive on flag drop, terminate new アプローチ Matchings on save.

**Architecture:** Three new record-triggered flows generated from Sato's three buyer-side flow XML files by a deterministic Node transform (rename, re-key on `SellSideConflict__c`, swap the "source" lookup from Matching to the seller's Opportunity, seller-specific marker fields and memo texts). Six new hidden fields. One-time sweep script that flips the flag off/on per account so the terminate flow runs for the 338 accounts already flagged. Sandbox `bogdan` for build + manual tests, `partial` for the sweep rehearsal, prod via a runbook Bogdan runs line by line with `!`.

**Tech Stack:** Salesforce Metadata API via `sf` CLI 2.147 (source format), Flow XML (apiVersion 60.0 like the originals), anonymous Apex, Node 24 for the transform/build scripts, Git Bash.

**Spec:** `docs/superpowers/specs/2026-10-19-sell-side-conflict-enforcement-design.md` — read it first; §2 documents the buyer-side flows being mirrored.

## Global Constraints

- Mirror Sato's build. Do not modify any of his flows or fields (`DealConflict_AutoTerminate`, `DealConflict_AutoReactivate`, `Matching_AfterSave_TerminateNewOnConflict`, `AutoTerminated__c`, `ConflictSourceName__c`, `DealConflictWarned__c`, `ConflictSourceId__c`).
- Source copies of Sato's flows: `scratch_dc/full/unpackaged/unpackaged/flows/*.flow` (prod, unchanged since 2026-07-07). Never edit those files; generate ours from them.
- Org aliases: `bogdan` (dev sandbox, no data), `partial` (sandbox with data), `prod`. **Never deploy to or write data in `prod` from a script or tool call.** Prod lines go in the runbook for Bogdan to run with `!`.
- Sandbox deploys: `sf project deploy start -o bogdan --source-dir <dir> --wait 10` from the repo root `G:/My Drive/Claude_projects/Salesforce/jcai-salesforce`. Never `deploy validate`, never `RunLocalTests`.
- Flows deploy as `<status>Draft</status>` and are activated by Tooling PATCH: `sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<300 id>" --body '{"Metadata":{"activeVersionNumber":<n>}}'` (relative URL, no leading slash).
- Field labels: Japanese master label in the field file, English in a **partial** `CustomObjectTranslation` file (partial translation files merge on deploy; they do not wipe other entries).
- New fields get FLS only on perm set `DealConflict_Access` and the System Administrator profile (`Admin`). Perm set deploys replace the whole file: retrieve from the target org first, edit, deploy. Profile deploys are partial: a profile file containing only the new entries.
- Memo texts: Task/Event subject `Seller Conflict: {deal name}` / `Seller Conflict Cleared: {deal name}`, Matching `other_termination_reason__c` = `売り手として進行中のため`.
- Every package lives under `scripts/deploy/sell_side_conflict_enforcement/`. Commit after each task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Use `git -c core.safecrlf=false commit` (Drive folder emits CRLF warnings).
- Account names from prod never go into committed files (Ids only).

---

## File structure

```
scripts/deploy/sell_side_conflict_enforcement/
  fields/objects/Account/fields/SellSideConflictSourceId__c.field-meta.xml
  fields/objects/Account/fields/SellSideConflictSourceName__c.field-meta.xml
  fields/objects/Matching__c/fields/SellSideAutoTerminated__c.field-meta.xml
  fields/objects/Matching__c/fields/SellSideConflictWarned__c.field-meta.xml
  fields/objects/Matching__c/fields/SellSideConflictSourceName__c.field-meta.xml
  fields/objects/Opportunity/fields/SellSideSellerParentId__c.field-meta.xml
  labels/objectTranslations/Account-en_US/Account-en_US.objectTranslation-meta.xml        (partial)
  labels/objectTranslations/Matching__c-en_US/Matching__c-en_US.objectTranslation-meta.xml (partial)
  labels/objectTranslations/Opportunity-en_US/Opportunity-en_US.objectTranslation-meta.xml (partial)
  access/profiles/Admin.profile-meta.xml                                                  (partial)
  access/permissionsets/DealConflict_Access.permissionset-meta.xml                        (whole file, per org: access_bogdan/, access_prod/ built from retrieves)
  flows/build_flows.js                 transform Sato's XML -> ours
  flows/out/flows/SellSideConflict_AutoTerminate.flow-meta.xml
  flows/out/flows/SellSideConflict_AutoReactivate.flow-meta.xml
  flows/out/flows/Matching_AfterSave_TerminateNewOnSellSideConflict.flow-meta.xml
  test/sandbox_testdata_enforcement.apex   creates SSE-T* records in bogdan
  test/verify_enforcement.apex             asserts expected end state (run after the manual steps)
  test/SANDBOX_TEST_PLAN.md
  sweep/backup_before_sweep.sh             Ids-only CSV of affected Matchings + flagged accounts
  sweep/sweep_chunk.apex                   flips 25 flagged accounts off/on
  sweep/report_sweep.sh                    counts terminated / warned / events
  prod/README.md                           runbook
  prod/snapshot_before/                    perm set retrieve from prod (whole-file component)
  prod/revert/                             flow deactivation + restore script
```

---

### Task 1: Fields, English labels, access (deploy to `bogdan`)

**Files:**
- Create: the six field files, three partial translation files, `access/profiles/Admin.profile-meta.xml`, `access_bogdan/permissionsets/DealConflict_Access.permissionset-meta.xml`
- Test: SOQL from the admin user in `bogdan`

**Interfaces:**
- Produces field API names used by every later task: `Matching__c.SellSideAutoTerminated__c`, `Matching__c.SellSideConflictWarned__c`, `Matching__c.SellSideConflictSourceName__c`, `Account.SellSideConflictSourceId__c`, `Account.SellSideConflictSourceName__c`, `Opportunity.SellSideSellerParentId__c`.

- [ ] **Step 1: Write the verification query first (it must fail now)**

Run:
```bash
cd "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce"
sf data query -o bogdan -q "SELECT Id, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c FROM Matching__c LIMIT 1"
sf data query -o bogdan -q "SELECT Id, SellSideConflictSourceId__c, SellSideConflictSourceName__c FROM Account LIMIT 1"
sf data query -o bogdan -q "SELECT Id, SellSideSellerParentId__c FROM Opportunity LIMIT 1"
```
Expected: all three fail with `No such column`.

- [ ] **Step 2: Create the six field files**

`fields/objects/Matching__c/fields/SellSideAutoTerminated__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideAutoTerminated__c</fullName>
    <defaultValue>false</defaultValue>
    <description>進行中売り手フラグ(Account.SellSideConflict__c)により自動終了されたマッチングの内部マーカー。フロー SellSideConflict_AutoTerminate が設定し、SellSideConflict_AutoReactivate が解除。買い手側の AutoTerminated__c とは独立。</description>
    <externalId>false</externalId>
    <inlineHelpText>売り手重複により自動終了されたことを示す内部項目。自動設定・編集不可。</inlineHelpText>
    <label>売り手重複_自動終了(内部制御)</label>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Checkbox</type>
</CustomField>
```

`fields/objects/Matching__c/fields/SellSideConflictWarned__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideConflictWarned__c</fullName>
    <defaultValue>false</defaultValue>
    <description>買い手が進行中売り手になった際にメモ(ToDo)で警告済みであることを示す内部マーカー。SellSideConflict_AutoTerminate が設定、SellSideConflict_AutoReactivate が解除。</description>
    <externalId>false</externalId>
    <inlineHelpText>売り手重複の警告メモ作成済みを示す内部項目。自動設定・編集不可。</inlineHelpText>
    <label>売り手重複_警告済み(内部)</label>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Checkbox</type>
</CustomField>
```

`fields/objects/Matching__c/fields/SellSideConflictSourceName__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideConflictSourceName__c</fullName>
    <description>自動終了時点の売り手側案件(商談)名。SellSideConflict_AutoTerminate / Matching_AfterSave_TerminateNewOnSellSideConflict が設定。</description>
    <externalId>false</externalId>
    <inlineHelpText>売り手重複の元となった売り手側案件名。自動設定・編集不可。</inlineHelpText>
    <label>売り手重複元案件名(内部)</label>
    <length>255</length>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

`fields/objects/Account/fields/SellSideConflictSourceId__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideConflictSourceId__c</fullName>
    <description>進行中売り手フラグがONになった時点の売り手側案件(商談)ID。SellSideConflict_AutoTerminate が設定、SellSideConflict_AutoReactivate が解除。</description>
    <externalId>false</externalId>
    <inlineHelpText>売り手重複の元となった案件のID。自動設定・編集不可。</inlineHelpText>
    <label>売り手重複元案件ID(内部)</label>
    <length>18</length>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

`fields/objects/Account/fields/SellSideConflictSourceName__c.field-meta.xml`: same as the Account Id file with `fullName` `SellSideConflictSourceName__c`, label `売り手重複元案件名(内部)`, length `255`, description `進行中売り手フラグがONになった時点の売り手側案件(商談)名。解除時のメモに使用。`, help `売り手重複の元となった案件名。自動設定・編集不可。`.

`fields/objects/Opportunity/fields/SellSideSellerParentId__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideSellerParentId__c</fullName>
    <description>売り手取引先の親取引先ID(Account.ParentId)。フローの Get Records で親会社がフラグONの場合に子会社の案件を検索するために使用(フローは関連項目で絞り込めないため)。</description>
    <externalId>false</externalId>
    <formula>CASESAFEID(Account.ParentId)</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <inlineHelpText>売り手の親取引先ID。自動計算。</inlineHelpText>
    <label>売り手親取引先ID(自動)</label>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 3: Create the three partial translation files**

`labels/objectTranslations/Matching__c-en_US/Matching__c-en_US.objectTranslation-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <help>Internal marker: this Matching was auto-terminated because the buyer is an active seller elsewhere. Set automatically, do not edit.</help>
        <label>Seller Conflict Auto-Terminated (internal)</label>
        <name>SellSideAutoTerminated__c</name>
    </fields>
    <fields>
        <help>Internal marker: a Seller Conflict memo task was created on this Matching. Set automatically, do not edit.</help>
        <label>Seller Conflict Warned (internal)</label>
        <name>SellSideConflictWarned__c</name>
    </fields>
    <fields>
        <help>Name of the buyer's own sell-side project at the time of auto-termination. Set automatically.</help>
        <label>Seller Conflict Source Deal (internal)</label>
        <name>SellSideConflictSourceName__c</name>
    </fields>
</CustomObjectTranslation>
```

`labels/objectTranslations/Account-en_US/Account-en_US.objectTranslation-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <help>Id of the sell-side project that turned the Seller Conflict flag on. Set automatically.</help>
        <label>Seller Conflict Source Deal Id (internal)</label>
        <name>SellSideConflictSourceId__c</name>
    </fields>
    <fields>
        <help>Name of the sell-side project that turned the Seller Conflict flag on; used by the "cleared" memo. Set automatically.</help>
        <label>Seller Conflict Source Deal (internal)</label>
        <name>SellSideConflictSourceName__c</name>
    </fields>
</CustomObjectTranslation>
```

`labels/objectTranslations/Opportunity-en_US/Opportunity-en_US.objectTranslation-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <help>Parent account Id of the seller (Account.ParentId); lets flows find a subsidiary's project when the parent is flagged. Auto-calculated.</help>
        <label>Seller Parent Account Id (auto)</label>
        <name>SellSideSellerParentId__c</name>
    </fields>
</CustomObjectTranslation>
```

- [ ] **Step 4: Create the partial Admin profile and the per-org perm set**

`access/profiles/Admin.profile-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflictSourceId__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflictSourceName__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideAutoTerminated__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideConflictWarned__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideConflictSourceName__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideSellerParentId__c</field>
        <readable>true</readable>
    </fieldPermissions>
</Profile>
```

Perm set (whole file, must come from the target org). For `bogdan`:
```bash
cd "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce"
sf project retrieve start -o bogdan --metadata PermissionSet:DealConflict_Access --target-metadata-dir scripts/deploy/sell_side_conflict_enforcement/access_bogdan/retrieve --unzip --wait 10
mkdir -p scripts/deploy/sell_side_conflict_enforcement/access_bogdan/permissionsets
cp scripts/deploy/sell_side_conflict_enforcement/access_bogdan/retrieve/unpackaged/unpackaged/permissionsets/DealConflict_Access.permissionset scripts/deploy/sell_side_conflict_enforcement/access_bogdan/permissionsets/DealConflict_Access.permissionset-meta.xml
```
Then insert these six blocks into the copied file, each in alphabetical position among the existing `<fieldPermissions>` entries (the file is sorted by `<field>`; keep it sorted):
```xml
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflictSourceId__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflictSourceName__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideAutoTerminated__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideConflictSourceName__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Matching__c.SellSideConflictWarned__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideSellerParentId__c</field>
        <readable>true</readable>
    </fieldPermissions>
```
Check with `git diff --no-index retrieve/.../DealConflict_Access.permissionset permissionsets/DealConflict_Access.permissionset-meta.xml`: exactly 30 added lines, 0 removed. Add `access_bogdan/retrieve/` to `.gitignore` (it is a scratch retrieve).

- [ ] **Step 5: Deploy to bogdan in order and verify**

```bash
cd "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce"
P=scripts/deploy/sell_side_conflict_enforcement
sf project deploy start -o bogdan --source-dir $P/fields --wait 10
sf project deploy start -o bogdan --source-dir $P/labels --wait 10
sf project deploy start -o bogdan --source-dir $P/access --wait 10
sf project deploy start -o bogdan --source-dir $P/access_bogdan --wait 10
```
Expected: each `Succeeded`, 6 / 3 / 1 / 1 components. Rerun the three Step 1 queries: all succeed now. Then:
```bash
sf data query -o bogdan -q "SELECT Parent.Name, Parent.Profile.Name, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE Field IN ('Matching__c.SellSideAutoTerminated__c','Matching__c.SellSideConflictWarned__c','Matching__c.SellSideConflictSourceName__c','Account.SellSideConflictSourceId__c','Account.SellSideConflictSourceName__c','Opportunity.SellSideSellerParentId__c') ORDER BY Field, Parent.Name"
```
Expected: 12 rows (6 fields × {DealConflict_Access, System Administrator}), all `PermissionsRead true`, `PermissionsEdit false`.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy/sell_side_conflict_enforcement .gitignore
git -c core.safecrlf=false commit -m "Sell-side conflict enforcement: 6 internal fields + en_US + FLS (perm set DealConflict_Access + Admin), deployed to bogdan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Flow transform script and the three generated flows (deploy to `bogdan`, activate)

**Files:**
- Create: `flows/build_flows.js`, generated `flows/out/flows/*.flow-meta.xml`
- Source (read only): `scratch_dc/full/unpackaged/unpackaged/flows/DealConflict_AutoTerminate.flow`, `DealConflict_AutoReactivate.flow`, `Matching_AfterSave_TerminateNewOnConflict.flow`

**Interfaces:**
- Consumes Task 1 field names.
- Produces flow API names `SellSideConflict_AutoTerminate`, `SellSideConflict_AutoReactivate`, `Matching_AfterSave_TerminateNewOnSellSideConflict`, and the Get Records element name `Get_SourceOpp` (fields `Id`, `Name`).

- [ ] **Step 1: Write the structural assertions first (`flows/check_flows.js`)**

```js
// flows/check_flows.js — asserts the generated flows against the spec. Exit 1 on any failure.
const fs = require('fs');
const dir = __dirname + '/out/flows/';
const must = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); };
const read = f => fs.readFileSync(dir + f, 'utf8');

const A = read('SellSideConflict_AutoTerminate.flow-meta.xml');
const B = read('SellSideConflict_AutoReactivate.flow-meta.xml');
const C = read('Matching_AfterSave_TerminateNewOnSellSideConflict.flow-meta.xml');

for (const [n, s] of [['A', A], ['B', B], ['C', C]]) {
  must(s.includes('<status>Draft</status>'), n + ' ships Draft');
  must(!/DealConflict__c|AutoTerminated__c(?!.*SellSide)|DealConflictWarned__c|Is_DealConflictSource__c|Deal_Is_TopStage__c|DealName__c/.test(s.replace(/SellSide\w+__c/g, '')), n + ' has no leftover buyer-side field tokens');
  must(!s.includes('Get_ConflictSrc') && !s.includes('ConflictSrcId'), n + ' has no leftover source-matching references');
  must(!s.includes('他案件進行中のため') && !s.includes('Deal Conflict'), n + ' has no leftover buyer-side texts');
  must(!s.includes('<name>ConflictSourceId__c</name>') && !s.includes('<field>ConflictSourceId__c</field>') && !s.includes('<field>ConflictSourceName__c</field>') && !s.includes('.ConflictSourceName__c'), n + ' uses only SellSide* source fields');
}
must(A.includes('ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = TRUE'), 'A entry formula');
must(B.includes('ISCHANGED({!$Record.SellSideConflict__c}), {!$Record.SellSideConflict__c} = FALSE'), 'B entry formula');
must(C.includes('{!$Record.Buy_Company__r.SellSideConflict__c} = TRUE'), 'C entry formula');
must((A.match(/<name>Get_SourceOpp<\/name>/g) || []).length === 1 && A.includes('<object>Opportunity</object>') && A.includes('<field>SellSideSellerParentId__c</field>'), 'A source lookup is the Opportunity lookup');
must((C.match(/<name>Get_SourceOpp<\/name>/g) || []).length === 1 && C.includes('<object>Opportunity</object>'), 'C source lookup is the Opportunity lookup');
must(A.includes('売り手として進行中のため') && C.includes('売り手として進行中のため'), 'termination text');
must(A.includes('Seller Conflict: ') && B.includes('Seller Conflict Cleared: ') && C.includes('Seller Conflict: '), 'memo subjects');
must(A.includes('<field>SellSideConflictWarned__c</field>') && (A.match(/SellSideConflictWarned__c/g) || []).length >= 4, 'A survivors keyed on SellSideConflictWarned__c');
must(!A.includes('Is_DealConflictSource__c'), 'A survivors no longer exclude a source Matching');
must(B.includes('<field>SellSideAutoTerminated__c</field>'), 'B revives on SellSideAutoTerminated__c');
must(A.includes('<label>SellSideConflict AutoTerminate</label>') && B.includes('<label>SellSideConflict AutoReactivate</label>') && C.includes('<label>Matching AfterSave Terminate New On SellSideConflict</label>'), 'labels');
// the Account-side field names collide with the Matching-side ones on purpose (same API name on both objects)
must(A.includes('<field>SellSideConflictSourceId__c</field>') && B.includes('$Record.SellSideConflictSourceId__c'), 'Account source fields');
```
Run `node scripts/deploy/sell_side_conflict_enforcement/flows/check_flows.js` → expected: fails (no out/ dir yet).

- [ ] **Step 2: Write `flows/build_flows.js`**

```js
// flows/build_flows.js — generates the three seller-side flows from Sato's buyer-side flow XML.
// Usage: node build_flows.js   (reads scratch_dc/full/..., writes ./out/flows/)
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '../../../../scratch_dc/full/unpackaged/unpackaged/flows');
const OUT = path.resolve(__dirname, 'out/flows');
fs.mkdirSync(OUT, { recursive: true });

function removeBlock(xml, tag, mustContain) {
  // remove every <tag>...</tag> block (non-nested) that contains mustContain
  const re = new RegExp('\\n?[ \\t]*<' + tag + '>[\\s\\S]*?</' + tag + '>', 'g');
  return xml.replace(re, m => (m.includes(mustContain) ? '' : m));
}
function replaceBlock(xml, tag, mustContain, replacement) {
  const re = new RegExp('[ \\t]*<' + tag + '>[\\s\\S]*?</' + tag + '>', 'g');
  let hits = 0;
  const out = xml.replace(re, m => (m.includes(mustContain) ? (hits++, replacement) : m));
  if (hits !== 1) throw new Error('expected exactly 1 ' + tag + ' block containing ' + mustContain + ', got ' + hits);
  return out;
}
function must1(xml, needle) { const n = xml.split(needle).length - 1; if (n < 1) throw new Error('missing: ' + needle); }

// Opportunity lookup replacing Sato's "Get_ConflictSrc" (source Matching). keyRef = $Record.Id (Account flows) or $Record.Buy_Company__c (Matching flow)
const sourceOpp = (keyRef, next) => `    <recordLookups>
        <name>Get_SourceOpp</name>
        <label>Get Source Opportunity (seller's active deal)</label>
        <locationX>176</locationX>
        <locationY>134</locationY>
        <assignNullValuesIfNoRecordsFound>false</assignNullValuesIfNoRecordsFound>
        <connector>
            <targetReference>${next}</targetReference>
        </connector>
        <filterLogic>1 AND (2 OR 3)</filterLogic>
        <filters>
            <field>SellSideActive__c</field>
            <operator>EqualTo</operator>
            <value>
                <booleanValue>true</booleanValue>
            </value>
        </filters>
        <filters>
            <field>AccountId</field>
            <operator>EqualTo</operator>
            <value>
                <elementReference>${keyRef}</elementReference>
            </value>
        </filters>
        <filters>
            <field>SellSideSellerParentId__c</field>
            <operator>EqualTo</operator>
            <value>
                <elementReference>${keyRef}</elementReference>
            </value>
        </filters>
        <getFirstRecordOnly>true</getFirstRecordOnly>
        <object>Opportunity</object>
        <queriedFields>Id</queriedFields>
        <queriedFields>Name</queriedFields>
        <sortField>SellSideBaseDate__c</sortField>
        <sortOrder>Desc</sortOrder>
        <storeOutputAutomatically>true</storeOutputAutomatically>
    </recordLookups>`;

const common = xml => xml
  // flag + marker fields (Account ConflictSourceId/Name and Matching ConflictSourceName share the SellSide* names on purpose)
  .replace(/\$Record\.DealConflict__c/g, '$Record.SellSideConflict__c')
  .replace(/Buy_Company__r\.DealConflict__c/g, 'Buy_Company__r.SellSideConflict__c')
  .replace(/\bAutoTerminated__c\b/g, 'SellSideAutoTerminated__c')
  .replace(/\bDealConflictWarned__c\b/g, 'SellSideConflictWarned__c')
  .replace(/\bConflictSourceName__c\b/g, 'SellSideConflictSourceName__c')
  .replace(/\bConflictSourceId__c\b/g, 'SellSideConflictSourceId__c')
  // source references: Sato's Get_ConflictSrc.DealName__c / formula ConflictSrcId -> our lookup
  .replace(/\{!Get_ConflictSrc\.DealName__c\}/g, '{!Get_SourceOpp.Name}')
  .replace(/<elementReference>Get_ConflictSrc\.DealName__c<\/elementReference>/g, '<elementReference>Get_SourceOpp.Name</elementReference>')
  .replace(/\{!ConflictSrcId\}/g, '{!Get_SourceOpp.Id}')
  .replace(/<elementReference>ConflictSrcId<\/elementReference>/g, '<elementReference>Get_SourceOpp.Id</elementReference>')
  // texts
  .replace(/他案件進行中のため/g, '売り手として進行中のため')
  .replace(/Deal Conflict Cleared: /g, 'Seller Conflict Cleared: ')
  .replace(/Deal Conflict: /g, 'Seller Conflict: ')
  // ship inactive
  .replace(/<status>Active<\/status>/, '<status>Draft</status>');

function buildA() {
  let x = fs.readFileSync(path.join(SRC, 'DealConflict_AutoTerminate.flow'), 'utf8');
  must1(x, '<name>Get_ConflictSrc</name>'); must1(x, '<name>ConflictSrcId</name>');
  x = replaceBlock(x, 'recordLookups', '<name>Get_ConflictSrc</name>', sourceOpp('$Record.Id', 'Create_Account_Event'));
  x = removeBlock(x, 'formulas', '<name>ConflictSrcId</name>');
  // survivors: drop the "not the source Matching" filter (seller source is an Opportunity), add "not yet warned"
  const srcFilter = /[ \t]*<filters>\s*<field>Is_DealConflictSource__c<\/field>\s*<operator>EqualTo<\/operator>\s*<value>\s*<booleanValue>false<\/booleanValue>\s*<\/value>\s*<\/filters>\n?/g;
  const n = (x.match(srcFilter) || []).length; if (n !== 2) throw new Error('expected 2 Is_DealConflictSource__c filters, got ' + n);
  x = x.replace(srcFilter, `        <filters>
            <field>SellSideConflictWarned__c</field>
            <operator>EqualTo</operator>
            <value>
                <booleanValue>false</booleanValue>
            </value>
        </filters>
`);
  x = common(x)
    .replace(/<label>DealConflict AutoTerminate<\/label>/, '<label>SellSideConflict AutoTerminate</label>')
    .replace(/<interviewLabel>DealConflict AutoTerminate /, '<interviewLabel>SellSideConflict AutoTerminate ')
    .replace(/<description>[\s\S]*?<\/description>/, '<description>買い手(譲受希望会社)が進行中売り手(Account.SellSideConflict__c)になった時、その買い手の生きている「アプローチ」マッチングを自動終了(マッチ終了/アプローチ&gt;終了/リスト除外/売り手として進行中のため)し、それ以外の生きているマッチングには警告メモを作成する。Sato作 DealConflict_AutoTerminate のミラー(2026-10-19)。</description>');
  fs.writeFileSync(path.join(OUT, 'SellSideConflict_AutoTerminate.flow-meta.xml'), x);
}
function buildB() {
  let x = fs.readFileSync(path.join(SRC, 'DealConflict_AutoReactivate.flow'), 'utf8');
  x = common(x)
    .replace(/<label>DealConflict AutoReactivate<\/label>/, '<label>SellSideConflict AutoReactivate</label>')
    .replace(/<interviewLabel>DealConflict AutoReactivate /, '<interviewLabel>SellSideConflict AutoReactivate ')
    .replace(/<description>[\s\S]*?<\/description>/, '<description>買い手の進行中売り手フラグ(Account.SellSideConflict__c)がtrue→falseになった時、売り手重複で自動終了したマッチング(SellSideAutoTerminated__c)を MG対応/未確認 に戻し、警告済みマッチングに解消メモを作成する。Sato作 DealConflict_AutoReactivate のミラー(2026-10-19)。</description>');
  fs.writeFileSync(path.join(OUT, 'SellSideConflict_AutoReactivate.flow-meta.xml'), x);
}
function buildC() {
  let x = fs.readFileSync(path.join(SRC, 'Matching_AfterSave_TerminateNewOnConflict.flow'), 'utf8');
  must1(x, '<name>Get_ConflictSrc</name>');
  x = replaceBlock(x, 'recordLookups', '<name>Get_ConflictSrc</name>', sourceOpp('$Record.Buy_Company__c', 'Terminate_Self'));
  x = removeBlock(x, 'formulas', '<name>ConflictSrcId</name>');
  x = common(x)
    .replace(/<label>Matching AfterSave Terminate New On Conflict<\/label>/, '<label>Matching AfterSave Terminate New On SellSideConflict</label>')
    .replace(/<interviewLabel>Matching AfterSave Terminate New On Conflict /, '<interviewLabel>Matching AfterSave Terminate New On SellSideConflict ')
    .replace(/<description>[\s\S]*?<\/description>/, '<description>新規マッチングがアプローチ段階で、買い手が既に進行中売り手(Account.SellSideConflict__c)の時、そのマッチングを自動終了する。Sato作 Matching_AfterSave_TerminateNewOnConflict のミラー(2026-10-19)。</description>');
  fs.writeFileSync(path.join(OUT, 'Matching_AfterSave_TerminateNewOnSellSideConflict.flow-meta.xml'), x);
}
buildA(); buildB(); buildC();
console.log('written to ' + OUT);
```

Before running, confirm the element names used above exist in the sources (they were verified 2026-10-19: `Create_Account_Event`, `Terminate_Self`, `Get_ConflictSrc`, `ConflictSrcId`, two `Is_DealConflictSource__c` filters in `Get_Survivors` and `Update_Survivors_Warned`). The script throws if a count is off.

- [ ] **Step 3: Run build and checks**

```bash
cd "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce"
node scripts/deploy/sell_side_conflict_enforcement/flows/build_flows.js
node scripts/deploy/sell_side_conflict_enforcement/flows/check_flows.js
```
Expected: all `ok:` lines, exit 0. Then eyeball the diff of A against its source to make sure nothing unexpected changed:
```bash
git diff --no-index scratch_dc/full/unpackaged/unpackaged/flows/DealConflict_AutoTerminate.flow scripts/deploy/sell_side_conflict_enforcement/flows/out/flows/SellSideConflict_AutoTerminate.flow-meta.xml | grep -E "^[-+]" | grep -vE "^(\+\+\+|---)"
```
Expected changed lines only: labels/description/interviewLabel, filterFormula, the lookup block, the formula block removed, the two survivor filters, field names, memo texts, status. Same for B and C.

- [ ] **Step 4: Deploy to bogdan (Draft) and activate**

Create `flows/out/.forceignore`? Not needed: deploy the folder directly.
```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict_enforcement/flows/out --wait 10
sf data query -o bogdan --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```
Expected: 3 rows, ActiveVersionId null, version 1. Activate each:
```bash
sf api request rest -o bogdan --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<Id>" --body '{"Metadata":{"activeVersionNumber":1}}'
```
Re-run the query: ActiveVersionId set on all 3. A deploy error about a missing field means Task 1 was not deployed to this org; an error "field not filterable" on `SellSideSellerParentId__c` means the formula type is not Text, fix Task 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/sell_side_conflict_enforcement/flows
git -c core.safecrlf=false commit -m "Sell-side conflict enforcement: build_flows.js transform + 3 generated flows (mirror of Sato's buyer-side flows), active in bogdan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Sandbox test data, verification script, manual test plan (run in `bogdan`)

**Files:**
- Create: `test/sandbox_testdata_enforcement.apex`, `test/verify_enforcement.apex`, `test/SANDBOX_TEST_PLAN.md`
- Reference: `scripts/deploy/sell_side_conflict/sandbox_testdata.apex` (helper style; account needs `Website='None'` and a unique `CorporateNumber__c` to pass duplicate/validation rules; Opportunity needs `Check_ActivitiesByStage__c = true`).

**Interfaces:**
- Consumes the three flows from Task 2 and the recalculator `SellSideConflictRecalculator` already live in all orgs (Opportunity save → flag).

Scenarios (prefix `SSE-T`):

| # | Setup | Trigger | Expected |
|---|---|---|---|
| T1 | Buyer B1 has Matching M1 at アプローチ on live deal D1 (seller S-D1, stage MGマッチング中), Matching M2 at MG対応 on live deal D2 | B1's own Opp O1 saved at stage NDA締結 → flag ON | M1: phase マッチ終了, status アプローチ>終了, reason リスト除外 / 売り手として進行中のため, SellSideAutoTerminated true, SellSideConflictWarned true, SourceName = O1.Name, 1 memo Task "Seller Conflict: O1" on M1. M2: unchanged phase, SellSideConflictWarned true, 1 memo Task. Account B1: Event "Seller Conflict: O1", SourceId/Name set |
| T2 | same B1 | O1 stage → 案件終了 → flag OFF | M1 back to MG対応 / 未確認, reasons blank, markers false, SourceName blank. M2 Warned false + Task "Seller Conflict Cleared: O1". Account Event "Seller Conflict Cleared: O1", source fields blank |
| T3 | B3 flagged (own Opp at 面談前) | insert new Matching M3 at アプローチ, buyer B3, live deal | M3 terminated on save (same values as T1), memo Task on M3, Event on B3 |
| T4 | B4 flagged | insert Matching M4 at アプローチ with RecordType CB_Target; insert M5 at アプローチ on a deal at 案件終了 | both untouched |
| T5 | Parent P has subsidiary C with Opp at トップ面談; P is buyer on Matching M6 at アプローチ | C's Opp saved → P flagged (parent rule) | M6 terminated, SourceName = C's Opp name (found via SellSideSellerParentId__c) |
| T6 | B6 has Matching M7 auto-terminated by the **buyer** mechanism beforehand is out of scope in `bogdan` (needs Sato's top-stage setup); instead: M7 manually set to マッチ終了 with AutoTerminated__c = true via Apex (perm set needed) | B6 flag ON then OFF | M7 never touched by our flows (phase stays マッチ終了, AutoTerminated__c still true) |

- [ ] **Step 1: Write `test/verify_enforcement.apex` first (expected end state after T1 only; it must fail before the manual steps)**

```apex
// verify_enforcement.apex — run after T1; asserts the terminate/warn outcome. Prints PASS/FAIL lines, never throws.
List<String> out = new List<String>();
void check(Boolean ok, String msg) { out.add((ok ? 'PASS ' : 'FAIL ') + msg); }
Matching__c m1 = [SELECT phase_match__c, status__c, termination_reason__c, other_termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c FROM Matching__c WHERE Name = 'SSE-T1 M1'];
Matching__c m2 = [SELECT phase_match__c, SellSideAutoTerminated__c, SellSideConflictWarned__c FROM Matching__c WHERE Name = 'SSE-T1 M2'];
Account b1 = [SELECT SellSideConflict__c, SellSideConflictSourceId__c, SellSideConflictSourceName__c FROM Account WHERE Name = 'SSE-T1 Buyer'];
Opportunity o1 = [SELECT Id, Name FROM Opportunity WHERE Name = 'SSE-T1 Own Opp'];
check(b1.SellSideConflict__c, 'B1 flag ON');
check(m1.phase_match__c == 'マッチ終了' && m1.status__c == 'アプローチ>終了', 'M1 terminated phase/status: ' + m1.phase_match__c + '/' + m1.status__c);
check(m1.termination_reason__c == 'リスト除外' && m1.other_termination_reason__c == '売り手として進行中のため', 'M1 reasons');
check(m1.SellSideAutoTerminated__c && m1.SellSideConflictWarned__c, 'M1 markers');
check(m1.SellSideConflictSourceName__c == o1.Name, 'M1 source name = ' + m1.SellSideConflictSourceName__c);
check(m2.phase_match__c == 'MG対応' && !m2.SellSideAutoTerminated__c && m2.SellSideConflictWarned__c, 'M2 warned only');
check(b1.SellSideConflictSourceId__c == String.valueOf(o1.Id) && b1.SellSideConflictSourceName__c == o1.Name, 'B1 source fields');
check([SELECT COUNT() FROM Task WHERE WhatId = :m1.Id AND Subject = 'Seller Conflict: ' + o1.Name] == 1, 'M1 memo task');
check([SELECT COUNT() FROM Task WHERE WhatId = :m2.Id AND Subject = 'Seller Conflict: ' + o1.Name] == 1, 'M2 memo task');
check([SELECT COUNT() FROM Event WHERE WhatId = :b1.Id AND Subject = 'Seller Conflict: ' + o1.Name] == 1, 'B1 memo event');
System.debug('\n' + String.join(out, '\n'));
```
(Run with `sf apex run -o bogdan --file ... | grep -E "PASS|FAIL"`.) Expected before data exists: query exception → that is the failing state.

- [ ] **Step 2: Write `test/sandbox_testdata_enforcement.apex`**

```apex
// Sandbox bogdan test data for the Sell-Side Conflict ENFORCEMENT manual test plan (2026-10-19). Re-runnable.
Id sellingRt = Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('SellingOpp').getRecordTypeId();
Id matchRt   = Schema.SObjectType.Matching__c.getRecordTypeInfosByDeveloperName().get('MatchingMaster').getRecordTypeId();
Id targetRt  = Schema.SObjectType.Matching__c.getRecordTypeInfosByDeveloperName().get('CB_Target').getRecordTypeId();

delete [SELECT Id FROM Task WHERE What.Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Event WHERE What.Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Matching__c WHERE Name LIKE 'SSE-T%' OR Buy_Company__r.Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Opportunity WHERE Name LIKE 'SSE-T%'];
delete [SELECT Id FROM Account WHERE Name LIKE 'SSE-T%'];

Integer n = 200;
Account acc(String name, Id parentId) { n++; return new Account(Name = name, Website = 'None', CorporateNumber__c = '9980000000' + String.valueOf(n), ParentId = parentId); }
Opportunity opp(String name, Id accId, String stage) { return new Opportunity(Name = name, AccountId = accId, StageName = stage, CloseDate = Date.today().addMonths(6), RecordTypeId = sellingRt, Check_ActivitiesByStage__c = true); }
Matching__c mt(String name, Id oppId, Id buyerId, String phase, Id rt) { return new Matching__c(Name = name, RecordTypeId = rt, Sell__c = oppId, Buy_Company__c = buyerId, phase_match__c = phase); }

// sellers of the "other" deals (live and dead) — these must NOT be flagged, so keep their opps at リード反響 or 案件終了
Account sD1 = acc('SSE-T Seller D1', null), sD2 = acc('SSE-T Seller D2', null), sDead = acc('SSE-T Seller Dead', null);
// buyers under test
Account b1 = acc('SSE-T1 Buyer', null), b3 = acc('SSE-T3 Buyer', null), b4 = acc('SSE-T4 Buyer', null), b6 = acc('SSE-T6 Buyer', null);
Account p5 = acc('SSE-T5 Parent', null);
insert new List<Account>{ sD1, sD2, sDead, b1, b3, b4, b6, p5 };
Account c5 = acc('SSE-T5 Child', p5.Id);
insert c5;

Opportunity d1 = opp('SSE-T Deal D1', sD1.Id, 'リード反響');   // live deal (stage is irrelevant for Deal_Is_Dead__c as long as not in the dead list)
Opportunity d2 = opp('SSE-T Deal D2', sD2.Id, 'リード反響');
Opportunity dDead = opp('SSE-T Deal Dead', sDead.Id, '案件終了');
Opportunity o1 = opp('SSE-T1 Own Opp', b1.Id, 'リード反響');   // flag OFF until the tester moves it to NDA締結
Opportunity o3 = opp('SSE-T3 Own Opp', b3.Id, '面談前');        // flag ON at insert
Opportunity o4 = opp('SSE-T4 Own Opp', b4.Id, '面談前');        // flag ON at insert
Opportunity o6 = opp('SSE-T6 Own Opp', b6.Id, 'リード反響');   // flag OFF until the tester moves it
Opportunity o5 = opp('SSE-T5 Child Opp', c5.Id, 'リード反響'); // flag OFF until the tester moves it to トップ面談
insert new List<Opportunity>{ d1, d2, dDead, o1, o3, o4, o6, o5 };

insert new List<Matching__c>{
  mt('SSE-T1 M1', d1.Id, b1.Id, 'アプローチ', matchRt),
  mt('SSE-T1 M2', d2.Id, b1.Id, 'MG対応', matchRt),
  mt('SSE-T5 M6', d1.Id, p5.Id, 'アプローチ', matchRt),
  mt('SSE-T6 M7', d1.Id, b6.Id, 'アプローチ', matchRt)
};
// T6: pretend M7 was auto-terminated by the BUYER mechanism
Matching__c m7 = [SELECT Id FROM Matching__c WHERE Name = 'SSE-T6 M7'];
m7.phase_match__c = 'マッチ終了'; m7.status__c = 'アプローチ>終了'; m7.termination_reason__c = 'リスト除外'; m7.other_termination_reason__c = '他案件進行中のため'; m7.AutoTerminated__c = true;
update m7;
System.debug('SSE test data ready. Flags ON now: ' + [SELECT COUNT() FROM Account WHERE Name LIKE 'SSE-T%' AND SellSideConflict__c = true] + ' (expect 2: T3, T4 buyers)');
```
Note: the running user needs read/edit on `AutoTerminated__c` (perm set `DealConflict_Access` assigned to Bogdan in `bogdan`; assign with `sf org assign permset -o bogdan -n DealConflict_Access` if the update fails with an FLS error). If `Name` on `Matching__c` is an auto-number in this org, drop the `Name =` assignments and query by `Buy_Company__r.Name` instead; check with `sf sobject describe -o bogdan -s Matching__c | grep -A3 '"name": "Name"'`.

- [ ] **Step 3: Write `test/SANDBOX_TEST_PLAN.md`** with the table above expanded into numbered click steps (which record to open, which field to change, what to look at: Matching phase/status/reasons, the Activity timeline memo, the Account timeline Event, the hidden markers via the verify script). Include the exact commands:
```
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/sandbox_testdata_enforcement.apex
# T1: open SSE-T1 Own Opp, set stage NDA締結, save  → run:
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/verify_enforcement.apex | grep -E "PASS|FAIL"
```
and the T2–T6 expected values as a checklist.

- [ ] **Step 4: Run the data script, then T1 and the verify script yourself (data changes only in `bogdan`)**

```bash
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/sandbox_testdata_enforcement.apex | grep -E "ready|FATAL|Exception"
sf data update record -o bogdan -s Opportunity -w "Name='SSE-T1 Own Opp'" -v "StageName='NDA締結'"
sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/verify_enforcement.apex | grep -E "PASS|FAIL"
```
Expected: 10 PASS, 0 FAIL. Then T2:
```bash
sf data update record -o bogdan -s Opportunity -w "Name='SSE-T1 Own Opp'" -v "StageName='案件終了'"
sf data query -o bogdan -q "SELECT Name, phase_match__c, status__c, termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c FROM Matching__c WHERE Name LIKE 'SSE-T1%'"
sf data query -o bogdan -q "SELECT Subject FROM Task WHERE What.Name = 'SSE-T1 M2' ORDER BY CreatedDate"
sf data query -o bogdan -q "SELECT Subject FROM Event WHERE What.Name = 'SSE-T1 Buyer' ORDER BY CreatedDate"
```
Expected: M1 MG対応 / 未確認 / blank reasons / both markers false / source blank; M2 Warned false; Tasks "Seller Conflict: …" then "Seller Conflict Cleared: …"; Events same pair. T3–T6 via the plan (T3/T4 inserts with `sf data create record -o bogdan -s Matching__c -v "..."`; T5 by moving `SSE-T5 Child Opp` to トップ面談; T6 by moving `SSE-T6 Own Opp` to NDA締結 then 案件終了 and checking M7 is untouched). Record every result in `test/SANDBOX_TEST_PLAN.md` under a "Results 2026-10-xx (bogdan)" heading. Any FAIL: fix the flow transform (Task 2), rebuild, redeploy (new version), activate the new version, rerun the data script, retest.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/sell_side_conflict_enforcement/test
git -c core.safecrlf=false commit -m "Sell-side conflict enforcement: sandbox test data + verify script + manual test plan with bogdan results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Sweep scripts, rehearsed in `partial`

**Files:**
- Create: `sweep/backup_before_sweep.sh`, `sweep/sweep_chunk.apex`, `sweep/report_sweep.sh`
- Precondition: Tasks 1–2 deployed to `partial` as well (repeat Task 1 Step 5 and Task 2 Step 4 with `-o partial`, including a fresh perm-set retrieve into `access_partial/`). `partial` already has 74 flagged accounts from the 2026-10-16 rehearsal.

**Interfaces:**
- Consumes flow B's API name for the deactivate/reactivate PATCH and the markers from Task 1.

- [ ] **Step 1: `sweep/backup_before_sweep.sh`** (Ids only; output file is git-ignored)

```bash
#!/usr/bin/env bash
# usage: backup_before_sweep.sh <org> <outdir>   -> <outdir>/matchings_before.csv, <outdir>/accounts_flagged.csv
set -euo pipefail
org=$1; out=$2; mkdir -p "$out"
sf data query -o "$org" -r csv -q "SELECT Id, phase_match__c, status__c, termination_reason__c, other_termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c FROM Matching__c WHERE SellSideConflict_M__c = true AND phase_match__c != 'マッチ終了'" > "$out/matchings_before.csv"
sf data query -o "$org" -r csv -q "SELECT Id FROM Account WHERE SellSideConflict__c = true" > "$out/accounts_flagged.csv"
echo "matchings: $(($(wc -l < "$out/matchings_before.csv")-1))  accounts: $(($(wc -l < "$out/accounts_flagged.csv")-1))"
```

- [ ] **Step 2: `sweep/sweep_chunk.apex`** (one chunk per run; rerun until it prints `remaining: 0`)

```apex
// Flips SellSideConflict__c off then on for up to 25 flagged accounts that have no stored source yet,
// so SellSideConflict_AutoTerminate runs for them. Run with SellSideConflict_AutoReactivate DEACTIVATED.
// Accounts whose flow run finds no source opp keep a blank name and would be re-selected: the WHERE excludes
// accounts already touched today via LastModifiedDate, so each run moves forward. Rerun until remaining = 0.
List<Account> chunk = [SELECT Id FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null
                       AND LastModifiedDate < :Datetime.now().addMinutes(-2) ORDER BY Id LIMIT 25];
for (Account a : chunk) a.SellSideConflict__c = false;
update chunk;                                   // no flow reacts: B is deactivated, Sato's flows key on DealConflict__c
for (Account a : chunk) a.SellSideConflict__c = true;
update chunk;                                   // A fires once per account
Integer remaining = [SELECT COUNT() FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null
                     AND LastModifiedDate < :Datetime.now().addMinutes(-2)];
System.debug('swept ' + chunk.size() + ', remaining: ' + remaining);
```
Wrapper loop (bash), e.g. in the runbook:
```bash
for i in $(seq 1 20); do r=$(sf apex run -o partial --file scripts/deploy/sell_side_conflict_enforcement/sweep/sweep_chunk.apex | grep -oE "swept [0-9]+, remaining: [0-9]+"); echo "$i: $r"; [[ "$r" == *"remaining: 0" ]] && break; sleep 130; done
```
(The 130 s sleep is what makes the `LastModifiedDate < now-2min` guard work for accounts that got no source name.)

- [ ] **Step 3: `sweep/report_sweep.sh`**

```bash
#!/usr/bin/env bash
# usage: report_sweep.sh <org>
set -euo pipefail
org=$1
echo "== terminated by seller sweep"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideAutoTerminated__c = true"
echo "== warned (live)";              sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideConflictWarned__c = true AND SellSideAutoTerminated__c = false"
echo "== flagged accounts with source stored / without"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c != null"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND SellSideConflictSourceName__c = null"
echo "== memo events today";          sf data query -o "$org" -q "SELECT COUNT(Id) FROM Event WHERE Subject LIKE 'Seller Conflict: %' AND CreatedDate = TODAY"
echo "== live アプローチ matchings whose buyer is still a flagged seller (expect 0 after sweep, excluding Target/dead)"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Matching__c WHERE SellSideConflict_M__c = true AND phase_match__c = 'アプローチ' AND RecordType.DeveloperName != 'CB_Target' AND Deal_Is_Dead__c = false"
```
(`Deal_Is_Dead__c` needs the perm set on the running user; in prod Bogdan has it via System Administrator only if Task 1's Admin grant is extended to it — it is not. Replace the last filter with `(NOT Sell__r.StageName IN ('成約','案件終了','On Hold','Converted to Buyer')) AND (NOT Sell_New__r.StageName__c IN ('成約','案件終了','On Hold','Converted to Buyer'))`.)

- [ ] **Step 4: Rehearse in partial**

```bash
P=scripts/deploy/sell_side_conflict_enforcement
bash $P/sweep/backup_before_sweep.sh partial $P/sweep/partial_before      # note counts
bash $P/sweep/report_sweep.sh partial                                      # all zeros expected
# deactivate B in partial (Tooling PATCH activeVersionNumber 0 on its FlowDefinition Id), then:
for i in $(seq 1 20); do r=$(sf apex run -o partial --file $P/sweep/sweep_chunk.apex | grep -oE "swept [0-9]+, remaining: [0-9]+"); echo "$i: $r"; [[ "$r" == *"remaining: 0" ]] && break; sleep 130; done
# reactivate B (PATCH activeVersionNumber 1)
bash $P/sweep/report_sweep.sh partial
```
Expected: terminated = number of アプローチ rows in `matchings_before.csv` on live non-Target deals; warned = the other live rows; accounts with source = 74 (or fewer if some flagged account has no active opp, which indicates a stale flag — list them); last count 0. Record the counts in `sweep/REHEARSAL_partial.md`. Add `sweep/partial_before/` and `sweep/prod_before/` to `.gitignore`.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/sell_side_conflict_enforcement/sweep .gitignore
git -c core.safecrlf=false commit -m "Sell-side conflict enforcement: sweep scripts (backup, chunked flag flip, report) rehearsed in partial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Prod runbook, prod snapshot, revert package

**Files:**
- Create: `prod/README.md`, `prod/snapshot_before/permissionsets/DealConflict_Access.permissionset` (prod retrieve), `access_prod/permissionsets/DealConflict_Access.permissionset-meta.xml` (prod copy + 6 blocks), `prod/revert/README.md`, `prod/revert/restore_matchings.apex`

- [ ] **Step 1: Prod snapshot (read-only) and prod perm set package**

```bash
sf project retrieve start -o prod --metadata PermissionSet:DealConflict_Access --target-metadata-dir scripts/deploy/sell_side_conflict_enforcement/prod/snapshot_before --unzip --wait 10
```
Copy to `access_prod/permissionsets/DealConflict_Access.permissionset-meta.xml`, insert the same six blocks as Task 1 Step 4, diff = +30/−0. Record the file's LastModifiedDate: `sf data query -o prod -q "SELECT LastModifiedDate FROM PermissionSet WHERE Name='DealConflict_Access'"` (expected 2026-10-19 from today's deploy 0AfRA000003345N0AQ) in the README as the staleness reference.

- [ ] **Step 2: `prod/README.md`** — same shape as `scripts/deploy/sell_side_conflict/prod/README.md` sections 1–3 and 7: summary, pre-conditions, one `! ` command per line in this order, expected result after each, gates.

```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/fields --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/labels --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/access --wait 10
! sf data query -o prod -q "SELECT LastModifiedDate FROM PermissionSet WHERE Name='DealConflict_Access'"      # must equal the snapshot value, else re-retrieve + rebuild access_prod
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/access_prod --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/flows/out --wait 10   # 3 flows, Draft
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/backup_before_sweep.sh prod scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before     # expect 21 matchings (12 live-deal + 9 dead/Target), 338 accounts
GATE: Bogdan's go for activation
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<A id>" --body '{"Metadata":{"activeVersionNumber":1}}'
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<C id>" --body '{"Metadata":{"activeVersionNumber":1}}'
   (B stays Draft until the sweep is done)
GATE: Bogdan's go for the sweep
! for i in $(seq 1 20); do r=$(sf apex run -o prod --file scripts/deploy/sell_side_conflict_enforcement/sweep/sweep_chunk.apex | grep -oE "swept [0-9]+, remaining: [0-9]+"); echo "$i: $r"; [[ "$r" == *"remaining: 0" ]] && break; sleep 130; done
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/report_sweep.sh prod        # expect terminated 6, warned 6, accounts with source 338 / without 0, last count 0
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B id>" --body '{"Metadata":{"activeVersionNumber":1}}'
```
Also list the 12 affected Matching names (not account names) from §3.7 of the spec as the expected sweep targets, and the post-checks: open one terminated Matching (memo Task, reasons), one warned Matching (memo Task, phase unchanged), one flagged Account (Event), and `report_flags.sh prod` from the first project still 0/0.

- [ ] **Step 3: Revert package**

`prod/revert/README.md`: (1) deactivate A, B, C via PATCH `activeVersionNumber 0`; (2) run `restore_matchings.apex` which reads `sweep/prod_before/matchings_before.csv` values (paste them into the script's list, Ids only) and restores phase/status/reasons and clears the three markers; (3) clear `SellSideConflictSourceId__c`/`Name__c` on all accounts with one anonymous update; (4) optionally delete the memo Tasks/Events `WHERE Subject LIKE 'Seller Conflict%' AND CreatedDate = <sweep date>`; fields may stay.

`prod/revert/restore_matchings.apex` skeleton with a `Map<Id, List<String>>` of `Id → {phase, status, reason, otherReason}` to be filled from the backup CSV at revert time, and the update loop that also sets `SellSideAutoTerminated__c = false`, `SellSideConflictWarned__c = false`, `SellSideConflictSourceName__c = null`. Note in the README that the Matching flows `CheckStage`/`OBEditingActions` may need pausing for the restore (see bulk-load pause list in memory).

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy/sell_side_conflict_enforcement
git -c core.safecrlf=false commit -m "Sell-side conflict enforcement: prod runbook, prod perm set package from snapshot, revert package

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Final review before prod

- [ ] Run `superpowers:requesting-code-review` style review (Opus subagent) over `scripts/deploy/sell_side_conflict_enforcement/` against the spec: generated flow XML vs Sato's originals (diff only the intended lines), FLS scope, sweep safety (B deactivated, chunking, guard), runbook order (every component before anything referencing it: fields → labels → access → perm set → flows → backup → activate A+C → sweep → activate B).
- [ ] Fix findings, re-run `check_flows.js` and the bogdan verify script, commit.
- [ ] Hand over: tell Bogdan the runbook path; he runs each line with `!`; Claude checks each result (`sf project deploy report -o prod -i <id>`) and gives the next line. After prod: tracker row (next ID, 種別 追加, short bulleted note), README deploy record, memory, push.

---

## Self-review notes

- Spec §3.2 → Task 1; §3.3–3.5 → Task 2 (transform) + Task 3 (behaviour tests); §3.6 interactions → Task 3 T6 and the review checklist; §3.7 sweep → Task 4 + runbook; §3.8 rollback → Task 5 revert; §3.9 testing → Tasks 3–4.
- Names used consistently: `Get_SourceOpp`, `SellSideAutoTerminated__c`, `SellSideConflictWarned__c`, `SellSideConflictSourceName__c` (both objects), `SellSideConflictSourceId__c`, `SellSideSellerParentId__c`, flow API names as in the spec.
- Deviation from pure mirror, deliberate and in the spec: Admin read on the internal fields; survivors filtered on "not yet warned"; source lookup sorted by `SellSideBaseDate__c` desc.
