import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
async function walk(path) {
  const results = [];
  for (const item of await readdir(path, { withFileTypes: true })) {
    const p = `${path}/${item.name}`;
    if (item.isDirectory()) results.push(...(await walk(p)));
    else if (p.endsWith(".md")) results.push(p);
  }
  return results;
}
let checked = 0;
for (const file of ["README.md", "AGENTS.md", ...(await walk("docs"))]) {
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1];
    if (/^(?:https?:|mailto:|#)/.test(raw)) continue;
    const target = decodeURIComponent(raw.split("#")[0].replace(/^<|>$/g, ""));
    if (!target) continue;
    await stat(resolve(dirname(file), target)).catch(() => {
      throw new Error(`Broken local link in ${file}: ${target}`);
    });
    checked++;
  }
}
console.info(`${checked} local Markdown link targets exist.`);
