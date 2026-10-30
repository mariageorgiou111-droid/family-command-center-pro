-- Family Command Center PRO - Shared Household Phase 2A
--
-- This migration is intentionally repository-only until it has been reviewed and
-- applied manually in the Supabase SQL Editor. It creates the household tenancy,
-- invitation, shared-domain, grants, and row-level security foundation.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema fcc_private;
revoke all on schema fcc_private from public, anon, authenticated;

create type public.household_role as enum ('owner', 'admin', 'member');
create type public.household_invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.household_import_status as enum ('started', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  date_format text not null default 'eu' check (date_format in ('eu', 'us', 'iso')),
  schema_version integer not null default 1 check (schema_version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_role not null,
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create index household_memberships_household_role_idx
  on public.household_memberships (household_id, role);

create table fcc_private.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_email extensions.citext not null,
  role public.household_role not null check (role in ('admin', 'member')),
  token_hash bytea not null unique,
  status public.household_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or status <> 'accepted'
  )
);

create index household_invitations_household_status_idx
  on fcc_private.household_invitations (household_id, status, expires_at);
create index household_invitations_email_status_idx
  on fcc_private.household_invitations (invited_email, status, expires_at);
create unique index household_invitations_one_pending_email_idx
  on fcc_private.household_invitations (household_id, invited_email)
  where status = 'pending';

