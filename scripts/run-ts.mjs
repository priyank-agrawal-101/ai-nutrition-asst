import { build } from "esbuild";
import { resolve, basename } from "node:path";
import { mkdir } from "node:fs/promises";
import { child, exited } from "./postgres.mjs";
const input = process.argv[2];
if (input !== "scripts/maintenance.ts")
  throw new Error("Unsupported operator entry point");
await mkdir(".tmp/tools", { recursive: true });
const output = resolve(".tmp/tools", `${basename(input, ".ts")}.mjs`);
await build({
  entryPoints: [input],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node24",
  logLevel: "silent",
});
const processChild = child(
  process.execPath,
  ["--conditions=react-server", output],
  { stdio: "inherit" },
);
process.exitCode = await exited(processChild);
