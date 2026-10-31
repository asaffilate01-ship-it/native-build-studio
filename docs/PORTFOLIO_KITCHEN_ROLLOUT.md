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
