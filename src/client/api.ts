import { z } from "zod";
import {
  envelope,
  type ApiError,
  type ConversationView,
} from "@/contracts/api";
export class ClientError extends Error {
  constructor(public readonly detail: ApiError) {
    super(detail.message);
  }
}
export async function api<T extends z.ZodType>(
  path: string,
  schema: T,
  csrf?: string,
  body?: unknown,
): Promise<z.infer<T>> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(70000),
  });
  const value: unknown = await response.json();
  const parsed = envelope(schema).parse(value);
  if ("error" in parsed) throw new ClientError(parsed.error);
  if (!response.ok) throw new Error("Uncertain response");
  return schema.parse(z.object({ data: z.unknown() }).parse(parsed).data);
}
export function mergeConversation(
  current: ConversationView | null,
  incoming: ConversationView,
  activeId: string,
): ConversationView | null {
  if (
    incoming.id !== activeId ||
    (current?.id === incoming.id && current.revision > incoming.revision)
  )
    return current;
  return incoming;
}
