import "server-only";
export const groqSettings = Object.freeze({
  name: "groq",
  model: "openai/gpt-oss-120b",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  temperature: 0,
  reasoning_effort: "low",
  include_reasoning: false,
  seed: null,
  retries: 0,
  stream: false,
  contextWindow: 131072,
  outputTokens: { input_safety: 256, answer: 2000, output_safety: 256 },
  phaseMs: { input_safety: 10000, answer: 25000, output_safety: 10000 },
  requestsPerMinute: 30,
  requestsPerDay: 1000,
  tokensPerMinute: 8000,
  tokensPerDay: 200000,
});
