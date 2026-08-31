# Windows Quick Start

You can operate the entire factory from a Windows PC. GitHub-hosted macOS
builds the iOS app; you do not need a Mac mini or Xcode on Windows.

## What runs where

| Task | Where it runs |
| --- | --- |
| Edit Lovable app | Lovable/browser |
| Manage factory and secrets | Windows + GitHub browser |
| Validate/build the web `dist` | Windows |
| Compile Android AAB | GitHub-hosted macOS by default |
| Compile/sign iOS IPA | GitHub-hosted macOS |
| Manage Play Console/App Store Connect | Windows browser |
| Test Android | Physical Android device |
| Test iOS | Physical iPhone/iPad through TestFlight |

You cannot run Xcode or the iOS Simulator on Windows. This does not prevent
hosted compilation or App Store submission.

## Fastest option: open Native Factory Studio

Install GitHub CLI as well as the tools below and run `gh auth login`. Then
double-click `START_NATIVE_FACTORY_STUDIO.cmd`. The dashboard opens locally and
guides app identities, suite roles, uploads, Apple/Google access, update bridges,
builds and outputs. See [the Studio guide](STUDIO_GUIDE.md).

## 1. Install on Windows

Install:

- Git for Windows;
- GitHub CLI, followed by `gh auth login`;
- Python 3.12, with **Add Python to PATH** enabled;
- Node.js 22;
- Bun if the Lovable repository uses `bun.lock`/`bun.lockb`;
- optionally Android Studio for local Android emulation and `keytool`.

Open PowerShell in the extracted factory folder and check the machine:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\scripts\windows-doctor.ps1
```

## 2. Create the Python environment

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .
native-factory --help
```

If PowerShell blocks activation, run this once for your user and reopen it:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 3. Onboard a Lovable app

Use PowerShell backticks for continued lines:

```powershell
native-factory onboard `
  --slug example-platform `
  --name "Example Brand" `
  --repo "https://github.com/your-org/example-platform-connect.git" `
  --app-id "uk.co.brand.app" `
  --icon ".\assets\example-platform\icon.png" `
  --splash ".\assets\example-platform\splash.png" `
  --google-services-json ".\assets\example-platform\google-services.json" `
  --runner github-macos `
  --package-manager bun `
  --capability camera `
  --capability filesystem `
  --capability network `
  --capability preferences `
  --capability push `
  --capability share
```

Run:

```powershell
native-factory validate
native-factory doctor example-platform --platform all
native-factory web-check example-platform
native-factory readiness example-platform --platform all --submit
```

The doctor will report that native Xcode/Android checks run on GitHub-hosted
macOS. That is expected.

## 4. Encode signing files safely

Android upload keystore:

```powershell
$bytes = [IO.File]::ReadAllBytes("C:\secure\example-platform-upload.jks")
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

Apple `.p8` key:

```powershell
$bytes = [IO.File]::ReadAllBytes("C:\secure\AuthKey_XXXXXXXXXX.p8")
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

Google Play service-account JSON:

```powershell
$bytes = [IO.File]::ReadAllBytes("C:\secure\play-service-account.json")
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

Paste each value directly into its protected GitHub Environment secret. Clear
the clipboard afterwards:

```powershell
Set-Clipboard -Value ""
```

Do not save base64 values in a text file, email or the factory repository.

## 5. Put the factory on GitHub

You can use GitHub Desktop or Git:

```powershell
git init
git add .
git commit -m "Set up native app factory"
git branch -M main
git remote add origin https://github.com/your-org/native-app-factory.git
git push -u origin main
```

Before committing, confirm `git status` does not show `.p8`, `.jks`, service
account credentials, `.env` or `.factory` build output.

## 6. Configure GitHub

In the factory repository:

1. Open **Settings → Environments**.
2. Create `example-platform` (matching the manifest slug).
3. Add the secrets listed in `config/secrets.env.example`.
4. Set Environment variable `MATCH_READONLY=false` for the first controlled
   Apple signing bootstrap, then change it to `true`.
5. Add required reviewers before submission.

For private Lovable source repositories, add a read-only `SOURCE_REPO_TOKEN`.
Use a separate restricted `MATCH_REPO_TOKEN` for the certificate repository.

## 7. Build without a Mac

Open **Actions → Build native app → Run workflow**.

First Android:

```text
app_slug: example-platform
platform: android
submit: false
```

Then iOS:

```text
app_slug: example-platform
platform: ios
submit: false
```

After testing, rerun with `submit: true` to upload to the Play internal track or
TestFlight. Production promotion remains manual and approval-gated.

## 8. Test from Windows

- Download Android test artifacts or install through Play internal testing.
- Use Play Console pre-launch reports and physical Android devices.
- Install iOS builds through TestFlight on an iPhone/iPad.
- Use hosted logs for compilation failures.
- A physical Apple device remains important for camera, push, deep-link,
  keyboard, file upload and background testing.

If you later buy a Mac mini, change `runner: github-macos` to `runner: mac` and
register it with the labels documented in the full guide. Nothing else changes.
