import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { resolvePartnerByHostname } from "./config/partnerConfig.ts";
import { buildDefaultTheme, applyPartnerTheme } from "./lib/partnerTheme.ts";

// Synchronously apply partner brand tokens + surface class before first render.
// This eliminates flash of wrong colors on initial load.
const partner = resolvePartnerByHostname(window.location.hostname);
const savedTheme = localStorage.getItem("brokia-theme") ?? "partner";
const surfaceMode: "light" | "dark" =
  savedTheme === "dark" ? "dark" : "light";

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
