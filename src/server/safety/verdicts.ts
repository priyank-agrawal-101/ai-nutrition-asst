import "server-only";
import { z } from "zod";
export const refusalReasons = [
  "calorie_target",
  "weight_target",
  "medical_advice",
  "mixed_request",
  "urgent_help",
  "harmful_body_change",
  "sensitive_personalization",
  "unsafe_food_request",
] as const;
export const clarificationReasons = [
  "ambiguous_intent",
  "unsupported_language",
  "unrelated_topic",
] as const;
export const inputVerdict = z
  .strictObject({
    action: z.enum(["allow", "refuse", "clarify"]),
    reason: z.enum([
      "general_education",
      ...refusalReasons,
      ...clarificationReasons,
    ]),
  })
  .refine((v) =>
    v.action === "allow"
      ? v.reason === "general_education"
      : v.action === "refuse"
        ? refusalReasons.some((r) => r === v.reason)
        : clarificationReasons.some((r) => r === v.reason),
  );
export const outputVerdict = z
  .strictObject({
    action: z.enum(["allow", "reject"]),
    reason: z.enum([
      "within_scope",
      "policy_violation",
      "unsafe_food_guidance",
      "unsupported_safety_assurance",
      "sensitive_data_exposure",
    ]),
  })
  .refine((v) => (v.action === "allow") === (v.reason === "within_scope"));
export type InputVerdict = z.infer<typeof inputVerdict>;
export type TemplateReason = Exclude<
  InputVerdict["reason"],
  "general_education"
>;
