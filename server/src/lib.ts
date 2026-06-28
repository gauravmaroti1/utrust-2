import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { query } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";

export type Role = "SUPER_ADMIN" | "BRANCH_MANAGER" | "EVALUATOR" | "SALES_EXECUTIVE";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  branch_id: number | null;
}

export function hashPassword(pw: string) {
  return bcrypt.hashSync(pw, 10);
}
export function checkPassword(pw: string, hash: string) {
  return bcrypt.compareSync(pw, hash);
}
export function signToken(u: AuthUser) {
  return jwt.sign(u, JWT_SECRET, { expiresIn: "12h" });
}

// Express request augmented with the authenticated user
export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restrict a route to specific roles
export function authorize(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * Returns a SQL fragment + params that scope a query to the user's branch.
 * SUPER_ADMIN sees everything; others are limited to their own branch.
 * `col` is the branch column name in the target table (default branch_id).
 */
export function branchScope(user: AuthUser, col = "branch_id") {
  if (user.role === "SUPER_ADMIN" || user.branch_id == null) {
    return { clause: "TRUE", params: [] as any[] };
  }
  return { clause: `${col} = $BRANCH`, params: [user.branch_id] };
}

export async function audit(
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  detail: any = {}
) {
  try {
    await query(
      `INSERT INTO audit_log(user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)`,
      [userId, action, entity, entityId, JSON.stringify(detail)]
    );
  } catch (e) {
    // never let audit failures break a request
  }
}
