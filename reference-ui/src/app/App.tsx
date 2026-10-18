import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { AppProvider } from "../lib/store";
import { ErpShellProvider } from "../lib/erpShell";
import { ProcurementLiveGate, isProcurementLiveMode } from "../lib/ProcurementLiveGate";
import { LiveVendorList, LiveVendorEditor, LiveVendorDetail } from "../features/LiveVendors";
import { LiveItemList, LiveItemEditor, LiveItemDetail } from "../features/LiveItems";
import { LiveRequestList, LiveRequestEditor, LiveRequestDetail } from "../features/LiveRequests";
import { LiveSourcingList, LiveSourcingEditor, LiveSourcingDetail } from "../features/LiveSourcing";
import { LiveContractList, LiveContractEditor, LiveContractDetail } from "../features/LiveContracts";
import { LivePlanList, LivePlanEditor, LivePlanDetail } from "../features/LivePlans";
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
function WizardRoute() {
  const location = useLocation();
  return <RfqWizard key={`${location.pathname}${location.search}`} />;
}
function CatalogRoute({ kind }: { kind: "items" | "vendors" }) {
  const location = useLocation();
  return <CatalogEditor key={location.pathname} kind={kind} />;
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
        <ProcurementLiveGate>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/approvals"
              element={<RecordList kind="requests" approval />}
            />
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
                    : <RecordList key={module.key} kind={module.key} />}
              />
            ))}
            {Object.values(modules).map((module) => (
              <Route
                key={`${module.key}-detail`}
                path={`/${module.key}/:id`}
                element={
                  <div className="p-5 sm:p-8">
                    {isProcurementLiveMode && module.key === "requests" ? <LiveRequestDetail />
                      : isProcurementLiveMode && module.key === "rfqs" ? <LiveSourcingDetail />
                        : <RecordRoute kind={module.key} />}
                  </div>
                }
              />
            ))}
            {Object.values(modules)
              .filter((module) => module.key !== "rfqs")
              .flatMap((module) => [
                <Route
                  key={`${module.key}-new`}
                  path={`/${module.key}/new`}
                  element={
                    isProcurementLiveMode && module.key === "requests" ? <LiveRequestEditor /> : <EditorRoute
                      kind={module.key as Exclude<ModuleKey, "rfqs">}
                    />
                  }
                />,
                <Route
                  key={`${module.key}-edit`}
                  path={`/${module.key}/:id/edit`}
                  element={
                    isProcurementLiveMode && module.key === "requests" ? <LiveRequestEditor /> : <EditorRoute
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
                  <Budgets />
                </div>
              }
            />
            <Route
              path="/analytics"
              element={
                <div className="p-5 sm:p-8">
                  <Analytics />
                </div>
              }
            />
            <Route
              path="/inbox"
              element={
                <div className="p-5 sm:p-8">
                  <PayablesInbox />
                </div>
              }
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
          <Route path="/settings/*" element={<Settings />} />
        </Routes>
        </ProcurementLiveGate>
        </ErpShellProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
