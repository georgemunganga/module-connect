import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { supplierRole } from "@/modules/procurement/access";
import { getProcurement, saveProcurement } from "@/modules/procurement/store";
import type { SupplierRecord } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/import")({
  head: () => ({ meta: [{ title: "Import vendors — Meridian ERP Procurement" }, { name: "description", content: "Preview a vendor CSV and import proposed records for review." }] }),
  component: VendorImport,
});

interface ImportRow { line: number; name: string; registration: string; contactName: string; contactEmail: string; category: string; errors: string[] }
const required = ["name", "registration", "contact_name", "contact_email", "category"];
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const input = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index++; }
      else if (quoted) quoted = false;
      else if (!field) quoted = true;
      else throw new Error("A quote appears inside an unquoted field.");
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function previewCsv(source: string, country: string): ImportRow[] {
  const parsed = parseCsv(source);
  if (!parsed.length) throw new Error("The CSV is empty.");
  const headings = parsed[0].map((heading) => heading.toLowerCase().replace(/[\s-]+/g, "_"));
  const missing = required.filter((heading) => !headings.includes(heading));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}. Download the template and try again.`);
  if (parsed.length < 2) throw new Error("Add at least one vendor below the header row.");
  if (parsed.length > 201) throw new Error("Import up to 200 vendors at a time.");
  const existing = getProcurement().suppliers.filter((vendor) => vendor.country === country);
  const names = new Set<string>(), registrations = new Set<string>();
  return parsed.slice(1).map((values, index) => {
    const get = (heading: string) => values[headings.indexOf(heading)]?.trim() ?? "";
    const name = get("name"), registration = get("registration"), contactName = get("contact_name"), contactEmail = get("contact_email"), category = get("category");
    const errors: string[] = [];
    if (!name || !registration) errors.push("Name and registration are required");
    if (Boolean(contactName) !== Boolean(contactEmail)) errors.push("Contact name and email must be provided together");
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.push("Invalid contact email");
    if (existing.some((vendor) => normalize(vendor.name) === normalize(name) || Boolean(registration) && normalize(vendor.registration) === normalize(registration))) errors.push("Possible existing vendor");
    if (names.has(normalize(name)) || registrations.has(normalize(registration))) errors.push("Duplicate in this file");
    names.add(normalize(name)); registrations.add(normalize(registration));
    return { line: index + 2, name, registration, contactName, contactEmail, category, errors };
  });
}

function VendorImport() {
  const { role } = useApp();
  const entity = useEntity();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  if (!supplierRole(role) || role === "auditor") return <AppShell><RestrictedState /></AppShell>;
  const download = () => {
    const blob = new Blob(["name,registration,contact_name,contact_email,category\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "vendors-template.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  const commit = () => {
    if (!rows.length || rows.some((row) => row.errors.length)) return setError("Resolve every highlighted row before importing.");
    const existing = getProcurement().suppliers.filter((vendor) => vendor.country === entity.country);
    if (rows.some((row) => existing.some((vendor) => normalize(vendor.name) === normalize(row.name) || normalize(vendor.registration) === normalize(row.registration)))) return setError("A vendor was added after this preview. Upload the file again to review duplicates.");
    const timestamp = new Date().toISOString();
    const owner = entity.country === "Kenya" ? "Grace Wanjiru" : "Priya Raman";
    const imported: SupplierRecord[] = rows.map((row) => ({ id: `sup-import-${crypto.randomUUID()}`, name: row.name, legalName: row.name, country: entity.country,
      registration: row.registration, status: "Proposed", owner, nextAction: "Review identity, contacts and required evidence", dueDate: "—",
      categories: row.category ? [row.category] : [], sites: [], contacts: row.contactName || row.contactEmail ? [{ name: row.contactName, role: "Main contact", email: row.contactEmail }] : [],
      qualifications: [], documents: [], procurementDecision: { state: "Pending" }, openPOs: 0, openInvoices: 0, reviewVersion: 1,
      timeline: [{ id: crypto.randomUUID(), at: timestamp, actor: `${role} (demo)`, event: "Imported from CSV for review", reason: "No supplier was activated by the import" }],
    }));
    saveProcurement((state) => ({ ...state, suppliers: [...imported, ...state.suppliers] }));
    setDone(imported.length); setRows([]); setError("");
  };
  return <AppShell>
    <PageHeader eyebrow="Vendors" title="Import vendors" description={`Import into ${entity.country}. Every row starts as Proposed and requires normal onboarding review before orders can use it.`} />
    <div className="mt-4 max-w-4xl space-y-4">
      <section className="rounded-lg border bg-surface p-5">
        <div className="flex items-center gap-3"><FileUp className="size-7 text-primary" aria-hidden /><div><h2 className="font-semibold">Upload a CSV</h2><p className="text-sm text-muted-foreground">Up to 200 rows, 1 MB. The file stays in this browser demo; payment details are not imported.</p></div></div>
        <div className="mt-4 flex flex-wrap items-end gap-3"><div><Label htmlFor="vendor-csv">Vendor CSV</Label><Input id="vendor-csv" className="mt-1 max-w-sm" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; setRows([]); setDone(0); if (!file) return; if (file.size > 1_000_000) return setError("Choose a CSV smaller than 1 MB."); try { setRows(previewCsv(await file.text(), entity.country)); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the CSV."); } }} /></div><Button variant="outline" onClick={download}>Download CSV template</Button></div>
        <p className="mt-3 text-xs text-muted-foreground">Columns: name, registration, contact_name, contact_email, category. Quotes and commas in a field are supported.</p>
      </section>
      {error ? <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
      {done ? <section role="status" className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm"><strong>{done} vendor{done === 1 ? "" : "s"} added as Proposed.</strong> Review them before activation. <Link to="/procurement/suppliers" className="ml-1 text-primary underline">Open vendors</Link></section> : null}
      {rows.length ? <section className="rounded-lg border bg-surface p-4"><h2 className="font-semibold">Review {rows.length} vendor{rows.length === 1 ? "" : "s"}</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b"><th className="p-2">CSV row</th><th className="p-2">Vendor</th><th className="p-2">Registration</th><th className="p-2">Contact</th><th className="p-2">Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.line} className="border-b"><td className="p-2">{row.line}</td><td className="p-2">{row.name}</td><td className="p-2">{row.registration}</td><td className="p-2">{row.contactName}<span className="block text-xs text-muted-foreground">{row.contactEmail}</span></td><td className={`p-2 ${row.errors.length ? "text-danger" : "text-success"}`}>{row.errors.length ? row.errors.join("; ") : "Ready as Proposed"}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap gap-2"><Button disabled={rows.some((row) => row.errors.length)} onClick={commit}>Import {rows.length} vendor{rows.length === 1 ? "" : "s"}</Button><Button variant="outline" asChild><Link to="/procurement/suppliers">Cancel</Link></Button></div></section> : null}
    </div>
  </AppShell>;
}
