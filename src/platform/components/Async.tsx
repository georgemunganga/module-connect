import type { ReactNode } from "react";
import type { MockState } from "@/platform/use-mock";
import { DegradedState, ErrorState, LoadingState } from "./States";

export function Async<T>({
  state,
  children,
  rows = 4,
}: {
  state: MockState<T>;
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  if (state.loading) return <LoadingState rows={rows} />;
  if (state.degraded) return <DegradedState service={state.degraded} onRetry={state.reload} />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return null;
  return <>{children(state.data)}</>;
}
