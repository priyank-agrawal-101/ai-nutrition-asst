import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { parseRawJson, readJson } from "../../src/server/validation/json";
import {
  submitSchema,
  m1AnswerSchema,
  answerSchema,
  normalize,
  scalar,
} from "../../src/contracts/api";
import { loadConfig } from "../../src/server/config";
import { csrf, verifyCsrf } from "../../src/server/security";
import { configEnv } from "../support/config";
describe("Raw request contract", () => {
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":{"x":1,"x":2}}',
    '{"a":1,}',
    '{/*comment*/"a":1}',
    '{"a":"\\u0000"}',
    '{"a":"\\ud800"}',
    '{"a":"\\udc00"}',
    '{"a":1e999}',
    "",
  ])("EC-INPUT-07 rejects raw invalid data %s", (raw) => {
    expect(() => parseRawJson(Buffer.from(raw))).toThrow();
  });
  it("EC-INPUT-08 rejects invalid UTF-8 before JSON", () => {
    expect(() =>
      parseRawJson(
        Uint8Array.from([123, 34, 97, 34, 58, 34, 0xc0, 0xaf, 34, 125]),
      ),
    ).toThrow();
  });
  it("EC-INPUT-02 counts Unicode code points and preserves raw text", () => {
    const input = {
      client_submission_id: randomUUID(),
      question: "😀".repeat(2000),
    };
    expect(submitSchema.safeParse(input).success).toBe(true);
    expect(
      submitSchema.safeParse({ ...input, question: input.question + "a" })
        .success,
    ).toBe(false);
    expect(scalar("a😀b")).toBe(true);
    expect(normalize(" \r\n A\rB \r ")).toBe("A\nB");
  });
  it("EC-INPUT-01/06 rejects empty and client history", () => {
    expect(
      submitSchema.safeParse({
        client_submission_id: randomUUID(),
        question: " \n",
      }).success,
    ).toBe(false);
    expect(
      submitSchema.safeParse({
        client_submission_id: randomUUID(),
        question: "Food",
        history: [],
      }).success,
    ).toBe(false);
  });
  it("EC-INPUT-03 enforces body bound while streaming and cancels", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(9000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    await expect(readJson(request)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
    expect(cancelled).toBe(true);
  });
  it("EC-MODEL-01/05 strict nested sources preserve future union", () => {
    const cited = {
      answer: "Fixture",
      claims: [
        {
          text: "Fixture",
          source: {
            id: "s1",
            title: "Title",
            url: "https://example.com/source",
            locator: null,
          },
        },
      ],
    };
    expect(answerSchema.safeParse(cited).success).toBe(true);
    expect(m1AnswerSchema.safeParse(cited).success).toBe(false);
    expect(
      m1AnswerSchema.safeParse({
        answer: "Fixture",
        claims: [{ text: "Fixture" }],
      }).success,
    ).toBe(false);
    expect(
      m1AnswerSchema.safeParse({ answer: "Fixture", claims: [], extra: true })
        .success,
    ).toBe(false);
    expect(
      answerSchema.safeParse({
        ...cited,
        claims: [
          {
            text: "Fixture",
            source: {
              ...cited.claims[0]?.source,
              url: "https://u:p@example.com",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("Configuration and CSRF", () => {
  it("EC-SEC-07 forbids production scripted mode, missing and reused keys", () => {
    expect(() =>
      loadConfig({ ...configEnv(), APP_ENV: "production" }),
    ).toThrow();
    expect(() => loadConfig({})).toThrow();
    const env = configEnv();
    expect(() =>
      loadConfig({ ...env, CSRF_KEYS: JSON.stringify({ v1: env.QUOTA_KEY }) }),
    ).toThrow();
  });
  it("EC-SEC-06/07 validates canonical tokens and retains rotated session keys", () => {
    const config = loadConfig(configEnv());
    const s = {
      id: randomUUID(),
      csrf_nonce: Buffer.alloc(32, 3),
      csrf_key_version: "v1",
      expires_at: new Date().toISOString(),
    };
    const value = csrf(s, config);
    expect(value).toHaveLength(43);
    expect(() => verifyCsrf(value, s, config)).not.toThrow();
    expect(() => verifyCsrf(value + "=", s, config)).toThrow();
    expect(() =>
      verifyCsrf(value, { ...s, id: randomUUID() }, config),
    ).toThrow();
    expect(() => verifyCsrf(null, s, config)).toThrow();
    const rotated = loadConfig({
      ...configEnv(),
      CSRF_KEYS: JSON.stringify({
        ...config.csrfKeys,
        v2: Buffer.alloc(32, 8).toString("base64url"),
      }),
      CSRF_ACTIVE_KEY: "v2",
    });
    expect(csrf(s, rotated)).toBe(value);
  });
});
