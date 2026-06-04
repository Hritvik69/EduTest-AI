import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    exclude: ["node_modules/**", ".next/**", "tests/browser/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
