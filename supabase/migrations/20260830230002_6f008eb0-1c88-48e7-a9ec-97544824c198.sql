create extension if not exists pgcrypto;

create type public.org_role as enum ('owner','release_owner','product_owner','member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.organisations to authenticated;
grant all on public.organisations to service_role;
alter table public.organisations enable row level security;

create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, insert, update, delete on public.organisation_members to authenticated;
grant all on public.organisation_members to service_role;
alter table public.organisation_members enable row level security;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisation_members m where m.org_id = _org and m.user_id = auth.uid());
$$;

create or replace function public.has_org_role(_org uuid, _roles public.org_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organisation_members m where m.org_id = _org and m.user_id = auth.uid() and m.role = any(_roles));
$$;

create policy "profiles readable by self" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles updatable by self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles insert self" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "orgs readable by members" on public.organisations for select to authenticated using (public.is_org_member(id));
create policy "orgs insert by creator" on public.organisations for insert to authenticated with check (created_by = auth.uid());
create policy "orgs update by owners" on public.organisations for update to authenticated using (public.has_org_role(id, array['owner']::public.org_role[]));

create policy "members readable by members" on public.organisation_members for select to authenticated using (public.is_org_member(org_id));
create policy "members insert bootstrap or owner" on public.organisation_members for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.organisations o where o.id = org_id and o.created_by = auth.uid())
              or public.has_org_role(org_id, array['owner']::public.org_role[]));
create policy "members update by owners" on public.organisation_members for update to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));
create policy "members delete by owners" on public.organisation_members for delete to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.native_apps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  suite text not null,
  app_role text not null default 'main',
  display_name text not null,
  source_repo text not null,
  source_ref text not null default 'main',
  engine text not null check (engine in ('capacitor','expo')),
  runner text not null check (runner in ('mac','github-macos','eas')),
  ios_bundle_id text not null unique,
  android_package text not null unique,
  credential_scope text not null default 'default',
  legal_owner text not null default '',
  public_brand text not null default '',
  support_url text not null default '',
  privacy_url text not null default '',
  apple_team_id text not null default '',
  apple_app_id text not null default '',
  google_developer_name text not null default '',
  manifest jsonb not null default '{}'::jsonb,
  store_record jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.native_apps to authenticated;
