import "server-only";
import { z } from "zod";
import type { Provider, ProviderResult, Phase } from "../provider";
import { parseRawJson } from "../validation/json";
import { AppError } from "../errors";
import { groqSettings } from "./settings";
import { requestBody, safeIdentifier } from "./request";
import { providerRetryAfter } from "./rate-limit";
const tokenCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const usageSchema = z.object({
  prompt_tokens: tokenCount.optional(),
  completion_tokens: tokenCount.optional(),
  prompt_tokens_details: z
    .object({ cached_tokens: tokenCount.optional() })
    .nullish(),
  completion_tokens_details: z
    .object({ reasoning_tokens: tokenCount.optional() })
    .nullish(),
});
const envelopeSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
          tool_calls: z.array(z.unknown()).optional(),
        }),
      }),
    )
    .length(1),
  usage: usageSchema.nullish(),
});
export async function boundedResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new AppError("MODEL_SERVICE_FAILED");
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > 262144) throw new AppError("MODEL_SERVICE_FAILED");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class GroqProvider implements Provider {
  constructor(
    private readonly key: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async call(
    phase: Phase,
    context: string,
    candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    signal.throwIfAborted();
    const response = await this.transport(groqSettings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(phase, context, candidate)),
      signal,
      redirect: "error",
      cache: "no-store",
    });
    // Never parse or log provider error bodies (may echo prompts/candidates).
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429)
        throw new AppError(
          "PROVIDER_RATE_LIMITED",
          "accepted",
          "check_status",
          providerRetryAfter(response.headers.get("retry-after")),
        );
      throw new AppError("MODEL_SERVICE_FAILED");
    }
    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(
        parseRawJson(await boundedResponse(response, signal), 262144),
      );
    } catch {
      throw new AppError("MODEL_SERVICE_FAILED");
    }
    const choice = envelope.choices[0]!;
    const u = envelope.usage;
    const input = u?.prompt_tokens ?? null,
      output = u?.completion_tokens ?? null;
    const cached = u?.prompt_tokens_details?.cached_tokens ?? null,
      reasoning = u?.completion_tokens_details?.reasoning_tokens ?? null;
    const complete =
      choice.finish_reason === "stop" &&
      choice.message.content !== null &&
      !choice.message.refusal &&
      !choice.message.tool_calls?.length;
    return {
      raw: Buffer.from(choice.message.content ?? ""),
      complete: Boolean(complete),
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens:
        input !== null && cached !== null && cached <= input ? cached : null,
      reasoningTokens:
        output !== null && reasoning !== null && reasoning <= output
          ? reasoning
          : null,
      reportedModel: safeIdentifier.safeParse(envelope.model).success
        ? (envelope.model ?? null)
        : null,
      requestId: safeIdentifier.safeParse(envelope.id).success
        ? (envelope.id ?? null)
        : null,
      finishCode: choice.message.refusal
        ? "refusal"
        : ["stop", "length", "content_filter", "tool_calls"].includes(
              choice.finish_reason ?? "",
            )
          ? choice.finish_reason
          : "unknown",
    };
  }
}