-- Phase 1 generated string IDs include a collection prefix, so shared records use
-- household-scoped text keys rather than replacing those stable IDs with UUIDs.
create table public.household_events (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  event_date date,
  event_time time,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_tasks (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  due_date date,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High')),
  notes text not null default '',
  is_done boolean not null default false,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.cleaning_tasks (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  frequency text not null default 'Weekly',
  schedule text not null default '',
  assigned_to_text text not null default '',
  notes text not null default '',
  is_done boolean not null default false,
  last_completed_on date,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.home_care_items (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  due_date date,
  status text not null default 'To do',
  frequency text not null default 'One-off',
  last_serviced_on date,
  provider text not null default '',
  cost numeric(14,2) not null default 0 check (cost >= 0),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.home_care_history (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  home_care_item_id text not null,
  service_date date not null,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  provider text not null default '',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  foreign key (household_id, home_care_item_id)
    references public.home_care_items(household_id, id) on delete cascade
);

create table public.inventory_items (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  purchase_date date,
  warranty_until date,
  model_serial text not null default '',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_transactions (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  description text not null check (char_length(btrim(description)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  transaction_type text not null check (transaction_type in ('Income', 'Expense')),
  category text not null default 'Other',
  transaction_date date not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_bills (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  due_date date,
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, category)
);

create table public.savings_goals (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  deadline date,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_meals (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  meal_type text not null check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  meal_name text not null check (char_length(btrim(meal_name)) > 0),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  unique (household_id, day_of_week, meal_type)
);

create table public.grocery_items (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  item_name text not null check (char_length(btrim(item_name)) > 0),
  quantity text not null default '',
  category text not null default 'Other',
  is_bought boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.household_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  idempotency_key uuid not null,
  source_schema_version integer not null check (source_schema_version > 0),
  source_fingerprint text not null,
  status public.household_import_status not null default 'started',
  record_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (household_id, idempotency_key),
  unique (household_id, source_fingerprint)
);

-- Every household-scoped table receives an index beginning with household_id;
-- these indexes also keep membership-based RLS lookups inexpensive.
create index household_events_household_date_idx on public.household_events (household_id, event_date);
create index household_tasks_household_due_idx on public.household_tasks (household_id, due_date);
create index cleaning_tasks_household_idx on public.cleaning_tasks (household_id);
create index home_care_items_household_due_idx on public.home_care_items (household_id, due_date);
create index home_care_history_household_item_idx on public.home_care_history (household_id, home_care_item_id);
create index inventory_items_household_idx on public.inventory_items (household_id);
create index household_transactions_household_date_idx on public.household_transactions (household_id, transaction_date);
create index household_bills_household_due_idx on public.household_bills (household_id, due_date);
create index savings_goals_household_idx on public.savings_goals (household_id);
create index household_meals_household_idx on public.household_meals (household_id);
create index grocery_items_household_idx on public.grocery_items (household_id);
create index household_imports_household_user_idx on public.household_imports (household_id, user_id);

create or replace function fcc_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function fcc_private.set_shared_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
    new.created_at = now();
  else
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

create or replace function fcc_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function fcc_private.handle_new_user();

-- The trigger covers new accounts; this statement safely backfills accounts that
-- existed before the migration was applied.
insert into public.profiles (id, display_name)
select usr.id, coalesce(usr.raw_user_meta_data ->> 'display_name', '')
from auth.users usr
on conflict (id) do nothing;

create or replace function fcc_private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_memberships membership
    where membership.household_id = p_household_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function fcc_private.has_household_role(
  p_household_id uuid,
  p_roles public.household_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_memberships membership
    where membership.household_id = p_household_id
      and membership.user_id = auth.uid()
      and membership.role = any(p_roles)
  );
$$;

create or replace function fcc_private.shares_household(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_memberships mine
    join public.household_memberships theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_other_user_id
  );
$$;

create or replace function fcc_private.current_verified_email()
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when usr.email_confirmed_at is not null then usr.email::extensions.citext
    else null
  end
  from auth.users usr
  where usr.id = auth.uid();
$$;

create or replace function public.create_household(
  p_name text,
  p_currency text default 'EUR',
  p_date_format text default 'eu'
)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_memberships where user_id = auth.uid()) then
    raise exception 'User already belongs to a household' using errcode = '23505';
  end if;

  insert into public.households (name, currency, date_format, created_by)
  values (btrim(p_name), upper(p_currency), p_date_format, auth.uid())
  returning * into created_household;

  insert into public.household_memberships (household_id, user_id, role)
  values (created_household.id, auth.uid(), 'owner');

  return created_household;
end;
$$;

create or replace function public.create_household_invitation(
  p_household_id uuid,
  p_invited_email text,
  p_role public.household_role default 'member',
  p_expires_in interval default interval '7 days'
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text;
  normalized_email extensions.citext;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not fcc_private.has_household_role(p_household_id, array['owner', 'admin']::public.household_role[]) then
    raise exception 'Owner or admin role required' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invitations may grant only admin or member roles' using errcode = '22023';
  end if;
  if p_expires_in <= interval '5 minutes' or p_expires_in > interval '30 days' then
    raise exception 'Invitation expiry must be between 5 minutes and 30 days' using errcode = '22023';
  end if;

  normalized_email := lower(btrim(p_invited_email))::extensions.citext;
  if normalized_email is null or normalized_email::text !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'A valid invitation email is required' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.household_memberships membership
    join auth.users usr on usr.id = membership.user_id
    where membership.household_id = p_household_id
      and usr.email::extensions.citext = normalized_email
  ) then
    raise exception 'This user is already a household member' using errcode = '23505';
  end if;

  update fcc_private.household_invitations invitation
  set status = 'expired'
  where invitation.household_id = p_household_id
    and invitation.invited_email = normalized_email
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  if exists (
    select 1 from fcc_private.household_invitations invitation
    where invitation.household_id = p_household_id
      and invitation.invited_email = normalized_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email' using errcode = '23505';
  end if;
  if (
    select count(*)
    from fcc_private.household_invitations invitation
    where invitation.household_id = p_household_id
      and invitation.invited_by = auth.uid()
      and invitation.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Too many invitations have been created; try again later' using errcode = '54000';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into fcc_private.household_invitations as invitation (
    household_id, invited_email, role, token_hash, expires_at, invited_by
  ) values (
    p_household_id,
    normalized_email,
    p_role,
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    now() + p_expires_in,
    auth.uid()
  )
  returning invitation.id, invitation.expires_at
  into invitation_id, expires_at;
  invitation_token := raw_token;
  return next;
end;
$$;

create or replace function public.accept_household_invitation(p_invitation_token text)
returns table (household_id uuid, household_name text, assigned_role public.household_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched fcc_private.household_invitations;
  caller_email extensions.citext;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invitation_token is null or p_invitation_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation is invalid' using errcode = '22023';
  end if;
  caller_email := fcc_private.current_verified_email();
  if caller_email is null then
    raise exception 'A confirmed email address is required' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_memberships where user_id = auth.uid()) then
    raise exception 'User already belongs to a household' using errcode = '23505';
  end if;

  select invitation.* into matched
  from fcc_private.household_invitations invitation
  where invitation.token_hash = extensions.digest(convert_to(p_invitation_token, 'UTF8'), 'sha256')
  for update;

  if matched.id is null then
    raise exception 'Invitation is invalid' using errcode = '22023';
  end if;
  if matched.status <> 'pending' then
    raise exception 'Invitation is no longer available' using errcode = '22023';
  end if;
  if matched.expires_at <= now() then
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if matched.invited_email <> caller_email then
    raise exception 'Invitation was issued to a different email address' using errcode = '42501';
  end if;

  insert into public.household_memberships (household_id, user_id, role, invited_by)
  values (matched.household_id, auth.uid(), matched.role, matched.invited_by);

  update fcc_private.household_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = matched.id;

  return query
  select household.id, household.name, matched.role
  from public.households household
  where household.id = matched.household_id;
end;
$$;

create or replace function public.revoke_household_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_household_id uuid;
begin
  select household_id into invitation_household_id
  from fcc_private.household_invitations
  where id = p_invitation_id and status = 'pending'
  for update;

  if invitation_household_id is null then
    return false;
  end if;
  if not fcc_private.has_household_role(invitation_household_id, array['owner', 'admin']::public.household_role[]) then
    raise exception 'Owner or admin role required' using errcode = '42501';
  end if;

  update fcc_private.household_invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id;
  return true;
end;
$$;

create or replace function public.list_household_invitations(p_household_id uuid)
returns table (
  invitation_id uuid,
  invited_email text,
  role public.household_role,
  status public.household_invitation_status,
  expires_at timestamptz,
  invited_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not fcc_private.has_household_role(p_household_id, array['owner', 'admin']::public.household_role[]) then
    raise exception 'Owner or admin role required' using errcode = '42501';
  end if;
  return query
  select invitation.id, invitation.invited_email::text, invitation.role,
         case
           when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired'::public.household_invitation_status
           else invitation.status
         end,
         invitation.expires_at, invitation.invited_by, invitation.created_at
  from fcc_private.household_invitations invitation
  where invitation.household_id = p_household_id
  order by invitation.created_at desc;
end;
$$;

-- Keep updated_at trustworthy without requiring every browser mutation to set it.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles', 'households', 'household_memberships'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function fcc_private.set_updated_at()',
      relation_name
    );
  end loop;
end;
$$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'household_events', 'household_tasks', 'cleaning_tasks', 'home_care_items',
    'home_care_history', 'inventory_items', 'household_transactions',
    'household_bills', 'household_budgets', 'savings_goals',
    'household_meals', 'grocery_items'
  ] loop
    execute format(
      'create trigger set_shared_audit_fields before insert or update on public.%I for each row execute function fcc_private.set_shared_audit_fields()',
      relation_name
    );
  end loop;
end;
$$;

-- RLS is enabled explicitly even though the project setting also enables it for
-- newly created tables. This makes the migration portable and reviewable.
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.household_events enable row level security;
alter table public.household_tasks enable row level security;
alter table public.cleaning_tasks enable row level security;
alter table public.home_care_items enable row level security;
alter table public.home_care_history enable row level security;
alter table public.inventory_items enable row level security;
alter table public.household_transactions enable row level security;
alter table public.household_bills enable row level security;
alter table public.household_budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.household_meals enable row level security;
alter table public.grocery_items enable row level security;
alter table public.household_imports enable row level security;

create policy profiles_select_household
  on public.profiles for select to authenticated
  using (id = auth.uid() or fcc_private.shares_household(id));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy households_select_member
  on public.households for select to authenticated
  using (fcc_private.is_household_member(id));
create policy households_update_admin
  on public.households for update to authenticated
  using (fcc_private.has_household_role(id, array['owner', 'admin']::public.household_role[]))
  with check (fcc_private.has_household_role(id, array['owner', 'admin']::public.household_role[]));

create policy memberships_select_household
  on public.household_memberships for select to authenticated
  using (fcc_private.is_household_member(household_id));

-- Apply identical household membership boundaries to all ordinary shared data.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'household_events', 'household_tasks', 'cleaning_tasks', 'home_care_items',
    'home_care_history', 'inventory_items', 'household_transactions',
    'household_bills', 'household_budgets', 'savings_goals',
    'household_meals', 'grocery_items'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (fcc_private.is_household_member(household_id))',
      relation_name || '_select_member', relation_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (fcc_private.is_household_member(household_id) and created_by = auth.uid() and updated_by = auth.uid())',
      relation_name || '_insert_member', relation_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (fcc_private.is_household_member(household_id)) with check (fcc_private.is_household_member(household_id) and updated_by = auth.uid())',
      relation_name || '_update_member', relation_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (fcc_private.is_household_member(household_id))',
      relation_name || '_delete_member', relation_name
    );
  end loop;
end;
$$;

create policy household_imports_select_own
  on public.household_imports for select to authenticated
  using (
    user_id = auth.uid()
    and fcc_private.has_household_role(household_id, array['owner', 'admin']::public.household_role[])
  );

-- Automatic table exposure is disabled for the project, so grants are explicit.
-- anon receives no access to household or profile tables. Revoke only Phase 2A
-- objects so this migration cannot disturb unrelated application objects.
revoke all on table public.profiles, public.households, public.household_memberships,
  public.household_events, public.household_tasks, public.cleaning_tasks,
  public.home_care_items, public.home_care_history, public.inventory_items,
  public.household_transactions, public.household_bills, public.household_budgets,
  public.savings_goals, public.household_meals, public.grocery_items,
  public.household_imports from anon, authenticated;

grant select, update (display_name) on public.profiles to authenticated;
grant select, update (name, currency, date_format) on public.households to authenticated;
grant select on public.household_memberships to authenticated;
grant select, insert, delete, update (title, event_date, event_time, notes)
  on public.household_events to authenticated;
grant select, insert, delete, update (title, due_date, priority, notes, is_done, completed_at)
  on public.household_tasks to authenticated;
grant select, insert, delete, update (title, frequency, schedule, assigned_to_text, notes, is_done, last_completed_on)
  on public.cleaning_tasks to authenticated;
grant select, insert, delete, update (title, due_date, status, frequency, last_serviced_on, provider, cost, notes)
  on public.home_care_items to authenticated;
grant select, insert, delete, update (service_date, cost, provider, notes)
  on public.home_care_history to authenticated;
grant select, insert, delete, update (name, purchase_date, warranty_until, model_serial, notes)
  on public.inventory_items to authenticated;
grant select, insert, delete, update (description, amount, transaction_type, category, transaction_date)
  on public.household_transactions to authenticated;
grant select, insert, delete, update (name, amount, due_date, is_paid, paid_at)
  on public.household_bills to authenticated;
grant select, insert, delete, update (amount)
  on public.household_budgets to authenticated;
grant select, insert, delete, update (name, target_amount, saved_amount, deadline)
  on public.savings_goals to authenticated;
grant select, insert, delete, update (day_of_week, meal_type, meal_name, notes)
  on public.household_meals to authenticated;
grant select, insert, delete, update (item_name, quantity, category, is_bought)
  on public.grocery_items to authenticated;
grant select on public.household_imports to authenticated;

revoke all on function public.create_household(text, text, text) from public, anon;
revoke all on function public.create_household_invitation(uuid, text, public.household_role, interval) from public, anon;
revoke all on function public.accept_household_invitation(text) from public, anon;
revoke all on function public.revoke_household_invitation(uuid) from public, anon;
revoke all on function public.list_household_invitations(uuid) from public, anon;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.create_household_invitation(uuid, text, public.household_role, interval) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
grant execute on function public.list_household_invitations(uuid) to authenticated;

revoke all on function fcc_private.set_updated_at() from public, anon, authenticated;
revoke all on function fcc_private.set_shared_audit_fields() from public, anon, authenticated;
revoke all on function fcc_private.handle_new_user() from public, anon, authenticated;
revoke all on function fcc_private.is_household_member(uuid) from public, anon, authenticated;
revoke all on function fcc_private.has_household_role(uuid, public.household_role[]) from public, anon, authenticated;
revoke all on function fcc_private.shares_household(uuid) from public, anon, authenticated;
revoke all on function fcc_private.current_verified_email() from public, anon, authenticated;
revoke all on table fcc_private.household_invitations from public, anon, authenticated;
-- These helpers are embedded in RLS expressions. authenticated needs EXECUTE,
-- plus schema USAGE. fcc_private remains outside the Data API exposed schemas.
grant usage on schema fcc_private to authenticated;
grant execute on function fcc_private.is_household_member(uuid) to authenticated;
grant execute on function fcc_private.has_household_role(uuid, public.household_role[]) to authenticated;
grant execute on function fcc_private.shares_household(uuid) to authenticated;

commit;
