import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        configure: (proxy) => {
          // Suppress ECONNREFUSED noise during server restarts.
          proxy.on("error", () => {});
        },
      },
      "/ws": {
        target: "ws://localhost:3002",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", () => {});
        },
      },
    },
  },
});
