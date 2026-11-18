import { mkdirSync } from "node:fs";
import { createFileLocalStateStore } from "@worksocial/persistence";
import { loadSupervisorConfig } from "./config.js";
import { runSupervisorCommand } from "./lifecycle.js";
import { createChildProcessSpawner } from "./process-manager.js";
import type { SupervisorCommand } from "./types.js";

const allowed: SupervisorCommand[] = [
  "start",
  "stop",
  "doctor",
  "diagnostics",
  "health",
  "test-local",
];

async function main(): Promise<number> {
  const arg = (process.argv[2] ?? "doctor") as SupervisorCommand;
  if (!allowed.includes(arg)) {
    console.error(`Unknown supervisor command: ${arg}`);
    console.error(`Allowed: ${allowed.join(", ")}`);
    return 1;
  }

  const config = loadSupervisorConfig();
  mkdirSync(config.stateDir, { recursive: true });
  const store = createFileLocalStateStore(config.stateDir);
  const spawner = createChildProcessSpawner();

  const result = await runSupervisorCommand(arg, store, config, spawner);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
