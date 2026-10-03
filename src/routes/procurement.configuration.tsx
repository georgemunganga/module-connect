import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/platform/app-context";
import { RestrictedState } from "@/platform/components/States";
import { procConfigurationGroups } from "@/modules/procurement/nav";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";

export const Route = createFileRoute("/procurement/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration — Meridian ERP Procurement" },
      { name: "description", content: "The single entry point for all procurement setup and administration." },
      { property: "og:title", content: "Configuration — Meridian ERP Procurement" },
      { property: "og:description", content: "The single entry point for all procurement setup and administration." },
    ],
  }),
  component: ProcConfiguration,
});

function ProcConfiguration() {
  const { role } = useApp();
  if (role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Configuration"
        description="Every setup and admin screen for this module lives behind this one entry point, grouped by purpose."
      />
      <div className="space-y-8">
        {procConfigurationGroups.map((g) => (
          <section key={g.label} aria-labelledby={`cfg-${g.label}`}>
            <h2 id={`cfg-${g.label}`} className="text-sm font-semibold">{g.label}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {g.items.map((i) => (
                <li key={i.label}>
                  <button
                    type="button" disabled title="Configuration editor is UI preview only"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-left opacity-75"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{i.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">Preview</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
