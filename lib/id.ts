import { randomBytes } from "crypto";

export function uid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}
