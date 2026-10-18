export type ErpBranding = {
  displayName?: string;
  fontFamily?: string;
  primaryColor?: string;
  primaryForegroundColor?: string;
  buttonColor?: string;
  buttonForegroundColor?: string;
  secondaryColor?: string;
  secondaryForegroundColor?: string;
  accentColor?: string;
  accentForegroundColor?: string;
  railColor?: string;
  railForegroundColor?: string;
  railMutedColor?: string;
  railActiveColor?: string;
  logoLightDataUri?: string | null;
  logoDarkDataUri?: string | null;
  faviconDataUri?: string | null;
};

const CACHE_KEY = "erp.company-branding.v1";
const colorTokens: Record<string, keyof ErpBranding> = {
  "--primary": "primaryColor",
  "--primary-foreground": "primaryForegroundColor",
  "--button-primary": "buttonColor",
  "--button-primary-foreground": "buttonForegroundColor",
  "--secondary": "secondaryColor",
  "--secondary-foreground": "secondaryForegroundColor",
  "--accent": "accentColor",
  "--accent-foreground": "accentForegroundColor",
  "--rail": "railColor",
  "--rail-foreground": "railForegroundColor",
  "--rail-muted": "railMutedColor",
  "--rail-active": "railActiveColor",
  "--ring": "primaryColor",
};

export function readBrandingCache(): ErpBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as ErpBranding | null;
    return value && typeof value.primaryColor === "string" && typeof value.fontFamily === "string" ? value : null;
  } catch { return null; }
}

export function saveBrandingCache(value: ErpBranding): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* Storage may be disabled or full. */ }
}

export function applyBranding(value: ErpBranding): void {
  const root = document.documentElement;
  for (const [token, field] of Object.entries(colorTokens)) {
    const color = value[field];
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) root.style.setProperty(token, color);
  }
  const fonts: Record<string, string> = {
    Poppins: '"Poppins", ui-sans-serif, system-ui, sans-serif',
    Montserrat: '"Montserrat", ui-sans-serif, system-ui, sans-serif',
    Inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  };
  root.style.setProperty("--erp-font-family", fonts[value.fontFamily || "Montserrat"] ?? fonts.Montserrat);
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.dataset.erpDefaultHref ||= icon.getAttribute("href") || "/favicon.ico";
    icon.href = value.faviconDataUri?.startsWith("data:image/")
      ? value.faviconDataUri : icon.dataset.erpDefaultHref;
  }
  const logo = value.logoDarkDataUri || value.logoLightDataUri;
  const image = document.getElementById("erp-preloader-logo") as HTMLImageElement | null;
  if (image) {
    image.hidden = !logo?.startsWith("data:image/");
    if (!image.hidden && logo && image.getAttribute("src") !== logo) {
      image.src = logo;
      image.dataset.readyAt = String(Date.now());
    }
  }
}
