import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalAddress, loadFrontendConfig } from "./deployment";
import { AppError, publicError, statusFor } from "./errors";
import { readJson } from "./validation/json";
import { emit, type Event, type EventSink } from "./telemetry";

// Vercel terminates browser requests. Railway alone owns sessions and model work.
export async function frontendProxy(
  request: Request,
  env: Readonly<Record<string, string | undefined>>,
  transport: typeof fetch = fetch,
  log: EventSink = emit,
): Promise<Response> {
  let dispatched = false;
  let stage: Extract<Event, { event: "frontend_proxy_failed" }>["stage"] =
    "configuration";
  try {
    const config = loadFrontendConfig(env);
    const url = new URL(request.url);
    // Next.js may construct request.url with an internal server origin. Vercel
    // preserves the visitor-facing domain in Host; accept only our exact host.
    stage = "host";
    if (request.headers.get("host") !== new URL(config.origin).host)
      throw new AppError("REQUEST_FORBIDDEN");
    stage = "path";
    if (!url.pathname.startsWith("/api/v1/"))
      throw new AppError("REQUEST_FORBIDDEN");
    stage = "method";
    if (!["GET", "POST"].includes(request.method))
      throw new AppError("METHOD_NOT_ALLOWED");
    stage = "origin";
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== config.origin
    )
      throw new AppError("REQUEST_FORBIDDEN");
    // Vercel overwrites this header. Never trust browser-supplied X-Forwarded-For.
    stage = "client_address";
    const address = canonicalAddress(
      request.headers.get("x-vercel-forwarded-for"),
    );
    let body: string | undefined;
    stage = "body";
    if (request.method === "POST") {
      // Consume once: cancelling one branch of a cloned oversized body can wait
      // forever for the unread branch. Validate raw syntax before serialization.
      body = JSON.stringify(await readJson(request));
    } else if (
      request.body ||
      Number(request.headers.get("content-length") ?? 0)
    ) {
      throw new AppError("INVALID_REQUEST");
    }
    const headers = new Headers({
      "x-nutribite-proxy-key": config.secret,
      "x-nutribite-client-ip": address,
    });
    for (const name of ["cookie", "origin", "x-csrf-token", "content-type"])
      if (request.headers.has(name))
        headers.set(name, request.headers.get(name)!);
    stage = "upstream";
    dispatched = true;
    const upstream = await transport(
      `${config.backend}${url.pathname}${url.search}`,
      {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(70000),
      },
    );
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      throw new Error("Backend redirects are not allowed");
    }
    const outgoing = new Headers({ "Cache-Control": "private, no-store" });
    for (const name of ["content-type", "x-request-id", "retry-after", "allow"])
      if (upstream.headers.has(name))
        outgoing.set(name, upstream.headers.get(name)!);
    const location = upstream.headers.get("location");
    if (location?.startsWith("/api/v1/")) outgoing.set("location", location);
    for (const cookie of upstream.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outgoing,
    });
  } catch (error) {
    const failure =
      error instanceof AppError
        ? error
        : new AppError(
            "SERVICE_NOT_READY",
            dispatched ? "unknown" : "not_accepted",
            dispatched ? "check_status" : "repeat_request",
          );
    const id = randomUUID();
    log({ event: "frontend_proxy_failed", request_id: id, stage });
    return Response.json(
      {
        error: publicError(failure),
        meta: {
          request_id: id,
          server_time: new Date().toISOString(),
        },
      },
      {
        status: statusFor(failure.code),
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": id,
          ...(failure.code === "METHOD_NOT_ALLOWED"
            ? { Allow: "GET, POST" }
            : {}),
        },
      },
    );
  }
}
