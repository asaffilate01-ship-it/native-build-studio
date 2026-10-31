import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/adopt.mjs", import.meta.url));

function run(target, ...args) {
  return spawnSync(process.execPath, [script, "--target=" + target, ...args], { encoding: "utf8" });
}

test("dry run is read-only; install is brand-aware and never overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "itech-ui-adopt-"));
  try {
    await mkdir(join(root, "src", "components"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^18.3.1" } }));

    const dry = run(root, "--brand=hsl", "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /"dryRun": true/);

    const install = run(root, "--brand=hsl");
    assert.equal(install.status, 0, install.stderr);
    const css = await readFile(join(root, "src", "components", "portfolio-ui", "kitchen-ui.css"), "utf8");
    assert.match(css, /--itu-accent: hsl\(var\(--primary\)\)/);
    const source = await readFile(join(root, "src", "components", "portfolio-ui", "index.tsx"), "utf8");
    assert.match(source, /export function ActionButton/);

    const again = run(root);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /No files were overwritten/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported frameworks and unknown brand mapping", async () => {
  const root = await mkdtemp(join(tmpdir(), "itech-ui-invalid-"));
  try {
    await mkdir(join(root, "src", "components"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^17.0.0" } }));
    assert.notEqual(run(root, "--brand=none", "--dry-run").status, 0);
    assert.notEqual(run(root, "--brand=unknown", "--dry-run").status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
