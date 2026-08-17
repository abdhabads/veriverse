import { describe, it, expect } from "vitest";
import {
  cleanString,
  cleanOptionalString,
  isValidEmail,
  isStrongEnoughPassword,
} from "@/lib/validation";

describe("validation helpers", () => {
  it("cleans valid strings", () => {
    expect(cleanString("  hello  ", { maxLength: 10 })).toBe("hello");
  });

  it("rejects empty required strings", () => {
    expect(cleanString("   ")).toBeNull();
  });

  it("rejects strings over max length", () => {
    expect(cleanString("123456", { maxLength: 5 })).toBeNull();
  });

  it("cleans optional strings safely", () => {
    expect(cleanOptionalString("  abc  ", { maxLength: 10 })).toBe("abc");
    expect(cleanOptionalString(null as any, { maxLength: 10 })).toBe("");
  });

  it("validates email", () => {
    expect(isValidEmail("user@test.com")).toBe(true);
    expect(isValidEmail("bad-email")).toBe(false);
  });

  it("checks password strength", () => {
    expect(isStrongEnoughPassword("Password123")).toBe(true);
    expect(isStrongEnoughPassword("12345")).toBe(false);
  });
});
