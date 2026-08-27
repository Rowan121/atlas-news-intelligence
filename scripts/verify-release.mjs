import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const timeoutMs = 5 * 60 * 1_000;

const steps = [
  ["install data dependencies", repositoryRoot, ["ci"]],
  ["install UI dependencies", resolve(repositoryRoot, "ui"), ["ci"]],
  ["install Surface dependencies", resolve(repositoryRoot, "surface"), ["ci"]],
  ["typecheck data package", repositoryRoot, ["run", "typecheck"]],
  ["test data package", repositoryRoot, ["test"]],
  ["build data package", repositoryRoot, ["run", "build"]],
  ["test UI", resolve(repositoryRoot, "ui"), ["test"]],
  ["build UI", resolve(repositoryRoot, "ui"), ["run", "build"]],
  ["check Surface", resolve(repositoryRoot, "surface"), ["run", "check"]],
  ["bundle Worker and UI assets (dry run)", resolve(repositoryRoot, "surface"), ["run", "build"]],
];

for (const [label, cwd, args] of steps) {
  console.log(`\n[verify:release] ${label}`);
  const result = spawnSync(npm, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    stdio: "inherit",
    timeout: timeoutMs,
  });
  if (result.error) {
    console.error(`[verify:release] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[verify:release] ${label} exited with ${result.status ?? result.signal ?? "unknown status"}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[verify:release] all install, check, test, and build gates passed");
