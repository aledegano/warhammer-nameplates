import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "/warhammer-nameplates/",
  plugins: [react()],
  build: { outDir: "../dist-web", emptyOutDir: true },
  worker: { format: "es" },
  // manifold-3d locates its WASM relative to its own module; pre-bundling would break that.
  optimizeDeps: { exclude: ["manifold-3d"] },
  // The bundled font lives outside the web root.
  server: { fs: { allow: [".."] } },
});
