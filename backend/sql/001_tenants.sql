-- Run once in the Supabase SQL Editor. All application data remains private.
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'factory_owner')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint owner_has_tenant check ((role = 'admin' and tenant_id is null) or (role = 'factory_owner' and tenant_id is not null))
);

-- The existing calculation engine reads one coherent snapshot of all related
-- collections. A revision guard prevents concurrent writes from overwriting.
create table if not exists public.tenant_states (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_states enable row level security;

create policy "users read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "users read own tenant" on public.tenants for select to authenticated
  using (id = (select tenant_id from public.profiles where id = (select auth.uid())));
create policy "members read their tenant state" on public.tenant_states for select to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = (select auth.uid()))
    or (select role from public.profiles where id = (select auth.uid())) = 'admin');
create policy "members update their tenant state" on public.tenant_states for update to authenticated
  using (tenant_id = (select tenant_id from public.profiles where id = (select auth.uid()))
    or (select role from public.profiles where id = (select auth.uid())) = 'admin')
  with check (tenant_id = (select tenant_id from public.profiles where id = (select auth.uid()))
    or (select role from public.profiles where id = (select auth.uid())) = 'admin');

create or replace function public.save_tenant_state(
  p_tenant_id uuid, p_expected_revision bigint, p_state jsonb
) returns bigint language plpgsql security invoker set search_path = public as $$
declare new_revision bigint;
begin
  update public.tenant_states
     set state = p_state, revision = revision + 1, updated_at = now()
   where tenant_id = p_tenant_id and revision = p_expected_revision
   returning revision into new_revision;
  if new_revision is null then
    raise exception 'Tenant state revision conflict or access denied';
  end if;
  return new_revision;
end;
$$;
revoke all on function public.save_tenant_state(uuid,bigint,jsonb) from public;
grant execute on function public.save_tenant_state(uuid,bigint,jsonb) to authenticated;
grant select on public.profiles, public.tenants, public.tenant_states to authenticated;
grant update on public.tenant_states to authenticated;

-- Supabase Postgres Changes sends updates only to subscribers allowed by RLS.
do $$ begin
  alter publication supabase_realtime add table public.tenant_states;
exception when duplicate_object then null;
end $$;
