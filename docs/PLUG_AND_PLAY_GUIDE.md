# Lovable to Apple and Google: Plug-and-Play Guide

This guide takes one Lovable SaaS/web application from its GitHub export to an
Android App Bundle (`.aab`), an iOS package (`.ipa`), and automated rebuilds.

The factory supports two Capacitor runners:

1. `github-macos` — no Mac required; builds run on a temporary hosted Mac.
2. `mac` — your own Apple Silicon Mac mini registered as a GitHub runner.

EAS remains supported for genuine Expo/React Native repositories. Do not choose
EAS for an ordinary Lovable/Vite web export when Capacitor is the runtime.

On Windows, double-click `START_NATIVE_FACTORY_STUDIO.cmd` for the guided local
dashboard. It covers manifests, assets, store access, update bridges, builds and
outputs; this document remains the detailed reference.

## 1. Decide who owns the store accounts

The chosen portfolio model is brand-first. On Google Play, use separate
organisation developer accounts for major public brands such as Example Brand,
TaxCenda and Craftvaro when each should have its own developer profile. Google
permits multiple accounts under the same D-U-N-S identity, but they must be
declared as associated accounts. The verified legal owner may remain
Brand Legal Entity Ltd.

Apple's developer/seller name is account-wide and is not configurable per app.
An organisation can select an accepted registered trade/DBA name when its first
app is created, but that name cannot later be changed. For an Apple account
displaying Example Brand, confirm the registered trade-name and enrollment structure
with Apple before paying or uploading. Otherwise the app can be named Example Brand
while the seller remains Brand Legal Entity Ltd.

For a white-label app legally owned and published by an independent client, the
client should normally own the Apple/Google developer accounts and invite
your delivery team with the minimum required role. Apple says a contract developer can
assist while the client organisation enrols and submits the app.

Each app always needs its own permanent identifier, for example:

```text
uk.co.example-platform.app
com.taxcenda.app
com.craftvaro.app
```

Do not reuse an identifier and do not change it after release.

## 2. Make the Lovable repository native-ready

The Lovable GitHub export must have:

- a `package.json`;
- a reproducible install command (`bun install --frozen-lockfile` or `npm ci`);
- a production build command;
- `dist/index.html` after the build, including a `<head>` element;
- mobile layouts that handle safe areas and the software keyboard;
- HTTPS-only API/backend URLs;
- persistent Supabase authentication after an app restart;
- no secrets in frontend `VITE_*` variables;
- privacy, account deletion and support pages reachable inside the app.

For store approval, add real native value rather than only wrapping the site:

- camera/document capture;
- file upload and sharing;
- push notifications;
- deep links;
- offline startup and queued submissions;
- network-state handling;
- secure local preferences.

The source repo must install/import each Capacitor plugin its web code uses. The
factory installs the matching native plugin into the wrapper before `cap sync`.

Example for a Bun Lovable repository:

```bash
bun add @capacitor/core@latest-8 \
  @capacitor/camera@latest-8 \
  @capacitor/filesystem@latest-8 \
  @capacitor/network@latest-8 \
  @capacitor/preferences@latest-8 \
  @capacitor/push-notifications@latest-8 \
  @capacitor/share@latest-8
```

Feature-detect plugins and keep a web fallback so the same project still works
in a browser.

## 3. Prepare the image files

Create:

```text
assets/example-platform/icon.png
assets/example-platform/splash.png
```

| Asset | Recommended source | Notes |
| --- | --- | --- |
| Icon | 1024 × 1024 PNG | Square; no transparency in the final iOS icon |
| Splash | 2732 × 2732 PNG | Artwork centred with generous safe space |

The factory generates the required Android and Apple sizes.

## 4. Install and onboard the app

Unzip the factory and run inside its directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Add a Lovable app using hosted macOS:

```bash
native-factory onboard \
  --slug example-platform \
  --name "Example Brand" \
  --repo "https://github.com/your-org/example-platform-connect.git" \
  --app-id "uk.co.example-platform.app" \
  --icon "assets/example-platform/icon.png" \
  --splash "assets/example-platform/splash.png" \
  --google-services-json "assets/example-platform/google-services.json" \
  --runner github-macos \
  --package-manager bun \
  --capability camera \
  --capability filesystem \
  --capability network \
  --capability preferences \
  --capability push \
  --capability share
```

This creates or safely updates `config/apps.yml`. It stores only credential
variable names, never credential values.

Run:

```bash
native-factory validate
native-factory readiness example-platform --platform all --submit
native-factory doctor example-platform --platform all
native-factory web-check example-platform
native-factory plan example-platform --platform all
```

