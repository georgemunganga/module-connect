import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
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
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-left transition-colors hover:border-border-strong"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{i.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
