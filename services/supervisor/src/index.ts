/** Local supervisor — owns startup, host lease, doctor/health for VS Code tasks. */

export type { SupervisorCommand, SupervisorResult, DoctorReport, DoctorCheck } from "./types.js";
export { loadSupervisorConfig, defaultDurableRootSuggestions } from "./config.js";
export { runSupervisorCommand } from "./lifecycle.js";
export { runDoctor } from "./doctor.js";
export { collectHealth } from "./health.js";
export {
  createChildProcessSpawner,
  createInMemorySpawner,
  type ProcessSpawner,
} from "./process-manager.js";
