import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { AppProvider } from "../lib/store";
import { ErpShellProvider } from "../lib/erpShell";
import { ProcurementLiveGate, ProcurementScopeSelectionState, isProcurementLiveMode, useLiveReadiness } from "../lib/ProcurementLiveGate";
import { LiveVendorList, LiveVendorEditor, LiveVendorDetail } from "../features/LiveVendors";
import { LiveItemList, LiveItemEditor, LiveItemDetail } from "../features/LiveItems";
import { LiveApprovalQueue, LiveApprovalDetail } from "../features/LiveApprovals";
import { InvoiceUnitReviewDetail } from "../features/InvoiceUnitReviewTasks";
import { LiveRequestList, LiveRequestEditor, LiveRequestDetail } from "../features/LiveRequests";
import { LiveSourcingList, LiveSourcingEditor, LiveSourcingDetail } from "../features/LiveSourcing";
import { LiveContractList, LiveContractEditor, LiveContractDetail } from "../features/LiveContracts";
import { LiveRecurringPurchaseList, LiveRecurringPurchaseEditor, LiveRecurringPurchaseDetail } from "../features/LiveRecurringPurchases";
import { LivePlanList, LivePlanEditor, LivePlanDetail } from "../features/LivePlans";
import { LiveVendorCreditList, LiveVendorCreditDetail, LiveVendorCreditEditor } from "../features/LiveVendorCredits";
import { LiveInvoiceList, LiveInvoiceEditor, LiveInvoiceDetail } from "../features/LiveInvoices";
import { LiveOrderList, LiveOrderEditor, LiveOrderDetail } from "../features/LiveOrders";
import { LiveReceivingList, LiveReceivingDetail } from "../features/LiveReceiving";
import { LiveReceivingEditor } from "../features/LiveReceivingEditor";
import { LiveBudgets } from "../features/LiveBudgets";
import { LiveOverview } from "../features/LiveOverview";
import { AppShell } from "../components/layout/AppShell";
import { Dashboard } from "../features/Dashboard";
import { RecordList } from "../features/RecordList";
import { TransactionEditor } from "../features/TransactionEditor";
import { RfqWizard } from "../features/RfqWizard";
import { CatalogList, CatalogEditor } from "../features/Catalogs";
import { CatalogDetail } from "../features/CatalogDetail";
import { RecordDetail } from "../features/RecordDetail";
import { Budgets, Analytics, PayablesInbox } from "../features/Insights";
import { BatchPayments } from "../features/BatchPayments";
import { BatchPaymentEditor } from "../features/BatchPaymentEditor";
import { Settings } from "../features/Settings";
import { LiveSettingsShell } from "../features/LiveSettingsShell";
import { modules, type ModuleKey } from "../data/modules";

