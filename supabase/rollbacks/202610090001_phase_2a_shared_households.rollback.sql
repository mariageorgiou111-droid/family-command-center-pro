-- DEVELOPMENT/TEST ROLLBACK ONLY.
-- This removes Phase 2A tables, functions, types, triggers, and its dedicated
-- fcc_private schema. Shared pgcrypto/citext extensions are intentionally retained.
-- Do not run after real shared-household data has been accepted without a backup.

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.list_household_invitations(uuid);
drop function if exists public.revoke_household_invitation(uuid);
drop function if exists public.accept_household_invitation(text);
drop function if exists public.create_household_invitation(uuid, text, public.household_role, interval);
drop function if exists public.create_household(text, text, text);

drop table if exists public.household_imports;
drop table if exists public.grocery_items;
drop table if exists public.household_meals;
drop table if exists public.savings_goals;
drop table if exists public.household_budgets;
drop table if exists public.household_bills;
drop table if exists public.household_transactions;
drop table if exists public.inventory_items;
drop table if exists public.home_care_history;
drop table if exists public.home_care_items;
drop table if exists public.cleaning_tasks;
drop table if exists public.household_tasks;
drop table if exists public.household_events;
drop table if exists fcc_private.household_invitations;
drop table if exists public.household_memberships;
drop table if exists public.households;
drop table if exists public.profiles;

drop function if exists fcc_private.current_verified_email();
drop function if exists fcc_private.shares_household(uuid);
drop function if exists fcc_private.has_household_role(uuid, public.household_role[]);
drop function if exists fcc_private.is_household_member(uuid);
drop function if exists fcc_private.handle_new_user();
drop function if exists fcc_private.set_shared_audit_fields();
drop function if exists fcc_private.set_updated_at();

drop type if exists public.household_import_status;
drop type if exists public.household_invitation_status;
drop type if exists public.household_role;
drop schema if exists fcc_private;

commit;
