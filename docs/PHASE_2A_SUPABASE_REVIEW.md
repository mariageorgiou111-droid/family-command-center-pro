# Phase 2A Supabase review and manual application

Phase 2A prepares the database foundation for Shared Household. It does not connect
the existing browser application to Supabase and does not change `index.html`.

## Files

- `supabase/migrations/202610090001_phase_2a_shared_households.sql` creates the
  schema, RPCs, explicit Data API grants, and RLS policies.
- `supabase/tests/phase_2a_schema_verification.sql` performs read-only catalog
  checks after manual application.
- `supabase/tests/phase_2a_manual_security_test.md` defines the Maria, Christos,
  and unrelated-account test.
- `supabase/rollbacks/202610090001_phase_2a_shared_households.rollback.sql`
  removes the Phase 2A objects during development only.

## Review before applying

1. Confirm the active Supabase project is **Family Command Center PRO** in West EU.
2. Read the complete migration. Do not apply only selected fragments.
3. Confirm `fcc_private` is not listed under Data API exposed schemas.
4. Confirm no database password, secret/service-role key, access token, or JWT
   signing secret appears in any repository file.
5. Export a database backup if the project has acquired any non-test data.

## Manual SQL Editor application

1. Open Supabase Dashboard -> SQL Editor -> New query.
2. Copy the complete migration file into the editor.
3. Run it once. The migration is transactional: an error rolls back the run.
4. Open a second query and run
   `supabase/tests/phase_2a_schema_verification.sql`.
5. Expect exactly:

   ```text
   Phase 2A schema, RLS, grants, RPC security, and tenant-isolation checks passed
   ```

6. In Table Editor, verify every public Phase 2A table shows RLS enabled.
7. In API settings, leave **Automatically expose new tables** disabled.
8. Do not expose the `fcc_private` schema.
9. Confirm shared record primary keys are `(household_id, id)` and the browser
   roles cannot update tenant/audit columns.

## Realtime (defer until Phase 2B integration)

When Phase 2B adds browser synchronization, enable Realtime only for:

- `household_events`
- `household_tasks`
- `cleaning_tasks`
- `home_care_items`
- `home_care_history`
- `inventory_items`
- `household_transactions`
- `household_bills`
- `household_budgets`
- `savings_goals`
- `household_meals`
- `grocery_items`

Do not enable Realtime for `fcc_private.household_invitations`.

## Reversibility and local data

The migration never reads or changes browser `localStorage`. Phase 1 data remains
under the existing browser keys and current backup/export/import behavior remains
unchanged. The rollback SQL is provided only while the shared schema contains test
data; it is destructive to data stored in the new Supabase tables.
The rollback removes the dedicated `fcc_private` schema owned by this feature. It
intentionally leaves the shared `pgcrypto` and `citext` extensions installed because
other Supabase features may also depend on them.

Phase 2B will add an explicit migration workflow:

1. normalize the existing local data;
2. require/offer a backup;
3. create the shared household;
4. upload with stable Phase 1 record IDs and an idempotency key;
5. verify server record counts;
6. switch to shared mode only after verification; and
7. retain the original local dataset as a recovery source.

Joining another household will never upload, merge, replace, or delete the joining
user's existing local household automatically.

## Browser configuration

No Supabase URL or publishable key is needed to review or manually apply this
migration. Phase 2B will consume those public values through browser-safe runtime
or deployment configuration. Never put database credentials, secret/service-role
keys, JWT signing secrets, or personal access tokens in browser code.
