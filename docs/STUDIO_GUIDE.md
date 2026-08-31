# Native Factory Studio Guide

Native Factory Studio is a local control panel for a Windows PC. It writes the
non-secret app manifest and assets into the factory, sends credentials directly
to protected GitHub Environments, installs update bridges, queues cloud builds
and downloads their output.

It listens only on `127.0.0.1`. Do not expose its port to a network or the
internet.

## 1. Install the Windows prerequisites

Install Python 3.12, Git for Windows, Node.js 22, GitHub CLI, and Bun when you
also want to validate Lovable builds locally. Sign in from PowerShell:

```powershell
gh auth login
```

The signed-in GitHub user must be allowed to manage Actions, Environments and
secrets in the factory and source repositories.

## 2. Start the dashboard

Double-click `START_NATIVE_FACTORY_STUDIO.cmd`. The first run creates `.venv`,
installs local dependencies and opens `http://127.0.0.1:8787`. Keep the
PowerShell window open; closing it stops the dashboard.

## 3. Understand suites and apps

A **suite** is the software product. An **app** is an independently installed
binary with its own icon, identifier and store record.

| Suite | App role | Display name | Permanent identifier |
| --- | --- | --- | --- |
| `example-platform` | `customer` | Example Brand | `uk.co.brand.customer` |
| `example-platform` | `manager` | Example Brand Manager | `uk.co.brand.manager` |
| `example-platform` | `kitchen` | Example Brand Kitchen | `uk.co.brand.kitchen` |
| `example-platform` | `inspector` | Example Brand Inspector | `uk.co.brand.inspector` |

Use only the apps stakeholders genuinely need. A responsive role-based main app
is usually easier than several nearly identical apps. Separate binaries are
appropriate when the role, device workflow, permissions, notification channel
or store audience is materially different.

### One Lovable repository serving several apps

Each role app may point to the same source repository. During its build, the
factory sets `VITE_NATIVE_APP_SLUG`, `VITE_NATIVE_SUITE`,
`VITE_NATIVE_APP_ROLE`, and `VITE_NATIVE_APP_ID`. It also adds:

```javascript
window.__NATIVE_FACTORY__
```

The Lovable app can use the role to select the correct start page, permissions,
navigation and notification topics. It must still enforce authorisation in
Supabase/backend policies; hiding a screen is not security.

```typescript
const nativeRole = window.__NATIVE_FACTORY__?.role ??
  import.meta.env.VITE_NATIVE_APP_ROLE ?? "web";
```

## 4. Complete Apps & suites

For each installed app, enter:

1. Suite, app role, display name and slug.
2. Brand domain and permanent ID. For Example Brand use `uk.co.brand.*`, not an
   your delivery team-prefixed ID.
3. Lovable GitHub URL, branch, package manager and `dist` output.
4. Required native capabilities.
5. Icon, splash and optional Firebase `google-services.json`.
6. Public brand/store data and legal URLs.

The icon and splash are repository assets. `google-services.json` contains
Firebase project identifiers rather than the server credential, but restrict
the Firebase API key and commit it only to a private factory repository.

Return to **Overview**, enter the central factory repository, and choose
**Commit & push**. Studio initializes the local Git repository when necessary,
stages only known factory paths, blocks credential-like files, commits the
configuration and pushes it to `main`. With the checkbox selected, it creates
the central repository as private when it does not already exist. Do this after
changing app settings or assets and before starting a cloud build.

## 5. Create the store records

### Google Play

For a brand-specific public developer profile, create or use the organisation
developer account for that brand. The verified legal organisation may remain
Brand Legal Entity Ltd. Declare all associated developer accounts as Google requires.

Create the app using exactly the package entered in Studio. Enable Play App
Signing, create a replaceable upload keystore and invite the release service
account with access only to this app.

### Apple

Create the explicit App ID and App Store Connect record using exactly the
Bundle ID entered in Studio. The public app name can be Example Brand. Apple's
developer/seller name is account-wide; use a registered brand/trading name only
where Apple accepts it for that organisation account.

Create an App Store Connect API key and configure Fastlane Match in a private
certificate repository. Set Match to bootstrap only during the controlled
first signing run; return it to read-only afterwards.

## 6. Complete Store access

Studio sends the values directly to a GitHub Environment named after the app
slug. It does not add them to `config/apps.yml` or `.factory/studio.json`.

| Studio input | GitHub Environment secret |
| --- | --- |
| Apple API key ID | `APPLE_KEY_ID` |
| Apple Issuer ID | `APPLE_ISSUER_ID` |
| Apple `.p8` upload | `APPLE_PRIVATE_KEY_B64` |
| Match repository | `MATCH_GIT_URL` |
| Match repository token | `MATCH_REPO_TOKEN` |
| Match password | `MATCH_PASSWORD` |
| Android keystore | `ANDROID_KEYSTORE_B64` |
| Keystore password/alias/key password | Android signing secrets |
| Play service-account JSON | `GOOGLE_SERVICE_ACCOUNT_B64` |
| Read-only source token | `SOURCE_REPO_TOKEN` |

Empty fields never erase existing values. GitHub does not return secret values
after they are stored, so the dashboard reports only which names it updated.

## 7. Install the update bridge

Open **Update bridge** and select one app whose source repository should receive
the workflow, every role app built from that source, the factory repository,
and a restricted token with Contents write access to the factory repository.

Studio stores the token as `FACTORY_DISPATCH_TOKEN` in the source repository
and creates `.github/workflows/native-factory-bridge.yml`.

On every source push, the bridge verifies the web build and sends one
`lovable-app-updated` event per selected role app. The default event builds
artifacts but does not publish production releases.

## 8. Build and retrieve output

Use **Builds & output**:

1. Build Android without submission and test through Play internal testing.
2. Build iOS and test through TestFlight.
3. Complete real-device testing.
4. Only then upload a controlled release candidate.

The GitHub Environment should have required reviewers before submission. The
included lanes do not automatically release production. Downloaded artifacts
are placed under `.factory/downloads/<run-id>/`.

## 9. What automatic updates can and cannot do

The safe default embeds the Lovable `dist` folder in each Capacitor binary.
Every web change therefore creates a new signed native build. The bridge can
automatically place it in internal testing, but Apple/Google production review
and release approval cannot be bypassed.

Ionic Appflow Live Updates is an optional later adapter for JS/HTML/CSS-only
changes. Native plugin, entitlement, permission, SDK or signing changes always
require a new binary. Maintain a rollback channel and test live updates before
production.

## 10. Recommended Example Brand rollout

1. Configure the primary Example Brand app first as `uk.co.brand.app`.
2. Complete Android internal testing and TestFlight.
3. Prove authentication, tenant isolation, camera, documents, push and offline
   startup.
4. Decide which roles genuinely warrant separate store apps.
5. Add Kitchen/Inspector apps with unique IDs if the operational case is strong.
6. Install the bridge after the first manual build is reproducible.
7. Keep production deployment approval-gated.

## Troubleshooting

- **GitHub CLI required:** install it and run `gh auth login`.
- **Environment secret denied:** the user needs repository administration or
  appropriate Actions permissions.
- **Bridge cannot update:** use a restricted token with Contents write access to
  the factory and ensure the signed-in operator can edit the source repository.
- **Web verification fails:** run `native-factory web-check <slug>`.
- **Same screens in every role app:** consume `VITE_NATIVE_APP_ROLE` or
  `window.__NATIVE_FACTORY__.role` in the Lovable code.
- **iOS compile failure:** inspect the hosted-macOS job and confirm agreements,
  App ID capabilities, Match and API-key permissions.
