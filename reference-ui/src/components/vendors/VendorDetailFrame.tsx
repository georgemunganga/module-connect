import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../ui";
import { DetailTabs } from "../data/DetailPrimitives";

export const vendorDetailTabs = [
  { key: "overview", label: "Overview" }, { key: "comments", label: "Comments" },
  { key: "transactions", label: "Transactions" }, { key: "mails", label: "Mails" },
  { key: "statement", label: "Statement" },
];

/** Presentation extracted from the imported CatalogDetail vendor layout. No store,
 * network, business permissions, financial calculations or mutations live here. */
export function VendorDetailFrame({ title, status, subtitle, directory, actions, activeTab, onTabChange, children }: {
  title: string; status: string; subtitle?: string; directory: ReactNode; actions?: ReactNode;
  activeTab: string; onTabChange: (tab: string) => void; children: ReactNode;
}) {
  return <div className="-mx-5 -mt-5 min-h-[calc(100dvh-5rem)] bg-background sm:-mx-8 sm:-mt-8" data-testid="vendor-detail-frame">
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col xl:flex-row">
      <aside aria-label="Vendor directory" className="w-full shrink-0 border-b border-border bg-card xl:w-64 xl:border-b-0 xl:border-r">{directory}</aside>
      <section aria-label="Vendor record" className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-6">
          <div className="min-w-0"><Link to="/vendors" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={14} />Back to vendors</Link>
            <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-semibold">{title}</h1><Badge>{status}</Badge></div>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <DetailTabs tabs={vendorDetailTabs} active={activeTab} onChange={onTabChange} />
        <div className="space-y-4 p-4 sm:p-6">{children}</div>
      </section>
    </div>
  </div>;
}
