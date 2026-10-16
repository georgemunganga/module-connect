# Procurement workspace UI

This is the actual React frontend from `Greenwebb/zoho-procurement-ui`, copied from commit `6f0c305` on 16 October 2026. It is mounted at `/procurement/workspace/` and the ERP's `/procurement` entry opens it. Its original routes, vendor selector, editors, lists and settings remain in place. The header, side menu and reusable controls use the Meridian ERP theme.

`src/styles.css` imports the parent ERP's `src/theme/tokens.css`. Build this workspace inside `module-connect` so it uses the same font, palette and surface tokens as the ERP.

The workspace still uses fictional data in browser storage. It does not read or write the ERP procurement records or execute finance actions. The existing typed ERP workflow demo remains available on its deep routes while the data adapter is built.

Build with Node 22:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

The Vite base and React Router basename are `/procurement/workspace`. Nginx serves `dist/` at that path with a fallback to `index.html`. Do not deploy the private screenshot reference directory as public assets.
