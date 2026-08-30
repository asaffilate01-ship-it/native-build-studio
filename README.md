# Native Build Studio

Native Factory Studio — Windows to Store Approval

This starts with a Lovable SaaS app and finishes with branded Android and iOS builds in testing, ready for a human to submit for review. Your Windows PC runs Studio; GitHub-hosted macOS compiles iOS. You do not need a Mac mini.

What is automatic

StageFactory handlesBrand/operator handlesCapacitor readinessGenerates a role-aware brief and validates distLovable/ChatGPT implements and commits itNative wrapperGenerates native folders, IDs, icons, plugins and runtime roleConfirms capabilities and permanent IDsSigning/buildUses protected secrets and a hosted MacOpens developer accounts and grants API accessStore listingSaves copy, URLs, declarations and artwork; creates Fastlane metadataConfirms policy answers and marketing claimsTestingUploads to TestFlight and Play Internal TestingInvites testers and approves QAProductionProduces the hand-off and tested buildNamed operator submits/releases it

1. Make Lovable Capacitor-ready

Connect the Lovable project to a brand-owned or managed GitHub repository.

Start START_NATIVE_FACTORY_STUDIO.cmd on Windows.

Create the app in Apps & suites. For multiple role apps, reuse one suite and assign unique permanent IDs, for example:

haccora-customer → uk.co.haccora.customer

haccora-driver → uk.co.haccora.driver

haccora-kitchen → uk.co.haccora.kitchen

In Capacitor ready, generate the brief.

Paste briefs/<slug>/CAPACITOR_READY_BRIEF.md into Lovable or ChatGPT. Ask it to implement every item, run a clean build, and commit the result.

Confirm the repository produces dist/index.html. Do not commit generated ios/ or android/ directories; the factory creates clean native projects per build.

The bundle/package ID is permanent technical identity, not the public seller name. Each brand can own its Apple and Google accounts while using IDs such as uk.co.haccora.customer.

2. Create the brand developer accounts

Google Play

The brand owns its Play Console account and completes identity/organisation verification.

Create each app with the exact Android package ID saved in Studio.

Enable Play App Signing.

Create the upload keystore once and keep an offline recovery copy.

Create a restricted service account with only the app/release permissions needed by this pipeline, then download its JSON key.

Apple

The brand enrols in the Apple Developer Program as the organisation that should appear as seller.

Register each Bundle ID exactly as saved in Studio.

Create the app in App Store Connect and save its numeric Apple App ID.

Create a minimum-role App Store Connect API key. Save the Key ID, Issuer ID and downloaded .p8.

Create a private Git repository for Fastlane Match signing material.

Apple's public seller/developer name is account-wide. If Haccora must appear as seller, the accepted Haccora legal organisation/trading name must own that account. A Bundle ID does not change seller name.

3. Complete the submission workspace

In Apps & suites, record legal owner, public brand, public URLs, Apple Team/App IDs and Google developer name. In Store listing, complete:

title, subtitle, short/full descriptions, keywords, promotional text and release notes;

support, privacy, account-deletion and marketing URLs;

categories, audience, reviewer notes and contact details;

ads, tracking, personal-data, account creation, children, encryption, UGC and regulated-feature declarations;

Apple screenshots, Google screenshots and Google feature graphic.

These switches prepare the hand-off; they do not replace Apple App Privacy or Google Data Safety. Verify all production data flows and third-party SDKs before submission.

4. Send credentials securely

Install GitHub CLI on Windows and run gh auth login.

Publish the factory to a private GitHub repository from Overview.

In Store access, select the app and factory repository.

Enter Apple API identifiers, .p8, private Match repository/token/password, Android keystore, Play service-account JSON and keystore passwords.

If reviewers require login, add a dedicated review username/password here—not in reviewer notes.

Press Send secrets to GitHub.

Studio sends secret values directly to the app-specific GitHub Environment. It does not store them in apps.yml, Studio settings or hand-off files.

5. Link Lovable/GitHub changes to the apps

