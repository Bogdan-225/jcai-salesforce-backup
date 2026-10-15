# Account FLS for System Administrator profile (2026-10-15)

Partial-profile deploy: grants READ on six Account fields to the System Administrator profile.
Fields: ContactSourcing__c, ContactSourcingDate__c, ContactSourcingReason__c, ContactSourcingTool__c,
DealConflict__c, MailContactCount__c.

Why: the fields were created via permission sets only (ContactSourcing_Read/Edit, DealConflict_Access,
MailContactCount_Read); the admin profile had no FLS rows, so admins without the sets saw blank gaps
in the Notes section of the Account Lightning pages.

Partial profiles are merged by the Metadata API: only the listed fieldPermissions change.

Deploy (user runs it, prod deploys are blocked from the assistant shell):
  sf project deploy start -o prod --metadata-dir scripts/deploy/account_fls_sysadmin --wait 10
