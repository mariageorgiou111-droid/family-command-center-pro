# Phase 2B — Authentication and shared household onboarding

This documents PR #3's initial behavior. The subsequent Dashboard integration
removes its duplicate shared-record interface; see `SHARED_DASHBOARD_PHASE.md`.

## Scope and architecture

The existing app is a static, monolithic `index.html`, with in-page navigation,
inline scripts, and local browser storage. Its Phase 1 dataset is
`fccProDataV7_6_QA`, with a legacy `fccProDataV7` fallback. Family name, username,
theme, currency, date preferences, onboarding and demo flags use additional keys.
There was no authentication client, server router, or framework dependency.

The Phase 2A schema lives on
`codex/plan-implementation-for-shared-household-feature`, commit
`5ca1f11db3c78443b92835dfe0b8f72f688331fc`, rather than `main`.
This change is reviewed against that branch. Its migration and rollback are
unchanged and must **not** be run again. The migration's Git blob remains
`f0af754ecddd7a27b30a58e4605766c5fd1bea6a`.

`shared.html` adds an authenticated application with hash routes for sign-in,
sign-up, password reset and household onboarding. It uses the pinned Supabase
JavaScript SDK (`@supabase/supabase-js@2.49.8`, UMD via jsDelivr), with automatic
token refresh and browser session persistence. No server or service-role key is
introduced. The new SDK auth storage key is `fcc-supabase-auth-v1`.

Protected views wait for a restored session, verified user and server membership.
On auth changes, old household data and dialogs are cleared before new requests.
Database authorization is provided by existing grants and RLS; a static HTML route
guard only controls UI. Viewing the static source never grants data access.

`index.html` remains the **local workspace**, with one added link and label. It
retains its existing functions and storage behavior. The new shared area never
reads, uploads, overwrites, deletes, or migrates existing local application keys.
Local data is device/browser data and is **not protected by signing out** of the
shared area. People sharing a browser profile can still open that local workspace.
Use separate browser profiles for private local datasets.

Shared CRUD forms cover the twelve existing domain tables: calendar, tasks,
cleaning, home care and service history, inventory, transactions, bills, budgets,
savings goals, meals and groceries. They use only allowlisted writable columns,
and constrain requests to the authenticated membership's household. Existing
dashboard calculations, exports, reports and themes remain in the local workspace;
they have not been rewritten to operate on shared data.

## Public environment configuration

Requires Node.js 20+ for build and tests (verified here with Node.js 24).
There are no npm dependencies to install. The browser needs access to jsDelivr
and the selected Supabase project.

```sh
export SUPABASE_URL='https://YOUR-PROJECT.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_YOUR_PUBLIC_KEY'
# Alternatively: SUPABASE_ANON_KEY='YOUR_LEGACY_ANON_JWT'
npm run check
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080/shared.html`. The root remains the local workspace.
Environment variables must be exported in the build process. `.env.example` is a
reference; the build does not automatically read `.env` files. Do not commit keys.
The URL and publishable/anon key are intentionally public in generated browser
configuration. The build rejects secret and service-role keys. Never use database
passwords, Supabase management tokens, or JWT signing secrets in browser config.

Build output is `dist/` and includes only the two active HTML pages and `auth/`.
Historical HTML snapshots, SQL, tests and environment files are excluded. The
source checkout's `auth/config.js` is unconfigured and fails closed with a setup
message. Missing variables fail the build before replacing an existing output.
For a custom Supabase API domain, review and explicitly adapt the `connect-src`
policy in `shared.html` before use; the default policy permits `*.supabase.co`.

## Cloudflare build configuration

Cloudflare's existing build command is `npm run build:cloudflare`. This command
uses the same Phase 2B asset builder and then runs `npm run check:cloudflare`.
`wrangler.jsonc` identifies the existing `family-command-center` Worker and uses
`./dist` as its static asset directory. These commands build and validate files
only; they do not invoke Wrangler, upload assets, or deploy.

