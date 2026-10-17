import { defineConfig } from "vite";

// Dev server and build for the G1 harness page only (index.html at this folder root).
export default defineConfig({
  root: ".",
  base: "./",
  server: { port: 5181, open: false },
  build: { outDir: "dist", emptyOutDir: true },
});
