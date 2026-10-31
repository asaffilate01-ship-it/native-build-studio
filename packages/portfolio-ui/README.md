# iTechLounge Portfolio UI — Kitchen-inspired patterns

Phase 1 of the iTechLounge cross-SaaS design system. This is original code inspired by the interaction patterns showcased at https://www.dqnamo.com/kitchen and https://github.com/dqnamo/website. It is **not** a copy or redistributed package from that project.

## Components

- **ActionButton** — pending state and tactile feedback, maintaining the existing click handler.
- **HoldConfirmButton** — hold for a user-confirmation gesture (pointer + keyboard). It is not a security/authorization check.
- **FileDropZone** — accessible drag/file picker with client-side type and size selection hints. It does **not** upload or scan.
- **MetricSparkline** — compact SVG display of **supplied** measurements, never synthetic data.
- **validateUploadSelection** — independent validation helper, covered by Node tests.

## Adoption

Copy `src/index.tsx`, `src/file-validation.ts`, and `src/kitchen-ui.css` into
`src/components/portfolio-ui/` of a React 18 or React 19 project. Import selectively:

```tsx
import { ActionButton } from "@/components/portfolio-ui";

<ActionButton pending={isSaving} pendingLabel="Saving…" onClick={save}>
  Save
</ActionButton>
```

Styles are prefixed with `itu-` and opt-in. All components are local (no new npm dependencies).
This intentionally works with Vite/Tailwind 3, Vite/Tailwind 4, and TanStack Start as an ordinary client React module.
Vite loads CSS via the component's CSS import. For SSR, ensure the component is used in an interactive client boundary.

### Scalable installer (no Lovable credits)

The included installer copies exactly three files into an existing React 18/19 checkout; it does not rewrite screens, update dependency manifests, edit backend config or overwrite a previous copy.

Run from this repository:

```sh
node packages/portfolio-ui/scripts/adopt.mjs --target=../your-saas --brand=hsl --dry-run
node packages/portfolio-ui/scripts/adopt.mjs --target=../your-saas --brand=hsl
```

Use `--brand=oklch` for Tailwind 4 apps with native colour values, or `--brand=none` for manual theming. After installation manually choose real user actions to enhance, run target-specific CI and inspect responsive/accessibility behavior before opening a PR.

## Brand tokens

Set these optional CSS properties in the host theme; do **not** replace the host brand theme:

- `--itu-accent`, `--itu-on-accent`, `--itu-focus`
- `--itu-text`, `--itu-surface`, `--itu-border`
- `--itu-danger`, `--itu-metric-color`

### Example: HSL theme (Tailwind 3)

```css
:root, .dark {
  --itu-accent: hsl(var(--primary));
  --itu-on-accent: hsl(var(--primary-foreground));
  --itu-text: hsl(var(--foreground));
  --itu-surface: hsl(var(--card));
  --itu-border: hsl(var(--border));
}
```

### Example: OKLCH theme (Tailwind 4)

```css
:root, .dark {
  --itu-accent: var(--primary);
  --itu-on-accent: var(--primary-foreground);
  --itu-text: var(--foreground);
  --itu-surface: var(--card);
  --itu-border: var(--border);
}
```

## Release rules

1. Add a small pilot only to an existing, well-understood UI action. Keep all backend logic, authorization and routing unchanged.
2. Treat successful file selection as *ready to upload*, never proof of server acceptance. Validate upload contents and permissions again server-side.
3. Do not use HoldConfirmButton in payment, medical, regulatory or legal flows without explicit product acceptance and a secondary confirmation as needed.
4. Verify loading states, disabled behavior, keyboard/pointer, reduced motion, light/dark themes, responsive layout and screen-reader announcements.
5. Run each application's typecheck, unit tests, lint and build, then stage browser acceptance before merging. Don't claim successful deployment from a PR.
6. Keep each brand's colours and copy. Avoid bulk CSS rewrites or upgrades of React/Tailwind during this rollout.
7. Do not use Lovable credits; everything here can be committed and verified with GitHub + existing CI.

## Smoke tests

From `packages/portfolio-ui`, run `npm test` on Node.js 22+ for the pure file-validation policy.

For live pilot status, see `docs/PORTFOLIO_KITCHEN_ROLLOUT.md`.
