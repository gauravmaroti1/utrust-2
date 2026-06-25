import { Router } from "express";
import { query, one } from "../db.js";
import {
  authenticate, authorize, checkPassword, hashPassword,
  signToken, audit, type AuthedRequest,
} from "../lib.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  const u = await one(
    `SELECT u.*, b.code AS branch_code, b.name AS branch_name
     FROM users u LEFT JOIN branches b ON b.id=u.branch_id
     WHERE lower(u.email)=lower($1) AND u.active=TRUE`,
    [email]
  );
  if (!u || !checkPassword(password, u.password_hash))
    return res.status(401).json({ error: "Invalid credentials" });
  const authUser = {
    id: u.id, name: u.name, email: u.email, role: u.role, branch_id: u.branch_id,
  };
  await audit(u.id, "LOGIN", "user", u.id);
  res.json({
    token: signToken(authUser),
    user: { ...authUser, branch_code: u.branch_code, branch_name: u.branch_name },
  });
});

authRouter.get("/me", authenticate, async (req: AuthedRequest, res) => {
  const u = await one(
    `SELECT u.id,u.name,u.email,u.role,u.branch_id,b.code AS branch_code,b.name AS branch_name
     FROM users u LEFT JOIN branches b ON b.id=u.branch_id WHERE u.id=$1`,
    [req.user!.id]
  );
  res.json(u);
});

// ---------------- Users ----------------
export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get("/", async (req: AuthedRequest, res) => {
  // Super admin sees all; branch manager sees own branch
  const user = req.user!;
  let rows;
  if (user.role === "SUPER_ADMIN") {
    rows = await query(
      `SELECT u.id,u.name,u.email,u.role,u.branch_id,u.phone,u.active,b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id=u.branch_id ORDER BY u.id`
    );
  } else {
    rows = await query(
      `SELECT u.id,u.name,u.email,u.role,u.branch_id,u.phone,u.active,b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id=u.branch_id
       WHERE u.branch_id=$1 ORDER BY u.id`,
      [user.branch_id]
    );
  }
  res.json(rows);
});

usersRouter.post("/", authorize("SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const { name, email, password, role, branch_id, phone } = req.body || {};
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: "name, email, password, role required" });
  try {
    const u = await one(
      `INSERT INTO users(name,email,password_hash,role,branch_id,phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email,role,branch_id`,
      [name, email, hashPassword(password), role, branch_id || null, phone || null]
    );
    await audit(req.user!.id, "CREATE", "user", u.id, { email });
    res.status(201).json(u);
  } catch (e: any) {
    if (e.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Could not create user" });
  }
});

usersRouter.patch("/:id", authorize("SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const { name, role, branch_id, phone, active, password } = req.body || {};
  const u = await one(
    `UPDATE users SET
       name=COALESCE($2,name), role=COALESCE($3,role),
       branch_id=COALESCE($4,branch_id), phone=COALESCE($5,phone),
       active=COALESCE($6,active),
       password_hash=CASE WHEN $7::text IS NOT NULL THEN $7 ELSE password_hash END
     WHERE id=$1 RETURNING id,name,email,role,branch_id,active`,
    [req.params.id, name, role, branch_id, phone, active,
     password ? hashPassword(password) : null]
  );
  await audit(req.user!.id, "UPDATE", "user", Number(req.params.id));
  res.json(u);
});

// Branches list (used by dropdowns)
export const branchRouter = Router();
branchRouter.use(authenticate);
branchRouter.get("/", async (_req, res) => {
  res.json(await query(`SELECT id,code,name FROM branches ORDER BY id`));
});
