# Native App Factory · product brief

Users: developers, QA operators, tenant app owners and release managers.

Product surfaces: convert source projects to branded native apps through configuration, builds, signing, QA evidence and staged app-store distribution.

Current visual basis: Current src/styles.css is dark-slate (background oklch 0.19 0.021 258) with warm gold primary (oklch 0.79 0.155 78), plus defined display/monospace roles. Prefer measured high-contrast operational UI rather than marketing gradients.

Workflow safety: Every pipeline step should reveal queued/running/succeeded/failed states, logs, build provenance, signing status and human confirmation before publishing. Never turn a failed build into a green decorative success state. Preserve app-store credentials and secrets.

Backends and tests are the source of truth. Never infer operational or customer-facing readiness from design documentation.
