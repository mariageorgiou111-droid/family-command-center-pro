# Private Beta readiness — Keyur / external household testers

Status: **BLOCKED pending verified staging database and end-to-end checks**. This document does not authorize production changes or database writes.

## Intended tester journey
1. Open a dedicated non-production full-app URL, not `beta-demo.html`.
2. Sign up with own email; verify email; sign in and return after logout.
3. Create a new household; confirm all modules load.
4. Add/edit/delete test tasks, shopping, meals, expenses, bills, budgets, and other available modules; refresh and verify persistence.
5. Invite a second independently registered person by email; accept once; verify both users see shared updates across two devices.
6. Create an unrelated second household with a separate account; verify no reads/writes/invitations leak between households.
7. Collect tester feedback without collecting passwords or private family financial details.

## Hard prerequisites
- Verify exact Supabase staging ref `lytlyemzothzsmcbkgwx` and verify it is NOT the production dependency.
- Perform **read-only** catalog inventory of `public`, `fcc_private`, extensions, and existing objects; check migration conflicts and backup/recovery approach.
- Only then apply the separately approved, reviewed `supabase/migrations/202610090001_phase_2a_shared_households.sql` to that staging project.
- Run `supabase/tests/phase_2a_schema_verification.sql` and require success.
- Create disposable staging-only test users only with separate approval; run `npm run test:staging` against verified staging; check invitation email binding, one-time acceptance, write isolation, and session behavior manually.
- Configure isolated beta hosting with **public** staging URL and publishable key only; never embed service-role keys, credentials, or real household data.
- Check responsive full app, persistence, and invitations end to end before sharing the beta URL.
- No merges to main, production deployments, production database mutations, or paid services without explicit approval.

## Current evidence
- The repository contains the Phase 2A migration and schema verifier, plus opt-in read-only `tests/staging.mjs`.
- A standalone `beta-demo.html` is **not** the real beta and must not be sent as the full app.
- There is no confirmed safe full-app beta URL yet.
