import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InboxChannel,
  createConversation,
  defaultResponsePolicy,
} from "@worksocial/domain";
import { createFileInboxStore } from "./inbox-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("inbox store", () => {
  it("persists conversations and policy", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-inbox-store-"));
    dirs.push(dir);
    const store = createFileInboxStore(dir);
    const now = "2026-11-20T02:00:00.000Z";
    store.setResponsePolicy(defaultResponsePolicy(now));
    store.upsertConversation(
      createConversation({
        conversationId: "c1",
        providerThreadId: "thr-1",
        channel: InboxChannel.FIXTURE,
        customerDisplayName: "Alex",
        nowIso: now,
      }),
    );
    const again = createFileInboxStore(dir);
    expect(again.read().conversations).toHaveLength(1);
    expect(again.read().responsePolicy?.policyId).toBe(
      "pol-after-hours-default",
    );
    expect(again.status().liveInboxWiring).toBe("NOT_WIRED");
  });
});
