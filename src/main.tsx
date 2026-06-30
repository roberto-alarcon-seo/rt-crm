import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { resolvePartnerByHostname } from "./config/partnerConfig.ts";
import { buildDefaultTheme, applyPartnerTheme } from "./lib/partnerTheme.ts";

// Synchronously apply partner brand tokens + surface class before first render.
// This eliminates flash of wrong colors on initial load.
const partner = resolvePartnerByHostname(window.location.hostname);
const savedTheme = localStorage.getItem("brokia-theme");
// Default to dark when there's no explicit preference. "partner"/no-value
// used to fall through to "light" here, which applies the .light CSS class
// (near-white --border/--input) for the instant before the branded dark
// colors get computed and override it — a visible flash on first paint.
// No UI lets users pick "light" vs "partner" separately (see UserMenu.tsx),
// so defaulting unset state straight to dark removes that window entirely.
const surfaceMode: "light" | "dark" =
  savedTheme === "light" ? "light" : "dark";

const initialTheme = buildDefaultTheme(
  partner.primaryColorHsl,
  partner.defaultLightPreset,
  partner.defaultDarkPreset,
  surfaceMode,
);

document.documentElement.classList.remove("dark", "light", "blue");
document.documentElement.classList.add(surfaceMode);
document.body.classList.remove("dark", "light", "blue");
applyPartnerTheme(initialTheme);

createRoot(document.getElementById("root")!).render(
  <App />
);
