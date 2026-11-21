import { afterEach, describe, expect, it } from "vitest";
import {
  createTemporalWorkerMissionStores,
  resolveTemporalWorkerStoreKind,
} from "./worker-stores.js";

const originalDb = process.env.DATABASE_URL;
const originalWsDb = process.env.WORKSOCIAL_DATABASE_URL;
const originalAllow = process.env.WORKSOCIAL_TEMPORAL_ALLOW_MEMORY;

afterEach(() => {
  if (originalDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDb;
  if (originalWsDb === undefined) delete process.env.WORKSOCIAL_DATABASE_URL;
  else process.env.WORKSOCIAL_DATABASE_URL = originalWsDb;
  if (originalAllow === undefined) delete process.env.WORKSOCIAL_TEMPORAL_ALLOW_MEMORY;
  else process.env.WORKSOCIAL_TEMPORAL_ALLOW_MEMORY = originalAllow;
});

describe("temporal worker store selection", () => {
  it("requires Postgres unless memory escape hatch is set", () => {
    delete process.env.DATABASE_URL;
    delete process.env.WORKSOCIAL_DATABASE_URL;
    delete process.env.WORKSOCIAL_TEMPORAL_ALLOW_MEMORY;
    const resolved = resolveTemporalWorkerStoreKind({});
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.detail).toMatch(/DATABASE_URL/);
    }
  });

  it("selects memory when WORKSOCIAL_TEMPORAL_ALLOW_MEMORY=1", () => {
    const resolved = resolveTemporalWorkerStoreKind({
      WORKSOCIAL_TEMPORAL_ALLOW_MEMORY: "1",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.kind).toBe("memory");
    }

    const stores = createTemporalWorkerMissionStores({
      env: { WORKSOCIAL_TEMPORAL_ALLOW_MEMORY: "1" },
    });
    expect(stores.storeKind).toBe("memory");
    expect(stores.pool).toBeNull();
    expect(stores.runtime.temporalLabel).toBe("TEMPORAL");
  });

  it("prefers postgres when connection string is provided", () => {
    const resolved = resolveTemporalWorkerStoreKind(
      { WORKSOCIAL_TEMPORAL_ALLOW_MEMORY: "1" },
      "postgres://user:pass@127.0.0.1:5432/worksocial",
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.kind).toBe("postgres");
    }
  });
});
