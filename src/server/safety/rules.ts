import "server-only";
import type { AnswerContent } from "@/contracts/api";
import type { TemplateReason } from "./verdicts";
export const policyVersion = "m1-policy-v1";
// Inspection only: never changes saved text, request identity, or model context.
export function inspect(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function direct(text: string): TemplateReason | null {
  const s = inspect(text);
  if (
    /\b(i|he|she|they|my (child|friend|baby))\s+(have |has )?(swallowed|drank|ingested)\b.{0,30}\b(cleaner|bleach|poison|detergent)\b|\b(i|he|she|they)\b.{0,30}\b(trouble breathing|severely unwell|lost consciousness)\b/.test(
      s,
    )
  )
    return "urgent_help";
  if (
    /\b(i|he|she|they|my (child|friend|baby))\b.{0,50}\b(can't breathe|cannot breathe|struggling to breathe|unconscious|swallowed (bleach|poison)|drank (bleach|poison)|want to die|kill myself)\b/.test(
      s,
    )
  )
    return "urgent_help";
  // Educational mentions are passed to contextual classification. Only actionable patterns refuse here.
  const calorie =
    /\b(calculate|recommend|give|set|work out|design|write|create)\b.{0,65}\b(calorie|caloric|energy)\b.{0,30}\b(target|budget|deficit|surplus|maintenance|intake|plan)\b|\bhow many (calories|kilocalories|kcal)\b.{0,55}\b(should|must|need to)\b.{0,30}\b(eat|consume|have)|\b(calculate|work out)\b.{0,40}\b(tdee|bmr)\b/.test(
      s,
    );
  const weight =
    /\b(what|how much)\b.{0,20}\b(should|must)\b.{0,35}\bweigh\b|\b(calculate|recommend|give|set|find)\b.{0,60}\b(ideal weight|weight target|target weight|ideal bmi|ideal-weight)\b/.test(
      s,
    );
  const harmful =
    /\b(how (do|can|should) i|help me|teach me|ways to)\b.{0,50}\b(purge|make myself (vomit|throw up)|hide.{0,20}(starving|not eating)|starve myself)\b/.test(
      s,
    );
  const medical =
    /\b(what|which|how much)\b.{0,35}\b(should|can|must) i\b.{0,35}\b(eat|take|stop taking)\b.{0,55}\b(diabetes|kidney disease|insulin|warfarin|medicine|medication)|\b(diet|meal plan|nutrition plan)\b.{0,25}\b(for|to treat|to manage)\b.{0,30}\b(my|his|her)\b.{0,25}\b(diabetes|kidney disease|cancer)|\b(interpret|diagnose)\b.{0,35}\b(my|these)\b.{0,25}\b(symptoms|lab|blood test)|\b(what|which)\b.{0,25}\b(dose|dosage)\b.{0,30}\b(should|can) i\b/.test(
      s,
    );
  const unsafe =
    /\b(can|is it safe|safe for me to)\b.{0,25}\b(eat|taste|consume)\b.{0,25}\b(unknown|unidentified|wild)\b.{0,15}\b(mushroom|berry|berries|plant)|\bhow (can|do) i\b.{0,35}\b(make.{0,15}poison|poison (someone|food))/.test(
      s,
    );
  const sensitive =
    /\b(i am|i'm)\s+(pregnant|breastfeeding|(?:[1-9]|1[0-7])(?: years old)?)\b/.test(
      s,
    ) &&
    /\b(my diet|diet for me|what should i eat|lose weight|weight target|calorie target|how many calories)\b/.test(
      s,
    );
  const found = [harmful, unsafe, sensitive, medical, calorie, weight].filter(
    Boolean,
  ).length;
  if (
    found &&
    /\b(and|also)\b.{0,35}\b(explain|what is|what are|how (to|do i) cook|tell me about)\b|\b(explain|what is|what are)\b.{0,70}\b(and|also)\b/.test(
      s,
    )
  )
    return "mixed_request";
  if (calorie && weight) return "mixed_request";
  if (harmful) return "harmful_body_change";
  if (unsafe) return "unsafe_food_request";
  if (sensitive) return "sensitive_personalization";
  if (medical) return "medical_advice";
  if (calorie) return "calorie_target";
  if (weight) return "weight_target";
  return null;
}
export function inputRule(
  question: string,
  previousQuestions: readonly string[],
): TemplateReason | null {
  const current = direct(question);
  if (current) return current;
  // Only explicit references reuse a known boundary. Independent food questions remain classifiable.
  if (
    /^(?:just |then |so )?(?:give me|calculate|tell me|what(?:'s| is)) (?:that|the same|the earlier|the previous) (?:number|target|calculation|dose)[.!? ]*$/.test(
      inspect(question),
    )
  ) {
    for (const prior of [...previousQuestions].reverse()) {
      const reason = direct(prior);
      if (reason && reason !== "urgent_help") return reason;
    }
  }
  return null;
}
export function outputRule(content: AnswerContent): boolean {
  return [content.answer, ...content.claims.map((c) => c.text)].some((text) => {
    const s = inspect(text);
    if (
      /\b(use|try|calculate|work out|set)\b.{0,60}\b(maintenance.calorie calculator|tdee calculator|bmr calculator|daily calorie target|ideal.weight formula)\b/.test(
        s,
      )
    )
      return true;
    return /\b(you|he|she|they) should (aim to )?(weigh|lose \d|gain \d)|\b(your|daily|recommended|maintenance) (calorie|energy|weight) (target|budget|intake|range)\b.{0,30}\d|\b(eat|consume|aim for|target|budget)\b.{0,25}\d[\d,.]*\s*(?:-\s*\d+\s*)?(calories|kcal)\b.{0,25}\b(day|daily)|\b(take|increase|decrease|stop taking)\b.{0,20}\d[\d.]*\s*(mg|mcg|iu)\b|\b(i can't|i cannot|i'm unable to)\b.{0,35}\b(medical advice|calorie targets|weight target|diet prescription)|\b(unknown|wild|unidentified)\b.{0,30}\b(mushroom|berries|plant)\b.{0,35}\b(safe to eat|edible)|\b(gsk_[a-z0-9]{15,}|sk-[a-z0-9]{20,})\b/.test(
      s,
    );
  });
}
