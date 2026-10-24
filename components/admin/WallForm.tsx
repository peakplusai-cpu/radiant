"use client";

import { useActionState, useRef, useState } from "react";
import { saveWall } from "@/app/actions/admin";
import type { Product, WallPhoto } from "@/lib/types";

type Draft = { key: string; id: string; src: string; productId: string };

let n = 0;
const nextKey = () => `w${++n}`;

function toDraft(photos: WallPhoto[]): Draft[] {
  return photos.map((p) => ({ key: nextKey(), id: p.id, src: p.src, productId: p.productId }));
}

export function WallForm({ photos, products }: { photos: WallPhoto[]; products: Product[] }) {
  const [message, action, pending] = useActionState(saveWall, "");
  const [items, setItems] = useState<Draft[]>(() => toDraft(photos));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pickId, setPickId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const listed = products.filter((p) => p.photos[0]);

  async function shrink(file: File): Promise<File> {
    if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 1_500_000) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch {
      return file;
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    const added: Draft[] = [];
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", await shrink(file));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) added.push({ key: nextKey(), id: "", src: json.url, productId: "" });
      else setUploadError(json.error ?? "上傳失敗");
    }
    setItems((list) => [...list, ...added].slice(0, 24));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function addFromProduct() {
    const product = products.find((p) => p.id === pickId);
    if (!product?.photos[0]) return;
    setItems((list) => {
      if (list.length >= 24) return list;
      return [...list, { key: nextKey(), id: "", src: product.photos[0], productId: product.id }];
    });
    setPickId("");
  }

  function move(i: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <form action={action}>
      <input
        type="hidden"
        name="photos"
        value={JSON.stringify(items.map(({ id, src, productId }) => ({ id, src, productId })))}
      />
      <section className="panel">
        <h2>
          首頁動態牆
          <small>上傳或從商品帶入照片，會在首頁頂部持續輪播。最多 24 張。可選擇點擊後前往的商品。</small>
        </h2>
        <div className="photos wall-admin">
          {items.map((item, i) => (
            <div key={item.key} className="wall-tile">
              <div className="photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt="" />
                <div className="photo-actions">
                  <button type="button" onClick={() => move(i, -1)} aria-label="前移" disabled={i === 0}>
                    ←
                  </button>
                  <button type="button" onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))}>
                    刪除
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="後移" disabled={i === items.length - 1}>
                    →
                  </button>
                </div>
              </div>
              <select
                className="select"
                value={item.productId}
                onChange={(e) =>
                  setItems((list) => list.map((x) => (x.key === item.key ? { ...x, productId: e.target.value } : x)))
                }
                aria-label="連結商品"
              >
                <option value="">不連結商品</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" className="add-slot" onClick={() => fileRef.current?.click()} disabled={uploading || items.length >= 24}>
            {uploading ? "上傳中…" : items.length >= 24 ? "已達上限" : "＋ 上傳照片"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
        {uploadError && (
          <div className="notice error" style={{ marginBottom: 20 }}>
            {uploadError}
          </div>
        )}
        {listed.length > 0 && (
          <div className="wall-from-product">
            <select className="select" value={pickId} onChange={(e) => setPickId(e.target.value)} aria-label="從商品帶入">
              <option value="">從現有商品帶入主圖</option>
              {listed.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn small" disabled={!pickId || items.length >= 24} onClick={addFromProduct}>
              加入
            </button>
          </div>
        )}
      </section>
      <div className="savebar">
        <button className="btn solid" disabled={pending || uploading}>
          {pending ? "儲存中…" : "儲存動態牆"}
        </button>
        {message && (
          <span style={{ color: "var(--teal-deep)", fontSize: 14 }} role="status">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
