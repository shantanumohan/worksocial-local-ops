import { createServer, type Server } from "node:http";
import {
  bindTemporalMissionEnqueue,
  createApiRuntime,
  handleApiRequest,
  type ApiRuntime,
} from "./auth-http.js";

export type ApiServerOptions = {
  stateDir: string;
  port: number;
  consolePort: number;
  ownerPassword?: string;
  /** Skip Temporal client bind (tests / offline). Default: probe and bind. */
  skipTemporalBind?: boolean;
};

export async function startApiServer(options: ApiServerOptions): Promise<{
  server: Server;
  runtime: ApiRuntime;
  port: number;
  temporalEnqueueStatus: string;
}> {
  const runtime = createApiRuntime({
    stateDir: options.stateDir,
    apiPort: options.port,
    consolePort: options.consolePort,
    ...(options.ownerPassword !== undefined
      ? { ownerPassword: options.ownerPassword }
      : {}),
  });

  let temporalEnqueueStatus = "NOT_WIRED";
  if (!options.skipTemporalBind) {
    const bound = await bindTemporalMissionEnqueue(runtime);
    temporalEnqueueStatus = bound.temporalStatus;
  }

  const server = createServer((req, res) => {
    void handleApiRequest(runtime, req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "INTERNAL", message }));
    });
  });

  server.on("close", () => {
    if (runtime.temporalClient) {
      void runtime.temporalClient.close().catch(() => undefined);
      runtime.temporalClient = null;
    }
    if (runtime.evaluationPool) {
      void runtime.evaluationPool.end().catch(() => undefined);
      runtime.evaluationPool = null;
    }
    if (runtime.recoveryPool) {
      void runtime.recoveryPool.end().catch(() => undefined);
      runtime.recoveryPool = null;
    }
    if (runtime.credentialRotationPool) {
      void runtime.credentialRotationPool.end().catch(() => undefined);
      runtime.credentialRotationPool = null;
    }
  });

  return {
    server,
    runtime,
    port: options.port,
    temporalEnqueueStatus,
  };
}
