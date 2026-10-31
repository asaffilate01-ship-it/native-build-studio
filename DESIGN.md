# Native App Factory · design system

## Product truth
For developers, QA operators, tenant app owners and release managers, this product handles convert source projects to branded native apps through configuration, builds, signing, QA evidence and staged app-store distribution.

## Existing visual system
Current src/styles.css is dark-slate (background oklch 0.19 0.021 258) with warm gold primary (oklch 0.79 0.155 78), plus defined display/monospace roles. Prefer measured high-contrast operational UI rather than marketing gradients.

## Core UX commitments
Every pipeline step should reveal queued/running/succeeded/failed states, logs, build provenance, signing status and human confirmation before publishing. Never turn a failed build into a green decorative success state. Preserve app-store credentials and secrets.

- Make actionable state, actor, timestamp, location and next step clear in all operational pages. Render failures and required approvals as real alerts, never camouflage them with smooth animations.
- Distinctive public pages can use richer typography and layout; operator dashboards must remain efficient, familiar, keyboard-accessible, table-driven and role-specific.
- Preserve API contracts, data integrity, auth/security, source assets and user permissions. Never substitute fake pipeline data for real backend outcomes.
- Review 360px, 390px, 768px and 1440px, 200% zoom, contrast, keyboard, screen reader, reduced motion, offline/timeout/error and empty screens.
- Use existing design tokens and semantic state colours, not another company's trademarked theme.

## Three-source design practice
1. [Taste Skill](https://github.com/Leonxlnx/taste-skill): make an explicit brand/layout/motion/density design decision before building; inspect actual rendered pages.
2. [Impeccable](https://github.com/pbakaus/impeccable): focus on targeted critique, audit, harden and polish. Static scan: `npx --yes impeccable@4.8.0 detect src/`, currently advisory.
3. [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md): structurally document owned design tokens. Third-party examples are research, not pixel-copy references.

## Verification
Use existing lint/build/tests plus real workflow and mobile/desktop accessibility testing. The design detector's exit is not proof that critical features or visual UI work.
