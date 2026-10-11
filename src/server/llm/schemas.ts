import "server-only";
import { z } from "zod";
import { textSchema, m1AnswerSchema } from "@/contracts/api";
import { inputVerdict, outputVerdict } from "../safety/verdicts";
// The public source union is unchanged. Only this provider-facing M1 schema narrows it.
const nativeAnswer = z.strictObject({
  answer: textSchema(6000),
  claims: z
    .array(z.strictObject({ text: textSchema(600), source: z.null() }))
    .max(20),
});
export const validators = {
  input_safety: inputVerdict,
  answer: m1AnswerSchema,
  output_safety: outputVerdict,
};
export const nativeSchemas = {
  input_safety: z.toJSONSchema(inputVerdict),
  answer: z.toJSONSchema(nativeAnswer),
  output_safety: z.toJSONSchema(outputVerdict),
};
