# Changelog

## 0.6.0

- Made examples and dashboard copy project-neutral for a multi-brand portfolio.
- Unified the Python controller with the Lovable `organisations` Supabase schema.
- Added exact source-SHA builds and webhook propagation for reproducible binaries.
- Added audited, app-specific approval records for the exact build that passed QA.
- Connected authenticated Lovable server actions to protected GitHub workflows.
- Added build and store-submission status callbacks from GitHub to Supabase.
- Changed Play Internal Testing uploads from draft to tester-available completed releases.

## 0.5.0

- Added first-class Supabase organisations with multiple independently signed apps.
- Added brand developer-account and store-readiness confirmations.
- Added signed Android APK output for direct Windows/device testing.
- Added a protected workflow that submits the exact tested TestFlight build or
  promotes the exact Play Internal version code after typed confirmation.
- Added production GitHub Environments and staged Android rollout controls.

## 0.4.0

- Added a Lovable/ChatGPT Capacitor-ready brief generator.
- Added complete per-app store copy, privacy/compliance, reviewer and marketing records.
- Added screenshot/feature-graphic uploads and Fastlane-ready store packages.
- Added optional metadata upload without automatic App Store review submission.
- Added automatic Git/Lovable commits to TestFlight and Play Internal Testing.
- Added an Appflow live-update path with native-change safety boundaries.

## 0.3.0

- Added Native Factory Studio, a local Windows web dashboard.
- Added guided app, suite, asset and store-metadata configuration.
- Added secure direct transfer of signing credentials to GitHub Environments.
- Added one-click Lovable/source update bridge installation.
- Added guarded commit-and-push publishing for factory configuration and assets.
- Added GitHub build queue, run status and artifact download controls.
- Added multi-app suites for customer, driver, kitchen, manager and other roles.
- Added build-time and runtime role identity injection for shared repositories.
- Changed the Haccora example to the brand-based `uk.co.haccora.app` identifier.

## 0.2.0

- Added one-command Lovable/Capacitor onboarding.
- Added web-bundle, app-readiness and toolchain doctor checks.
- Added GitHub-hosted macOS builds for users without a Mac mini.
- Added a Windows-first PowerShell setup and workstation doctor.
- Pinned hosted build toolchains for Node, Bun, Java and Ruby.
- Added native camera, filesystem, network, preferences, push and share profiles.
- Added iOS camera privacy descriptions and push entitlements/AppDelegate wiring.
- Added Android Firebase configuration injection for push notifications.
- Added secure private-source and Fastlane Match repository authentication.
- Added automatic CI store build numbers.
- Added source-repository dispatch workflow example.
- Added complete Google Play, Apple and no-Mac setup guides.

## 0.1.0

- Initial Capacitor/Mac and Expo/EAS factory, Fastlane lanes and CI workflow.
