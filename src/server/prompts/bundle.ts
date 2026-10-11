import "server-only";
import { createHash } from "node:crypto";
import { text as common } from "./common-policy";
import { text as input } from "./input-safety";
import { text as answer } from "./answer";
import { text as output } from "./output-safety";
export const promptVersion = "m1-prompts-v2";
export const prompts = Object.freeze({
  input_safety: common + "\n\n" + input,
  answer: common + "\n\n" + answer,
  output_safety: common + "\n\n" + output,
});
export const promptHashes = Object.freeze(
  Object.fromEntries(
    Object.entries(prompts).map(([phase, text]) => [
      phase,
      createHash("sha256").update(text, "utf8").digest("hex"),
    ]),
  ),
);
