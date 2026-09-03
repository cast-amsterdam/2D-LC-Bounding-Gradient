import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: resolve(currentDirectory, "src/main.tsx"),
      name: "BG2DLC",
      formats: ["iife"],
      fileName: () => "bg2dlc.js",
      cssFileName: "bg2dlc",
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        entryFileNames: "assets/bg2dlc.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith(".css"))
            ? "assets/bg2dlc.css"
            : "assets/[name][extname]",
      },
    },
  },
  worker: { format: "iife" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
