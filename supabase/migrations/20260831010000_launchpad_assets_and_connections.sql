-- Guided launchpad fields. These are operational settings, never secret values.
alter table public.native_apps
  add column if not exists live_url text not null default '',
  add column if not exists package_manager text not null default 'bun'
    check (package_manager in ('bun','npm','pnpm','yarn')),
  add column if not exists install_command text not null default 'bun install --frozen-lockfile',
  add column if not exists build_command text not null default 'bun run build',
  add column if not exists web_dir text not null default 'dist',
  add column if not exists version text not null default '1.0.0',
  add column if not exists build_number bigint not null default 1 check (build_number > 0),
  add column if not exists capabilities jsonb not null default '[]'::jsonb,
  add column if not exists github_environment text not null default '';

alter table public.store_listings
  add column if not exists copyright text not null default '',
  add column if not exists age_rating_notes text not null default '',
  add column if not exists compliance_notes text not null default '',
  add column if not exists marketing_notes text not null default '',
  add column if not exists release_checks jsonb not null default '{}'::jsonb;

create table public.app_connections (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null check (provider in ('apple','google','github','appflow')),
  status text not null default 'not_started'
    check (status in ('not_started','details_added','secrets_added','verified','blocked')),
  account_name text not null default '',
  account_email text not null default '',
  external_id text not null default '',
  key_id text not null default '',
  issuer_id text not null default '',
  service_account_email text not null default '',
  environment_name text not null default '',
  secret_names jsonb not null default '[]'::jsonb,
  notes text not null default '',
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, provider)
);
grant select, insert, update, delete on public.app_connections to authenticated;
grant all on public.app_connections to service_role;
alter table public.app_connections enable row level security;
create trigger app_connections_touch before update on public.app_connections
for each row execute function public.touch_updated_at();
create policy "connections read" on public.app_connections for select to authenticated
using (public.is_org_member(org_id));
create policy "connections insert" on public.app_connections for insert to authenticated
with check (public.has_org_role(org_id, array['owner','release_owner']::public.org_role[]));
create policy "connections update" on public.app_connections for update to authenticated
using (public.has_org_role(org_id, array['owner','release_owner']::public.org_role[]));
create policy "connections delete" on public.app_connections for delete to authenticated
using (public.has_org_role(org_id, array['owner']::public.org_role[]));

create table public.app_assets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  asset_type text not null check (asset_type in (
    'app_icon','splash','apple_screenshot','google_screenshot',
    'google_feature_graphic','firebase_android','firebase_ios','other'
  )),
  locale text not null default 'en-GB',
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  status text not null default 'uploaded' check (status in ('uploaded','approved','rejected')),
  notes text not null default '',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.app_assets to authenticated;
grant all on public.app_assets to service_role;
alter table public.app_assets enable row level security;
create policy "assets read" on public.app_assets for select to authenticated
using (public.is_org_member(org_id));
create policy "assets insert" on public.app_assets for insert to authenticated
with check (uploaded_by = auth.uid() and public.is_org_member(org_id));
create policy "assets update" on public.app_assets for update to authenticated
using (public.is_org_member(org_id));
create policy "assets delete" on public.app_assets for delete to authenticated
using (public.has_org_role(org_id, array['owner','release_owner','product_owner']::public.org_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'native-app-assets',
  'native-app-assets',
  false,
  20971520,
  array['image/png','image/jpeg','application/json','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object names always begin with the organisation UUID. The metadata table
-- remains the source of truth for which app and slot each object belongs to.
create policy "native assets read" on storage.objects for select to authenticated
using (
  bucket_id = 'native-app-assets'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);
create policy "native assets upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'native-app-assets'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);
create policy "native assets update" on storage.objects for update to authenticated
using (
  bucket_id = 'native-app-assets'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);
create policy "native assets delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'native-app-assets'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['owner','release_owner','product_owner']::public.org_role[]
  )
);

create index on public.app_connections (org_id, app_id);
create index on public.app_assets (org_id, app_id, asset_type, created_at desc);
