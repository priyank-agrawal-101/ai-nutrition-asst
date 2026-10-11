export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.APP_ENV
  ) {
    const { getApplication } = await import("./server/runtime");
    try {
      await getApplication();
    } catch {
      /* Invalid configuration remains unavailable at readiness and chat boundaries. */
    }
  }
}
