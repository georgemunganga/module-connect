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

## Preserve the supplied Procurement UI

The Greenwebb/zoho-procurement-ui import is the product presentation baseline. Backend integration must retain its page structure, detail tabs, form sections, list toolbar, filters, selection and action placement while applying shared ERP branding/components. Do not introduce a reduced parallel Live* layout as a shortcut. Separate data/action adapters from shared presentation. Preserve unsupported controls/sections with truthful availability explanations instead of silently dropping them. Never reconnect live routes to demo/local-store mutations to recover their appearance. Verify visual/interaction parity separately from actual API persistence.

Use merged ERP-adapted layout reference `d104f596183e7a012a04578a679aac795e1489d4` and the later verified fixes; retain `@amizopower/erp-ui` controls. See `reference-ui/IMPORTED_UI_RESTORATION.md` for exact accepted scope and remaining integration gaps.
