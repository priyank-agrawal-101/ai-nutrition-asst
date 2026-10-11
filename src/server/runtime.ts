import "server-only";
import { bootstrap } from "./bootstrap";
import { emit } from "./telemetry";
let application: ReturnType<typeof bootstrap> | undefined;
let startup: Promise<void> | undefined;
let maintenancePending = false;
export async function getApplication(): Promise<ReturnType<typeof bootstrap>> {
  if (!application) {
    application = bootstrap(process.env);
    const pass = async () => {
      if (maintenancePending || !application) return;
      maintenancePending = true;
      try {
        await application.maintain();
      } catch {
        emit({ event: "maintenance_failed", code: "STORAGE_UNAVAILABLE" });
      } finally {
        maintenancePending = false;
      }
    };
    startup = pass();
    const timer = setInterval(() => {
      void pass();
    }, 300000);
    timer.unref();
  }
  await startup;
  return application;
}
