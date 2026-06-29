import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
/// <reference types="vitest" />

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  const brand      = env.VITE_BRAND      ?? "brokia";
  const appName    = env.VITE_APP_NAME   ?? "Brokia24";
  const shortName  = env.VITE_SHORT_NAME ?? "Brokia";
  const themeColor = env.VITE_THEME_COLOR ?? "#141414";
  const description = env.VITE_APP_DESCRIPTION ?? "CRM inmobiliario con IA para brokers.";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          enabled: mode === "development",
        },
        includeAssets: [
          `icons/${brand}/ios/180.png`,
          `icons/${brand}/android/launchericon-192x192.png`,
          `icons/${brand}/android/launchericon-512x512.png`,
        ],
        manifest: {
          name: appName,
          short_name: shortName,
          description,
          theme_color: themeColor,
          background_color: "#141414",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/inbox",
          icons: [
            {
              src: `/icons/${brand}/android/launchericon-192x192.png`,
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: `/icons/${brand}/android/launchericon-512x512.png`,
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: `/icons/${brand}/android/launchericon-512x512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: `/icons/${brand}/ios/180.png`,
              sizes: "180x180",
              type: "image/png",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB (el bundle principal es ~3.3 MB)
          navigateFallback: "/index.html",
          runtimeCaching: [
            {
              // Fuentes de Google — cachear 1 año
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              // API de Supabase — NetworkFirst: prefiere red, cae a caché si no hay señal
              // Solo cachear respuestas exitosas (2xx) para evitar cachear 404/500
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-api",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
