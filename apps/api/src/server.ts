import { createServer, type Server } from "node:http";
import { createApiRuntime, handleApiRequest, type ApiRuntime } from "./auth-http.js";

export type ApiServerOptions = {
  stateDir: string;
  port: number;
  consolePort: number;
  ownerPassword?: string;
};

export function startApiServer(options: ApiServerOptions): {
  server: Server;
  runtime: ApiRuntime;
  port: number;
} {
  const runtime = createApiRuntime({
    stateDir: options.stateDir,
    apiPort: options.port,
    consolePort: options.consolePort,
    ...(options.ownerPassword !== undefined
      ? { ownerPassword: options.ownerPassword }
      : {}),
  });

  const server = createServer((req, res) => {
    void handleApiRequest(runtime, req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "INTERNAL", message }));
    });
  });

  return { server, runtime, port: options.port };
}
