"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn small" onClick={() => window.print()}>
      列印出貨單
    </button>
  );
}
