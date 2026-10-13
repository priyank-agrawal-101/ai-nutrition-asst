import { expect, it } from "vitest";
import {
  evaluationFixtures,
  hash,
  remainingExtensions,
} from "../../scripts/evaluation-fixtures";
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
it("continues only unobserved extensions without replacing adverse outcomes", async () => {
  const fixture = await evaluationFixtures();
  const previous = fixture.groups
    .filter((g) => g.suite !== "policy_extensions")
    .concat(
      fixture.groups.filter((g) => g.suite === "policy_extensions").slice(0, 5),
    )
    .flatMap((g) =>
      g.turns.map((t, index) => ({
        suite: g.suite,
        id: g.id,
        index,
        question: t.question,
      })),
    );
  expect(remainingExtensions(fixture, previous)).toHaveLength(24);
  expect(() =>
    remainingExtensions(fixture, [...previous, previous[0]!]),
  ).toThrow("Duplicate");
  expect(() =>
    remainingExtensions(fixture, [
      { ...previous[0]!, question: "Changed input" },
    ]),
  ).toThrow("differs");
  const sequence = {
    suite: "policy_extensions",
    id: "sequence",
    turns: [fixture.groups[0]!.turns[0]!, fixture.groups[0]!.turns[0]!],
  };
  expect(() =>
    remainingExtensions({ groups: [sequence] }, [
      {
        suite: sequence.suite,
        id: sequence.id,
        index: 0,
        question: sequence.turns[0]!.question,
      },
    ]),
  ).toThrow("Partially");
});
