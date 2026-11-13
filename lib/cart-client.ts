"use client";

import { addEntry, bump, countCart, removeEntry, sanitizeCart, setQty, type CartEntry } from "./cart";

export type { CartEntry };

const KEY = "radiant.cart";
const EVENT = "radiant:cart";

let memory: CartEntry[] | null = null;

function load(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as CartEntry[];
    return sanitizeCart(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function persist(items: CartEntry[]): void {
  memory = items;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function readCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  if (!memory) memory = load();
  return memory.map((item) => ({ ...item }));
}

export function writeCart(items: CartEntry[]): void {
  persist(sanitizeCart(items));
}

export function addToCart(entry: CartEntry, max: number): void {
  persist(addEntry(readCart(), entry, max));
}

export function changeQty(p: string, v: string, delta: number, max: number): CartEntry[] {
  const next = bump(readCart(), p, v, delta, max);
  persist(next);
  return next;
}

export function setCartQty(p: string, v: string, q: number, max: number): CartEntry[] {
  const next = setQty(readCart(), { p, v, q }, max);
  persist(next);
  return next;
}

export function removeFromCart(p: string, v: string): void {
  persist(removeEntry(readCart(), p, v));
}

export function clearCart(): void {
  persist([]);
}

export function cartCount(): number {
  return countCart(readCart());
}

export function onCartChange(fn: () => void): () => void {
  const onStorage = () => {
    memory = null;
    fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}
