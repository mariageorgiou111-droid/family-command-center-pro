-- Family Command Center PRO — staging preflight (READ-ONLY).
-- Execute ONLY in Supabase SQL Editor after visually verifying project ref
-- lytlyemzothzsmcbkgwx AND independently confirming it is not production.
-- This script does not apply migrations, change data, or reveal row contents.
-- Save the output and compare with the Phase 2A migration before any write.
--
-- 1. Database and session identity (project ref must be checked in dashboard).
select current_database() as database_name,
       current_user as sql_role,
       session_user as session_role,
       current_setting('search_path') as search_path;

-- 2. Schemas and all user-defined tables/views (including existing objects).
select n.nspname as schema_name, c.relname as object_name,
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
            when 'v' then 'view' when 'm' then 'materialized view'
            when 'S' then 'sequence' when 'f' then 'foreign table'
            else c.relkind::text end as object_kind,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'fcc_private')
  and c.relkind in ('r','p','v','m','S','f')
order by n.nspname, c.relname;

-- 3. Existing functions and types that may conflict with Phase 2A.
select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','fcc_private')
order by n.nspname, p.proname, arguments;

select n.nspname as schema_name, t.typname as type_name,
       t.typtype as type_kind
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
where n.nspname in ('public','fcc_private')
  and t.typname in ('household_role','household_invitation_status','household_import_status')
order by n.nspname, t.typname;

-- 4. Required extensions and installation schemas.
select e.extname, n.nspname as installed_schema, e.extversion
from pg_catalog.pg_extension e
join pg_catalog.pg_namespace n on n.oid = e.extnamespace
where e.extname in ('pgcrypto','citext')
order by e.extname;

-- 5. Counts of existing Phase 2A objects; non-zero counts require review.
with expected(name) as (values
 ('profiles'),('households'),('household_memberships'),('household_events'),
 ('household_tasks'),('cleaning_tasks'),('home_care_items'),('home_care_history'),
 ('inventory_items'),('household_transactions'),('household_bills'),
 ('household_budgets'),('savings_goals'),('household_meals'),
 ('grocery_items'),('household_imports'))
select e.name as expected_public_table,
       pg_catalog.to_regclass('public.' || e.name) is not null as already_exists
from expected e order by e.name;

select pg_catalog.to_regclass('fcc_private.household_invitations') is not null
  as private_invitation_table_already_exists;

-- Do not infer the project is empty from missing Phase 2A tables alone.
-- Do not apply SQL if existing objects, production linkage, or role are unclear.
