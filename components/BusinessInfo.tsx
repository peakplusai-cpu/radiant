import { businessLines } from "@/lib/business";
import type { Settings } from "@/lib/types";

export function BusinessInfo({ settings }: { settings: Settings }) {
  const lines = businessLines(settings);
  if (!lines.length) return null;
  return (
    <section>
      <h2>經營者資訊</h2>
      <ul>
        {lines.map((line) => (
          <li key={line.label}>
            {line.label}：{line.value}
          </li>
        ))}
      </ul>
    </section>
  );
}