In Update delivery, install the bridge in the source repository and select every role app built from it. Keep Automatically upload every successful change to TestFlight / Play Internal Testing enabled.

On every push, the bridge installs dependencies and builds dist. Only a successful web build dispatches native jobs. Each selected role receives its own runtime role, ID, signed binary and internal-test upload. This deliberately does not auto-release to production.

Optional direct installed-app web updates

Ionic Appflow Live Updates can deliver approved HTML/CSS/JavaScript changes from the same GitHub repo:

Import/connect the repository in Appflow.

Add the current Appflow Live Updates SDK/config to the initial native binary using Appflow's integration guide.

In Store listing, choose Appflow live web updates, enter the Appflow App ID/channel, and save the Ionic token in Store access.

Ship and test the first signed binary through TestFlight/Play.

Configure Appflow channel assignment and rollback. Promote only web-layer commits that passed device QA.

New plugins, permissions, native SDKs, icons, launch screens, IDs and review-significant behaviour require a new signed store build.

6. Build and test

In Builds & output, build Android first using Internal build + listing metadata.

Confirm the AAB reaches Play Internal Testing and install from the tester link.

Build iOS and confirm it reaches TestFlight; complete export-compliance questions if requested.

Test every role on real devices: install/upgrade, auth, deletion, push, camera/files, links, slow/offline network, background/resume, keyboard, safe areas, tablets and accessibility.

Fix issues in Lovable/GitHub. The next commit automatically creates the next internal builds.

7. Approval and production

Generate the store package and review store-packages/<slug>/SUBMISSION_HANDOFF.md.

Verify artwork, copy and claims match the tested build.

Complete Apple App Privacy and Play Data Safety from actual production behaviour.

Supply a permanent reviewer account when login is required.

Select the tested build in App Store Connect and submit for review.

Promote the Play internal release using a staged rollout.

Monitor crashes, auth, API health and reviews; keep release/rollback ownership explicit.

Windows-compatible Mac choices

ChoiceWorks from WindowsBest useGitHub-hosted macOSYesDefault; no hardware and isolated buildsIonic AppflowYesManaged Capacitor builds/live updates; paid serviceCodemagic or BitriseYesAlternative hosted macOS CI; adapt the included workflowApple Silicon Mac miniControlled remotelyHigh sustained volume and predictable local costEAS BuildYes, for Expo/React NativeNot the default compiler for this Capacitor wrapper

Start with GitHub-hosted macOS. Consider a Mac mini only when build volume and queue costs justify operating it.  8

9

10

11

12

13

14

15

16

17

18

19

20

21

22

23

24

25

26

27

28

29

30

31

32

33

34

35

36

37

38

39

40

41

42

43

44

45

46

47

48

49

50

51

52

53

54

55

56

57

58

59

60

61

62

63

64

65

66

67

68

69

70

71

72

73

74

75

76

77

78

79

80

81

82

83

84

85

86

87

88

89

-- Native Factory control plane. Run in a dedicated Supabase project.

 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),

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

-- No anon policies are installed. Add organisation/member policies before

-- exposing records to Lovable. The Python service role performs sync/build

-- operations through narrow server endpoints.

revoke all on function public.queue_native_build(text, text, boolean, boolean)

from public, anon, authenticated;


Python + Supabase + Lovable architecture

Responsibility map

LayerOwnsMust not receiveLovable UIOperator forms, authenticated portfolio views, plan/build statusSupabase service role, signing keys, OpenAI API keySupabaseAuth, app/build/plan records, RLS, realtime statusRaw Apple .p8, Android keystore passwordsPython control planeValidation, planning prompts, Supabase sync, GitHub dispatch, metadata generationPublic browser access without authenticationGitHub EnvironmentsPer-app Apple/Google/signing/reviewer secretsLovable client accessmacOS runner/AppflowNative compilation and internal-test uploadsCross-brand credentials outside the selected environmentChatGPT/OpenAI APIDraft plan, backlog, QA/store copy questionsSigning credentials or unreviewed production authority

