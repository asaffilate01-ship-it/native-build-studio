# Portfolio design quality rollout — 31 October 2026

## Purpose and upstream references

Adopt three complementary sources across iTechLounge web and SaaS brands. These are **engineering workflows and documentation patterns**, not a replacement for each brand's identity.

- [Taste Skill](https://github.com/Leonxlnx/taste-skill) for visual direction, editorial hierarchy and intentional layout/motion on real screens.
- [Impeccable](https://github.com/pbakaus/impeccable) for iterative design critique, accessibility audit, hardening, polishing and a CLI source check.
- [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) for reference on recording product-owned visual design rules and tokens. Do **not** copy the showcased brands or their logos.

## Completed **proposed** GitHub changes (not released)

The 21 PRs below were opened on the separate `design/taste-impeccable-2026-10-31` branch in each listed repository. None should be described as merged or deployed solely because it appears in this table.

| Product | Pull request | Proposed scope |
|---|---|---|
| Orvilo | [webtemplates #4](https://github.com/asaffilate01-ship-it/webtemplates/pull/4) | Homepage UI + guidelines + advisory audit |
| AhlNikah | [ahl-nikkah #26](https://github.com/asaffilate01-ship-it/ahl-nikkah/pull/26) | Guidelines + advisory audit |
| amityOS | [care-connect #6](https://github.com/asaffilate01-ship-it/care-connect/pull/6) | Guidelines + advisory audit |
| Haccora | [haccora #28](https://github.com/asaffilate01-ship-it/haccora/pull/28) | Guidelines + advisory audit |
| UniPathway | [ascent-education-cloud #150](https://github.com/asaffilate01-ship-it/ascent-education-cloud/pull/150) | Guidelines + advisory audit |
| Ilmvero | [schooldash #22](https://github.com/asaffilate01-ship-it/schooldash/pull/22) | Guidelines + advisory audit |
| StemCoach | [stemcoach #21](https://github.com/asaffilate01-ship-it/stemcoach/pull/21) | Guidelines + advisory audit |
| Nafsi | [nafsiapp #36](https://github.com/asaffilate01-ship-it/nafsiapp/pull/36) | Guidelines + advisory audit |
| Zivvo | [zivvo #28](https://github.com/asaffilate01-ship-it/zivvo/pull/28) | Guidelines + advisory audit |
| Kindelo | [kindelo-uk #88](https://github.com/asaffilate01-ship-it/kindelo-uk/pull/88) | Guidelines + advisory audit |
| Dishbee+ Pakistan | [onynapp-pakistan #20](https://github.com/asaffilate01-ship-it/onynapp-pakistan/pull/20) | Guidelines + advisory audit |
| Cafe 1 Connect | [cafe1-connect-dash #54](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/pull/54) | Guidelines + advisory audit |
| EventPlanr UK | [eventplanr2 #23](https://github.com/asaffilate01-ship-it/eventplanr2/pull/23) | Guidelines + advisory audit |
| Courier Connect Hub | [courier-connect-hub #37](https://github.com/asaffilate01-ship-it/courier-connect-hub/pull/37) | Guidelines + advisory audit |
| Native App Factory | [native-build-studio #2](https://github.com/asaffilate01-ship-it/native-build-studio/pull/2) | Guidelines, advisory audit + portfolio inventory |
| SkillFinch | [care-quest-learn #40](https://github.com/asaffilate01-ship-it/care-quest-learn/pull/40) | Guidelines + advisory audit |
| Lawquo | [law-remix #8](https://github.com/asaffilate01-ship-it/law-remix/pull/8) | Guidelines + advisory audit |
| Zoryn Rewards | [zoryn-rewards-hub #3](https://github.com/asaffilate01-ship-it/zoryn-rewards-hub/pull/3) | Guidelines + advisory audit |
| ParkPunkt | [steady-implementor #23](https://github.com/asaffilate01-ship-it/steady-implementor/pull/23) | Guidelines + advisory audit |
| ONYN | [onyn #8](https://github.com/asaffilate01-ship-it/onyn/pull/8) | Guidelines + advisory audit |
| EventPlanr Germany | [eventplanrger #26](https://github.com/asaffilate01-ship-it/eventplanrger/pull/26) | Guidelines + advisory audit |

**Actual UI code change:** Orvilo's landing page has a more meaningful illustrative example-site preview, improved skip navigation, responsive header and visible keyboard-focus affordances. It still needs rendered visual/keyboard QA and existing build verification.

**All other projects:** Mainly root `DESIGN.md`, `PRODUCT.md`, updated or newly created `AGENTS.md`, and `.github/workflows/design-quality.yml`. These set brand-specific standards, but they are **not** complete feature or visual redesigns.

**Native App Factory:** adds `scripts/portfolio-design-inventory.mjs` to inventory future read-only design coverage without Lovable credits.

## Read-only inventory of the remaining projects

From the repository root, with GitHub CLI authenticated:

```sh
gh auth status
node scripts/portfolio-design-inventory.mjs --owner asaffilate01-ship-it --limit 1000 --output docs/PORTFOLIO_DESIGN_STATUS.md
```

The command lists repositories accessible to the connected GitHub login, inspects root source/layout directories plus `DESIGN.md`, `PRODUCT.md`, `AGENTS.md` and `.github/workflows/design-quality.yml`, then writes Markdown and JSON under `docs/`. It has **read-only GitHub behaviour** and no Lovable or GitHub repo mutations. The output is a *coverage inventory*, not a judgement that any site is visually polished. Repositories without accessible source, or projects stored in other accounts, require separate review. Run it against the actual account with the necessary read permissions.

## Design implementation route for each product

1. Inspect active routes/screens and create/maintain a product-owned design brief preserving real brand colour/font and trust constraints. Merge this with existing engineering instructions rather than replacing them.
2. Run an Impeccable static baseline in advisory mode: `npx --yes impeccable@4.8.0 detect --github src/`. Review findings rather than making the detector a blanket merge blocker.
3. Choose one high-impact page (hero/conversion, critical onboarding, booking/order flow or busy dashboard) and implement actual code improvements.
4. Inspect desktop (1440px), tablet (768px), mobile (390px and 360px), dark/light where used, keyboard focus, non-colour-only alerts, reduced motion, long text and 200% zoom. Include empty/loading/error/offline/permission-denied and legally sensitive states.
5. Run the existing lint/build/test/CI gates and product-specific acceptance. Only then consider PR merge; deployment requires a separate verified release process.

## Platform and security constraints

- **No Lovable credits** for this work. Changes are GitHub-native proposals and use standard GitHub Actions.
- Never rewrite Lovable-linked Git history or force-push. PRs target `main` but do not alter it until explicitly merged.
- Protected dashboards and real personal, clinical, student or financial information must stay behind their existing server-backed rules. Removing a marketing access gate is not permission to remove operational authentication.
- Do not turn mockups into misleading promises about real-time courier location, AI clinical/legal accuracy, supplier approvals, paid orders or platform integrations.
- Do not copy visual identities from external `awesome-design-md` examples. The brand-specific `DESIGN.md` in each repo is authoritative.
- Advisory CI jobs may show green even when source findings exist; existing CI can separately fail. Investigate, rather than assuming passing audit equals launch-readiness.

## Unresolved verification

Orvilo and AhlNikah pull-request workflows reported failures in initial checks; the available Orvilo workflow jobs showed no executed steps and the job-log download was unavailable. Haccora and UniPathway's advisory design-source jobs returned success, but full project QA and production evidence are separate. Do not merge any PR blindly. Once GitHub runner status and standard checks are understood, follow a controlled product-by-product visual implementation sequence.
