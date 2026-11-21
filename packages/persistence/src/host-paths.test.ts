import { describe, expect, it } from "vitest";
import {
  resolveHostPaths,
  resolveWorkSocialDataHome,
  resolveWorkSocialStateDir,
} from "./host-paths.js";

describe("host-paths", () => {
  it("uses XDG data home on Linux by default (outside the repo)", () => {
    const dataHome = resolveWorkSocialDataHome({
      platform: "linux",
      homeDir: "/home/owner",
      env: {},
    });
    expect(dataHome).toBe("/home/owner/.local/share/worksocial");
    const stateDir = resolveWorkSocialStateDir({
      platform: "linux",
      homeDir: "/home/owner",
      env: {},
    });
    expect(stateDir).toBe("/home/owner/.local/share/worksocial/local-state");
    expect(stateDir.includes("OneDrive")).toBe(false);
    expect(stateDir.includes(".worksocial")).toBe(false);
  });

  it("honors XDG_DATA_HOME and WORKSOCIAL_DATA_HOME", () => {
    expect(
      resolveWorkSocialDataHome({
        platform: "linux",
        homeDir: "/home/owner",
        env: { XDG_DATA_HOME: "/var/xdg" },
      }),
    ).toBe("/var/xdg/worksocial");
    expect(
      resolveWorkSocialDataHome({
        platform: "linux",
        homeDir: "/home/owner",
        env: { WORKSOCIAL_DATA_HOME: "/opt/ws-data" },
      }),
    ).toBe("/opt/ws-data");
  });

  it("uses LocalAppData on Windows (not OneDrive Documents)", () => {
    const paths = resolveHostPaths({
      platform: "win32",
      homeDir: "C:/Users/ShantanuMohan",
      env: {
        LOCALAPPDATA: "C:/Users/ShantanuMohan/AppData/Local",
      },
    });
    expect(paths.dataHome.replace(/\\/g, "/")).toBe(
      "C:/Users/ShantanuMohan/AppData/Local/WorkSocial",
    );
    expect(paths.stateDir.replace(/\\/g, "/")).toBe(
      "C:/Users/ShantanuMohan/AppData/Local/WorkSocial/local-state",
    );
    expect(paths.durableRoots.database.replace(/\\/g, "/")).toContain(
      "AppData/Local/WorkSocial/pgdata",
    );
    expect(paths.stateDirOnSyncPath).toBe(false);
    expect(paths.source).toBe("platform-default");
  });

  it("flags OneDrive WORKSOCIAL_STATE_DIR as sync-path risk", () => {
    const paths = resolveHostPaths({
      platform: "win32",
      homeDir: "C:/Users/ShantanuMohan",
      env: {
        WORKSOCIAL_STATE_DIR:
          "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/state",
      },
      syncPolicy: { resolveCanonical: false },
    });
    expect(paths.stateDirOnSyncPath).toBe(true);
    expect(paths.source).toBe("WORKSOCIAL_STATE_DIR");
    expect(paths.notes.some((n) => n.includes("WARNING"))).toBe(true);
  });

  it("ignores repoRoot for durable defaults", () => {
    const paths = resolveHostPaths({
      platform: "linux",
      homeDir: "/home/owner",
      env: {},
      repoRoot: "/repo/on/onedrive/AgenticArmyWS",
    });
    expect(paths.stateDir.startsWith("/home/owner/.local/share/worksocial")).toBe(true);
    expect(paths.stateDir.includes("AgenticArmyWS")).toBe(false);
  });
});
