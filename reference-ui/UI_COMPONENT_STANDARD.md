# ERP UI component standard

Procurement and HRM use the same tenant branding, typography scale, and control dimensions. Keep workflow-specific page layouts, but build recurring controls from the module's shared UI components.

| Element | Standard |
| --- | --- |
| Root text and tenant font | 17px root; `--erp-font-family` from Core Branding |
| Page title | `text-2xl font-semibold` |
| Navigation and form labels | `text-sm` |
| Standard input, select, and button | Minimum height `2.75rem` (about 47px at the ERP root) |
| Standard control corners | `rounded-lg` |
| Primary action | Pill button, `text-base`, `px-6`; one primary action per page |
| Card | `rounded-xl`, semantic `bg-card` and `border-border` |
| Content | `max-w-6xl`; wide tables scroll within their card |

In this frontend, use `Button`, `Input`, `Select`, `Switch`, `Textarea`, `Field`, `Panel`, `Badge`, and `PageHeader` from `src/components/ui/index.tsx`. Button, Input, Select, Switch, Textarea, and Panel's Card consume the pinned `@amizopower/erp-ui` package, which HRM also imports. `RecordTable` uses the shared Table primitive; `StandardDataTable` retains Procurement's filters, selection, and row actions. The top bar frame and sidebar header are shared, while links and module actions stay local. Use semantic tokens imported from `../src/theme/tokens.css`; Core Branding can override tenant colors and font.

Avoid new one-off input or button classes on feature pages. If a workflow needs a compact control, add a named variant to the shared package and check it at desktop and mobile sizes. Keep small type for secondary metadata only. The shared Select and Switch use Radix behavior; Procurement's record table still owns its workflow-specific interactions.
