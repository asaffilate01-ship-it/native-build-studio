# Start Here

For the complete Windows-to-store workflow, follow [docs/END_TO_END_SUBMISSION_GUIDE.md](docs/END_TO_END_SUBMISSION_GUIDE.md).

For a normal Lovable SaaS/app, use this route:

```text
Lovable → GitHub → Native App Factory → Capacitor 8
         → GitHub-hosted macOS (no Mac required)
         → Play internal testing + TestFlight
```

On Windows, use the hosted Lovable control plane and open **Launchpad**. It
guides every field, private upload, account-readiness step, preflight and build
without requiring Xcode on the PC. The local dashboard remains available by
double-clicking `START_NATIVE_FACTORY_STUDIO.cmd` when you want an offline
controller at `http://127.0.0.1:8787`.

## What you need for each app

- Lovable GitHub repository and its working build command.
- Permanent brand-based app ID such as `uk.co.brand.customer`.
- 1024 × 1024 PNG icon.
- 2732 × 2732 PNG splash source.
- Privacy, support and account-deletion URLs.
- Test/reviewer login with fictional data.
- Apple Developer organisation membership.
- Google Play organisation developer account.
- Android upload keystore and Play service account.
- Apple App Store Connect API key and Fastlane Match signing store.
- Physical Android and Apple devices for final testing.

## The 12 steps

1. Export/sync the Lovable project to GitHub.
2. Install this factory with `pip install -e .`.
3. Open Launchpad, add/select the role app and complete App setup.
4. Run `native-factory web-check <slug>`.
5. Put the factory in a private GitHub repository.
6. Create a GitHub Environment named exactly like the app slug.
7. Create the Google Play app, upload key and service account.
8. Create the Apple App ID, App Store Connect app, API key and Match signing.
9. Add the secrets shown in Launchpad to the app's GitHub Environment, then
   confirm the connection in Launchpad (secret values are never uploaded to
   Supabase).
10. Build Android with `submit: false`, test, then upload internally.
11. Build iOS with `submit: false`, test, then upload to TestFlight.
12. Complete store declarations, real-device QA and staged production release.

## If you do not own a Mac

Use `runner: github-macos`. It is already wired into the workflow. GitHub's
current baseline rate for standard hosted macOS usage beyond allowances is
USD 0.062/minute; confirm current billing before a large batch. Ionic Appflow is
the managed Capacitor alternative.

EAS is available in this factory for genuine Expo/React Native projects, not as
the default Lovable/Capacitor route.

## Account costs to allow for

- Apple Developer Programme: currently USD 99/year or local equivalent.
- Google Play Console: currently USD 25 one-time registration.
- GitHub-hosted macOS: included allowance then usage billing.
- Appflow: optional subscription if selected instead of GitHub/macOS.
- A Mac mini: optional; useful later when frequent builds cost more than owning
  and maintaining the machine.

Then follow [the complete guide](docs/PLUG_AND_PLAY_GUIDE.md).

On a Windows PC, begin with [the Windows quick start](docs/WINDOWS_QUICKSTART.md).
For the complete dashboard workflow, use [the Studio guide](docs/STUDIO_GUIDE.md).
