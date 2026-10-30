-- Read-only Phase 2A schema/RLS verification.
-- Run in the Supabase SQL Editor only after applying the matching migration.
-- A successful run returns one final row and makes no data changes.

do $$
declare
  required_tables constant text[] := array[
    'profiles', 'households', 'household_memberships', 'household_events',
    'household_tasks', 'cleaning_tasks', 'home_care_items', 'home_care_history',
    'inventory_items', 'household_transactions', 'household_bills',
    'household_budgets', 'savings_goals', 'household_meals', 'grocery_items',
    'household_imports'
  ];
  shared_tables constant text[] := array[
    'household_events', 'household_tasks', 'cleaning_tasks', 'home_care_items',
    'home_care_history', 'inventory_items', 'household_transactions',
    'household_bills', 'household_budgets', 'savings_goals',
    'household_meals', 'grocery_items'
  ];
  public_rpcs constant text[] := array[
    'create_household', 'create_household_invitation',
    'accept_household_invitation', 'revoke_household_invitation',
    'list_household_invitations'
  ];
  relation_name text;
  rpc_name text;
  policy_count integer;
  primary_key_definition text;
begin
  foreach relation_name in array required_tables loop
    if to_regclass('public.' || relation_name) is null then
      raise exception 'Missing Phase 2A table: public.%', relation_name;
    end if;
    if not coalesce((
      select cls.relrowsecurity
      from pg_class cls
      join pg_namespace ns on ns.oid = cls.relnamespace
      where ns.nspname = 'public' and cls.relname = relation_name
    ), false) then
      raise exception 'RLS is disabled on public.%', relation_name;
    end if;
  end loop;

  if to_regclass('fcc_private.household_invitations') is null then
    raise exception 'Missing private invitation table';
  end if;
  if has_schema_privilege('anon', 'fcc_private', 'USAGE') then
    raise exception 'anon has USAGE on fcc_private';
  end if;
  if not has_schema_privilege('authenticated', 'fcc_private', 'USAGE') then
    raise exception 'authenticated lacks fcc_private USAGE required by RLS helpers';
  end if;
  if has_table_privilege('anon', 'fcc_private.household_invitations', 'SELECT')
     or has_table_privilege('authenticated', 'fcc_private.household_invitations', 'SELECT') then
    raise exception 'A browser API role can read invitation secrets';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants grants
    where grants.table_schema in ('public', 'fcc_private')
      and grants.grantee = 'anon'
      and grants.table_name = any(required_tables || array['household_invitations'])
  ) then
    raise exception 'anon unexpectedly has a Phase 2A table grant';
  end if;

  foreach relation_name in array shared_tables loop
    select count(*) into policy_count
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = relation_name
      and policy.cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      and 'authenticated'::name = any(policy.roles);
    if policy_count <> 4 then
      raise exception 'Expected four authenticated CRUD policies on public.%, found %', relation_name, policy_count;
    end if;

    if exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = relation_name
        and policy.roles && array['anon'::name, 'public'::name]
    ) then
      raise exception 'public.% has a policy available to anon/public', relation_name;
    end if;

    if not exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public' and policy.tablename = relation_name
        and policy.cmd = 'SELECT'
        and position('fcc_private.is_household_member(household_id)' in coalesce(policy.qual, '')) > 0
    ) then
      raise exception 'public.% SELECT policy is not household-scoped', relation_name;
    end if;
    if not exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public' and policy.tablename = relation_name
        and policy.cmd = 'INSERT'
        and position('fcc_private.is_household_member(household_id)' in coalesce(policy.with_check, '')) > 0
        and position('auth.uid()' in coalesce(policy.with_check, '')) > 0
    ) then
      raise exception 'public.% INSERT policy lacks membership/audit checks', relation_name;
    end if;
    if not exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public' and policy.tablename = relation_name
        and policy.cmd = 'UPDATE'
        and position('fcc_private.is_household_member(household_id)' in coalesce(policy.qual, '')) > 0
        and position('fcc_private.is_household_member(household_id)' in coalesce(policy.with_check, '')) > 0
        and position('auth.uid()' in coalesce(policy.with_check, '')) > 0
    ) then
      raise exception 'public.% UPDATE policy lacks membership/audit checks', relation_name;
    end if;
    if not exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public' and policy.tablename = relation_name
        and policy.cmd = 'DELETE'
        and position('fcc_private.is_household_member(household_id)' in coalesce(policy.qual, '')) > 0
    ) then
      raise exception 'public.% DELETE policy is not household-scoped', relation_name;
    end if;

    if relation_name <> 'household_budgets' then
      select pg_get_constraintdef(con.oid) into primary_key_definition
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
      where ns.nspname = 'public' and cls.relname = relation_name and con.contype = 'p';
      if primary_key_definition <> 'PRIMARY KEY (household_id, id)' then
        raise exception 'public.% does not have a household-scoped primary key: %', relation_name, primary_key_definition;
      end if;
    end if;

    if not has_table_privilege('authenticated', 'public.' || relation_name, 'SELECT')
       or not has_table_privilege('authenticated', 'public.' || relation_name, 'INSERT')
       or not has_table_privilege('authenticated', 'public.' || relation_name, 'DELETE') then
      raise exception 'authenticated lacks required shared-data privileges on public.%', relation_name;
    end if;
    if has_column_privilege('authenticated', 'public.' || relation_name, 'household_id', 'UPDATE')
       or (relation_name <> 'household_budgets'
           and has_column_privilege('authenticated', 'public.' || relation_name, 'id', 'UPDATE'))
       or has_column_privilege('authenticated', 'public.' || relation_name, 'created_by', 'UPDATE')
       or has_column_privilege('authenticated', 'public.' || relation_name, 'created_at', 'UPDATE') then
      raise exception 'authenticated can update protected tenant/audit columns on public.%', relation_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households'
      and cmd = 'SELECT' and position('fcc_private.is_household_member(id)' in coalesce(qual, '')) > 0
  ) or not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households'
      and cmd = 'UPDATE' and position('fcc_private.has_household_role' in coalesce(qual, '')) > 0
  ) then
    raise exception 'Household policies do not enforce member-read/admin-update separation';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships'
      and cmd = 'SELECT' and position('fcc_private.is_household_member(household_id)' in coalesce(qual, '')) > 0
  ) then
    raise exception 'Membership SELECT policy is not household-scoped';
  end if;
  if has_table_privilege('authenticated', 'public.household_memberships', 'INSERT')
     or has_table_privilege('authenticated', 'public.household_memberships', 'UPDATE')
     or has_table_privilege('authenticated', 'public.household_memberships', 'DELETE') then
    raise exception 'authenticated can mutate memberships directly';
  end if;
  if has_table_privilege('authenticated', 'public.households', 'INSERT')
     or has_table_privilege('authenticated', 'public.households', 'DELETE')
     or has_column_privilege('authenticated', 'public.households', 'created_by', 'UPDATE')
     or has_column_privilege('authenticated', 'public.households', 'schema_version', 'UPDATE') then
    raise exception 'authenticated has an unsafe direct household privilege';
  end if;

  foreach rpc_name in array public_rpcs loop
    if not exists (
      select 1 from pg_proc proc
      join pg_namespace ns on ns.oid = proc.pronamespace
      where ns.nspname = 'public' and proc.proname = rpc_name
        and proc.prosecdef
        and position('search_path=' in coalesce(array_to_string(proc.proconfig, ','), '')) > 0
    ) then
      raise exception 'RPC public.% is missing SECURITY DEFINER or a pinned search_path', rpc_name;
    end if;
    if exists (
      select 1 from pg_proc proc join pg_namespace ns on ns.oid = proc.pronamespace
      where ns.nspname = 'public' and proc.proname = rpc_name
        and has_function_privilege('anon', proc.oid, 'EXECUTE')
    ) then
      raise exception 'anon can execute public.%', rpc_name;
    end if;
    if not exists (
      select 1 from pg_proc proc join pg_namespace ns on ns.oid = proc.pronamespace
      where ns.nspname = 'public' and proc.proname = rpc_name
        and has_function_privilege('authenticated', proc.oid, 'EXECUTE')
    ) then
      raise exception 'authenticated cannot execute public.%', rpc_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc proc
    join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname in ('public', 'fcc_private')
      and proc.proname in (
        'create_household', 'create_household_invitation', 'accept_household_invitation',
        'revoke_household_invitation', 'list_household_invitations',
        'handle_new_user', 'is_household_member', 'has_household_role',
        'shares_household', 'current_verified_email'
      )
      and proc.prosecdef
      and position('search_path=' in coalesce(array_to_string(proc.proconfig, ','), '')) = 0
  ) then
    raise exception 'A SECURITY DEFINER function has an unpinned search_path';
  end if;
end;
$$;

select 'Phase 2A schema, RLS, grants, RPC security, and tenant-isolation checks passed' as result;
