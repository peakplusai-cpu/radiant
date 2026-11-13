const NAMED: [RegExp, string][] = [
  [/咖啡/, "#6f4e37"],
  [/亞麻/, "#c4b48a"],
  [/卡其/, "#c3b091"],
  [/米白|乳白|象牙/, "#f4f0e6"],
  [/杏|裸/, "#e4c4a8"],
  [/駝|棕|褐/, "#8a6243"],
  [/黑/, "#1c1c1c"],
  [/白/, "#f7f7f5"],
  [/灰|銀/, "#8e9696"],
  [/藍|藏青|牛仔/, "#3d5f8a"],
  [/綠|橄欖/, "#3f6b56"],
  [/紅|酒紅|莓/, "#8d3a3a"],
  [/粉|桃/, "#e7b7be"],
  [/黃|芥末|金/, "#d4b15a"],
  [/紫|藕/, "#6d5278"],
  [/橙|橘/, "#d4844a"],
];

export function inferHex(color: string): string | null {
  const name = color.trim();
  if (!name) return null;
  for (const [pattern, hex] of NAMED) {
    if (pattern.test(name)) return hex;
  }
  return null;
}

const PLACEHOLDERS = new Set(["#d9d9d9", "#ffffff", "#fff", "#dddddd", "#cccccc"]);

/** Replace the untouched gray/white picker default when the color name is known. */
export function resolveHex(color: string, hex: string | undefined): string {
  const raw = (hex ?? "").trim().toLowerCase();
  const valid = /^#[0-9a-f]{6}$/.test(raw) ? raw : "";
  const named = inferHex(color);
  if (!named) return valid || "#d9d9d9";
  if (!valid || PLACEHOLDERS.has(valid)) {
    if (valid === "#ffffff" && /白/.test(color)) return "#f7f7f5";
    return named;
  }
  return valid;
}
