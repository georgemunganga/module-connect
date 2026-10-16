# Procurement workspace mount

The ERP Procurement entry `/procurement` redirects to `/procurement/workspace/`, which serves the cloned Greenwebb frontend in `reference-ui/`. This gives users the source frontend's actual vendor, item, request, order, bill, settings and other UI paths. The existing TanStack Procurement workflow routes remain available under paths such as `/procurement/requests` and `/procurement/orders`.

The workspace is a browser-local UI prototype. Its `AppProvider`/`AppRecord` store and its payment actions are not ERP API contracts. Until the data adapter is implemented, workspace changes are saved only in that browser and are separate from existing ERP demo records. The navigation and data stores must be unified before calling this a fully integrated Procurement module. Its stylesheet imports the ERP theme tokens from the parent `src/theme/tokens.css`, and its reusable Button, Panel and record-detail components apply those tokens without changing route behavior.

Server route configuration:

```nginx
location = /procurement { return 302 /procurement/workspace/; }
location = /procurement/ { return 302 /procurement/workspace/; }
location = /procurement/workspace { return 301 /procurement/workspace/; }
location ^~ /procurement/workspace/ {
    alias /home/amizo/procurement-ui/reference-ui/dist/;
    try_files $uri $uri/ /procurement/workspace/index.html;
}
```

Keep these locations ahead of the existing `/procurement` proxy. The source app's Vite base and BrowserRouter basename are set to the same path.