The Cloudflare validator checks that both active HTML pages and all five auth
assets are present, source assets are byte-identical, generated configuration is
public-only, and no extra files or symbolic links enter the publishable output.
The old single-file validator from the separate Cloudflare build branch is not
compatible with the Phase 2B application.

If all public Supabase variables are absent, `build:cloudflare` produces
`window.FCC_AUTH_CONFIG = null` and reports that shared authentication is disabled.
The local workspace remains available and shared sign-in displays its existing
configuration message. This supports static build checks without adding secrets
or changing Supabase. Partial or invalid configuration, including secret/service-role
keys, still fails. `npm run build` retains its strict requirement for public
Supabase configuration. Configure public variables and rebuild before enabling
shared auth. No Cloudflare dashboard settings were changed by this fix.

## Supabase prerequisites — review manually, no changes made by this PR

Use a separate, already provisioned test project for verification. This PR does
not apply SQL or alter authentication settings, redirect allowlists, permissions,
email delivery, Realtime, or production data.

Before enabling this feature in a future deployment, a project administrator must
check that email/password auth is enabled, email confirmations and reset emails
are deliverable, and the intended URLs are already allowed. Confirmation returns
to `https://APP-ORIGIN/shared.html`; recovery returns to
`https://APP-ORIGIN/shared.html?flow=recovery`. For local tests, the corresponding
URLs start with `http://localhost:8080`. Use explicit trusted origins rather than
broad wildcard redirects. Do not change production settings as part of this PR.
If settings are missing, review those changes separately before enabling auth.

Required existing RPCs:

- `create_household(p_name, p_currency, p_date_format)` creates an empty household
  and an owner membership atomically.
- `create_household_invitation(p_household_id, p_invited_email, p_role,
  p_expires_in)` is limited to owners/admins and returns a random token once.
- `accept_household_invitation(p_invitation_token)` requires a confirmed matching
  email and atomically consumes a valid pending invitation.
- `list_household_invitations` returns safe invitation metadata to owners/admins.
- `revoke_household_invitation` invalidates pending invitations.

The UI uses seven-day invitations with `member` as the default role. It never
directly inserts memberships or accesses `fcc_private`. No additional grant or
migration has been identified as necessary against the reviewed Phase 2A schema.
If the actual project's API differs, stop and review the mismatch; do not rerun
Phase 2A or work around RLS with elevated credentials.

## Account and invitation flow

1. Each person creates an individual account and confirms their email.
2. A signed-in person without membership creates an empty household or pastes an
   invitation token. Joining never uploads or merges that person's local records.
3. Owners/admins enter the recipient's email and role to create a link. Copy and
   send the link privately. **The app does not send invitation email.**
4. Tokens are in a fragment, removed from the visible URL on entry, and held only
   in page memory. They are not persisted or logged. Copy the original invitation
   before confirming email or reloading; reopen it or paste its token afterward.
5. The recipient signs in with the invited, confirmed email and accepts. The
   server checks expiry, email binding, revocation, single use, and membership.
6. A person can belong to one household, as enforced by Phase 2A. Household
   switching, member removal and ownership transfer are outside this change.

Sign out removes this browser's Supabase session (`scope: local`), clears the
protected UI and preserves all local application data. It does not sign out other
devices. Browser tabs using the SDK receive the auth change. Account switching
reloads membership and has no fallback to another household's data.

## Checks and verification limits

```sh
npm run check
npm test                 # 13 tests, including the Cloudflare build regression
npm run test:browser     # Chromium at /usr/bin/chromium, or set CHROMIUM_PATH
```

Chromium tests serve a loopback-only fixture using a **mock SDK**, exercising UI
forms, login errors, route protection, onboarding, invite display/revocation,
password recovery, logout, reload persistence, auth-event clearing and preservation
of seeded local data. They do not contact Supabase. Unit tests cover membership
race guards, scoped requests, column allowlists, role guards, error paths, public
configuration and Phase 2A integrity. The Cloudflare regression also tests complete
asset packaging, unconfigured builds, invalid-key rejection and output integrity. These checks passed in the implementation
environment. Mock tests are not evidence of real email delivery or RLS behavior.

