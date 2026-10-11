import { readFile, writeFile, readdir } from "node:fs/promises";
async function walk(path) {
  const items = await readdir(path, { withFileTypes: true });
  const paths = [];
  for (const item of items) {
    const name = `${path}/${item.name}`;
    if (item.isDirectory()) paths.push(...(await walk(name)));
    else if (/\.(test|spec)\.ts$/.test(name)) paths.push(name);
  }
  return paths.sort();
}
const catalogue = await readFile("docs/edge-cases.md", "utf8"),
  ids = [
    ...new Set([...catalogue.matchAll(/`(EC-[A-Z]+-\d+)`/g)].map((m) => m[1])),
  ].sort();
const locations = new Map(ids.map((id) => [id, []]));
for (const file of await walk("tests")) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(/EC-([A-Z]+)-(\d+(?:\/\d+)*)/g)) {
    for (const number of match[2].split("/")) {
      const id = `EC-${match[1]}-${number}`;
      if (!locations.has(id))
        throw new Error(`Unknown test case ${id} in ${file}`);
      if (!locations.get(id).includes(file)) locations.get(id).push(file);
    }
  }
}
const manifest = {
  note: "Locations identify assertions for selected variants, not a pass for every variant of a catalogue case. Actual run results live in docs/testing.md.",
  cases: ids.map((id) => ({
    id,
    tests: locations.get(id),
    status: locations.get(id).length
      ? "case-linked; inspect covered variants"
      : ["EC-DATA-08", "EC-DATA-09"].includes(id)
        ? "deferred FB-001"
        : id.startsWith("EC-RAG-")
          ? "future M2"
          : "pending broader M1 verification in phases 2-3",
  })),
};
const expected = JSON.stringify(manifest, null, 2) + "\n";
if (process.argv.includes("--write"))
  await writeFile("tests/coverage-map.json", expected);
else if (
  JSON.stringify(
    JSON.parse(await readFile("tests/coverage-map.json", "utf8")),
  ) !== JSON.stringify(manifest)
)
  throw new Error(
    "Coverage map is stale; run node scripts/coverage.mjs --write",
  );
console.info(
  `${ids.length} catalogue cases mapped; unexecuted variants remain explicit.`,
);
