import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type PhotoParams = { params: Promise<{ id: string; photoId: string }> };
const root = () => path.resolve(process.env.JOB_PHOTO_DIR || "./data/job-photos");

async function authorized(jobId: number) {
  if (!Number.isInteger(jobId) || !await getSession()) return false;
  return !!(await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
}

async function readMetadata(jobId: number, photoId: string) {
  const file = path.join(root(), String(jobId), photoId + ".json");
  return { file, meta: JSON.parse(await readFile(file, "utf8")) as Record<string, unknown> };
}

function presentPhoto(meta: Record<string, unknown>, jobId: number, photoId: string) {
  const description = typeof meta.description === "string" ? meta.description : String(meta.comment || "");
  return {
    ...meta,
    id: photoId,
    title: typeof meta.title === "string" ? meta.title : "",
    description,
    comment: description,
    url: `/api/jobs/${jobId}/photos/${photoId}`,
  };
}

async function locate(params: PhotoParams["params"]) {
  const { id, photoId } = await params;
  const jobId = Number(id);
  if (!/^[\w-]+$/.test(photoId) || !await authorized(jobId)) return null;
  return { jobId, photoId };
}

export async function GET(_req: NextRequest, { params }: PhotoParams) {
  const location = await locate(params);
  if (!location) return new NextResponse("Not found", { status: 404 });
  const { jobId, photoId } = location;

  try {
    const { meta } = await readMetadata(jobId, photoId);
    const filename = String(meta.filename || "");
    if (path.basename(filename) !== filename) return new NextResponse("Not found", { status: 404 });
    const bytes = await readFile(path.join(root(), String(jobId), filename));
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif", ".gif": "image/gif",
    };
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: PhotoParams) {
  const location = await locate(params);
  if (!location) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  const { jobId, photoId } = location;

  let details: { title?: unknown; description?: unknown };
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
    details = body;
  } catch {
    return NextResponse.json({ error: "Invalid photo details." }, { status: 400 });
  }
  if (typeof details.title !== "string" || typeof details.description !== "string") {
    return NextResponse.json({ error: "Title and description must be text." }, { status: 400 });
  }

  try {
    const { file, meta } = await readMetadata(jobId, photoId);
    const title = details.title.trim().slice(0, 120);
    const description = details.description.trim().slice(0, 500);
    const updated = { ...meta, title, description, comment: description, updatedAt: new Date().toISOString() };
    await writeFile(file, JSON.stringify(updated));
    return NextResponse.json({ photo: presentPhoto(updated, jobId, photoId) });
  } catch (error) {
    console.error(`Could not update photo ${photoId} for job ${jobId}`, error);
    return NextResponse.json({ error: "The server could not update the photo details. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: PhotoParams) {
  const location = await locate(params);
  if (!location) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  const { jobId, photoId } = location;

  try {
    const { file, meta } = await readMetadata(jobId, photoId);
    const filename = String(meta.filename || "");
    if (path.basename(filename) !== filename) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    // Remove the listing first. If the second operation fails, only an
    // inaccessible orphan remains rather than a gallery entry with no image.
    await unlink(file);
    await unlink(path.join(root(), String(jobId), filename));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`Could not delete photo ${photoId} for job ${jobId}`, error);
    return NextResponse.json({ error: "The server could not delete the photo. Please try again." }, { status: 500 });
  }
}
