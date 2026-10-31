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
| Shared foundation | https://github.com/asaffilate01-ship-it/native-build-studio/pull/3 | 4 components, installer, Node tests, CSS tokens; dedicated `portfolio-ui` job passed; broader factory Python onboarding test separately failed |
| Dishbee staging | https://github.com/asaffilate01-ship-it/dishbee-helper/pull/76 | Existing read-only deployment and transaction reviews; GitHub jobs failed without executing runner steps, so no reliable code verdict |
| UniPathway | https://github.com/asaffilate01-ship-it/ascent-education-cloud/pull/151 | Authenticated work-queue refresh; typecheck, build, lint, database and browser acceptance jobs passed; separate IQA-review unit test failed |
| Haccora UK | https://github.com/asaffilate01-ship-it/haccora-connect/pull/70 | Recovery control; initially a shallow test had hard-coded native button identity; test updated to accept the reusable button, rerun pending |

Do not merge or deploy these drafts solely on the basis of green sub-jobs. Verify all required gates and actual signed-in browser interactions.


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
- Haccora PR https://github.com/asaffilate01-ship-it/haccora-connect/pull/70 passed the UI code lint and type/test gates on its latest check, but was blocked by the existing production dependency audit identifying moderate `seroval` advisories. Do **not** waive the security gate.
- AmityOS Book Demo currently shows a success toast without transmitting an enquiry. Follow-up issue https://github.com/asaffilate01-ship-it/care-connect/issues/10 tracks proper backend delivery and non-misleading confirmations.
- Shared foundation's independent `portfolio-ui` test job passed; the older Native App Factory Python onboarding test failed before its unrelated build stages.
- UniPathway pilot PR https://github.com/asaffilate01-ship-it/ascent-education-cloud/pull/151 passed build/typecheck/lint/database/browser CI but an unrelated IQA-review unit test failed.

Do not merge drafts based on partial CI: all required test, accessibility, staging and native gates must pass, including security. Every PR remains independent and reviewable.

