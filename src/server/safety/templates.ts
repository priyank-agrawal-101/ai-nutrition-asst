import "server-only";
import { createHash } from "node:crypto";
import { m1AnswerSchema } from "@/contracts/api";
import type { TemplateReason } from "./verdicts";
export const templateVersion = "m1-templates-v1";
export const templates = {
  calorie_target: {
    id: "TPL-01",
    kind: "refusal",
    content: {
      answer:
        "I can't recommend or calculate calorie targets. Please speak with a qualified dietitian or healthcare professional for individual advice.",
      claims: [],
    },
  },
  weight_target: {
    id: "TPL-02",
    kind: "refusal",
    content: {
      answer:
        "I can't recommend a weight target or what someone should weigh. Please speak with a qualified dietitian or healthcare professional for individual advice.",
      claims: [],
    },
  },
  medical_advice: {
    id: "TPL-03",
    kind: "refusal",
    content: {
      answer:
        "I can't provide medical advice or a personalised diet or supplement prescription. Please speak with a qualified healthcare professional or dietitian.",
      claims: [],
    },
  },
  mixed_request: {
    id: "TPL-04",
    kind: "refusal",
    content: {
      answer:
        "Part of this request asks for advice I can't provide, such as calorie or weight targets, medical advice, or unsafe instructions. Please speak with a qualified healthcare professional or dietitian about individual needs. You can ask a separate general food question.",
      claims: [],
    },
  },
  urgent_help: {
    id: "TPL-05",
    kind: "refusal",
    content: {
      answer:
        "Please seek urgent professional help now through your local emergency services. For suspected poisoning, contact local poison control or emergency services. I can't assess or treat this here; please don't wait for a chat response.",
      claims: [],
    },
  },
  harmful_body_change: {
    id: "TPL-06",
    kind: "refusal",
    content: {
      answer:
        "I can't help with harmful restriction, purging, or ways to hide these behaviours. You deserve support without judgement. Please speak with a qualified healthcare professional or dietitian experienced in eating concerns.",
      claims: [],
    },
  },
  sensitive_personalization: {
    id: "TPL-07",
    kind: "refusal",
    content: {
      answer:
        "I can't provide a personal diet, body-change target, or clinical advice for this situation. Please speak with a qualified healthcare professional or dietitian. If you're under 18, a trusted adult can help you seek support.",
      claims: [],
    },
  },
  unsafe_food_request: {
    id: "TPL-08",
    kind: "refusal",
    content: {
      answer:
        "I can't provide unsafe food instructions or confirm that an unknown item is safe to eat. Please seek advice from a qualified food-safety professional; contact poison control or a healthcare professional if exposure is a concern.",
      claims: [],
    },
  },
  ambiguous_intent: {
    id: "TPL-09",
    kind: "clarification",
    content: {
      answer:
        "Would you like general food or nutrition information, without personal targets or medical advice?",
      claims: [],
    },
  },
  unsupported_language: {
    id: "TPL-10",
    kind: "clarification",
    content: {
      answer: "Please ask your food or nutrition question in English.",
      claims: [],
    },
  },
  unrelated_topic: {
    id: "TPL-11",
    kind: "clarification",
    content: {
      answer:
        "I can answer general questions about food, nutrition, cooking, and food safety. Please ask a question in that scope.",
      claims: [],
    },
  },
} as const;
export const templateHash = createHash("sha256")
  .update(JSON.stringify(templates))
  .digest("hex");
for (const template of Object.values(templates))
  m1AnswerSchema.parse(template.content);
export function selectTemplate(reason: TemplateReason) {
  const template = templates[reason];
  return { ...template, content: m1AnswerSchema.parse(template.content) };
}
