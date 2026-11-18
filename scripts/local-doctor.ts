import { mkdirSync } from "node:fs";
import { createFileLocalStateStore } from "../packages/persistence/src/index.ts";
import { loadSupervisorConfig } from "../services/supervisor/src/config.ts";
import { runSupervisorCommand } from "../services/supervisor/src/lifecycle.ts";
import { createChildProcessSpawner } from "../services/supervisor/src/process-manager.ts";

async function main(): Promise<number> {
  const config = loadSupervisorConfig();
  mkdirSync(config.stateDir, { recursive: true });
  const store = createFileLocalStateStore(config.stateDir);
  const result = await runSupervisorCommand(
    "doctor",
    store,
    config,
    createChildProcessSpawner(),
  );
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