Local pilot

Create a dedicated Supabase project.

Run docs/control-plane.sql in the SQL editor.

Copy .env.example to .env outside version control and set the server values in your Windows PowerShell session.

Start Native Factory Studio.

Configure apps, then press Sync apps to Supabase.

In Capacitor ready, enter product goals and create a ChatGPT planning pack. Without API settings, Studio writes a prompt you can paste into ChatGPT. With OPENAI_API_KEY and an explicitly selected OPENAI_MODEL, the Python server writes the returned draft plan and syncs it to Supabase.

Production hosting

Host the Python control plane on a private service such as Azure Container Apps, Google Cloud Run, Railway or Render. Put SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY and GitHub App credentials in that host's secret manager. Do not expose the current local Studio directly to the internet; it is intentionally bound to 127.0.0.1.

The production Lovable UI should:

Use Supabase Auth with the public project URL and anon/publishable key.

Read only organisation-scoped app, plan and build-status rows allowed by RLS.

Send privileged commands to authenticated Python endpoints.

Let Python verify the signed-in user's organisation/role before syncing apps, calling OpenAI, dispatching GitHub or changing approval status.

Subscribe to build rows for realtime progress.

Before exposing any records, add organisations, memberships and RLS policies appropriate to your tenancy. The starter SQL intentionally creates no anonymous policies.

Planning lifecycle

stateDiagram-v2
    [*] --> PromptReady
    PromptReady --> Draft: ChatGPT/OpenAI plan
    Draft --> Draft: Human edits
    Draft --> Approved: Product owner approval
    Approved --> BuildQueued: Release owner queues test
    BuildQueued --> Tested: Device QA passes
    Tested --> Submitted: Human store submission
    Draft --> Superseded: Requirements changed

ChatGPT is a drafting partner, not an approver. Unknown data practices, regulated claims, account ownership, legal text and completed test results stay marked for human confirmation.

Recommended next production module

Replace the local-only admin transport with an authenticated Python API and worker queue:

POST /v1/apps/{slug}/plans — create prompt/draft;

POST /v1/apps/{slug}/sync — validate and sync metadata;

POST /v1/apps/{slug}/builds — create job and dispatch GitHub;

POST /v1/build-webhook — update job status from GitHub;

POST /v1/apps/{slug}/approve — role-gated plan/release approval.

Use idempotency keys for build requests and a GitHub App instead of long-lived personal access tokens once the pilot is proven.


Prompt for the Lovable control-plane UI

Build a responsive authenticated SaaS dashboard named Native Factory Control Plane. Use Supabase Auth and typed Supabase queries. Do not place any service-role, OpenAI, Apple, Google, GitHub signing or reviewer credential in browser code.

Required screens:

Portfolio: suites, role apps, brand owner, permanent IDs, source repo/branch, readiness and latest build.

App planner: product context form, generated plan versions, human-confirmation items, comments and approve/supersede actions.

Capacitor readiness: checklist for responsive UI, safe areas, keyboard, offline/auth restore, support/privacy/deletion links and native capabilities.

Store listing: per-locale copy, privacy/compliance answers, artwork inventory and submission status.

Build queue: platform, destination, commit SHA, status, runner link, artifacts and failure summary.

Update delivery: source mapping, affected role apps, internal-build policy and optional Appflow channel.

Audit: actor, action, target and timestamp.

The browser may read organisation-scoped rows permitted by RLS. All privileged actions call an authenticated Python API; never call GitHub workflow dispatch, OpenAI planning, or credential endpoints directly from the browser. Show confirmation before queuing a build and require a distinct release-owner confirmation before production submission.

Provide clear empty/loading/error/offline states, accessible keyboard navigation, mobile layouts, UK English copy and no hover-only controls. Generate database types from Supabase and keep all queries scoped to the signed-in organisation.


build this tool as per the full guide

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/48355a77-7f1e-4149-a360-223a276c6bed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
