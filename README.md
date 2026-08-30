# Native App Factory

A configuration-driven build factory for a portfolio of branded applications.
It pulls a source repository, applies app identity and assets, builds a native
binary, and can upload it to TestFlight or Google Play's internal track.

Start with [START_HERE.md](START_HERE.md), then use the complete
[plug-and-play Lovable guide](docs/PLUG_AND_PLAY_GUIDE.md).
Windows users should also follow [WINDOWS_QUICKSTART.md](docs/WINDOWS_QUICKSTART.md).
For device testing and the protected final release gate, follow
[TESTING_AND_STORE_APPROVAL.md](docs/TESTING_AND_STORE_APPROVAL.md).

For the guided dashboard, double-click `START_NATIVE_FACTORY_STUDIO.cmd` and
follow [the Studio guide](docs/STUDIO_GUIDE.md). The dashboard configures apps,
suites, assets, GitHub secrets, update bridges, builds and downloaded outputs.

## The engine boundary

Use the same control plane, but do not force every source project through the
same compiler:

| Source project | Native engine | Build runner |
| --- | --- | --- |
| Lovable/Vite/React web export | Capacitor 8 | GitHub-hosted Mac, Mac mini, or Ionic Appflow |
| Real Expo/React Native project | Expo/EAS | EAS Build |

The EAS path in this factory is reserved for Expo and React Native projects.
Lovable/Capacitor apps use macOS or Appflow. A Lovable project can be rewritten
as an Expo app, but a simple WebView does not provide the same result and may
fail store minimum-functionality review.

## What this starter includes

- One YAML manifest for any number of apps.
- Unique bundle/package ID validation before a build starts.
- Isolated source checkout and build workspace per app.
- Capacitor 8 shell generation, icons/splash generation, and `cap sync`.
- Fastlane iOS IPA/TestFlight and Android AAB/Play internal-track lanes.
- EAS queueing for genuine Expo projects.
- Per-brand secrets through GitHub Environments; keys never appear in YAML or
  command-line arguments.
- Manual and `repository_dispatch` GitHub Actions triggers.
- A metadata-only Supabase schema for a later admin dashboard and build queue.
- Dry-run plans and unit tests.
- One-command Lovable onboarding, web-bundle checks, readiness checks and
  build-machine diagnostics.
- GitHub-hosted macOS builds when no Mac mini is available.
- Native capability profiles for camera, files, network, preferences, push and
  sharing.
- A local Windows web dashboard for guided configuration and build control.
- Multi-app suites such as Customer, Driver, Kitchen and Manager from one source.
- Direct GitHub Environment secret transfer without saving credential values.
- One-click update bridges from Lovable/source repositories.
- Python-to-Supabase control-plane sync and per-app ChatGPT planning packs.
- Optional server-side OpenAI planning; keys never enter the Lovable browser.

## Repository layout

```text
config/apps.yml                 one record per app
assets/<slug>/                  icon, splash and app-specific mobile config
src/native_factory/            Python controller
templates/capacitor/            clean reusable native shell
.github/workflows/build-app.yml Hosted Mac, Mac mini and EAS jobs
docs/control-plane.sql          optional dashboard/job metadata
docs/PYTHON_SUPABASE_LOVABLE_ARCHITECTURE.md hosted control-plane design
```

## Quick start

