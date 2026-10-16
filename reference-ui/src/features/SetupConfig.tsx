import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Image, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  Select,
  Textarea,
} from "../components/ui";

type Props = { slug: string; onSavePreview: (label: string) => void };
export function SetupConfig({ slug, onSavePreview }: Props) {
  const [values, setValues] = useState<Record<string, string>>({
    organization: "Meridian Procurement Demo",
    industry: "Professional Services",
    currency: "ZMW",
    timezone: "Africa/Lusaka",
    year: "January",
    color: "#3987f6",
    country: "Zambia",
    dateFormat: "dd MMM yyyy",
    notification: "Enabled",
    portal: "Disabled",
    location: "Main Office",
    entity: "Purchase Orders",
    prefix: "PO-",
    start: "00001",
    name: "",
    url: "",
  });
  const [rows, setRows] = useState<Record<string, string>[]>(
    slug === "payment-terms"
      ? [
          { name: "Due on Receipt", days: "0" },
          { name: "Net 15", days: "15" },
          { name: "Net 30", days: "30" },
        ]
      : slug === "reporting-tags"
        ? [
            { name: "Department", options: "Operations, IT, Finance" },
            { name: "Project", options: "Office, Technology" },
          ]
        : [],
  );
  const set = (key: string, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const field = (label: string, key: string, type = "text", hint?: string) => (
    <Field label={label} hint={hint}>
      <Input
        type={type}
        value={values[key] || ""}
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  );
  const select = (label: string, key: string, options: string[]) => (
    <Field label={label}>
      <Select
        value={values[key]}
        onChange={(event) => set(key, event.target.value)}
      >
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </Select>
    </Field>
  );
  const title: Record<string, string> = {
    profile: "Organization Profile",
    general: "General",
    branding: "Branding",
    "payment-terms": "Payment Terms",
    "vendor-portal": "Vendor Portal",
    "punchout-catalogs": "Punchout Catalogs",
    "transaction-number-series": "Transaction Number Series",
    "reporting-tags": "Reporting Tags",
    "web-tabs": "Web Tabs",
  };
  return (
    <Panel
      title={title[slug] || "Configuration"}
      action={<Badge>Unsaved preview</Badge>}
    >
      <div className="space-y-5 p-5">
        {slug === "profile" && (
          <div className="grid gap-5 sm:grid-cols-2">
            {field("Organization Name *", "organization")}
            {select("Industry", "industry", [
              "Professional Services",
              "Retail",
              "Manufacturing",
              "Technology",
            ])}
            {field("Website", "website", "url")}
            {field("Phone", "phone", "tel")}
            {field("Street Address", "street")}
            {field("City", "city")}
            {field("Country", "country")}
            {field("Postal Code", "postcode")}
            {field("Tax Registration #", "taxId")}
            {select("Base Currency", "currency", ["ZMW", "USD", "EUR"])}
            {select("Fiscal Year Starts In", "year", [
              "January",
              "April",
              "July",
              "October",
            ])}
            {select("Timezone", "timezone", [
              "Africa/Lusaka",
              "UTC",
              "Europe/London",
            ])}
          </div>
        )}
        {slug === "general" && (
          <div className="grid gap-5 sm:grid-cols-2">
            {select("Date Format", "dateFormat", [
              "dd MMM yyyy",
              "yyyy-MM-dd",
              "MM/dd/yyyy",
            ])}
            {select("Organization Timezone", "timezone", [
              "Africa/Lusaka",
              "UTC",
              "Europe/London",
            ])}
            {select("Notification Preferences", "notification", [
              "Enabled",
              "Disabled",
            ])}
            {select("Default Location", "location", [
              "Main Office",
              "Warehouse",
            ])}
            <Field label="Default Payment Terms">
              <Select defaultValue="Net 30">
                <option>Due on Receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked />
              Show item descriptions on purchasing documents
            </label>
            <Field label="Default Customer Notes" className="sm:col-span-2">
              <Textarea placeholder="Shown on new document drafts." />
            </Field>
          </div>
        )}
        {slug === "branding" && (
          <>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                <Image size={30} />
              </div>
              <Field
                label="Organization Logo"
                hint="Only the filename is retained in this preview."
              >
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    set("logo", event.target.files?.[0]?.name || "")
                  }
                />
                {values.logo && (
                  <span className="mt-2 block text-xs text-slate-400">
                    {values.logo}
                  </span>
                )}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {field("Brand Accent Color", "color", "color")}
              {field("Display Name", "organization")}
              <Field label="Email Footer" className="sm:col-span-2">
                <Textarea defaultValue="Meridian Procurement Demo · Purchasing with clarity." />
              </Field>
            </div>
            <div className="rounded-lg border border-slate-200 p-5">
              <span
                className="rounded px-4 py-2 text-sm text-white"
                style={{ background: values.color }}
              >
                {values.organization}
              </span>
              <p className="mt-4 text-xs text-slate-400">
                Brand preview only. This does not replace live logos.
              </p>
            </div>
          </>
        )}
        {slug === "vendor-portal" && (
          <>
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-slate-600">
              A workspace where vendors can view requests, documents, and
              account information.
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {select("Vendor Portal Status", "portal", [
                "Disabled",
                "Enabled (preview only)",
              ])}
              {field("Portal Name", "organization")}
              {field(
                "Portal URL / Subdomain",
                "portalUrl",
                "text",
                "Preview only; no portal is provisioned.",
              )}
              <Field label="Welcome Message">
                <Textarea placeholder="Message displayed to your vendors." />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" />
              Allow vendors to update profile information (preview)
            </label>
            <p className="text-xs text-slate-400">
              Enabling here is a visual selection only. No invitations are sent.
            </p>
          </>
        )}
        {slug === "punchout-catalogs" && (
          <>
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              Configure external supplier catalogs for employee purchasing.
              Credentials and live supplier connections are not part of this
              frontend.
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {field("Catalog Name *", "name")}
              {field("Supplier URL", "url", "url")}
              {field("Supplier Identity", "identity")}
              {select("Default Currency", "currency", ["ZMW", "USD", "EUR"])}
            </div>
            <p className="text-xs text-slate-400">
              No supplier connection will be established; do not enter real
              credentials.
            </p>
          </>
        )}
        {slug === "transaction-number-series" && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              {select("Transaction", "entity", [
                "Purchase Orders",
                "Purchase Requests",
                "Bills",
                "Purchase Receives",
                "Vendor Credits",
                "Payments Made",
              ])}
              {field("Number Series Name", "name")}
              {field("Prefix", "prefix")}
              {field("Starting Number", "start")}
              <Field label="Preview">
                <Input value={`${values.prefix}${values.start}`} readOnly />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" />
                Use this number series by default
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Numbering previews do not change identifiers in the live
              organization.
            </p>
          </>
        )}
        {["payment-terms", "reporting-tags", "web-tabs"].includes(slug) && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="table-cell">Name</th>
                    <th className="table-cell">
                      {slug === "payment-terms"
                        ? "Days"
                        : slug === "reporting-tags"
                          ? "Options"
                          : "URL"}
                    </th>
                    <th className="table-cell">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td className="table-cell">
                        <Input
                          aria-label={`Name ${index + 1}`}
                          value={row.name}
                          onChange={(event) =>
                            setRows((previous) =>
                              previous.map((value, i) =>
                                i === index
                                  ? { ...value, name: event.target.value }
                                  : value,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="table-cell">
                        <Input
                          aria-label={`Value ${index + 1}`}
                          type={slug === "payment-terms" ? "number" : "text"}
                          min={0}
                          value={row.days ?? row.options ?? row.url ?? ""}
                          onChange={(event) =>
                            setRows((previous) =>
                              previous.map((value, i) =>
                                i === index
                                  ? {
                                      ...value,
                                      [slug === "payment-terms"
                                        ? "days"
                                        : slug === "reporting-tags"
                                          ? "options"
                                          : "url"]: event.target.value,
                                    }
                                  : value,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="table-cell">
                        <Button
                          variant="ghost"
                          aria-label={`Remove row ${index + 1}`}
                          onClick={() =>
                            setRows((previous) =>
                              previous.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="text-sm text-slate-400">
                No {title[slug]?.toLowerCase()} configured in this preview.
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                setRows((previous) => [
                  ...previous,
                  {
                    name: "",
                    days: slug === "payment-terms" ? "0" : undefined,
                    options: slug === "reporting-tags" ? "" : undefined,
                    url: slug === "web-tabs" ? "" : undefined,
                  } as Record<string, string>,
                ])
              }
            >
              <Plus size={15} />
              Add{" "}
              {slug === "payment-terms"
                ? "Payment Term"
                : slug === "reporting-tags"
                  ? "Reporting Tag"
                  : "Web Tab"}
            </Button>
          </>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
        <Button onClick={() => onSavePreview(title[slug] || slug)}>
          Save preview snapshot
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("procureui.reset-settings"))
          }
        >
          Reset
        </Button>
        <Link to="/settings" className="px-3 text-xs text-slate-400">
          Cancel
        </Link>
      </footer>
    </Panel>
  );
}
