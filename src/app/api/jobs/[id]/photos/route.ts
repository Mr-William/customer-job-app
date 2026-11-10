import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jobPhotoExtension, jobPhotoValidationError, MAX_JOB_PHOTO_BYTES, type JobPhoto } from "@/lib/jobPhotos";

export const runtime = "nodejs";
const root = () => path.resolve(process.env.JOB_PHOTO_DIR || "./data/job-photos");
function presentPhoto(meta: Record<string, unknown>, jobId: number, id: string): JobPhoto {
  const description = typeof meta.description === "string" ? meta.description : String(meta.comment || "");
  return {
    id,
    title: typeof meta.title === "string" ? meta.title : "",
    description,
    comment: description,
    createdAt: String(meta.createdAt || ""),
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : undefined,
    url: `/api/jobs/${jobId}/photos/${id}`,
  };
}
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
    return presentPhoto(meta, id, name.slice(0, -5));
  }));
  return NextResponse.json({ photos: photos.sort((a,b) => b.createdAt.localeCompare(a.createdAt)) });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !await authorized(id)) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (error) {
    console.error(`Could not read photo upload for job ${id}`, error);
    return NextResponse.json({ error: "The photo upload could not be read. Please try again." }, { status: 400 });
  }

  const file = form.get("photo");
  const title = String(form.get("title") || "").trim().slice(0, 120);
  const description = String(form.get("description") ?? form.get("comment") ?? "").trim().slice(0, 500);
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  const validationError = jobPhotoValidationError(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: file.size > MAX_JOB_PHOTO_BYTES ? 413 : 400 });
  }
  const ext = jobPhotoExtension(file.type);
  if (!ext) return NextResponse.json({ error: "Supported formats: JPEG, PNG, WebP, HEIC, and GIF." }, { status: 400 });

  try {
    const dir = path.join(root(), String(id));
    await mkdir(dir, { recursive: true });
    const key = randomUUID();
    await writeFile(path.join(dir, key + ext), Buffer.from(await file.arrayBuffer()));
    const meta = { id: key, filename: key + ext, title, description, comment: description, createdAt: new Date().toISOString() };
    await writeFile(path.join(dir, key + ".json"), JSON.stringify(meta));
    return NextResponse.json({ photo: presentPhoto(meta, id, key) }, { status: 201 });
  } catch (error) {
    console.error(`Could not store photo upload for job ${id}`, error);
    return NextResponse.json({ error: "The server could not store the photo. Please try again or contact the administrator." }, { status: 500 });
  }
}
