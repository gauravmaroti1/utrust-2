import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL not set. On Railway, add the PostgreSQL plugin. Locally, set it in server/.env"
  );
}

// Railway-managed Postgres requires SSL in production; local does not.
const useSSL = /railway|rlwy|proxy\.rlwy|amazonaws|render|supabase/i.test(
  connectionString || ""
);

export const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function query<T = any>(text: string, params: any[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}
