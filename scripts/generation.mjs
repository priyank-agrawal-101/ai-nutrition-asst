import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
const mode = process.argv[2];
if (!["off", "on"].includes(mode))
  throw new Error("Use npm run generation:off or npm run generation:on");
const path = resolve(".tmp/local/generation.disabled");
await mkdir(resolve(".tmp/local"), { recursive: true });
if (mode === "off")
  await writeFile(path, "Generation disabled by local operator.\n", {
    mode: 0o600,
  });
else {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
console.info(
  `Local generation ${mode}. Saved history remains readable. GENERATION_ENABLED=false still takes precedence.`,
);
