import "server-only";
import { loadConfig } from "./config";
import { Database } from "./db/connection";
import { LocalScriptedProvider } from "./provider";
import { TurnService } from "./turn-service";
import { createHandler } from "./http";
import { maintenance } from "./maintenance";
import { emit } from "./telemetry";
export function bootstrap(env: NodeJS.ProcessEnv) {
  const config = loadConfig(env),
    database = new Database(config.databaseUrl),
    turns = new TurnService(database, config, new LocalScriptedProvider());
  return {
    database,
    turns,
    handler: createHandler(database, config, turns, emit),
    maintain: () => maintenance(database, turns, emit),
  };
}
