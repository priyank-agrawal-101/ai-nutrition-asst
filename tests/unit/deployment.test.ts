import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../../src/server/config";
import {
  canonicalAddress,
  loadFrontendConfig,
  networkIdentity,
} from "../../src/server/deployment";
import { frontendProxy } from "../../src/server/frontend-proxy";
import { configEnv } from "../support/config";

const secret = Buffer.alloc(32, 3).toString("base64url");
const frontend = {
  APP_ENV: "production",
  APP_ROLE: "frontend",
  VERCEL: "1",
  VERCEL_ENV: "production",
  APP_ORIGIN: "https://nutrition.example.com",
  BACKEND_ORIGIN: "https://api.example.com",
  PROXY_SHARED_SECRET: secret,
};
const backend = () => ({
  ...configEnv(),
  APP_ENV: "production",
  APP_ROLE: "backend",
  APP_ORIGIN: frontend.APP_ORIGIN,
  PROVIDER_MODE: "groq",
  GROQ_API_KEY: "synthetic-unused",
  PROXY_SHARED_SECRET: secret,
});
function request(headers: Record<string, string> = {}, body = "{}") {
  return new Request(`${frontend.APP_ORIGIN}/api/v1/session`, {
    method: "POST",
    headers: {
      origin: frontend.APP_ORIGIN,
      "content-type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body,
  });
}
describe("Production deployment boundaries", () => {
  it("EC-OPS-10 enables only explicit production backend configuration", () => {
    const config = loadConfig(backend());
    expect(config.cookieName).toBe("__Host-nutrition_session");
    expect(config.diagnosticsEnabled).toBe(false);
    expect(loadConfig(configEnv()).cookieName).toBe("nutribite_local_session");
    for (const patch of [
      { APP_ROLE: "combined" },
      { APP_ROLE: "frontend" },
      { PROXY_SHARED_SECRET: undefined },
      { PROVIDER_MODE: "scripted" },
      { APP_ORIGIN: "http://nutrition.example.com" },
      { APP_ORIGIN: "https://nutrition.example.com/path" },
      { APP_ORIGIN: "https://user:pass@nutrition.example.com" },
      { PROXY_SHARED_SECRET: config.quotaKey },
      { GROQ_API_KEY: "" },
    ])
      expect(() => loadConfig({ ...backend(), ...patch })).toThrow();
    expect(() =>
      loadConfig({
        ...configEnv(),
        PROVIDER_MODE: "groq",
        GROQ_API_KEY: "synthetic",
      }),
    ).toThrow();
  });
  it("EC-OPS-04 rejects forged proxy identities and canonicalizes equivalent IPs", () => {
    const config = loadConfig(backend());
    expect(() =>
      networkIdentity(request({ "x-forwarded-for": "1.2.3.4" }), config),
    ).toThrow();
    expect(() =>
      networkIdentity(
        request({
          "x-nutribite-proxy-key": secret,
          "x-nutribite-client-ip": "1.2.3.4, 5.6.7.8",
        }),
        config,
      ),
    ).toThrow();
    expect(
      networkIdentity(
        request({
          "x-nutribite-proxy-key": secret,
          "x-nutribite-client-ip": "::ffff:203.0.113.10",
        }),
        config,
      ),
    ).toBe("203.0.113.10");
    expect(canonicalAddress("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1",
    );
    expect(() => canonicalAddress("fe80::1%eth0")).toThrow();
    expect(networkIdentity(request(), loadConfig(configEnv()))).toBe(
      "loopback",
    );
  });
  it("EC-SEC-10 keeps credentials off the frontend and disables production access from previews", () => {
    expect(loadFrontendConfig(frontend).backend).toBe(frontend.BACKEND_ORIGIN);
    for (const patch of [
      { VERCEL_ENV: "preview" },
      { VERCEL: "0" },
      { DATABASE_URL: "forbidden" },
      { GROQ_API_KEY: "forbidden" },
      { BACKEND_ORIGIN: "http://127.0.0.1:3000" },
    ])
      expect(() => loadFrontendConfig({ ...frontend, ...patch })).toThrow();
  });
  it("EC-OPS-04 forwards only trusted identity and preserves cookies, CSRF and retry headers", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 429,
        headers: {
          "content-type": "application/json",
          "set-cookie":
            "__Host-nutrition_session=test; Secure; HttpOnly; Path=/; SameSite=Lax",
          "retry-after": "17",
          location: "/api/v1/conversations/example",
          "x-nutribite-proxy-key": "must-not-leak",
        },
      }),
    );
    const response = await frontendProxy(
      request({
        "x-nutribite-proxy-key": "forged",
        "x-nutribite-client-ip": "1.1.1.1",
        "x-forwarded-for": "2.2.2.2",
        cookie: "session=value",
        "x-csrf-token": "token",
      }),
      frontend,
      transport,
    );
    expect(response.status).toBe(429);
    const [target, options] = transport.mock.calls[0]!;
    expect(target).toBe(`${frontend.BACKEND_ORIGIN}/api/v1/session`);
    const sent = new Headers(options?.headers);
    expect(sent.get("x-nutribite-proxy-key")).toBe(secret);
    expect(sent.get("x-nutribite-client-ip")).toBe("203.0.113.10");
    expect(sent.has("x-forwarded-for")).toBe(false);
    expect(sent.get("cookie")).toBe("session=value");
    expect(sent.get("x-csrf-token")).toBe("token");
    expect(response.headers.get("set-cookie")).toContain("Secure; HttpOnly");
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("location")).toBe(
      "/api/v1/conversations/example",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("x-nutribite-proxy-key")).toBe(false);
  });
  it("EC-INPUT-07 EC-SEC-06 rejects malformed JSON and foreign origins before dispatch", async () => {
    const transport = vi.fn<typeof fetch>();
    for (const req of [
      request({ origin: "https://evil.example.com" }),
      request({}, '{"a":1,"a":2}'),
      request({ "x-vercel-forwarded-for": "forged" }),
      request({}, '"' + "x".repeat(40000) + '"'),
    ]) {
      expect(
        (await frontendProxy(req, frontend, transport)).status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("EC-UI-06 treats upstream disconnect and redirects as unknown without replay", async () => {
    for (const transport of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error("private detail")),
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 307,
          headers: { location: "https://elsewhere.example" },
        }),
      ),
    ]) {
      const response = await frontendProxy(request(), frontend, transport);
      const body = await response.text();
      expect(body).toContain('"operation_state":"unknown"');
      expect(body).toContain('"action":"check_status"');
      expect(body).not.toContain("private detail");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});
