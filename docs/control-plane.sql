-- Native Factory control plane. Run in a dedicated Supabase project.
-- The service-role key belongs only on the Python server/worker and must never
-- be placed in Lovable or browser code.
create extension if not exists pgcrypto;

create table if not exists public.native_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name text not null,
  legal_owner text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.native_organization_members (
  organization_id uuid not null references public.native_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'planner', 'release_manager', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.native_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  organization_id uuid not null references public.native_organizations(id) on delete cascade,
  suite text not null,
  app_role text not null default 'main',
  display_name text not null,
  source_repo text not null,
  source_ref text not null default 'main',
  engine text not null check (engine in ('capacitor', 'expo')),
  runner text not null check (runner in ('mac', 'github-macos', 'eas')),
  ios_bundle_id text not null unique,
  android_package text not null unique,
  credential_scope text not null,
  manifest jsonb not null default '{}'::jsonb,
  store_record jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.native_app_plans (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references public.native_apps(slug) on delete cascade,
  prompt text not null,
  plan_markdown text not null default '',
  status text not null check (status in ('prompt_ready', 'draft', 'approved', 'superseded')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.native_build_jobs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  source_sha text,
  platform text not null check (platform in ('ios', 'android', 'all')),
  submit_to_internal boolean not null default false,
  upload_metadata boolean not null default false,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  runner_job_id text,
  runner_url text,
  artifact_refs jsonb not null default '[]'::jsonb,
  failure_summary text,
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.native_release_approvals (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  tested_build_number bigint not null,
  source_sha text not null,
  status text not null check (status in ('draft', 'approved', 'submitted', 'rejected', 'cancelled')),
  qa_notes text not null default '',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  submitted_at timestamptz,
  store_reference text,
  created_at timestamptz not null default now(),
  unique(app_id, platform, tested_build_number)
);

create or replace function public.touch_native_app_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists native_apps_touch_updated_at on public.native_apps;
create trigger native_apps_touch_updated_at before update on public.native_apps
for each row execute function public.touch_native_app_updated_at();

create or replace function public.queue_native_build(
  target_slug text, target_platform text, should_submit boolean default false,
  should_upload_metadata boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare target_app_id uuid; new_job_id uuid;
begin
  if target_platform not in ('ios', 'android', 'all') then raise exception 'Invalid platform'; end if;
  select id into target_app_id from public.native_apps where slug = target_slug and active;
  if target_app_id is null then raise exception 'Unknown or inactive app'; end if;
  insert into public.native_build_jobs(app_id, platform, submit_to_internal, upload_metadata, status)
  values(target_app_id, target_platform, should_submit, should_upload_metadata, 'queued')
  returning id into new_job_id;
  return new_job_id;
end;
$$;

alter table public.native_apps enable row level security;
alter table public.native_app_plans enable row level security;
alter table public.native_build_jobs enable row level security;
alter table public.native_organizations enable row level security;
alter table public.native_organization_members enable row level security;
alter table public.native_release_approvals enable row level security;

create or replace function public.is_native_org_member(target_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.native_organization_members
    where organization_id = target_organization and user_id = auth.uid()
  );
$$;

create policy "members read organisations" on public.native_organizations
for select using (public.is_native_org_member(id));
create policy "members read memberships" on public.native_organization_members
for select using (public.is_native_org_member(organization_id));
create policy "members read apps" on public.native_apps
for select using (public.is_native_org_member(organization_id));
create policy "members read plans" on public.native_app_plans
for select using (exists (
  select 1 from public.native_apps a
  where a.slug = native_app_plans.app_slug and public.is_native_org_member(a.organization_id)
));
create policy "members read build jobs" on public.native_build_jobs
for select using (exists (
  select 1 from public.native_apps a
  where a.id = native_build_jobs.app_id and public.is_native_org_member(a.organization_id)
));
create policy "members read release approvals" on public.native_release_approvals
for select using (exists (
  select 1 from public.native_apps a
  where a.id = native_release_approvals.app_id and public.is_native_org_member(a.organization_id)
));

-- No anonymous writes are installed. The Python service role creates
-- organisations/members and performs planning/build/release mutations through
-- narrow authenticated endpoints. Lovable uses only the public anon key plus
-- the signed-in user's JWT and receives organisation-scoped read access.
revoke all on function public.queue_native_build(text, text, boolean, boolean)
from public, anon, authenticated;
