import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLISHED_PACKAGES, syncCore } from "./sync-core.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: node scripts/publish.mjs <version> [--dry-run]");
  process.exit(1);
}

function setVersion(packageJsonPath, nextVersion) {
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  manifest.version = nextVersion;
  writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

syncCore();
setVersion(join(ROOT, "package.json"), version);
setVersion(join(ROOT, "packages", "core", "package.json"), version);

for (const name of PUBLISHED_PACKAGES) {
  const dir = join(ROOT, "packages", name);
  setVersion(join(dir, "package.json"), version);
  copyFileSync(join(ROOT, "LICENSE"), join(dir, "LICENSE"));
}

execFileSync("npx", ["tsc", "--build", "--force"], { cwd: ROOT, stdio: "inherit", shell: true });

for (const name of PUBLISHED_PACKAGES) {
  const dir = join(ROOT, "packages", name);
  const args = ["publish", "--access", "public"];
  if (dryRun) args.push("--dry-run");

  console.log(`\n=== ${dryRun ? "dry-run " : ""}publish ${name}@${version} ===`);
  execFileSync("npm", args, { cwd: dir, stdio: "inherit", shell: true });
}
