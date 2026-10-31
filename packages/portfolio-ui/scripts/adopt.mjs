#!/usr/bin/env node
/**
 * Non-destructive installer for existing React/Vite/TanStack/Next checkouts.
 * No network calls, no dependencies, no automatic edits to working UI, and no overwrite.
 *
 * Usage: node packages/portfolio-ui/scripts/adopt.mjs --target=/path/to/app --brand=hsl --dry-run
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const FILENAMES = ["index.tsx", "file-validation.ts", "kitchen-ui.css"];

function argValue(name) {
  const prefix = "--" + name + "=";
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const hsl = ":root, .dark { --itu-accent: hsl(var(--primary)); --itu-on-accent: hsl(var(--primary-foreground)); --itu-text: hsl(var(--foreground)); --itu-surface: hsl(var(--card)); --itu-border: hsl(var(--border)); --itu-focus: hsl(var(--ring)); }\n";
const oklch = ":root, .dark { --itu-accent: var(--primary); --itu-on-accent: var(--primary-foreground); --itu-text: var(--foreground); --itu-surface: var(--card); --itu-border: var(--border); --itu-focus: var(--ring); }\n";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const rootArg = argValue("target");
  const brand = argValue("brand") ?? "none";
  const dryRun = process.argv.includes("--dry-run");
  if (!rootArg) throw new Error("Provide --target=/absolute/or/relative/application/repository");
  if (!["none", "hsl", "oklch"].includes(brand)) throw new Error("--brand must be none, hsl or oklch");
  const root = resolve(rootArg);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  const react = String(dependencies.react ?? "");
  if (!/^(?:\^|~|>=)?(?:18|19)\./.test(react)) {
    throw new Error("Only React 18/19 targets are supported. Check the project's actual stack first.");
  }
  const components = join(root, "src", "components");
  if (!(await exists(components))) throw new Error("Target must have a src/components directory.");

  const outputs = await Promise.all(FILENAMES.map(async (name) => {
    const source = new URL("../src/" + name, import.meta.url);
    const target = join(components, "portfolio-ui", name);
    const original = await readFile(source, "utf8");
    const adapter = name === "kitchen-ui.css" && brand !== "none"
      ? "\n/* Host brand token adapter. */\n" + (brand === "hsl" ? hsl : oklch)
      : "";
    return { name, target, content: original + adapter, exists: await exists(target) };
  }));

  console.log(JSON.stringify({
    target: root,
    react,
    brand,
    dryRun,
    files: outputs.map(({ name, target, exists }) => ({ name, target, exists })),
  }, null, 2));

  if (dryRun) return;
  if (outputs.some((file) => file.exists)) {
    throw new Error("The target already contains portfolio-ui files. No files were overwritten. Review differences manually.");
  }
  await mkdir(join(components, "portfolio-ui"), { recursive: true });
  for (const file of outputs) {
    await mkdir(dirname(file.target), { recursive: true });
    await writeFile(file.target, file.content, { flag: "wx" });
  }
  console.log("Installed source files. Wire up existing actions manually and run the target's tests.");
}

main().catch((error) => {
  console.error("Portfolio UI installer:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
