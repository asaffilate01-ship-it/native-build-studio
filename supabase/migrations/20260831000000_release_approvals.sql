create table public.native_release_approvals (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.native_apps(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  tested_build_number bigint not null check (tested_build_number > 0),
  source_sha text not null check (source_sha ~ '^[0-9a-fA-F]{7,40}$'),
  qa_notes text not null check (length(qa_notes) >= 20),
  confirmation text not null,
  status text not null default 'approved'
    check (status in ('approved','dispatch_failed','submitted','failed','rejected','cancelled')),
  workflow_dispatch_at timestamptz,
  workflow_url text,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  submitted_at timestamptz,
  store_reference text,
  unique (app_id, platform, tested_build_number)
);

grant select, insert, update on public.native_release_approvals to authenticated;
grant all on public.native_release_approvals to service_role;
alter table public.native_release_approvals enable row level security;

create policy "release approvals read" on public.native_release_approvals
for select to authenticated using (public.is_org_member(org_id));

create policy "release approvals insert" on public.native_release_approvals
for insert to authenticated with check (
  approved_by = auth.uid()
  and public.has_org_role(org_id, array['owner','release_owner']::public.org_role[])
);

create policy "release approvals update" on public.native_release_approvals
for update to authenticated using (
  public.has_org_role(org_id, array['owner','release_owner']::public.org_role[])
);

create index on public.native_release_approvals (org_id, approved_at desc);
