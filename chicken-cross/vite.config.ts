import { defineConfig } from "vite";

// Dev server and build for the G2 harness page only (index.html at this folder root).
export default defineConfig({
  root: ".",
  base: "./",
  server: { port: 5182, open: false },
  build: { outDir: "dist", emptyOutDir: true },
});
