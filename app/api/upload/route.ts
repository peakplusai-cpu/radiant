import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { uid } from "@/lib/id";
import { sameOrigin } from "@/lib/http";
import { supabaseAdmin, supabaseConfigured, UPLOAD_BUCKET } from "@/lib/supabase";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function sniff(buf: Buffer): keyof typeof TYPES | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.length > 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) return "gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "單張圖片請小於 4MB" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buffer);
  if (!ext) return NextResponse.json({ error: "僅支援 JPG、PNG、WebP、GIF" }, { status: 400 });
  const name = `${uid("img")}.${ext === "jpg" ? "jpg" : ext}`;
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { error } = await db.storage.from(UPLOAD_BUCKET).upload(name, buffer, {
      contentType: TYPES[ext],
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return NextResponse.json({ error: "上傳失敗" }, { status: 500 });
    return NextResponse.json({ url: db.storage.from(UPLOAD_BUCKET).getPublicUrl(name).data.publicUrl });
  }

  const dir = join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buffer);
  return NextResponse.json({ url: `/media/${name}` });
}
