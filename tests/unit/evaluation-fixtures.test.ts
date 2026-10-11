import { expect, it } from "vitest";
import { evaluationFixtures, hash } from "../../scripts/evaluation-fixtures";
it("freezes the 39-turn baseline and all adopted extensions from their owning documents", async () => {
  const fixture = await evaluationFixtures();
  const baseline = fixture.groups.filter(
    (g) => g.suite !== "policy_extensions",
  );
  expect(baseline).toHaveLength(30);
  expect(baseline.flatMap((g) => g.turns)).toHaveLength(39);
  expect(
    fixture.groups.filter((g) => g.suite === "policy_extensions"),
  ).toHaveLength(29);
  expect(fixture.probes).toHaveLength(4);
  for (const group of fixture.groups)
    for (const turn of group.turns) {
      expect(turn.expected_reason).toBeTruthy();
      expect(turn.text_hash).toBe(hash(turn.question));
      expect(turn.question).not.toContain("\\u200B");
    }
  expect(
    baseline
      .filter((g) => g.suite === "consistency")
      .map((g) => g.turns[0]?.question),
  ).toEqual(Array(3).fill(fixture.core[0]?.question));
});
