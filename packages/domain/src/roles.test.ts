import { describe, expect, it } from "vitest";
import {
  LocalRole,
  isLocalRole,
  roleMayPerform,
  roleMayViewAuthority,
} from "./roles.js";

describe("roles", () => {
  it("recognizes administrator and operator", () => {
    expect(isLocalRole("administrator")).toBe(true);
    expect(isLocalRole("operator")).toBe(true);
    expect(isLocalRole("agent")).toBe(false);
  });

  it("lets administrator toggle stop switch; operator cannot", () => {
    expect(
      roleMayPerform(LocalRole.ADMINISTRATOR, "toggle_stop_switch"),
    ).toBe(true);
    expect(roleMayPerform(LocalRole.OPERATOR, "toggle_stop_switch")).toBe(
      false,
    );
  });

  it("allows both roles to view authority", () => {
    expect(roleMayViewAuthority(LocalRole.ADMINISTRATOR)).toBe(true);
    expect(roleMayViewAuthority(LocalRole.OPERATOR)).toBe(true);
  });
});
