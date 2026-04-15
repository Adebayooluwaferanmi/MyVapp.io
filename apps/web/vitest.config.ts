import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    css: true,
    environment: "jsdom",
    fileParallelism: false,
    globals: true,
    maxWorkers: 1,
    minWorkers: 1,
    pool: "threads",
    setupFiles: "./src/setupTests.ts"
  }
});
