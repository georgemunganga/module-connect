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

For Procurement workspace UI changes, follow `reference-ui/UI_COMPONENT_STANDARD.md` and reuse the components in `reference-ui/src/components/ui/index.tsx` instead of adding page-specific versions of common controls.

GreenWebb's engineering standard is `GW-ENG-STD-001` in the ERP repository at `docs/engineering/GW-ENG-STD-001.md`. Treat Procurement as Tier 3. Before enabling a live screen, map its action to a scoped server API, owned record, state transition, validation, audit, failure state, and acceptance evidence. Keep browser-local transactions visibly separate from live ERP data.