function EditorRoute({ kind }: { kind: Exclude<ModuleKey, "rfqs"> }) {
  const location = useLocation();
  return (
    <TransactionEditor
      key={`${location.pathname}${location.search}`}
      kind={kind}
    />
  );
}
function LiveRequestRoute() {
  const location = useLocation();
  return <LiveRequestDetail key={location.pathname} />;
}
function LiveApprovalRoute() {
  const location = useLocation();
  return <LiveApprovalDetail key={location.pathname} />;
}
function WizardRoute() {
  const location = useLocation();
  return <RfqWizard key={`${location.pathname}${location.search}`} />;
}
function CatalogRoute({ kind }: { kind: "items" | "vendors" }) {
  const location = useLocation();
  return <CatalogEditor key={location.pathname} kind={kind} />;
}
function PendingLiveWorkflow() {
  const location = useLocation();
  const readiness = useLiveReadiness();
  if (readiness?.adminViewOnly && /\/(?:new|edit)\/?$/.test(location.pathname))
    return <div className="p-5 sm:p-8"><h1 className="text-2xl font-semibold">View only</h1><p className="mt-3 text-sm text-muted-foreground">You can review Procurement as an ERP administrator. Creating or changing purchasing records requires an active employee account.</p><Link className="mt-5 inline-block text-primary hover:underline" to={location.pathname.replace(/\/(?:new|edit)\/?$/, "") || "/vendors"}>Back to records</Link></div>;
  const routeName = location.pathname.split("/").filter(Boolean)[0];
  const pageName = routeName === "recurring-bills" ? "Recurring purchases" : routeName?.replaceAll("-", " ") || "Home";
  return <div className="p-5 sm:p-8">
    <h1 className="text-2xl font-semibold capitalize">{pageName}</h1>
    <p className="mt-3 max-w-xl text-sm text-muted-foreground">This workflow is being connected to your ERP. Your company and account are ready; no sample transactions are shown here.</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground" to="/requests">My requests</Link><Link className="rounded-full border px-5 py-2 text-sm" to="/vendors">Vendors</Link></div>
  </div>;
}
function RecordRoute({ kind }: { kind: string }) {
  const location = useLocation();
  return (
    <RecordDetail key={`${location.pathname}${location.search}`} kind={kind} />
  );
}
export function App() {
  return (
    <BrowserRouter basename="/procurement/workspace">
      <AppProvider>
        <ErpShellProvider>
        <ProcurementLiveGate blockedShell={content => <Routes><Route element={<AppShell />}><Route path="*" element={content} /></Route></Routes>} scopeUnavailable={<Routes><Route element={<AppShell />}><Route path="*" element={<ProcurementScopeSelectionState />} /></Route></Routes>} unavailable={<Routes><Route element={<AppShell />}><Route path="*" element={<PendingLiveWorkflow />} /></Route></Routes>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={isProcurementLiveMode ? <LiveOverview /> : <Dashboard />} />
            <Route
              path="/approvals"
              element={isProcurementLiveMode ? <LiveApprovalQueue /> : <RecordList kind="requests" approval />}
            />
            <Route path="/approvals/unit-review/:id" element={isProcurementLiveMode ? <InvoiceUnitReviewDetail /> : <PendingLiveWorkflow />} />
            <Route path="/approvals/:id" element={isProcurementLiveMode ? <LiveApprovalRoute /> : <PendingLiveWorkflow />} />
            <Route
              path="/procurement-requests"
              element={isProcurementLiveMode ? <LiveRequestList /> : <RecordList kind="requests" procurement />}
            />
            {Object.values(modules).map((module) => (
              <Route
                key={module.key}
                path={`/${module.key}`}
                element={isProcurementLiveMode && module.key === "requests" ? <LiveRequestList />
                  : isProcurementLiveMode && module.key === "rfqs" ? <LiveSourcingList />
                    : isProcurementLiveMode && module.key === "vendor-credits" ? <LiveVendorCreditList />
                    : isProcurementLiveMode && module.key === "bills" ? <LiveInvoiceList />
                    : isProcurementLiveMode && module.key === "recurring-bills" ? <LiveRecurringPurchaseList />
                    : isProcurementLiveMode && module.key === "purchase-receives" ? <LiveReceivingList />
                    : isProcurementLiveMode && module.key === "purchase-orders" ? <LiveOrderList />
                    : <RecordList key={module.key} kind={module.key} />}
              />
            ))}
            {Object.values(modules).map((module) => (
              <Route
                key={`${module.key}-detail`}
                path={`/${module.key}/:id`}
                element={isProcurementLiveMode && module.key === "vendor-credits" ? <LiveVendorCreditDetail />
                  : isProcurementLiveMode && module.key === "bills" ? <LiveInvoiceDetail />
                  : isProcurementLiveMode && module.key === "recurring-bills" ? <LiveRecurringPurchaseDetail />
                  : isProcurementLiveMode && module.key === "purchase-receives" ? <LiveReceivingDetail />
                  : isProcurementLiveMode && module.key === "purchase-orders" ? <LiveOrderDetail />
                  : <div className="p-5 sm:p-8">
                    {isProcurementLiveMode && module.key === "requests" ? <LiveRequestRoute />
                      : isProcurementLiveMode && module.key === "rfqs" ? <LiveSourcingDetail />
                        : <RecordRoute kind={module.key} />}
                  </div>}
              />
            ))}
            {Object.values(modules)
              .filter((module) => module.key !== "rfqs")
              .flatMap((module) => [
                <Route
                  key={`${module.key}-new`}
                  path={`/${module.key}/new`}
                  element={
                    isProcurementLiveMode && module.key === "requests" ? <LiveRequestEditor />
                      : isProcurementLiveMode && module.key === "vendor-credits" ? <LiveVendorCreditEditor />
                      : isProcurementLiveMode && module.key === "bills" ? <LiveInvoiceEditor />
                      : isProcurementLiveMode && module.key === "recurring-bills" ? <LiveRecurringPurchaseEditor />
                        : isProcurementLiveMode && module.key === "purchase-receives" ? <LiveReceivingEditor />
                        : isProcurementLiveMode && module.key === "purchase-orders" ? <LiveOrderEditor /> : <EditorRoute
                      kind={module.key as Exclude<ModuleKey, "rfqs">}
                    />
                  }
                />,
                <Route
                  key={`${module.key}-edit`}
                  path={`/${module.key}/:id/edit`}
                  element={
                    isProcurementLiveMode && module.key === "requests" ? <LiveRequestEditor />
                      : isProcurementLiveMode && module.key === "vendor-credits" ? <LiveVendorCreditEditor />
                      : isProcurementLiveMode && module.key === "bills" ? <LiveInvoiceEditor />
                      : isProcurementLiveMode && module.key === "recurring-bills" ? <LiveRecurringPurchaseEditor />
                        : isProcurementLiveMode && module.key === "purchase-receives" ? <LiveReceivingEditor />
                        : isProcurementLiveMode && module.key === "purchase-orders" ? <LiveOrderEditor /> : <EditorRoute
                      kind={module.key as Exclude<ModuleKey, "rfqs">}
                    />
                  }
                />,
              ])}
            <Route path="/rfqs/new" element={isProcurementLiveMode ? <LiveSourcingEditor /> : <WizardRoute />} />
            <Route path="/rfqs/:id/edit" element={isProcurementLiveMode ? <LiveSourcingEditor /> : <WizardRoute />} />
            {isProcurementLiveMode && <>
              <Route path="/contracts" element={<LiveContractList />} />
              <Route path="/contracts/new" element={<LiveContractEditor />} />
              <Route path="/contracts/:id/edit" element={<LiveContractEditor />} />
              <Route path="/contracts/:id" element={<LiveContractDetail />} />
              <Route path="/plans" element={<LivePlanList />} />
              <Route path="/plans/new" element={<LivePlanEditor />} />
              <Route path="/plans/:id/edit" element={<LivePlanEditor />} />
              <Route path="/plans/:id" element={<LivePlanDetail />} />
            </>}
            {(["items", "vendors"] as const).flatMap((kind) => [
              <Route
                key={kind}
                path={`/${kind}`}
                element={
                  <div className="p-5 sm:p-8">
                    {isProcurementLiveMode ? kind === "vendors" ? <LiveVendorList /> : <LiveItemList /> : <CatalogList kind={kind} />}
                  </div>
                }
              />,
              <Route
                key={`${kind}-new`}
                path={`/${kind}/new`}
                element={
                  <div className="p-5 sm:p-8">
                    {isProcurementLiveMode ? kind === "vendors" ? <LiveVendorEditor /> : <LiveItemEditor /> : <CatalogRoute kind={kind} />}
                  </div>
                }
              />,
              <Route
                key={`${kind}-edit`}
                path={`/${kind}/:id/edit`}
                element={
                  <div className="p-5 sm:p-8">
                    {isProcurementLiveMode ? kind === "vendors" ? <LiveVendorEditor /> : <LiveItemEditor /> : <CatalogRoute kind={kind} />}
                  </div>
                }
              />,
            ])}
            {(["items", "vendors"] as const).map((kind) => (
              <Route
                key={`${kind}-detail`}
                path={`/${kind}/:id`}
                element={
                  <div className="p-5 sm:p-8">
                  {isProcurementLiveMode ? kind === "vendors" ? <LiveVendorDetail /> : <LiveItemDetail /> : <CatalogDetail kind={kind} />}
                  </div>
                }
              />
            ))}
            <Route
              path="/vendors/:id/:tab"
              element={
                <div className="p-5 sm:p-8">
                  {isProcurementLiveMode ? <LiveVendorDetail /> : <CatalogDetail kind="vendors" />}
                </div>
              }
            />
            <Route
              path="/budgets"
              element={
                <div className="p-5 sm:p-8">
                  {isProcurementLiveMode ? <LiveBudgets /> : <Budgets />}
                </div>
              }
            />
            <Route
              path="/analytics"
              element={isProcurementLiveMode ? <LiveOverview analytics />
                : <div className="p-5 sm:p-8"><Analytics /></div>}
            />
            <Route
              path="/inbox"
              element={isProcurementLiveMode ? <LiveInvoiceList />
                : <div className="p-5 sm:p-8"><PayablesInbox /></div>}
            />
            <Route
              path="/batch-payments"
              element={
                <div className="p-5 sm:p-8">
                  <BatchPayments />
                </div>
              }
            />
            <Route
              path="/batch-payments/:id/edit"
              element={<BatchPaymentEditor />}
            />
            <Route
              path="/batch-payments/:id"
              element={
                <div className="p-5 sm:p-8">
                  <RecordRoute kind="batch-payments" />
                </div>
              }
            />
            <Route
              path="*"
              element={
                <div className="p-12 text-center">
                  <h1 className="text-xl font-semibold">Page not found</h1>
                  <p className="mt-3 text-slate-500">
                    This screen is not part of the current Procurement frontend.
                  </p>
                  <Link to="/" className="mt-6 inline-block text-blue-500">
                    Return to dashboard →
                  </Link>
                </div>
              }
            />
          </Route>
          <Route path="/settings/*" element={isProcurementLiveMode ? <LiveSettingsShell /> : <Settings />} />
        </Routes>
        </ProcurementLiveGate>
        </ErpShellProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
