// The deploy promises from the walking-skeleton ticket: every env var is listed
// in .env.example with no secret in it, the SDKs are pinned exactly, and
// render.yaml keeps the SPA rewrite, the cron schedule and the shared env group.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(join(root, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.ts$/.test(name) ? [rel] : [];
  });
}

function exampleEnv(): Map<string, string> {
  return new Map(
    read(".env.example")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)] as const),
  );
}

describe(".env.example", () => {
  it("lists every environment variable the code reads", () => {
    const used = new Set<string>();
    for (const f of [...sourceFiles("apps"), ...sourceFiles("packages"), ...sourceFiles("scripts")]) {
      const src = read(f);
      for (const m of src.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g)) used.add(m[1]!);
      for (const m of src.matchAll(/(?:requireEnv|need)\("([A-Z0-9_]+)"\)/g)) used.add(m[1]!);
    }
    // Set by the platform, not by us.
    for (const platform of ["PORT", "RENDER", "RENDER_SDK_SOCKET_PATH", "RENDER_SDK_AUTO_START", "DEV", "PROD", "MODE"])
      used.delete(platform);

    const listed = exampleEnv();
    const missing = [...used].filter((v) => !listed.has(v)).sort();
    expect(missing).toEqual([]);
  });

  it("lists the env vars the build plan names", () => {
    const listed = exampleEnv();
    for (const v of [
      "APPWRITE_ENDPOINT",
      "APPWRITE_PROJECT",
      "APPWRITE_KEY",
      "ELEVENLABS_API_KEY",
      "ELEVENLABS_AGENT_ID",
      "ELEVENLABS_WEBHOOK_SECRET",
      "GEMINI_API_KEY",
      "RESEND_API_KEY",
      "EMAIL_FROM_DOMAIN",
      "PAY_TOKEN_SECRET",
      "WEB_ORIGIN",
      "RENDER_API_KEY",
    ])
      expect(listed.has(v), v).toBe(true);
  });

  it("holds no secret values", () => {
    for (const [name, value] of exampleEnv())
      if (/KEY|SECRET|TOKEN/.test(name)) expect(value, name).toBe("");
  });
});

describe("SDK pins", () => {
  const pins: Record<string, string> = {
    appwrite: "29.1.0",
    "node-appwrite": "31.0.0",
    "@renderinc/sdk": "1.4.0",
  };

  it("pins appwrite, node-appwrite and @renderinc/sdk exactly wherever they are used", () => {
    const manifests = ["package.json", ...["apps", "packages"].flatMap((d) =>
      readdirSync(join(root, d)).map((p) => `${d}/${p}/package.json`),
    )];
    let seen = 0;
    for (const m of manifests) {
      const pkg = JSON.parse(read(m));
      for (const deps of [pkg.dependencies, pkg.devDependencies])
        for (const [name, version] of Object.entries(deps ?? {}))
          if (name in pins) {
            seen++;
            expect(version, `${m} ${name}`).toBe(pins[name]);
          }
    }
    expect(seen).toBeGreaterThanOrEqual(3);
  });
});

describe("render.yaml", () => {
  const blueprint = parse(read("render.yaml"));
  const service = (name: string) => blueprint.services.find((s: { name: string }) => s.name === name);

  it("rewrites every path to index.html so deep links like /pay/x never 404", () => {
    expect(service("app-web").routes).toContainEqual({ type: "rewrite", source: "/*", destination: "/index.html" });
  });

  it("runs the cron job at 30 4 * * * UTC (10:00 IST)", () => {
    expect(service("app-cron").schedule).toBe("30 4 * * *");
  });

  it("health-checks the web service on /healthz", () => {
    expect(service("app-server").healthCheckPath).toBe("/healthz");
  });

  it("declares a workflow service whose name matches the task slugs", async () => {
    const { WORKFLOW_SERVICE } = await import("../apps/server/src/workflows.ts");
    expect(service(WORKFLOW_SERVICE).type).toBe("workflow");
  });

  it("gives every service the one shared environment group", () => {
    const groups = blueprint.envVarGroups.map((g: { name: string }) => g.name);
    expect(groups).toHaveLength(1);
    for (const s of blueprint.services)
      expect(s.envVars, s.name).toContainEqual({ fromGroup: groups[0] });
  });

  it("keeps secrets out of the blueprint", () => {
    for (const g of blueprint.envVarGroups)
      for (const v of g.envVars) if ("value" in v) expect(v.key, relative(root, "render.yaml")).not.toMatch(/KEY|SECRET|TOKEN/);
  });
});
