# Portfolio Kitchen UI rollout — 31 October 2026

The initial scope is the accessible GitHub account, not an assumed 150 deployed applications.
The goal is interaction consistency without replacing brands, production databases, or existing Radix/shadcn UI libraries.

## Phase gates

| Stage | Projects | Acceptance |
| --- | --- | --- |
| 1 — Foundation | Native App Factory `packages/portfolio-ui` | Source, namespaced CSS, tests and documentation in PR |
| 2 — Mixed-stack pilots | Dishbee Helper (React 19), UniPathway (React 18), Haccora UK (React 19) | Real existing action replaced; pending/disabled behavior verified |
| 3 — UX templates | EventPlanr UK/DE, Kindelo, AmityOS, Zivvo UK/DE | Responsive brand-specific pilot + browser acceptance |
| 4 — Domain patterns | MealDeck, Zoryn, MoneyBridge, Omniqora, SkillFinch, Ilmvero, others | Validated receipt, upload, progress, AI interfaces; no fake backend |
| 5 — Wider catalogue | Remaining accessible repositories, then other accounts | Per-repo automated checks, phased review and explicit release gate |

## Safeguards

- Do not add React 19/Next.js to older applications just to adopt UI patterns.
- Use pointer + keyboard testing and `prefers-reduced-motion` visual testing.
- Do not change user roles, row-level policies, payments, application eligibility or business outcomes.
- Avoid bulk merges. Review each PR's actual CI and staged UI before production rollout.
- Source components here are original implementations inspired by patterns at dqnamo.com/kitchen. Do not copy third-party code without confirming its licence.

## Status

The source package and pilot PRs are implementation work, **not** evidence of production deployment.
Update status here after CI, browser checks and merges.

## Actual first-wave pull requests (31 October 2026)

| Area | Pull request | Scope and verification status |
| --- | --- | --- |
| Shared foundation | https://github.com/asaffilate01-ship-it/native-build-studio/pull/3 | **MERGED** at `62f0cf36` after both factory and portfolio-ui CI jobs passed |
| Dishbee staging | https://github.com/asaffilate01-ship-it/dishbee-helper/pull/76 | Existing read-only deployment and transaction reviews; GitHub jobs failed without executing runner steps, so no reliable code verdict |
| UniPathway | https://github.com/asaffilate01-ship-it/ascent-education-cloud/pull/151 | **MERGED** at `a56cd88d` after its full Production CI passed on rerun |
| Haccora UK | https://github.com/asaffilate01-ship-it/haccora-connect/pull/70 | **BLOCKED**. Original Seroval advisory patched in branch, but separate mobile high/moderate audit findings block production CI |

For open drafts, verify all required checks and actual signed-in browser interactions before merge; merged source does not establish published deployment.


## Phase 3 pull requests — 31 October 2026

| Product | Pull request | Change |
| --- | --- | --- |
| EventPlanr UK | https://github.com/asaffilate01-ship-it/eventplanr2/pull/28 | Workspace retry + release gate refresh progress |
| EventPlanr Germany | https://github.com/asaffilate01-ship-it/eventplanrger/pull/34 | EN/DE workspace retry |
| Kindelo | https://github.com/asaffilate01-ship-it/kindelo-uk/pull/89 | SkillFinch connected learning refresh + connection retry |
| AmityOS | https://github.com/asaffilate01-ship-it/care-connect/pull/9 | AI Insights loading feedback and keyboard-accessible collapse |
| Zivvo UK/DE | https://github.com/asaffilate01-ship-it/zivvo/pull/33 | Save-search/offer pending and error recovery + German copy |

### Release blockers and non-UI findings

- Multiple EventPlanr, Kindelo and Zivvo GitHub runs reported failed **before executing any runner steps**. These failures do not validate or invalidate the UI code. Inspect GitHub Actions execution/billing/runner configuration before evaluating the PRs.
- Haccora PR https://github.com/asaffilate01-ship-it/haccora-connect/pull/70 has a pinned root Seroval repair on branch, but cannot merge until the mobile dependency findings tracked in https://github.com/asaffilate01-ship-it/haccora-connect/issues/72 are resolved. Do **not** waive the security gate.
- AmityOS Book Demo currently shows a success toast without transmitting an enquiry. Follow-up issue https://github.com/asaffilate01-ship-it/care-connect/issues/10 tracks proper backend delivery and non-misleading confirmations.
- Native App Factory CI is green and foundation PR #3 merged. The Python test fixture was made deterministic in the hosted runner environment.
- UniPathway pilot PR https://github.com/asaffilate01-ship-it/ascent-education-cloud/pull/151 passed all Production CI jobs on rerun and merged; no IQA approval logic changed.

Do not merge drafts based on partial CI: all required test, accessibility, staging and native gates must pass, including security. Every PR remains independent and reviewable.

## Phase 4 — completed and staged work

| Product | PR | Status |
| --- | --- | --- |
| Dishbee+ Pakistan | https://github.com/asaffilate01-ship-it/onynapp-pakistan/pull/21 | **MERGED** at `f56a9398` after CI passed; profile/address save pending and repeat-click controls |
| Zoryn Rewards | https://github.com/asaffilate01-ship-it/zoryn-rewards-hub/pull/4 | **DRAFT**; integration-health retry and progress; CI failed before runner steps |

## Cross-portfolio blockers

- https://github.com/asaffilate01-ship-it/native-build-studio/issues/4 — verify why GitHub-hosted runners do not start in some projects; jobs have zero steps and `runner_id=0`.
- https://github.com/asaffilate01-ship-it/haccora-connect/issues/72 — mobile dependency audit identifies a high-severity `decode-uri-component` advisory and moderate `glob` / `minimatch` advisories.
- https://github.com/asaffilate01-ship-it/care-connect/issues/10 — AmityOS demo form must not report transmission without backend acknowledgement.
- Merged GitHub source is **not proof of publishing** to Lovable or acceptance on real mobile devices.
