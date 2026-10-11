import { vi } from "vitest";
vi.stubGlobal("fetch", () => {
  throw new Error("Unexpected outbound request in unit test");
});
