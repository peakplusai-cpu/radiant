/** Canonical Taiwan mobile (09xxxxxxxx) or area-code landline. */
export function normalizeTaiwanPhone(input: string): string | null {
  let digits = input.trim().replace(/[\s().-]/g, "");
  if (digits.startsWith("+886")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("886")) digits = `0${digits.slice(3)}`;
  if (/^09\d{8}$/.test(digits)) return digits;
  if (/^0[2-8]\d{7,8}$/.test(digits)) return digits;
  return null;
}

export function cleanPersonName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  if (/[\u0000-\u001f<>]/.test(name)) return null;
  return name;
}

export function cleanNote(input: string, max = 300): string {
  return input.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}
