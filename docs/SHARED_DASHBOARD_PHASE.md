# Shared Dashboard and onboarding — scoped read-only integration

Base: draft PR #4, commit `7459a8fc146c1b36f6cc636d4402849cd18585e7`.
Branch: `codex/shared-dashboard-readonly`.

## Delivered behavior

- Registration asks only for email and password. Signup/reset require the confirmed
  12-character project minimum; login accepts existing passwords for server validation.
- Household creation collects name, currency and date format once. Currency choices
  show readable names/codes; date choices show readable patterns while retaining
  `eu/us/iso` internally. Creation still uses the existing atomic Phase 2A RPC.
- Opening an invitation link prioritizes joining and does not display creation
  setup. An authenticated invited member accepts the existing email-bound token;
  no name, currency or date-format input is required. No new household is created.
- A signed-in household member goes directly to `app.html`, opening the normal
  Dashboard layout. `shared.html#account` is account/invitation management only.
  The duplicate collection selector, record forms and record editor are removed.
- The shared Dashboard shows open tasks, current-month unpaid bills, balance,
  savings rate, upcoming events, reminders, budget snapshot and today's meals.
  It reads authorized Supabase rows, not browser-local records.
- Reads refresh automatically every 30 seconds while the page is visible, and
  on focus/resume. An explicit refresh button is also available. This is polling,
  **not Realtime**, and does not need publication or database changes.

This phase is deliberately **read-only**. Dashboard is the only enabled shared
module; the sidebar shows the other original module names as unavailable pending
their integration. No original record form is enabled in the generated shell and
there is no shared write executor. Local functionality remains intact in the
unchanged `index.html`. This does not yet satisfy the full cross-module objective.

## Original interface without legacy bootstrap

`scripts/shared-shell.mjs` generates `dist/app.html` from `index.html` at build
time, reusing its original Dashboard markup and styles. It strips the legacy
scripts, onboarding overlay, and inline event handlers. Therefore opening the
shared Dashboard cannot run `fccLoadLocalData()`, normalize legacy data, save local
settings, trigger sample-data setup, or call the old index-based mutation handlers.
No second source copy of the original application is maintained.

The generated shell loads `integration/dashboard-app.mjs`, the reviewed read-only
repository and immutable store, and a pure Dashboard model. Dynamic values are
inserted through text-only DOM APIs. Both authentication and household access must
be verified before protected content is shown. Context changes, logout and errors
clear protected content; failed reads do not fall back to local data or samples.

`index.html`, Phase 2A SQL/rollback/security-test files and Wrangler configuration
are unchanged. The original local application remains directly accessible as a
recovery/local workspace; it is not authenticated by this new route. Users should
not confuse it with the read-only shared Dashboard. A later cutover will make the
integrated interface the sole normal entry point without deleting that recovery
source. No redirect into the local bootstrap occurs during shared auth flows.

## Data and calculation scope

Nine existing tables are read: households, tasks, bills, transactions, budgets,
events, meals, home-care items and inventory. Identity/tenant validation and
pagination come from PR #4's read-only repository. The application commits only
complete verified results to its in-memory store; no local application keys are
read or written. The SDK continues to manage only its separate auth session key.

Current-month financial formulas retain income minus expenses and the existing
nonnegative savings-rate calculation. Monetary sums use integer cents, display
retains two decimals, and paid bills are excluded from due bills. Existing next
seven days, priority reminders, warranty window and meal-type ordering are mapped
to the original widgets. Budget defaults retain the original standard category
order, with unknown categories placed afterward; stored custom ordering remains
pending because Phase 2A has no ordering column.

Two matching observations are required before rendering a multi-request load.
Changing datasets fail with a retry message rather than showing a known mismatch.
This reduces ordinary races but is **not a transactional snapshot**: offset
pagination and separate table requests cannot guarantee a single database instant.
The Dashboard is a last-checked summary, not an authoritative financial report.
Report activation still requires the planned snapshot/aggregate strategy.

Current date and automatic seasonal/special themes use the browser's date, with
the existing eight-theme selection rules. Shared timezone/manual theme settings
do not exist in Phase 2A and are not invented or read from old local preferences.
Those settings and full cross-device date parity remain pending schema approval.

## Security, synchronization and approvals

The new Dashboard path performs only authenticated SELECT requests. It creates no
RPCs, triggers, publications, policies or schema objects and sends no record
mutations. Existing signup, household creation and invitation actions remain
explicit user actions using the existing auth/RPC foundation; tests mock them.
Server RLS remains authoritative. Client guards are defense in depth.

Polling re-verifies membership, stops on hidden pages and resumes on visibility.
It clears protected views after failed verification and on auth/account changes.
No offline writes or conflict overwrites are possible because writes are absent.
The dormant edit/revision-intent foundation remains available for later work.

Polling can consume more requests/egress than private Realtime invalidation. Use
this scoped phase for testing, not as the final high-volume sync design. Automatic
private Broadcast, server revisions, idempotent commands and atomic bill/savings/
maintenance operations require separately approved database changes.

No migration/import/merge is performed, even if this household is empty. The
Georgiou Family household is resolved by verified membership, never guessed by
name or recreated by the Dashboard. No sample data is sent to Supabase.

## Validation

```sh
npm run check
npm test
npm run test:browser
npm run build:cloudflare
```

All 35 tests passed, along with syntax checks, the Chromium suite and the local
17-asset Cloudflare build. New tests cover KPI/date/budget mapping, invalid values,
empty-state behavior, changing-snapshot rejection and extraction without legacy
scripts. The original foundation's fixed baseline hashes continue protecting the
legacy local app, Phase 2A and unchanged dependencies; checks for intentionally
changed auth/build files were removed as this phase activates a read-only subset.

Chromium tests verify email/password-only registration, 12-character signup
validation, dashboard routing, disabled write controls, text-only rendering of
malicious records, automatic polling of simulated other-device changes, invitation
acceptance without repeated setup, member/admin invitation boundaries, account-only
management, password recovery, signout and exact preservation of seeded local data.
Backend behavior is mocked; no real accounts or Supabase data were changed and no
live RLS or two-device backend acceptance is claimed.

The build now ships generated `app.html`, shared integration modules and readable
auth options. The validator allows exactly 17 assets and checks generated shell
equality against its original source. Unconfigured builds remain fail-closed;
valid public variables are required for a working shared Dashboard.

## Remaining phases

1. Approve additive database changes for robust server revisions, compound commands,
   bill relationships, ordering, shared settings and import provenance.
2. Connect the original Calendar/Tasks/Home Care/Finance/Meals/Groceries/Settings
   pages for safe ID-based edits using those server contracts. Do not reintroduce
   record forms inside account management.
3. Add private household Realtime, complete reports and reconnect reconciliation.
4. Deliver explicit raw backup, preview, duplicate protection, import approval and
   recovery. Keep local originals until an independently approved retention policy.
5. Test against isolated staging with two members and an unrelated account before
   approving production cutover.

## Release and rollback

No branch push, hosted preview, merge or production deployment was performed in
this phase. Ask before pushing: existing Git integrations automatically deploy
previews. If approved, create a new draft PR stacked on PR #4; leave #3/#4 branches
unchanged. Use an isolated staging backend for live acceptance. Production database
changes and production promotion require separate explicit approval.

Rollback is a frontend/build revert to PR #4. There is no new schema or data to
roll back, and no local dataset to restore or clear. Restore the prior account
management flow only by deliberate code rollback, never automatic local fallback.
