import type { ErpBranding } from "./branding";

/** Existing Kuubu product palette and maintained hippo mark. */
export const kuubuMark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46"><path fill="#69c829" d="M8 13C0 6 8-3 15 3c2 2 2 4 2 6 5-2 9-2 14 0 0-2 0-4 2-6 7-6 15 3 7 10l2 10c5 4 7 11 4 16-4 7-13 7-22 7S6 46 2 39c-3-5-1-12 4-16z"/><ellipse cx="15" cy="33" rx="2" ry="3" fill="white"/><ellipse cx="33" cy="33" rx="2" ry="3" fill="white"/></svg>';
export const kuubuMarkUri = "data:image/svg+xml," + encodeURIComponent(kuubuMark);
export const kuubuBranding: ErpBranding = {
  displayName: "Kuubu", fontFamily: "Poppins", primaryColor: "#004b3b", primaryForegroundColor: "#ffffff",
  buttonColor: "#004b3b", buttonForegroundColor: "#ffffff", secondaryColor: "#f2f7ed", secondaryForegroundColor: "#004b3b",
  accentColor: "#69c829", accentForegroundColor: "#004b3b", railColor: "#073e2e", railForegroundColor: "#ffffff",
  railMutedColor: "#b6cfbf", railActiveColor: "#69c829", faviconDataUri: kuubuMarkUri,
};
