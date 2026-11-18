import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalRole, OperatingMode } from "@worksocial/domain";
import {
  createFileAuthorityStore,
  ensureBootstrapOwner,
  hashPassword,
  verifyPassword,
} from "./authority-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("authority-store", () => {
  it("hashes and verifies passwords", () => {
    const verifier = hashPassword("local-owner-change-me");
    expect(verifyPassword("local-owner-change-me", verifier)).toBe(true);
    expect(verifyPassword("wrong", verifier)).toBe(false);
  });

  it("bootstraps a local administrator once", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-auth-"));
    dirs.push(dir);
    const store = createFileAuthorityStore(dir);
    const first = ensureBootstrapOwner(store, {
      username: "owner",
      password: "secret",
      nowIso: "2026-11-18T00:00:00.000Z",
    });
    const second = ensureBootstrapOwner(store, {
      username: "owner",
      password: "other",
    });
    expect(first.userId).toBe(second.userId);
    expect(first.role).toBe(LocalRole.ADMINISTRATOR);
    expect(store.read().users).toHaveLength(1);
    expect(store.read().ownerControls.operatingMode).toBe(OperatingMode.OBSERVE);
    expect(store.read().providerStatuses.every((p) => !p.connected)).toBe(true);
  });

  it("persists stop-switch updates", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-auth-"));
    dirs.push(dir);
    const store = createFileAuthorityStore(dir);
    store.update((state) => ({
      ...state,
      ownerControls: {
        ...state.ownerControls,
        outboundStopped: true,
        updatedAtIso: "2026-11-18T01:00:00.000Z",
        updatedByUserId: "user-1",
      },
      updatedAt: "2026-11-18T01:00:00.000Z",
    }));
    expect(store.read().ownerControls.outboundStopped).toBe(true);
  });
});