### Opt-in tests with an isolated staging backend

First use the UI in a dedicated non-production project with Phase 2A already
available. Prepare three confirmed test accounts: OWNER and MEMBER in household A,
and OUTSIDER in household B. Add at least one shared record per collection in each
household so empty results cannot conceal an unexercised isolation boundary.
Do not apply or rerun any migration in production to set up these tests.

Export `FCC_TEST_NON_PRODUCTION=yes`, `FCC_TEST_SUPABASE_URL`,
`FCC_TEST_SUPABASE_KEY` (public key), and `FCC_TEST_OWNER_EMAIL`,
`FCC_TEST_OWNER_PASSWORD`, `FCC_TEST_MEMBER_EMAIL`, `FCC_TEST_MEMBER_PASSWORD`,
`FCC_TEST_OUTSIDER_EMAIL`, `FCC_TEST_OUTSIDER_PASSWORD`. Keep all credentials out
of command history and git; use your environment's secret bindings.

```sh
npm run test:staging
```

The script signs in, verifies users, refreshes tokens, checks anonymous denial,
same-household membership and foreign-household read isolation across all domain
tables, and rejects member invitation listing. It signs out its test sessions in
cleanup. It writes no household data but does create/refresh test auth sessions.
It was **not run here**: no non-production project or test credentials were
provided. The next checklist tests the remaining real browser/server boundaries.

### Manual staging acceptance checklist

- Seed a representative local dataset and take an export. Record the raw local
  data keys before testing. After signup, login, create/join, shared edits,
  password reset and logout, verify those keys are byte-identical.
- Sign up two people; verify confirmation email and duplicate-account handling.
  Wrong passwords must fail without rendering shared data. An invalid or expired
  confirmation/recovery link must not grant access.
- Open `shared.html#household`, `#onboarding` and `#reset` signed out. No shared
  records appear. Request public household tables/RPCs with the anon key and no
  session; expect denial, never data.
- Create household A. Refresh/reopen the page: it restores the owner's session and
  membership. Wait through an access-token refresh interval, then refresh shared
  records. Repeat with network loss: failed verification must keep data locked.
- Invite the second account by confirmed email. A different confirmed account,
  an unconfirmed account, a malformed token, an expired token, a revoked token,
  a previously accepted token, and a user already in a household must all fail.
  Retry a pending invitation after a network interruption; no duplicate membership
  should be created. Revoke pending invitations before recreating one for an email.
- Ordinary members must not create/list/revoke invitations by manually calling
  the RPCs. Owners/admins can invite only `member` or `admin`, never `owner`.
- Add/edit/delete records in each shared collection. Verify another authorized
  member sees the change after Refresh. Budgets use category keys; home care
  history uses the displayed home-care record ID. Try tenant/audit-column changes
  using direct API requests in staging: column grants/RLS must reject them.
- As the outsider in household B, directly request A's known record IDs and try
  insert/update/delete with A's household ID. Reads return no rows, writes fail or
  affect zero rows, and A's records remain unchanged. Test both directions.
- Reload, open a second tab, close/reopen a browser, and sign out in one tab.
  Protected data must clear across tabs. Switch accounts: never show the previous
  household. Use two independent browser profiles for isolation tests.
- Request password reset, follow its email link, set a new password, sign out,
  and verify the new password works and the old password fails. Test expired links.

## Known limits and manual review before release

No deployment, merge, production Supabase action, automatic import or email
invitation delivery is included. The shared workspace has simple CRUD forms,
manual refresh, and a 500-row limit per collection; it does not include Realtime,
offline shared writes, automatic merging, local-to-shared import, or the local
dashboard/reporting UI. Review UX and staging evidence before enabling this for
users. Existing local functionality remains available in its original workspace.
