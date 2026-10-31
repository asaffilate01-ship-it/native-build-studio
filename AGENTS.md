<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## UI craft and release QA
- Read `PRODUCT.md` and `DESIGN.md` before all UI changes. Never override existing security/workflow rules.
- Use Taste Skill art direction, Impeccable critique/audit/harden and Awesome DESIGN.md reference patterns while preserving product identity.
- Keep protected routes and backend results authoritative; do not rewrite Lovable-linked git history or force push.
- Run existing repo tests and build, advisory `npx --yes impeccable@4.8.0 detect src/`, plus rendered mobile/desktop keyboard accessibility checks.
