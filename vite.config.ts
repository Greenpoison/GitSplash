import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "./package.json"), "utf8"));

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `npm run dev:mock` (vite --mode mock) swaps every Tauri API/plugin
      // entry point the frontend touches for an in-memory fake — lets the
      // app run in a plain browser tab, with fake repos/commits/branches,
      // for eyeballing UI changes without a full `tauri dev`/`tauri build`
      // round-trip. See src/testing/mock/ for what's actually faked.
      ...(mode === "mock"
        ? {
            "@tauri-apps/api/core": path.resolve(__dirname, "./src/testing/mock/mockCore.ts"),
            "@tauri-apps/api/event": path.resolve(__dirname, "./src/testing/mock/mockEvent.ts"),
            "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/testing/mock/mockDialog.ts"),
            "@tauri-apps/plugin-updater": path.resolve(__dirname, "./src/testing/mock/mockUpdater.ts"),
            "@tauri-apps/plugin-process": path.resolve(__dirname, "./src/testing/mock/mockProcess.ts"),
          }
        : {}),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
