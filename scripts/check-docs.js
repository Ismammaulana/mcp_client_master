import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "coverage"]);
const requiredDocuments = [
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "docs/README.md",
  "docs/api.md",
  "docs/architecture.md",
  "docs/configuration.md",
  "docs/deployment.md",
  "docs/development.md",
  "docs/operations.md",
  "docs/security.md",
  "docs/testing.md",
];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : walk(fullPath);
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith(".md")
      ? [fullPath]
      : [];
  });
}

const failures = [];
for (const document of requiredDocuments) {
  if (!existsSync(resolve(root, document))) {
    failures.push(`Required document is missing: ${document}`);
  }
}

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of walk(root)) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }
    target = target.split("#", 1)[0];
    const resolvedTarget = resolve(dirname(file), target);
    if (!existsSync(resolvedTarget)) {
      failures.push(
        `Broken local link in ${file.slice(root.length + 1)}: ${match[1]}`,
      );
    } else if (!statSync(resolvedTarget).isFile()) {
      failures.push(
        `Local link is not a file in ${file.slice(root.length + 1)}: ${match[1]}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Documentation structure and local links are valid.\n");
}
