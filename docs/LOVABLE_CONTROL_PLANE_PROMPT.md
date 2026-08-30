# Prompt for the Lovable control-plane UI

Build a responsive authenticated SaaS dashboard named Native Factory Control Plane. Use Supabase Auth and typed Supabase queries. Do not place any service-role, OpenAI, Apple, Google, GitHub signing or reviewer credential in browser code.

Required screens:

1. Portfolio: suites, role apps, brand owner, permanent IDs, source repo/branch, readiness and latest build.
2. App planner: product context form, generated plan versions, human-confirmation items, comments and approve/supersede actions.
3. Capacitor readiness: checklist for responsive UI, safe areas, keyboard, offline/auth restore, support/privacy/deletion links and native capabilities.
4. Store listing: per-locale copy, privacy/compliance answers, artwork inventory and submission status.
5. Build queue: platform, destination, commit SHA, status, runner link, artifacts and failure summary.
6. Update delivery: source mapping, affected role apps, internal-build policy and optional Appflow channel.
7. Audit: actor, action, target and timestamp.

The browser may read organisation-scoped rows permitted by RLS. All privileged actions call an authenticated Python API; never call GitHub workflow dispatch, OpenAI planning, or credential endpoints directly from the browser. Show confirmation before queuing a build and require a distinct release-owner confirmation before production submission.

Provide clear empty/loading/error/offline states, accessible keyboard navigation, mobile layouts, UK English copy and no hover-only controls. Generate database types from Supabase and keep all queries scoped to the signed-in organisation.

