import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9_]+\.[a-z0-9]+$/i.test(name)) return new NextResponse("Not found", { status: 404 });
  const type = TYPES[name.split(".").pop()!.toLowerCase()];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readFile(join(process.cwd(), "data", "uploads", name));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
