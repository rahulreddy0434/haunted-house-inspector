import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      // `server-only` throws outside the Next.js server bundle; stub it in tests.
      "server-only": path.resolve(__dirname, "./src/test/serverOnlyStub.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
