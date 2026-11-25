import type { Settings } from "./types";

type BusinessKey = "businessName" | "taxId" | "address" | "phone" | "email" | "returnAddress";

/** The sentence previously stored as the default payment note. It no longer matches checkout. */
export const LEGACY_PAYMENT_NOTE = "送出訂單後，我們會透過 LINE 與您確認並提供付款方式。";

export const DEFAULT_PAYMENT_NOTE =
  "線上付款由藍新金流處理（信用卡、Apple Pay 等），卡號不會經過本店。請在 30 分鐘內完成付款，逾時訂單會自動取消並釋出庫存。";

/** Shown on NewebPay checkouts even when a saved payment note still mentions LINE. */
export const ONLINE_PAYMENT_NOTE =
  "付款由藍新金流（NewebPay）處理，可使用信用卡、Apple Pay 等方式。卡號只會輸入在藍新金流的頁面，本店不會看到也不會儲存。請在 30 分鐘內完成付款，逾時訂單會自動取消並釋出庫存。";

const BUSINESS_FIELDS: { key: BusinessKey; label: string; max: number }[] = [
  { key: "businessName", label: "經營者名稱", max: 80 },
  { key: "taxId", label: "統一編號", max: 8 },
  { key: "address", label: "地址", max: 200 },
  { key: "phone", label: "電話", max: 40 },
  { key: "email", label: "Email", max: 80 },
  { key: "returnAddress", label: "退貨地址", max: 200 },
];

export function cleanBusinessText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

export function businessLines(settings: Settings): { label: string; value: string }[] {
  return BUSINESS_FIELDS.flatMap((field) => {
    const value = cleanBusinessText(settings[field.key], field.max);
    return value ? [{ label: field.label, value }] : [];
  });
}

/** Labels still empty. The settings page warns before launch; the storefront hides those lines. */
export function missingBusinessFields(settings: Settings): string[] {
  return BUSINESS_FIELDS.filter((field) => !cleanBusinessText(settings[field.key], field.max)).map((field) => field.label);
}

export function paymentNoteForDisplay(note: string): string {
  const trimmed = note.trim();
  if (!trimmed || trimmed === LEGACY_PAYMENT_NOTE) return DEFAULT_PAYMENT_NOTE;
  return trimmed;
}
