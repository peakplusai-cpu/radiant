import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { uid } from "@/lib/id";
import { supabaseAdmin, supabaseConfigured, UPLOAD_BUCKET } from "@/lib/supabase";

const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED.has(ext)) {
    return NextResponse.json({ error: "僅支援 JPG、PNG、WebP、GIF" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "單張圖片請小於 4MB" }, { status: 400 });
  }
  const name = `${uid("img")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { error } = await db.storage.from(UPLOAD_BUCKET).upload(name, buffer, {
      contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ url: db.storage.from(UPLOAD_BUCKET).getPublicUrl(name).data.publicUrl });
  }

  const dir = join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buffer);
  return NextResponse.json({ url: `/media/${name}` });
}
