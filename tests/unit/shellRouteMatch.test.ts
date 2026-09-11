import { describe, it, expect } from "vitest";
import { isActiveRoute, isAnyRouteActive, isShellExcludedRoute } from "@/components/shell/routeMatch";

describe("isActiveRoute", () => {
  it("matches an exact route", () => {
    expect(isActiveRoute("/feed", "/feed")).toBe(true);
  });

  it("matches a subroute by prefix", () => {
    expect(isActiveRoute("/messages/abc123", "/messages")).toBe(true);
  });

  it("does not match an unrelated route", () => {
    expect(isActiveRoute("/notifications", "/messages")).toBe(false);
  });

  it("does not match a route that merely shares a prefix string", () => {
    expect(isActiveRoute("/messagesboard", "/messages")).toBe(false);
  });

  it("treats the root path as an exact-only match", () => {
    expect(isActiveRoute("/", "/")).toBe(true);
    expect(isActiveRoute("/feed", "/")).toBe(false);
  });
});

describe("isAnyRouteActive", () => {
  it("is active when any candidate path matches", () => {
    expect(isAnyRouteActive("/u/alice", ["/profile", "/u/alice"])).toBe(true);
  });

  it("correctly excludes another user's public profile from the viewer's own Profile item", () => {
    // The viewer is "alice"; someone else's profile must not light up
    // Profile as active.
    expect(isAnyRouteActive("/u/bob", ["/profile", "/u/alice"])).toBe(false);
  });
});

describe("isShellExcludedRoute", () => {
  it("excludes the marketing landing page", () => {
    expect(isShellExcludedRoute("/")).toBe(true);
  });

  it("excludes pre-auth and legal routes", () => {
    expect(isShellExcludedRoute("/login")).toBe(true);
    expect(isShellExcludedRoute("/register")).toBe(true);
    expect(isShellExcludedRoute("/privacy")).toBe(true);
    expect(isShellExcludedRoute("/onboarding")).toBe(true);
  });

  it("does not exclude ordinary application routes", () => {
    expect(isShellExcludedRoute("/feed")).toBe(false);
    expect(isShellExcludedRoute("/search")).toBe(false);
    expect(isShellExcludedRoute("/u/alice")).toBe(false);
  });
});
