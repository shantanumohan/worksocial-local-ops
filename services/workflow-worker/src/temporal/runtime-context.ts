/**
 * Activity-side durable mission runtime binding.
 * Worker process (or tests) call bindMissionRuntime once before Worker.run().
 */

import type { DurableMissionRuntime } from "../durable-mission.js";

let bound: DurableMissionRuntime | null = null;

export function bindMissionRuntime(runtime: DurableMissionRuntime): void {
  bound = runtime;
}

export function getMissionRuntime(): DurableMissionRuntime {
  if (!bound) {
    throw new Error(
      "Temporal mission activities: DurableMissionRuntime not bound. Call bindMissionRuntime before Worker.run().",
    );
  }
  return bound;
}

export function clearMissionRuntime(): void {
  bound = null;
}