`web-check` clones the Lovable repo, installs dependencies, builds it and
confirms a valid `dist/index.html`. Fix this before configuring signing.

## 5. Put the factory in GitHub

Create one private factory repository. Commit `src/`, `templates/`,
`config/apps.yml`, `assets/`, `docs/` and `.github/`. Never commit `.p8`, `.jks`,
service-account JSON, a completed `.env`, or build output.

For each slug, create a GitHub Environment with the exact same name. For
Example Brand, the Environment is `example-platform`. Add an approval rule before submission.

If the Lovable source repository is private, add `SOURCE_REPO_TOKEN`: preferably
a short-lived GitHub App installation token, or a fine-grained token with
read-only access to only the required source repositories. The factory supplies
it to Git without writing it into the manifest, clone URL or command log.

The included workflow supports manual builds, repository-dispatch events from
Lovable repos, one queue per app, hosted/self-hosted Macs, 14-day artifacts and
optional TestFlight/Play upload.

## 6. Google Play and Android setup

### 6.1 Create the organisation account and app

Create/verify a Google Play Console organisation account using the correct
your delivery team legal and contact details. Invite operators with app-level access.
Google currently lists a USD 25 one-time registration fee; confirm the amount
shown for the account's country during registration.

- [Required developer account information](https://support.google.com/googleplay/android-developer/answer/13628312)
- [Create and set up an app](https://support.google.com/googleplay/android-developer/answer/9859152)

Select **Create app**, enter the permanent name, language, app/game type and
free/paid status. Its package must exactly match the factory identifier.

Complete store listing, support contacts, privacy policy, App access/reviewer
credentials, Ads, Data safety, Content rating, Target audience, any regulated
category declarations, and account-deletion requirements.

### 6.2 Create the Android upload key once

Run on a protected workstation:

```bash
keytool -genkeypair -v \
  -keystore example-platform-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias example-platform-upload
```

Keep the original and passwords in the company secret manager. Enrol in
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
so Google protects the long-term signing key while the factory holds only the
replaceable upload key.

Base64 the keystore.

macOS/Linux:

```bash
base64 < example-platform-upload.jks | tr -d '\n'
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("example-platform-upload.jks"))
```

Add these `example-platform` Environment secrets:

```text
ANDROID_KEYSTORE_B64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

### 6.3 Create the Play upload service account

For automated upload:

1. Create/select a Google Cloud project.
2. Enable the Google Play Developer API.
3. Create a service account.
4. In Play Console **Users and permissions**, invite its email.
5. Give release permissions only for this app.
6. Download its JSON key once and base64 it.

See the [Google Play Developer API guide](https://developers.google.com/android-publisher/getting_started).
Save the encoded value as `GOOGLE_SERVICE_ACCOUNT_B64`.

For Android push, download the app-specific `google-services.json` from Firebase
and pass it during onboarding. The factory copies it into the generated Android
project. Firebase server keys remain backend secrets and do not belong there.

### 6.4 First Android build

Run the GitHub workflow with:

```text
app_slug: example-platform
platform: android
submit: false
```

Test the artifact, then rerun with `submit: true` to create a draft on the Play
internal track. If Google requires a first manual bundle, upload the generated
AAB once; later releases use the service account.

Test a current Pixel, Samsung, slow device/network, fresh install, update,
sign-out/in, camera, uploads, push, deep links and offline startup. Promote
internal → closed → production only after testing and declarations pass.

## 7. Apple Developer and iOS setup

### 7.1 Enrol your delivery team as an organisation

Apple requires two-factor authentication, legal entity status, authority to
bind the organisation and normally a D‑U‑N‑S number. Apple currently lists the
programme fee as USD 99/local equivalent. See
[Apple programme enrolment](https://developer.apple.com/help/account/membership/program-enrollment/).

### 7.2 Create the identifier and app record

1. Create an explicit App ID matching `uk.co.example-platform.app`.
2. Enable only required capabilities, such as Push or Sign in with Apple.
3. In App Store Connect create an app linked to that Bundle ID.
4. Record the SKU and primary language.

The identifier must be identical in Apple, App Store Connect and the manifest.

### 7.3 Create an App Store Connect API key

In **Users and Access → Integrations**, create a team API key with the minimum
upload role. Record Key ID, Issuer ID and the downloaded `.p8`. It downloads
only once, so retain the original securely.

Base64 it.

macOS/Linux:

```bash
base64 < AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8"))
```

Add:

```text
APPLE_KEY_ID
APPLE_ISSUER_ID
APPLE_PRIVATE_KEY_B64
```

### 7.4 Configure Fastlane Match signing

Create one private Match certificate repository per Apple developer team. Add:

```text
MATCH_GIT_URL
MATCH_REPO_TOKEN
MATCH_PASSWORD
```

`MATCH_REPO_TOKEN` should be a separate fine-grained token with access only to
the certificate repository. The factory passes it through Fastlane's protected
Git authorisation environment, not in a URL or command argument.

The first controlled run needs Match write access to create the distribution
certificate/profile. Set the GitHub Environment variable
`MATCH_READONLY=false` only for that bootstrap run, then change it to `true`.

### 7.5 Configure push if selected

Enable Push Notifications on the App ID, create/configure the APNs credential
used by the notification provider, add the entitlement, configure Firebase/APNs
or your gateway, and test foreground/background/terminated/denied states.
Push-provider credentials are backend secrets, separate from the upload key.

### 7.6 First iOS build

Run:

```text
app_slug: example-platform
platform: ios
submit: false
```

Test the IPA, then rerun with `submit: true` to upload to TestFlight.

Complete description, category, keywords, URLs, screenshots, Apple privacy
labels, age rating, export compliance, review notes/account, deletion details,
and subscription/IAP review information. Test internally before App Review.

## 8. If you do not buy a Mac mini

### Option A — GitHub-hosted macOS (implemented)

Use `runner: github-macos`. A fresh hosted Mac runs the same
Capacitor/Fastlane pipeline. Private repositories use included minutes and then
per-minute billing.

Best for pilots and intermittent builds. Trade-offs are higher macOS minute
cost, repeated setup on clean machines, hosted image changes, and the continuing
need for real iPhone/iPad QA. The workflow targets `macos-26` because current
Capacitor 8 requires Xcode 26. See
[GitHub-hosted macOS runners](https://docs.github.com/actions/using-jobs/choosing-the-runner-for-a-job).
GitHub currently lists a USD 0.062/minute baseline rate for standard hosted
macOS usage beyond included allowances; check current billing before batching.

### Option B — Ionic Appflow

Appflow is the most direct managed Capacitor service. It runs the web build,
`cap sync`, Xcode/Gym and Gradle, and can deliver to stores. See
[Appflow Native Builds](https://ionic.io/docs/appflow/package/builds). It has a
recurring subscription; an Appflow adapter can be added later.

### Option C — other hosted Macs

Codemagic, Bitrise, MacStadium and AWS EC2 Mac can provide macOS capacity. The
factory works wherever current macOS/Xcode, Node 22, Ruby/Fastlane and Android
tools are available.

### Option D — EAS

Use EAS for a real Expo/React Native app. The factory does not send a normal
Lovable/Capacitor wrapper through EAS because GitHub-hosted macOS or Appflow is
the clearer path. See [EAS Build](https://docs.expo.dev/build/introduction/).

## 9. When a Mac mini becomes worthwhile

Change only:

```yaml
runner: mac
```

Register it as a GitHub self-hosted runner with:

```text
self-hosted, macOS, ARM64, native-factory
```

Install Node 22+, Xcode 26+, Android Studio 2025.2.1+ and SDK, Python 3.12,
Ruby/Bundler/Fastlane, and CocoaPods only for apps set to `cocoapods`.

Run `native-factory doctor example-platform --platform all`. Use a dedicated runner
account, FileVault, automatic security updates, no plaintext permanent signing
files and concurrency one.

## 10. Normal update workflow

1. Lovable pushes to the app repository.
2. Web tests pass and send `lovable-app-updated` to the factory.
3. The factory clones only that app, compiles `dist`, generates a clean shell,
   assets and plugins.
4. The selected runner signs the binaries.
5. With approval, Fastlane uploads to TestFlight/Play internal testing.
6. Staff test and promote in stages.

Increase `version` for a new public version. In GitHub, the factory adds the
monotonically increasing Actions run number to the manifest's `build_number`
base, preventing duplicate store build numbers. Set a higher base when adopting
an existing app whose last store build is already high.

## 11. Definition of ready

- `native-factory validate` passes.
- `native-factory web-check <slug>` passes.
- `native-factory readiness <slug> --platform all --submit` has no failures.
- Android installs through Play internal testing.
- iOS installs through TestFlight.
- Fresh install/update preserve authentication.
- Roles and tenant isolation work.
- Camera/files/push/deep links/offline work on real devices.
- Legal pages, declarations and deletion flow are complete.
- Review credentials contain no real customer data.
- Monitoring, crash reporting and support contacts are live.
- The app is distinct and sufficiently app-like for store review.
