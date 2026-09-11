import { describe, it, expect } from "vitest";
import { resolveButtonState } from "@/components/ui/Button";

describe("resolveButtonState", () => {
  it("is enabled and not busy by default", () => {
    expect(resolveButtonState({})).toEqual({ disabled: false, ariaBusy: false });
  });

  it("disables the button while loading, and marks it busy", () => {
    expect(resolveButtonState({ loading: true })).toEqual({ disabled: true, ariaBusy: true });
  });

  it("disables the button when explicitly disabled, without marking it busy", () => {
    expect(resolveButtonState({ disabled: true })).toEqual({ disabled: true, ariaBusy: false });
  });

  it("stays disabled and busy when both disabled and loading are set", () => {
    expect(resolveButtonState({ disabled: true, loading: true })).toEqual({
      disabled: true,
      ariaBusy: true,
    });
  });
});
