import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProvider } from "../platform/app-context";
import { ProcurementSessionProvider, useProcurementSession } from "../platform/procurement-session";
import { applyBranding, readBrandingCache, saveBrandingCache, type ErpBranding } from "../../shared/branding";

function PreloaderController({ brandingReady }: { brandingReady: boolean }) {
  const session = useProcurementSession();
  const startedAt = useRef(Date.now());
  useEffect(() => {
    if (!brandingReady || session.mode === "loading") return;
    const overlay = document.getElementById("erp-global-preloader");
    if (!overlay) return;
    const image = document.getElementById("erp-preloader-logo") as HTMLImageElement | null;
    const visibleAt = Number(image?.dataset.readyAt) || startedAt.current;
    const delay = Math.max(0, 550 - (Date.now() - visibleAt));
    const timer = window.setTimeout(() => {
      overlay.classList.add("is-leaving");
      window.setTimeout(() => overlay.classList.add("is-gone"), 280);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [brandingReady, session.mode]);
  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ERP workspace" },
      { name: "description", content: "HR operations workspace for leave, attendance, requests and pay." },
      { name: "author", content: "ERP" },
      { property: "og:title", content: "ERP workspace" },
      { property: "og:description", content: "HR operations workspace for leave, attendance, requests and pay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="erp-global-preloader" className="erp-global-preloader" role="status" aria-label="Loading ERP">
          <div className="erp-preloader-orbit" aria-hidden="true">
            <img id="erp-preloader-logo" className="erp-preloader-logo" alt="" hidden />
          </div>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [brandingReady, setBrandingReady] = useState(false);
  const [branding, setBranding] = useState<ErpBranding | null>(null);

  useLayoutEffect(() => {
    const cached = readBrandingCache();
    if (cached) {
      applyBranding(cached);
      setBranding(cached);
      setBrandingReady(true);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "erp.company-branding.v1") {
        const next = readBrandingCache();
        if (next) { applyBranding(next); setBranding(next); }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    fetch("/api/hrm/branding", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ErpBranding> : Promise.reject())
      .then((branding) => {
        if (!active) return;
        applyBranding(branding);
        saveBrandingCache(branding);
        setBranding(branding);
      })
      .catch(() => {})
      .finally(() => { if (active) setBrandingReady(true); window.clearTimeout(timeout); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!branding?.displayName) return;
    const area = pathname.startsWith("/supplier") ? "Supplier portal"
      : pathname.startsWith("/procurement") ? "Procurement" : "ERP workspace";
    document.title = `${area} · ${branding.displayName}`;
  }, [branding, pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ProcurementSessionProvider>
          <PreloaderController brandingReady={brandingReady} />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </ProcurementSessionProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
