import { mkdirSync } from "node:fs";
import { createFileLocalStateStore } from "../packages/persistence/src/index.ts";
import { loadSupervisorConfig } from "../services/supervisor/src/config.ts";
import { runSupervisorCommand } from "../services/supervisor/src/lifecycle.ts";
import { createChildProcessSpawner } from "../services/supervisor/src/process-manager.ts";

async function main(): Promise<number> {
  const config = loadSupervisorConfig();
  if (config.hostPaths.stateDirOnSyncPath) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          command: "doctor",
          message:
            "Refusing doctor: state dir is under a consumer sync path (e.g. OneDrive). Set WORKSOCIAL_STATE_DIR to a local non-synced disk.",
          stateDir: config.stateDir,
          notes: config.hostPaths.notes,
          productionActivated: false,
        },
        null,
        2,
      ),
    );
    return 1;
  }
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
