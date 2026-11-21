/**
 * Security gate suite — HTTP auth/CSRF/origin gates already in API.
 * Offline loopback only. External effects: NONE.
 */
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActionClass, OperatingMode } from "@worksocial/domain";
import { createDemoPublishGrant } from "@worksocial/persistence";
import { createApiRuntime, handleApiRequest } from "@worksocial/api";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function withServer(
  stateDir: string,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const runtime = createApiRuntime({
    stateDir,
    apiPort: 0,
    consolePort: 8788,
    ownerPassword: "test-password",
    evaluationStoreMode: "file",
  });
  const now = new Date().toISOString();
  const demo = createDemoPublishGrant(now);
  runtime.store.update((s) => ({
    ...s,
    ownerControls: {
      ...s.ownerControls,
      operatingMode: OperatingMode.OPERATE,
    },
    standingPolicies: [demo.policy],
    capabilityGrants: [demo.grant],
    updatedAt: now,
  }));

  const server = createServer((req, res) => {
    void handleApiRequest(runtime, req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("no address");
  }
  const base = `http://127.0.0.1:${addr.port}`;
  runtime.apiOrigin = base;
  runtime.consoleOrigin = base;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("security: HTTP auth gates", () => {
  it("returns 401 for authority state without a session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-sec-http-"));
    dirs.push(dir);
    await withServer(dir, async (base) => {
      const unauth = await fetch(`${base}/authority/state`);
      expect(unauth.status).toBe(401);
    });
  });

  it("rejects mutating writes without CSRF after login", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-sec-csrf-"));
    dirs.push(dir);
    await withServer(dir, async (base) => {
      const login = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
        },
        body: JSON.stringify({ username: "owner", password: "test-password" }),
      });
      expect(login.status).toBe(200);
      const cookie = (
        login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie")!
      ).split(";")[0]!;

      const noCsrf = await fetch(`${base}/authority/stop-switch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie,
        },
        body: JSON.stringify({ outboundStopped: true }),
      });
      expect(noCsrf.status).toBe(401);
      const body = (await noCsrf.json()) as { error: string };
      expect(body.error).toBe("CSRF_INVALID");
    });
  });

  it("denies gateway intent when outbound stop switch is on", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-sec-stop-"));
    dirs.push(dir);
    await withServer(dir, async (base) => {
      const login = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
        },
        body: JSON.stringify({ username: "owner", password: "test-password" }),
      });
      expect(login.status).toBe(200);
      const loginBody = (await login.json()) as { csrfToken: string };
      const cookie = (
        login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie")!
      ).split(";")[0]!;

      const stop = await fetch(`${base}/authority/stop-switch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({ outboundStopped: true }),
      });
      expect(stop.status).toBe(200);

      const intent = await fetch(`${base}/gateway/intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({
          operationId: "op-sec-stop",
          actionClass: ActionClass.ROUTINE_PUBLISH,
          channelId: "owned-site",
          targetAccountId: "acct-demo",
          operation: "publish_page",
          assetId: "page-home",
          contentRevision: "rev-demo",
          payload: { title: "x" },
        }),
      });
      expect(intent.status).toBe(403);
      const denied = (await intent.json()) as {
        decision: { code: string; outcome: string };
      };
      expect(denied.decision.code).toBe("OUTBOUND_STOPPED");
      expect(denied.decision.outcome).toBe("DENIED");
    });
  });
});