Requirements for the controller are Python 3.11+. A local Capacitor runner also
needs Node 22, Xcode 26, Android Studio/SDK, Ruby/Bundler and Fastlane.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp config/apps.example.yml config/apps.yml
native-factory validate
native-factory readiness haccora --platform all --submit
native-factory plan haccora --platform all
native-factory studio
```

After adding real repository and asset paths:

```bash
native-factory build haccora --platform all
native-factory build haccora --platform all --submit
```

`build` creates binaries. `--submit` uploads the iOS build to TestFlight and
the Android build as a draft on the Play internal track. It deliberately does
not auto-release to production.

## App manifest

Start from `config/apps.example.yml`. Each app defines:

- source repo, ref, install/build commands, and web output folder;
- engine (`capacitor` or `expo`) and runner (`github-macos`, `mac` or `eas`);
- display name, stable app identifiers, version, and monotonically increasing
  build number;
- icon and splash paths;
- optional native capabilities and iOS package manager;
- environment-variable *names* for credentials, never credential values.

Capacitor uses one `appId`, so this starter requires the iOS bundle ID and
Android package to be identical. An existing released app must retain its
original identifier and signing identity forever.

Use brand-based IDs such as `uk.co.haccora.app`. When a suite has distinct
installed role apps, use unique IDs such as `uk.co.haccora.kitchen` and
`uk.co.haccora.inspector`. The factory injects the role into the web build as
`VITE_NATIVE_APP_ROLE` and `window.__NATIVE_FACTORY__.role`.

Production Capacitor builds embed the compiled `dist` files by default. A
remote `server.url` remains available for controlled cases, but it cannot be
combined with embedded assets and must use HTTPS. Embedding is the safer default
for offline startup, version control, and store review.

## Per-brand secrets

Create one GitHub Environment named exactly like each app slug. Every
environment can reuse the same secret names while holding different values:

| Secret | Purpose |
| --- | --- |
| `APPLE_KEY_ID` | App Store Connect API key ID |
| `APPLE_ISSUER_ID` | App Store Connect issuer ID |
| `APPLE_PRIVATE_KEY_B64` | Base64 of the downloaded `.p8` key |
| `MATCH_GIT_URL` | Private Fastlane Match certificate repository |
| `MATCH_REPO_TOKEN` | Restricted read/write token for the Match repository |
| `MATCH_PASSWORD` | Match encryption password |
| `GOOGLE_SERVICE_ACCOUNT_B64` | Base64 Play service-account JSON |
| `ANDROID_KEYSTORE_B64` | Base64 Android upload keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Upload keystore password |
| `ANDROID_KEY_ALIAS` | Upload key alias |
| `ANDROID_KEY_PASSWORD` | Upload key password |
| `EXPO_TOKEN` | Only for an Expo/EAS app |
| `SOURCE_REPO_TOKEN` | Read-only access to private Lovable source repositories |

Set the non-secret Environment variable `MATCH_READONLY=false` for the first
controlled Match bootstrap only, then change it to `true`.

Private keys are decoded into mode-`0600` temporary files and deleted when the
build step exits. They are not passed as Fastlane CLI options, stored in the
manifest, written to Supabase rows, or uploaded as build artifacts.

The Google service-account key authorizes Play Console upload; it does **not**
sign an AAB. Android also needs its upload keystore and passwords. Prefer Play
App Signing so Google holds the app-signing key while the factory holds only a
replaceable upload key.

For iOS, initialize Fastlane Match once per Apple developer team and keep CI in
`MATCH_READONLY=true` after certificates/profiles exist. The Apple private API
key can only be downloaded once, so retain an encrypted recovery copy.

## Mac mini runner

For a portfolio dominated by Lovable/Capacitor apps, an Apple Silicon Mac mini
is the direct build engine:

1. Create a dedicated non-admin runner account and enable FileVault.
2. Install current Xcode/command-line tools, Android SDK, Node 22, Python 3.12,
   Ruby/Bundler, CocoaPods, and Java.
3. Register a GitHub Actions self-hosted runner with labels
   `macOS`, `ARM64`, and `native-factory`.
4. Give the runner no permanent store keys. GitHub injects environment-scoped
   secrets only for the selected app.
5. Protect every production Environment with approval and restrict which branch
   may deploy.
6. Keep workspaces isolated and routinely remove old build outputs and Xcode
   derived data.

Start with one runner and a concurrency of one. Add a second Mac only after the
queue, build time, and failure rate justify it.

If you do not own a Mac, keep `runner: github-macos`; the included workflow uses
GitHub's hosted `macos-26` runner. Appflow is the managed Capacitor alternative.

## Webhook flow

The central workflow accepts a `repository_dispatch` event named
`lovable-app-updated`. Each source repository can send this after its web tests
pass:

```json
{
  "event_type": "lovable-app-updated",
  "client_payload": {
    "app_slug": "haccora",
    "platform": "all",
    "submit": false
  }
}
```

Use a GitHub App or a fine-grained token limited to the factory repository.
Do not rebuild all apps after one source changes. The app slug maps the event to
one manifest record and one concurrency queue.

## Rollout

1. **Pilot:** one Capacitor app, local binary, real devices, then TestFlight and
   Play internal testing.
2. **First batch:** 5-10 apps, still with manual approval before submission.
3. **Factory:** webhook-triggered builds, automated smoke tests, staged rollout,
   crash monitoring, and rollback visibility.

Every app still needs its own privacy declarations, permissions, screenshots,
age rating, review credentials, support URL, deletion flow, and native-device
testing. Builds should fail readiness checks when these are missing; that is a
good next module for the control-plane dashboard.

## Store-policy guardrail

Apple requires an app to provide more than a repackaged website, restricts
multiple bundle IDs for essentially the same app, and says commercial-template
apps should be submitted by the provider of the app's content. Google similarly
prohibits repetitive or low-quality apps. Use the factory for genuinely distinct
products with native value—push notifications, camera/document capture, offline
workflows, biometrics, deep links, background sync, share sheets—not cosmetic
clones.

## Tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
ruff check .
```

The starter's tests validate configuration rules and confirm that a plan routes
Capacitor and Expo apps to the correct build engines without executing external
commands.