grant all on public.native_apps to service_role;
alter table public.native_apps enable row level security;
create trigger native_apps_touch before update on public.native_apps for each row execute function public.touch_updated_at();
create policy "apps read" on public.native_apps for select to authenticated using (public.is_org_member(org_id));
create policy "apps write" on public.native_apps for insert to authenticated with check (public.has_org_role(org_id, array['owner','release_owner','product_owner']::public.org_role[]));
create policy "apps update" on public.native_apps for update to authenticated using (public.has_org_role(org_id, array['owner','release_owner','product_owner']::public.org_role[]));
create policy "apps delete" on public.native_apps for delete to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create table public.native_app_plans (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  version int not null default 1,
  prompt text not null,
  plan_markdown text not null default '',
  confirmation_items jsonb not null default '[]'::jsonb,
  status text not null check (status in ('prompt_ready','draft','approved','superseded')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.native_app_plans to authenticated;
grant all on public.native_app_plans to service_role;
alter table public.native_app_plans enable row level security;
create policy "plans read" on public.native_app_plans for select to authenticated using (public.is_org_member(org_id));
create policy "plans insert" on public.native_app_plans for insert to authenticated with check (public.is_org_member(org_id));
create policy "plans update" on public.native_app_plans for update to authenticated using (public.has_org_role(org_id, array['owner','product_owner']::public.org_role[]));

create table public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.native_app_plans(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.plan_comments to authenticated;
grant all on public.plan_comments to service_role;
alter table public.plan_comments enable row level security;
create policy "comments read" on public.plan_comments for select to authenticated using (public.is_org_member(org_id));
create policy "comments insert" on public.plan_comments for insert to authenticated with check (public.is_org_member(org_id) and author_id = auth.uid());
create policy "comments delete own" on public.plan_comments for delete to authenticated using (author_id = auth.uid());

create table public.readiness_checks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  check_key text not null,
  label text not null,
  category text not null default 'general',
  state text not null default 'pending' check (state in ('pending','in_progress','done','not_applicable')),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (app_id, check_key)
);
grant select, insert, update, delete on public.readiness_checks to authenticated;
grant all on public.readiness_checks to service_role;
alter table public.readiness_checks enable row level security;
create trigger readiness_touch before update on public.readiness_checks for each row execute function public.touch_updated_at();
create policy "readiness read" on public.readiness_checks for select to authenticated using (public.is_org_member(org_id));
create policy "readiness write" on public.readiness_checks for insert to authenticated with check (public.is_org_member(org_id));
create policy "readiness update" on public.readiness_checks for update to authenticated using (public.is_org_member(org_id));
create policy "readiness delete" on public.readiness_checks for delete to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create table public.store_listings (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  locale text not null default 'en-GB',
  title text not null default '',
  subtitle text not null default '',
  short_description text not null default '',
  full_description text not null default '',
  keywords text not null default '',
  promotional_text text not null default '',
  release_notes text not null default '',
  support_url text not null default '',
  privacy_url text not null default '',
  account_deletion_url text not null default '',
  marketing_url text not null default '',
  apple_category text not null default '',
  google_category text not null default '',
  audience text not null default '',
  reviewer_notes text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  declarations jsonb not null default '{}'::jsonb,
  artwork jsonb not null default '{}'::jsonb,
  appflow_enabled boolean not null default false,
  appflow_app_id text not null default '',
  appflow_channel text not null default '',
  submission_status text not null default 'draft' check (submission_status in ('draft','ready','submitted','approved','rejected')),
  updated_at timestamptz not null default now(),
  unique (app_id, locale)
);
grant select, insert, update, delete on public.store_listings to authenticated;
grant all on public.store_listings to service_role;
alter table public.store_listings enable row level security;
create trigger listings_touch before update on public.store_listings for each row execute function public.touch_updated_at();
create policy "listings read" on public.store_listings for select to authenticated using (public.is_org_member(org_id));
create policy "listings insert" on public.store_listings for insert to authenticated with check (public.is_org_member(org_id));
create policy "listings update" on public.store_listings for update to authenticated using (public.is_org_member(org_id));
create policy "listings delete" on public.store_listings for delete to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create table public.native_build_jobs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  source_sha text,
  platform text not null check (platform in ('ios','android','all')),
  destination text not null default 'internal' check (destination in ('internal','production')),
  submit_to_internal boolean not null default false,
  upload_metadata boolean not null default false,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled')),
  runner_job_id text,
  runner_url text,
  artifact_refs jsonb not null default '[]'::jsonb,
  failure_summary text,
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
grant select, insert, update on public.native_build_jobs to authenticated;
grant all on public.native_build_jobs to service_role;
alter table public.native_build_jobs enable row level security;
create policy "builds read" on public.native_build_jobs for select to authenticated using (public.is_org_member(org_id));
create policy "builds update" on public.native_build_jobs for update to authenticated using (public.has_org_role(org_id, array['owner','release_owner']::public.org_role[]));

create table public.update_delivery (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  source_repo text not null,
  source_ref text not null default 'main',
  app_ids jsonb not null default '[]'::jsonb,
  auto_upload boolean not null default true,
  appflow_channel text not null default '',
  bridge_installed boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.update_delivery to authenticated;
grant all on public.update_delivery to service_role;
alter table public.update_delivery enable row level security;
create trigger delivery_touch before update on public.update_delivery for each row execute function public.touch_updated_at();
create policy "delivery read" on public.update_delivery for select to authenticated using (public.is_org_member(org_id));
create policy "delivery insert" on public.update_delivery for insert to authenticated with check (public.has_org_role(org_id, array['owner','release_owner']::public.org_role[]));
create policy "delivery update" on public.update_delivery for update to authenticated using (public.has_org_role(org_id, array['owner','release_owner']::public.org_role[]));
create policy "delivery delete" on public.update_delivery for delete to authenticated using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_email text not null default '',
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;
create policy "audit read" on public.audit_events for select to authenticated using (public.is_org_member(org_id));

create index on public.native_apps (org_id);
create index on public.native_build_jobs (org_id, requested_at desc);
create index on public.native_app_plans (app_id, created_at desc);
create index on public.audit_events (org_id, created_at desc);