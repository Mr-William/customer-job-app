import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
 const { id, photoId } = await params;
 if (!/^[\w-]+$/.test(photoId) || !await getSession() || !(await db.select({id:jobs.id}).from(jobs).where(eq(jobs.id,Number(id))).limit(1))[0]) return new NextResponse("Not found",{status:404});
 try { const root=path.resolve(process.env.JOB_PHOTO_DIR||"./data/job-photos"); const dir=path.join(root,id); const meta=JSON.parse(await readFile(path.join(dir,photoId+".json"),"utf8")); const bytes=await readFile(path.join(dir,meta.filename)); const ext=path.extname(meta.filename).toLowerCase(); const types:Record<string,string>={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",".heic":"image/heic",".heif":"image/heif",".gif":"image/gif"}; return new NextResponse(bytes,{headers:{"Content-Type":types[ext]||"application/octet-stream","Cache-Control":"private, max-age=3600","X-Content-Type-Options":"nosniff"}}); } catch { return new NextResponse("Not found",{status:404}); }
}
