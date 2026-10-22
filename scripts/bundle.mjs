// Bundles a Node app's entry points into ./dist. Workspace packages (@tagada/*)
// ship TypeScript source, so they are bundled in; every other package stays an
// external import resolved from node_modules at runtime.
//   node ../../scripts/bundle.mjs src/index.ts src/cron.ts
import { build } from "esbuild";

await build({
  entryPoints: process.argv.slice(2),
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-node-modules",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith("@tagada/") ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
