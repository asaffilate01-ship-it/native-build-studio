# Native Factory Studio — Windows to Store Approval

This starts with a Lovable SaaS app and finishes with branded Android and iOS builds in testing, ready for a human to submit for review. Your Windows PC runs Studio; GitHub-hosted macOS compiles iOS. You do not need a Mac mini.

## What is automatic

| Stage | Factory handles | Brand/operator handles |
|---|---|---|
| Capacitor readiness | Generates a role-aware brief and validates `dist` | Lovable/ChatGPT implements and commits it |
| Native wrapper | Generates native folders, IDs, icons, plugins and runtime role | Confirms capabilities and permanent IDs |
| Signing/build | Uses protected secrets and a hosted Mac | Opens developer accounts and grants API access |
| Store listing | Saves copy, URLs, declarations and artwork; creates Fastlane metadata | Confirms policy answers and marketing claims |
| Testing | Uploads to TestFlight and Play Internal Testing | Invites testers and approves QA |
| Production | Produces the hand-off and tested build | Named operator submits/releases it |

## 1. Make Lovable Capacitor-ready

1. Connect the Lovable project to a brand-owned or managed GitHub repository.
2. Start `START_NATIVE_FACTORY_STUDIO.cmd` on Windows.
3. Create the app in **Apps & suites**. For multiple role apps, reuse one suite and assign unique permanent IDs, for example:
   - `example-customer` → `uk.co.brand.customer`
   - `example-driver` → `uk.co.brand.driver`
   - `example-kitchen` → `uk.co.brand.kitchen`
4. In **Capacitor ready**, generate the brief.
5. Paste `briefs/<slug>/CAPACITOR_READY_BRIEF.md` into Lovable or ChatGPT. Ask it to implement every item, run a clean build, and commit the result.
6. Confirm the repository produces `dist/index.html`. Do not commit generated `ios/` or `android/` directories; the factory creates clean native projects per build.

The bundle/package ID is permanent technical identity, not the public seller name. Each brand can own its Apple and Google accounts while using IDs such as `uk.co.brand.customer`.

## 2. Create the brand developer accounts

### Google Play

1. The brand owns its Play Console account and completes identity/organisation verification.
2. Create each app with the exact Android package ID saved in Studio.
3. Enable Play App Signing.
4. Create the upload keystore once and keep an offline recovery copy.
5. Create a restricted service account with only the app/release permissions needed by this pipeline, then download its JSON key.

For personal Play developer accounts created after 13 November 2023, internal
testing is only the first step: Google currently requires a closed test with at
least 12 opted-in testers for 14 continuous days before production access can
be requested. Organisation accounts follow their applicable Play Console flow.

### Apple

1. The brand enrols in the Apple Developer Program as the organisation that should appear as seller.
2. Register each Bundle ID exactly as saved in Studio.
3. Create the app in App Store Connect and save its numeric Apple App ID.
4. Create a minimum-role App Store Connect API key. Save the Key ID, Issuer ID and downloaded `.p8`.
5. Create a private Git repository for Fastlane Match signing material.

Apple's public seller/developer name is account-wide. If a brand must appear as
seller, its accepted legal organisation/trading name must own that account. A
Bundle ID does not change the seller name.

## 3. Complete the submission workspace

In **Apps & suites**, record legal owner, public brand, public URLs, Apple Team/App IDs and Google developer name. In **Store listing**, complete:

- title, subtitle, short/full descriptions, keywords, promotional text and release notes;
- support, privacy, account-deletion and marketing URLs;
- categories, audience, reviewer notes and contact details;
- ads, tracking, personal-data, account creation, children, encryption, UGC and regulated-feature declarations;
- Apple screenshots, Google screenshots and Google feature graphic.

These switches prepare the hand-off; they do not replace Apple App Privacy or Google Data Safety. Verify all production data flows and third-party SDKs before submission.

## 4. Send credentials securely

1. Install GitHub CLI on Windows and run `gh auth login`.
2. Publish the factory to a private GitHub repository from **Overview**.
3. In **Store access**, select the app and factory repository.
4. Enter Apple API identifiers, `.p8`, private Match repository/token/password, Android keystore, Play service-account JSON and keystore passwords.
5. If reviewers require login, add a dedicated review username/password here—not in reviewer notes.
6. Add the control-plane Supabase URL and service-role key if you want completed
   and failed workflow status returned to the Lovable dashboard.
7. Press **Send secrets to GitHub**.

Studio sends secret values directly to the app-specific GitHub Environment. It does not store them in `apps.yml`, Studio settings or hand-off files.

## 5. Link Lovable/GitHub changes to the apps

In **Update delivery**, install the bridge in the source repository and select every role app built from it. Keep **Automatically upload every successful change to TestFlight / Play Internal Testing** enabled.

On every push, the bridge installs dependencies and builds `dist`. Only a successful web build dispatches native jobs. Each selected role receives its own runtime role, ID, signed binary and internal-test upload. This deliberately does not auto-release to production.

### Optional direct installed-app web updates

Ionic Appflow Live Updates can deliver approved HTML/CSS/JavaScript changes from the same GitHub repo:

1. Import/connect the repository in Appflow.
2. Add the current Appflow Live Updates SDK/config to the initial native binary using Appflow's integration guide.
3. In **Store listing**, choose `Appflow live web updates`, enter the Appflow App ID/channel, and save the Ionic token in **Store access**.
4. Ship and test the first signed binary through TestFlight/Play.
5. Configure Appflow channel assignment and rollback. Promote only web-layer commits that passed device QA.

New plugins, permissions, native SDKs, icons, launch screens, IDs and review-significant behaviour require a new signed store build.

## 6. Build and test

1. In **Builds & output**, build Android first using **Internal build + listing metadata**.
2. Confirm the AAB reaches Play Internal Testing and install from the tester link.
3. Build iOS and confirm it reaches TestFlight; complete export-compliance questions if requested.
4. Test every role on real devices: install/upgrade, auth, deletion, push, camera/files, links, slow/offline network, background/resume, keyboard, safe areas, tablets and accessibility.
5. Fix issues in Lovable/GitHub. The next commit automatically creates the next internal builds.

## 7. Approval and production

1. Generate the store package and review `store-packages/<slug>/SUBMISSION_HANDOFF.md`.
2. Verify artwork, copy and claims match the tested build.
3. Complete Apple App Privacy and Play Data Safety from actual production behaviour.
4. Supply a permanent reviewer account when login is required.
5. In **Builds & output**, enter the exact TestFlight build number or Play
   version code, tested commit SHA and real-device QA evidence.
6. Type `SUBMIT <app-slug>`. The protected workflow selects that existing build,
   submits it to Apple review or promotes it from Play internal testing using a
   staged rollout. It does not compile a replacement binary.
7. Monitor crashes, auth, API health and reviews; keep release/rollback ownership explicit.

## Windows-compatible Mac choices

| Choice | Works from Windows | Best use |
|---|---:|---|
| GitHub-hosted macOS | Yes | Default; no hardware and isolated builds |
| Ionic Appflow | Yes | Managed Capacitor builds/live updates; paid service |
| Codemagic or Bitrise | Yes | Alternative hosted macOS CI; adapt the included workflow |
| Apple Silicon Mac mini | Controlled remotely | High sustained volume and predictable local cost |
| EAS Build | Yes, for Expo/React Native | Not the default compiler for this Capacitor wrapper |

Start with GitHub-hosted macOS. Consider a Mac mini only when build volume and queue costs justify operating it.
