import mongoose from "mongoose";

export function isValidObjectId(value: string | undefined | null): boolean {
  if (!value) return false;
  return mongoose.Types.ObjectId.isValid(value);
}

export function cleanString(
  value: unknown,
  options?: { maxLength?: number; allowEmpty?: boolean }
): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const allowEmpty = options?.allowEmpty ?? false;
  const maxLength = options?.maxLength;

  if (!allowEmpty && !trimmed) return null;
  if (maxLength && trimmed.length > maxLength) return null;

  return trimmed;
}

export function cleanOptionalString(
  value: unknown,
  options?: { maxLength?: number }
): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  const maxLength = options?.maxLength;

  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}

export function isValidUsername(username: string): boolean {
  // 3-30 chars, letters/numbers/underscore/dot/hyphen
  return /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
}

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
