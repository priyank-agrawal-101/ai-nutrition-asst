import "server-only";
import { visit, parse, type ParseError } from "jsonc-parser";
import { scalar, LIMITS } from "@/contracts/api";
import { AppError } from "../errors";
export function parseRawJson(
  bytes: Uint8Array,
  max: number = LIMITS.request_body_max_bytes,
): unknown {
  if (bytes.byteLength > max) throw new AppError("BODY_TOO_LARGE");
  let input: string;
  try {
    input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("INVALID_REQUEST");
  }
  const stack: Set<string>[] = [];
  let invalid = false;
  visit(
    input,
    {
      onObjectBegin: () => {
        stack.push(new Set());
      },
      onObjectProperty: (key) => {
        const keys = stack.at(-1);
        if (!keys || keys.has(key) || !scalar(key)) invalid = true;
        keys?.add(key);
      },
      onObjectEnd: () => {
        stack.pop();
      },
      onLiteralValue: (value: unknown) => {
        if (typeof value === "string" && !scalar(value)) invalid = true;
        if (typeof value === "number" && !Number.isFinite(value))
          invalid = true;
      },
      onError: () => {
        invalid = true;
      },
    },
    { disallowComments: true, allowTrailingComma: false },
  );
  const errors: ParseError[] = [];
  const value: unknown = parse(input, errors, {
    disallowComments: true,
    allowTrailingComma: false,
  });
  if (invalid || errors.length) throw new AppError("INVALID_REQUEST");
  return value;
}
export async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    ) ||
    request.headers.has("content-encoding")
  )
    throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > LIMITS.request_body_max_bytes)
  )
    throw new AppError("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.request_body_max_bytes) {
        await reader.cancel();
        throw new AppError("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseRawJson(Buffer.concat(chunks, size));
}
