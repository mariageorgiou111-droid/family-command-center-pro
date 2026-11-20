# Isolated staging acceptance gate — 2026-11-20

**Scope:** `family-command-center-staging` (Supabase project ref `lytlyemzothzsmcbkgwx`) only. This is a plan, **not** authorization to execute SQL or create accounts.

## Evidence and source integrity

- The project dashboard was shown as **Healthy** in a user-provided screenshot. Its Table Editor displayed only **Create a table**, consistent with no visible Phase 2A tables; this is not a database-level inventory.
- Reviewed migration: `supabase/migrations/202610090001_phase_2a_shared_households.sql`, Git blob `f0af754ecddd7a27b30a58e4605766c5fd1bea6a`. Do not edit it or apply it to production.
- Existing read-only verifier: `supabase/tests/phase_2a_schema_verification.sql`.
- Existing manual security scenarios: `supabase/tests/phase_2a_manual_security_test.md`.
- Existing opt-in backend check: `tests/staging.mjs`. Requires three **pre-created non-production** accounts and only public Supabase configuration.

## Gate 1: before any SQL

1. Independently confirm project reference `lytlyemzothzsmcbkgwx` in the Supabase project settings and confirm it is not a production application dependency.
2. Inventory `public` and `fcc_private` schemas using **read-only** catalog queries; check for existing Phase 2A objects or unrelated data. Do not infer emptiness solely from the Table Editor screenshot.
3. Review extension availability (`pgcrypto`, `citext`), migration dependencies, and SQL Editor execution role.
4. Obtain **separate explicit approval** to apply this specific reviewed migration to this specific staging project. Never apply a rollback casually; it is destructive.
5. Capture a pre-migration inventory and a rollback/recovery plan. If the target is not empty or any schema conflicts exist, stop for review.

## Gate 2: after separately approved staging migration

1. Apply the reviewed Phase 2A migration once, only to the verified staging project. Do not repeat it automatically.
2. Run `supabase/tests/phase_2a_schema_verification.sql` in the same project; require the explicit success row.
3. Confirm all 16 expected public tables, private invitation storage, RLS on every public table, restricted anonymous privileges, tenant-scoped policies, immutable audit/tenant columns, and secured RPCs.
4. Record the result without copying user data, secrets, tokens, or SQL Editor credentials into GitHub.

## Gate 3: isolated test accounts and access

After separate authorization for creating disposable test records, prepare OWNER and MEMBER in household A and OUTSIDER in household B. Each must have its own verified email and password; never commit credentials. Test email confirmation, invitation one-time use and email binding, and deny cross-household access.

Use `FCC_TEST_NON_PRODUCTION=yes` only after verifying the target. Supply `FCC_TEST_SUPABASE_URL`, `FCC_TEST_SUPABASE_KEY` (publishable/anon key), and the three `FCC_TEST_{OWNER,MEMBER,OUTSIDER}_{EMAIL,PASSWORD}` pairs through protected ephemeral CI or local environment. Execute `npm run test:staging`. The script tests login, session refresh, anonymous access denial, RLS isolation across domain tables and restricted invitation listing; it does not test all writes or email delivery.

## Independent beta demo

`demo/external-beta-preview:beta-demo.html` is a standalone in-memory fictional-data preview with no Supabase connection, persistence, or external scripts. It does **not** validate real authentication or household isolation. Publish only this file as a distinct preview, never as a production promotion. Verify the served HTML and URL before sharing with 3–4 invited testers.

**Deployment blocker (2026-11-20):** Vercel team `mgchat1` has no linked projects; a preview-only deployment of this standalone file returned HTTP 403, `You don't have permission to create a project`. No deployment was created. Do not claim a public beta URL until an authorized host succeeds and the URL is checked.

## Release gate

No merge to `main`, no production deployment, no production Supabase mutations, no billing changes, and no AI-agent additions. Live staging RLS acceptance is required before enabling shared-household access for real users.
