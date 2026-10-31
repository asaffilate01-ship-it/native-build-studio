#!/usr/bin/env node
/**
 * Read-only GitHub portfolio design quality inventory.
 *
 * Requires GitHub CLI (gh) with read access. Does not alter repositories,
 * launch deployments, call Lovable or include credentials in reports.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
function option(name, fallback) {
  const equals = argv.find((arg) => arg.startsWith("--" + name + "="));
  const index = argv.indexOf("--" + name);
  return equals ? equals.slice(name.length + 3) : index >= 0 ? argv[index + 1] : fallback;
}
const owner = option("owner", "asaffilate01-ship-it");
const limit = Number(option("limit", "1000"));
const output = resolve(option("output", "docs/PORTFOLIO_DESIGN_STATUS.md"));
if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
  throw new Error("Expected valid --owner GitHub login and integer --limit from 1 to 1000");
}
function gh(...command) {
  return execFileSync("gh", command, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function jsonGh(...command) {
  return JSON.parse(gh(...command));
}
function isFile(root, name) {
  return root.some((item) => item.name === name && item.type === "file");
}
function status(entry) {
  if (!entry.accessible) return "Access/repo inspection needed";
  if (entry.archived) return "Archived";
  if (entry.fork) return "Fork";
  if (!entry.ui) return "No root UI folder (inspect)";
  return entry.design && entry.product && entry.agents && entry.auditWorkflow
    ? "Coverage present (verify)"
    : "Missing baseline coverage";
}
function cell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}
let repos;
try {
  repos = jsonGh("repo", "list", owner, "--limit", String(limit), "--json", "nameWithOwner,isArchived,isFork");
} catch (error) {
  console.error("Cannot list repositories. Verify gh auth status and repository read permissions.");
  throw error;
}
const entries = [];
for (const r of repos) {
  const entry = {
    name: r.nameWithOwner,
    archived: Boolean(r.isArchived),
    fork: Boolean(r.isFork),
    accessible: true,
    ui: false,
    design: false,
    product: false,
    agents: false,
    auditWorkflow: false,
  };
  try {
    const listing = jsonGh("api", "repos/" + entry.name + "/contents/");
    if (!Array.isArray(listing)) throw new Error("Unexpected repository root listing");
    entry.ui = listing.some((item) =>
      ["src", "app", "pages", "components", "frontend", "web"].includes(item.name) && item.type === "dir");
    entry.design = isFile(listing, "DESIGN.md");
    entry.product = isFile(listing, "PRODUCT.md");
    entry.agents = isFile(listing, "AGENTS.md");
    if (listing.some((item) => item.name === ".github" && item.type === "dir")) {
      try {
        gh("api", "repos/" + entry.name + "/contents/.github/workflows/design-quality.yml");
        entry.auditWorkflow = true;
      } catch {
        entry.auditWorkflow = false;
      }
    }
  } catch (error) {
    entry.accessible = false;
    entry.error = String(error?.message || error).slice(0, 180);
  }
  entries.push(entry);
}
entries.sort((a, b) => a.name.localeCompare(b.name));
const candidates = entries.filter((e) => e.accessible && e.ui && !e.archived && !e.fork);
const covered = candidates.filter((e) => e.design && e.product && e.agents && e.auditWorkflow);
const date = new Date().toISOString();
const rows = entries.map((e) => {
  const yes = (b) => b ? "Yes" : "—";
  return "| [" + cell(e.name) + "](https://github.com/" + e.name + ") | " + status(e) +
    " | " + yes(e.design) + " | " + yes(e.product) + " | " +
    yes(e.agents) + " | " + yes(e.auditWorkflow) + " |";
});
const markdown = [
  "# Portfolio design quality inventory",
  "",
  "Generated: " + date + ". Account: \`" + owner + "\`. **" + entries.length +
    "** listed repositories, **" + candidates.length + "** non-archived UI candidates, **" +
    covered.length + "** with all four design-source files on the default branch.",
  "",
  "> Source-file presence only. This is NOT evidence of deployed UI changes, visual quality, accessible experience, CI success or even a distinct live product. Open pull requests do not count as merged coverage.",
  "",
  "| Repository | Status | DESIGN.md | PRODUCT.md | AGENTS.md | Audit workflow |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
  "## Implementation gate",
  "",
  "For each active product: review actual brand and user journeys; make a product-owned design brief; apply Taste Skill direction and Impeccable critique/audit/harden; change a real UI surface; inspect 360px/390px/768px/1440px layouts, keyboard focus, accessibility and error states; then run existing build/CI before PR review and merge.",
  "",
  "Keep audit jobs advisory until initial findings are understood. No Lovable credits are needed for this report.",
  "",
].join("\n");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, markdown, "utf8");
const jsonOutput = output.toLowerCase().endsWith(".md") ? output.slice(0, -3) + ".json" : output + ".json";
await writeFile(jsonOutput, JSON.stringify({
  generatedAt: date,
  owner,
  listedCount: entries.length,
  activeUiCount: candidates.length,
  coveredCount: covered.length,
  repositories: entries,
}, null, 2) + "\n", "utf8");
console.log("Read-only portfolio design inventory: " + entries.length + " listed, " +
  candidates.length + " active UI, " + covered.length + " with all design-source files.");
console.log("Markdown: " + output + "\nJSON: " + jsonOutput);
