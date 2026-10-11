import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { buildContext } from "../../src/server/context";
import { conversationSchema } from "../../src/contracts/api";
import { mergeConversation } from "../../src/client/api";
it("EC-CTX-07 full context contains current question once with deterministic digest", () => {
  const c = conversationSchema.parse({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    revision: 0,
    turn_count: 0,
    active_turn_id: null,
    turns: [],
  });
  const result = buildContext(c, "Current question", 1);
  expect(JSON.parse(result.canonical) as unknown).toEqual({
    version: "v1",
    prior_turns: [],
    current_question: "Current question",
  });
  expect(
    result.digest.equals(buildContext(c, "Current question", 1).digest),
  ).toBe(true);
  expect(() => buildContext(c, "A".repeat(8001), 1)).toThrow();
});
it("EC-REQ-13 lower revisions and old active-chat responses cannot regress state", () => {
  const c = conversationSchema.parse({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    revision: 4,
    turn_count: 0,
    active_turn_id: null,
    turns: [],
  });
  expect(mergeConversation(c, { ...c, revision: 2 }, c.id)).toBe(c);
  expect(
    mergeConversation(c, { ...c, id: randomUUID(), revision: 9 }, c.id),
  ).toBe(c);
  expect(mergeConversation(c, { ...c, revision: 5 }, c.id)?.revision).toBe(5);
});
