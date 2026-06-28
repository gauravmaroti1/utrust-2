import fs from "fs";
import path from "path";

/**
 * Photo storage on a persistent volume.
 * On Railway, mount a volume at /app/data and the photos live under
 * /app/data/uploads — only the URL path is stored in the database, keeping
 * Postgres lean. Falls back to a local ./data/uploads dir in development.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (fs.existsSync("/app/data") ? "/app/data/uploads" : path.join(process.cwd(), "data", "uploads"));

export function ensureUploadDir() {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

/**
 * Persist an array of { name, dataUrl } photos to disk.
 * Returns [{ name, url }] where url is like "/uploads/eval-123-0.jpg".
 * Items that are already URLs (no data: prefix) are passed through unchanged.
 */
export function saveDataUrls(
  photos: { name?: string; dataUrl?: string; url?: string }[] | undefined,
  prefix: string
): { name: string; url: string }[] {
  if (!Array.isArray(photos) || !photos.length) return [];
  ensureUploadDir();
  const out: { name: string; url: string }[] = [];
  photos.slice(0, 12).forEach((p, i) => {
    if (p.url && !p.dataUrl) { out.push({ name: p.name || `photo-${i}`, url: p.url }); return; }
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/.exec(p.dataUrl || "");
    if (!m) return;
    const ext = EXT[m[1]] || "jpg";
    const file = `${prefix}-${Date.now()}-${i}.${ext}`;
    try {
      fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(m[2], "base64"));
      out.push({ name: p.name || file, url: `/uploads/${file}` });
    } catch { /* skip on write error */ }
  });
  return out;
}

/** Resolve a stored "/uploads/x.jpg" url to its absolute disk path. */
export function resolveUploadPath(url: string): string | null {
  if (!url || !url.startsWith("/uploads/")) return null;
  const p = path.join(UPLOAD_DIR, url.replace("/uploads/", ""));
  return fs.existsSync(p) ? p : null;
}
