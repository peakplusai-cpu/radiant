const SIZE_RANK = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "F"];

function halfWidth(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

/** Pull a size list out of a free-text spec such as "Ｓ.M.L.XL 尺寸結帳留言" or "S~L". */
export function parseSizeList(raw: string): string[] {
  let text = halfWidth(raw).toUpperCase();
  text = text.replace(/尺寸結帳留言|請備註尺寸|請留言尺寸|結帳留言|請備註|請留言|尺寸|尺碼/g, " ");
  const range = text.match(
    /\b(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|F)\s*[~\-～－]\s*(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|F)\b/
  );
  if (range) {
    const from = SIZE_RANK.indexOf(range[1]);
    const to = SIZE_RANK.indexOf(range[2]);
    if (from >= 0 && to >= from) return SIZE_RANK.slice(from, to + 1);
  }
  const found = text.match(/XXS|2XL|3XL|4XL|5XL|XXL|XS|XL|F|S|M|L/g) ?? [];
  const set = new Set(found);
  return SIZE_RANK.filter((size) => set.has(size));
}

/** Keep the total. Extra pieces go to M, then L, then the rest. */
export function distributeStock(total: number, sizes: string[]): number[] {
  const safe = Math.max(0, Math.floor(total));
  const n = sizes.length;
  if (!n) return [];
  const base = Math.floor(safe / n);
  let remainder = safe - base * n;
  const counts = sizes.map(() => base);
  const prefer = ["M", "L", "S", "XL", "XS", "XXL", "2XL", "F"];
  const order = [...sizes].sort((a, b) => {
    const ia = prefer.indexOf(a);
    const ib = prefer.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const size of order) {
    if (remainder <= 0) break;
    counts[sizes.indexOf(size)] += 1;
    remainder -= 1;
  }
  return counts;
}
