import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActionClass, LocalRole, OperatingMode } from "@worksocial/domain";
import {
  createDemoPublishGrant,
  hashPassword,
} from "@worksocial/persistence";
import {
  createFixtureSeoPilotMapping,
  proveFixtureSeoWritePath,
  SEO_PILOT_WRITE_PATH_ID,
} from "@worksocial/seo";
import { createApiRuntime, handleApiRequest } from "./auth-http.js";

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
  });
  // Seed an operate-mode grant for authorized path tests.
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
  runtime.apiOrigin = `http://127.0.0.1:${addr.port}`;
  runtime.consoleOrigin = `http://127.0.0.1:${addr.port}`;
  try {
    await run(runtime.apiOrigin);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("api identity HTTP", () => {
  it("requires login for authority state and enforces stop switch on writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-api-"));
    dirs.push(dir);

    await withServer(dir, async (base) => {
      const unauth = await fetch(`${base}/authority/state`);
      expect(unauth.status).toBe(401);

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
      const cookie = login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie");
      expect(cookie).toBeTruthy();

      const stop = await fetch(`${base}/authority/stop-switch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookie!.split(";")[0]!,
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
          cookie: cookie!.split(";")[0]!,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({
          operationId: "op-stop",
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

  it("requires fixture ownership + read evidence before a mapped pilot write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-api-map-"));
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
      const cookieHeader = (
        login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie")!
      ).split(";")[0]!;

      const seed = await fetch(`${base}/mapping/seed-fixture-pilot`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: "{}",
      });
      expect(seed.status).toBe(200);
      const seeded = (await seed.json()) as { writePathId: string };

      const before = await fetch(`${base}/gateway/intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({
          operationId: "op-map-before",
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: "owned-site",
          targetAccountId: "acct-demo",
          operation: "submit_form_canary",
          assetId: "page-contact",
          contentRevision: null,
          writePathId: seeded.writePathId,
          payload: { email: "canary@example.com" },
        }),
      });
      expect(before.status).toBe(403);
      const beforeBody = (await before.json()) as {
        decision: { code: string };
      };
      expect(beforeBody.decision.code).toBe("OWNERSHIP_UNPROVEN");

      const prove = await fetch(`${base}/mapping/prove-fixture-pilot`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({ writePathId: seeded.writePathId }),
      });
      expect(prove.status).toBe(200);

      const mapping = await fetch(`${base}/mapping/state`, {
        headers: { origin: base, cookie: cookieHeader },
      });
      expect(mapping.status).toBe(200);
      const mappingBody = (await mapping.json()) as {
        mapping: {
          bindings: Array<{ ownershipProven: boolean }>;
          readEvidence: unknown[];
        };
        learningHook: { note: string };
      };
      expect(mappingBody.mapping.bindings.some((b) => b.ownershipProven)).toBe(
        true,
      );
      expect(mappingBody.mapping.readEvidence.length).toBeGreaterThan(0);
      expect(mappingBody.learningHook.note).toMatch(/learning-worker/i);

      // Still denied: demo grant is publish_page, not submit_form_canary — proves
      // ownership/evidence cleared and grant check is reached.
      const after = await fetch(`${base}/gateway/intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({
          operationId: "op-map-after",
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: "owned-site",
          targetAccountId: "acct-demo",
          operation: "submit_form_canary",
          assetId: "page-contact",
          contentRevision: null,
          writePathId: seeded.writePathId,
          payload: { email: "canary@example.com" },
        }),
      });
      expect(after.status).toBe(403);
      const afterBody = (await after.json()) as { decision: { code: string } };
      expect(afterBody.decision.code).toBe("GRANT_MISSING");
    });
  });

  it("binds gateway actorRole from session so operators cannot use admin policy (F05)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-api-actor-"));
    dirs.push(dir);

    const runtime = createApiRuntime({
      stateDir: dir,
      apiPort: 0,
      consolePort: 8788,
      ownerPassword: "test-password",
    });
    const now = new Date().toISOString();
    const demo = createDemoPublishGrant(now);
    const seeded = createFixtureSeoPilotMapping(now);
    const proven = proveFixtureSeoWritePath(seeded.state, now);
    runtime.mappingStore.write(proven);
    runtime.store.update((s) => ({
      ...s,
      ownerControls: {
        ...s.ownerControls,
        operatingMode: OperatingMode.OPERATE,
      },
      standingPolicies: [demo.policy],
      capabilityGrants: [demo.grant],
      users: [
        ...s.users,
        {
          userId: "user-operator",
          username: "operator",
          role: LocalRole.OPERATOR,
          passwordVerifier: hashPassword("operator-password"),
          createdAtIso: now,
          disabled: false,
        },
      ],
      updatedAt: now,
    }));

    const server = createServer((req, res) => {
      void handleApiRequest(runtime, req, res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no address");
    }
    const base = `http://127.0.0.1:${addr.port}`;
    runtime.apiOrigin = base;
    runtime.consoleOrigin = base;

    try {
      const login = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
        },
        body: JSON.stringify({
          username: "operator",
          password: "operator-password",
        }),
      });
      expect(login.status).toBe(200);
      const loginBody = (await login.json()) as {
        csrfToken: string;
        role: string;
      };
      expect(loginBody.role).toBe(LocalRole.OPERATOR);
      const cookieHeader = (
        login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie")!
      ).split(";")[0]!;

      const intent = await fetch(`${base}/gateway/intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          cookie: cookieHeader,
          "x-csrf-token": loginBody.csrfToken,
        },
        body: JSON.stringify({
          operationId: "op-operator-escalation",
          actionClass: ActionClass.ROUTINE_PUBLISH,
          channelId: "owned-site",
          targetAccountId: "acct-demo",
          operation: "publish_page",
          assetId: "page-home",
          contentRevision: "rev-demo",
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          // Spoofed client claim must be ignored — session is operator.
          actorRole: LocalRole.ADMINISTRATOR,
          payload: { title: "Home" },
        }),
      });
      expect(intent.status).toBe(403);
      const denied = (await intent.json()) as {
        decision: { code: string; outcome: string };
      };
      expect(denied.decision.code).toBe("GRANT_MISSING");
      expect(denied.decision.outcome).toBe("DENIED");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
