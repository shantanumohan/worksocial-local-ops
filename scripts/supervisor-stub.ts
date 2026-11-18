import { runSupervisor, type SupervisorCommand } from "../services/supervisor/src/index.ts";

const allowed: SupervisorCommand[] = [
  "start",
  "stop",
  "doctor",
  "diagnostics",
  "test-local",
];

const arg = (process.argv[2] ?? "doctor") as SupervisorCommand;
if (!allowed.includes(arg)) {
  console.error(`Unknown supervisor command: ${arg}`);
  process.exit(1);
}

const result = runSupervisor(arg);
console.log(JSON.stringify(result, null, 2));
