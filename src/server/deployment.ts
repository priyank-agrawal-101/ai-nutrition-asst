import "server-only";
import { z } from "zod";
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

export const proxyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(
    (value) => Buffer.from(value, "base64url").toString("base64url") === value,
  );
export const productionOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.origin === value &&
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
    url.hostname.includes(".") &&
    !url.hostname.endsWith(".localhost")
  );
}, "Use an exact public HTTPS origin without a path or credentials");

export function canonicalAddress(value: string | null): string {
  if (!value || !isIP(value) || value.includes("%"))
    throw new AppError("REQUEST_FORBIDDEN");
  if (isIP(value) === 4) return value;
  const normalized = new URL(`http://[${value}]`).hostname.slice(1, -1);
  // Collapse IPv4-mapped IPv6 to the same network identity as IPv4.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (mapped) {
    const high = parseInt(mapped[1]!, 16),
      low = parseInt(mapped[2]!, 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return normalized;
}

export function networkIdentity(
  request: Request,
  config: {
    environment: string;
    proxySecret: string | undefined;
  },
): string {
  if (config.environment !== "production") return "loopback";
  const supplied = request.headers.get("x-nutribite-proxy-key") ?? "";
  const expected = config.proxySecret;
  if (
    !expected ||
    !proxyKey.safeParse(supplied).success ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    throw new AppError("REQUEST_FORBIDDEN");
  return canonicalAddress(request.headers.get("x-nutribite-client-ip"));
}

export function loadFrontendConfig(
  env: Readonly<Record<string, string | undefined>>,
) {
  if (
    env.APP_ROLE !== "frontend" ||
    env.APP_ENV !== "production" ||
    env.VERCEL !== "1"
  )
    throw new Error("Frontend proxy requires the production Vercel role");
  if (env.VERCEL_ENV !== "production")
    throw new Error("Preview deployments cannot use the production backend");
  if (
    env.GROQ_API_KEY ||
    env.DATABASE_URL ||
    env.MIGRATION_DATABASE_URL ||
    env.CSRF_KEYS ||
    env.QUOTA_KEY
  )
    throw new Error(
      "Backend credentials must not be configured on the frontend",
    );
  return {
    origin: productionOrigin.parse(env.APP_ORIGIN),
    backend: productionOrigin.parse(env.BACKEND_ORIGIN),
    secret: proxyKey.parse(env.PROXY_SHARED_SECRET),
  };
}
