import { spawnSync } from "node:child_process";
for (const [entry, args] of [
  [
    "prettier/bin/prettier.cjs",
    [
      "--check",
      "src",
      "tests",
      "scripts",
      "migrations",
      "*.json",
      "*.mjs",
      "*.ts",
      ".github/workflows/ci.yml",
    ],
  ],
  ["eslint/bin/eslint.js", ["src", "tests", "scripts"]],
  ["typescript/bin/tsc", ["--noEmit"]],
  ["vitest/vitest.mjs", ["run", "--project", "unit"]],
]) {
  const result = spawnSync(
    process.execPath,
    [`node_modules/${entry}`, ...args],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const script of ["scripts/coverage.mjs", "scripts/docs-check.mjs"]) {
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
