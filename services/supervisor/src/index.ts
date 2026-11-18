/** Local supervisor scaffold — owns startup/health stubs for VS Code tasks. */

export type SupervisorCommand = "start" | "stop" | "doctor" | "diagnostics" | "test-local";

export type SupervisorResult = {
  ok: true;
  command: SupervisorCommand;
  message: string;
  productionActivated: false;
};

export function runSupervisor(command: SupervisorCommand): SupervisorResult {
  const messages: Record<SupervisorCommand, string> = {
    start: "Supervisor stub: local services not started (scaffold only).",
    stop: "Supervisor stub: local services not stopped (scaffold only).",
    doctor: "Supervisor stub: doctor checks not implemented (scaffold only).",
    diagnostics: "Supervisor stub: diagnostics not implemented (scaffold only).",
    "test-local": "Supervisor stub: local ops tests not implemented (scaffold only).",
  };
  return {
    ok: true,
    command,
    message: messages[command],
    productionActivated: false,
  };
}
