import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function commit(): string {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  if (process.env.VITE_COMMIT) return process.env.VITE_COMMIT;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: { __TAGADA_COMMIT__: JSON.stringify(commit()) },
  plugins: [react(), tailwindcss()],
  // Read VITE_* from the repo-root .env, next to the server's variables.
  envDir: "../..",
  server: { port: 5173 },
});
