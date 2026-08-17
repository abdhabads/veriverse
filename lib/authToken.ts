import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  id: string;
};

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload;
  } catch {
    return null;
  }
}
