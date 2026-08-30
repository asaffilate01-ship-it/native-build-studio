# Testing and store approval

This process applies to every organisation and app in Native Factory Studio. Product names in examples are placeholders only.

## Where to test from Windows

| Test stage | Android | Apple |
|---|---|---|
| Fast local check | Download the signed APK artifact and install it on an Android phone or Android Studio emulator | Use the web build for layout checks; Windows cannot run Apple's iOS Simulator |
| Official beta | Google Play Internal Testing | TestFlight on a real iPhone/iPad |
| Remote physical devices | BrowserStack App Live or another approved device cloud | BrowserStack App Live or another approved device cloud |
| Final acceptance | At least one low/mid/high Android device and every important role | Current and older supported iPhone; iPad if enabled |

The factory produces both an Android AAB for Google Play and a signed APK for direct device testing. The App Store-signed IPA is uploaded to TestFlight; installing it directly from Windows is not the normal test route.

## Organisation and multi-app structure

Create one Native Factory organisation for each SaaS/product. Under it, create any required apps:

| Organisation | Role app | Example permanent ID |
|---|---|---|
| `your-product` | Customer | `uk.co.yourproduct.customer` |
| `your-product` | Driver | `uk.co.yourproduct.driver` |
| `your-product` | Kitchen | `uk.co.yourproduct.kitchen` |
| `your-product` | Staff | `uk.co.yourproduct.staff` |

Each role app has independent store records, screenshots, privacy answers, credentials, builds and approvals even when all roles come from the same Lovable repository.

## Apple identifiers and records

The brand first enrols and verifies its organisation with Apple. Studio asks for and checks:

1. Apple account-owner email and legal owner.
2. Apple Team ID.
3. Permanent Bundle ID, registered in Certificates, Identifiers & Profiles.
4. Numeric App Store Connect App ID after the app record is created.
5. App Store Connect API Key ID, Issuer ID and `.p8` key.
6. Fastlane Match signing repository and encryption password.
7. Confirmation that agreements, tax and banking are active.

The tool cannot bypass Apple organisation verification. It prevents final submission until the Bundle ID, app record, privacy answers, listing and screenshots are confirmed.

## Google identifiers and records

The brand first creates/verifies its Play Console developer account. Studio asks for and checks:

1. Google account-owner email and public developer name.
2. Permanent Android package ID.
3. Confirmation that the Play Console app record exists.
4. Play App Signing enabled.
5. Upload keystore, alias and passwords.
6. Restricted Play service-account JSON.
7. Confirmation that agreements, payment profile and Data Safety are complete.

The initial Play app record and organisation verification remain brand-owned console tasks. The factory handles repeatable signed uploads after access is granted.

## Internal testing gate

Every Git/Lovable update can automatically:

1. build and validate the production `dist` output;
2. dispatch only the role apps linked to that repository;
3. generate new Capacitor wrappers and native projects;
4. create signed APK/AAB/IPA outputs;
5. upload Android to Play Internal Testing and iOS to TestFlight;
6. refresh saved store metadata and artwork when selected.

Test login, logout, account creation/deletion, role permissions, camera/files, push, links, payments, slow/offline operation, background/resume, updates, accessibility and every critical business workflow.

## Final approval gate

When QA passes, enter in **Builds & output**:

- the exact tested TestFlight build number or Play version code;
- the exact Lovable/Git commit SHA;
- real-device QA notes;
- `SUBMIT <app-slug>` as typed confirmation.

The workflow uses the `<app-slug>-production` GitHub Environment. Configure required reviewers on that Environment. After approval:

- Apple: the already-tested TestFlight build, current metadata, screenshots and reviewer details are submitted to App Review; automatic public release remains off.
- Google: the already-tested internal version code is promoted to a staged production rollout using the saved percentage.

## Update delivery after launch

- Embedded mode: every change creates a new signed binary and internal test release. This is the safest default.
- Appflow Live Updates: approved HTML/CSS/JavaScript can be assigned to an Appflow channel after the initial SDK-enabled binary is installed.
- Native changes: plugins, permissions, SDKs, entitlements, icons, splash screens and IDs always require a new signed store build.

Keep a rollback-capable Appflow channel and a staged Google rollout. Do not let an untested Lovable commit go directly to all production users.

