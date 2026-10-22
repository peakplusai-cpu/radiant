"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveProduct } from "@/app/actions/admin";
import type { Product } from "@/lib/types";

type VariantDraft = { key: string; id?: string; color: string; hex: string; sku: string; stock: string; price: string };
type DetailDraft = { key: string; label: string; value: string };

let counter = 0;
const key = () => `k${++counter}`;

const DETAIL_SUGGESTIONS = ["材質", "尺寸", "重量", "產地", "保養方式"];

export function ProductForm({ product }: { product?: Product }) {
  const [error, action, pending] = useActionState(saveProduct, "");
  const [name, setName] = useState(product?.name ?? "");
  const [subtitle, setSubtitle] = useState(product?.subtitle ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [comparePrice, setComparePrice] = useState(product?.comparePrice ? String(product.comparePrice) : "");
  const [listed, setListed] = useState(product ? product.status === "listed" : true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [photos, setPhotos] = useState<string[]>(product?.photos ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length
      ? product.variants.map((v) => ({
          key: key(),
          id: v.id,
          color: v.color,
          hex: v.hex,
          sku: v.sku,
          stock: String(v.stock),
          price: v.price === null ? "" : String(v.price),
        }))
      : [{ key: key(), color: "", hex: "#d9d9d9", sku: "", stock: "0", price: "" }]
  );
  const [details, setDetails] = useState<DetailDraft[]>(
    product?.details.length
      ? product.details.map((d) => ({ key: key(), ...d }))
      : DETAIL_SUGGESTIONS.slice(0, 3).map((label) => ({ key: key(), label, value: "" }))
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const payload = JSON.stringify({
    name,
    subtitle,
    category,
    description,
    price: Number(price),
    comparePrice: Number(comparePrice || 0),
    status: listed ? "listed" : "unlisted",
    featured,
    photos,
    details: details.map(({ label, value }) => ({ label, value })),
    variants: variants.map((v) => ({
      id: v.id,
      color: v.color,
      hex: v.hex,
      sku: v.sku,
      stock: Number(v.stock || 0),
      price: v.price === "" ? null : Number(v.price),
    })),
  });

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
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", await shrink(file));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) urls.push(json.url);
      else setUploadError(json.error ?? "上傳失敗");
    }
    setPhotos((p) => [...p, ...urls]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function patchVariant(k: string, patch: Partial<VariantDraft>) {
    setVariants((list) => list.map((v) => (v.key === k ? { ...v, ...patch } : v)));
  }

  function movePhoto(i: number, dir: -1 | 1) {
    setPhotos((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="form-grid">
        <div>
          <section className="panel">
            <h2>基本資料</h2>
            <label className="field">
              <span className="label">商品名稱</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </label>
            <label className="field">
              <span className="label">副標題</span>
              <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} />
            </label>
            <label className="field">
              <span className="label">分類</span>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
              <span className="hint">相同分類名稱會在前台自動歸類。</span>
            </label>
            <label className="field">
              <span className="label">商品說明</span>
              <textarea className="textarea" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
            </label>
          </section>

          <section className="panel">
            <h2>
              顏色與庫存
              <small>每個顏色獨立計算庫存；如需不同售價，填入「款式價」，留白則使用商品售價。</small>
            </h2>
            <div className="rows">
              {variants.map((v) => (
                <div className="vrow" key={v.key}>
                  <div>
                    <span className="label">色票</span>
                    <input
                      className="color-input"
                      type="color"
                      value={v.hex}
                      onChange={(e) => patchVariant(v.key, { hex: e.target.value })}
                      aria-label="色票"
                    />
                  </div>
                  <div>
                    <span className="label">顏色名稱</span>
                    <input className="input" value={v.color} onChange={(e) => patchVariant(v.key, { color: e.target.value })} placeholder="例：湖水綠" maxLength={40} />
                  </div>
                  <div>
                    <span className="label">SKU</span>
                    <input className="input" value={v.sku} onChange={(e) => patchVariant(v.key, { sku: e.target.value })} maxLength={40} />
                  </div>
                  <div>
                    <span className="label">數量</span>
                    <input className="input" type="number" min={0} step={1} value={v.stock} onChange={(e) => patchVariant(v.key, { stock: e.target.value })} />
                  </div>
                  <div>
                    <span className="label">款式價（選填）</span>
                    <input className="input" type="number" min={0} step={1} value={v.price} onChange={(e) => patchVariant(v.key, { price: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    className="x-btn"
                    aria-label="移除此顏色"
                    disabled={variants.length === 1}
                    onClick={() => setVariants((l) => l.filter((x) => x.key !== v.key))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn small"
              style={{ marginBottom: 28 }}
              onClick={() => setVariants((l) => [...l, { key: key(), color: "", hex: "#d9d9d9", sku: "", stock: "0", price: "" }])}
            >
              ＋ 新增顏色
            </button>
          </section>

          <section className="panel">
            <h2>
              商品細節
              <small>前台以規格表呈現，例如材質、尺寸、保養方式。</small>
            </h2>
            <div className="rows">
              {details.map((d) => (
                <div className="drow" key={d.key}>
                  <div>
                    <span className="label">項目</span>
                    <input
                      className="input"
                      value={d.label}
                      list="detail-labels"
                      onChange={(e) => setDetails((l) => l.map((x) => (x.key === d.key ? { ...x, label: e.target.value } : x)))}
                      maxLength={40}
                    />
                  </div>
                  <div>
                    <span className="label">內容</span>
                    <input
                      className="input"
                      value={d.value}
                      onChange={(e) => setDetails((l) => l.map((x) => (x.key === d.key ? { ...x, value: e.target.value } : x)))}
                      maxLength={300}
                    />
                  </div>
                  <button type="button" className="x-btn" aria-label="移除此項目" onClick={() => setDetails((l) => l.filter((x) => x.key !== d.key))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <datalist id="detail-labels">
              {DETAIL_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button type="button" className="btn small" style={{ marginBottom: 28 }} onClick={() => setDetails((l) => [...l, { key: key(), label: "", value: "" }])}>
              ＋ 新增項目
            </button>
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>上架與售價</h2>
            <label className="toggle">
              <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
              <span>{listed ? "上架中，前台可見" : "已下架，前台隱藏"}</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              <span>精選置頂（綜合排序優先）</span>
            </label>
            <div className="two">
              <label className="field">
                <span className="label">售價 NT$</span>
                <input className="input" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">原價 NT$</span>
                <input className="input" type="number" min={0} step={1} value={comparePrice} onChange={(e) => setComparePrice(e.target.value)} />
              </label>
            </div>
            <span className="hint" style={{ display: "block", marginTop: -14, marginBottom: 24, fontSize: 12.5, color: "var(--muted)" }}>
              填入高於售價的原價，前台會顯示劃線價。
            </span>
          </section>

          <section className="panel">
            <h2>
              商品圖片
              <small>第一張為封面，前台卡片懸停時顯示第二張。</small>
            </h2>
            <div className="photos">
              {photos.map((src, i) => (
                <div className="photo" key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                  {i === 0 && <span className="cover">封面</span>}
                  <div className="photo-actions">
                    <button type="button" onClick={() => movePhoto(i, -1)} aria-label="前移" disabled={i === 0}>
                      ←
                    </button>
                    <button type="button" onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))} aria-label="移除">
                      ×
                    </button>
                    <button type="button" onClick={() => movePhoto(i, 1)} aria-label="後移" disabled={i === photos.length - 1}>
                      →
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="add-slot" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "上傳中…" : "＋ 上傳圖片"}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => void upload(e.target.files)} />
            {uploadError && <div className="notice error" style={{ marginBottom: 20 }}>{uploadError}</div>}
          </section>
        </div>
      </div>

      <div className="savebar">
        <button className="btn solid" disabled={pending || uploading}>
          {pending ? "儲存中…" : "儲存商品"}
        </button>
        <Link href="/admin/products" className="btn">
          取消
        </Link>
        {error && (
          <span style={{ color: "var(--alert)", fontSize: 14 }} role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
