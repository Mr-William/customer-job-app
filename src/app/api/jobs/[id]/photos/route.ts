import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const root = () => path.resolve(process.env.JOB_PHOTO_DIR || "./data/job-photos");
async function authorized(jobId: number) {
  if (!await getSession()) return false;
  return !!(await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
}
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !await authorized(id)) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  const dir = path.join(root(), String(id));
  let names: string[];
  try { names = await readdir(dir); } catch { names = []; }
  const photos = await Promise.all(names.filter(n => n.endsWith(".json")).map(async name => {
    const meta = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    return { ...meta, url: `/api/jobs/${id}/photos/${name.slice(0, -5)}` };
  }));
  return NextResponse.json({ photos: photos.sort((a,b) => b.createdAt.localeCompare(a.createdAt)) });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !await authorized(id)) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  const form = await req.formData();
  const file = form.get("photo");
  const comment = String(form.get("comment") || "").trim().slice(0, 500);
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Choose an image up to 15 MB." }, { status: 400 });
  const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "image/gif": ".gif" } as Record<string,string>)[file.type];
  if (!ext) return NextResponse.json({ error: "Supported formats: JPEG, PNG, WebP, HEIC, and GIF." }, { status: 400 });
  const dir = path.join(root(), String(id)); await mkdir(dir, { recursive: true });
  const key = randomUUID();
  await writeFile(path.join(dir, key + ext), Buffer.from(await file.arrayBuffer()));
  const meta = { id: key, filename: key + ext, comment, createdAt: new Date().toISOString() };
  await writeFile(path.join(dir, key + ".json"), JSON.stringify(meta));
  return NextResponse.json({ photo: { ...meta, url: `/api/jobs/${id}/photos/${key}` } }, { status: 201 });
}
