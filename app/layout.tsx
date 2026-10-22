import type { Metadata } from "next";
import { Cormorant_Garamond, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";
import { getStore } from "@/lib/store";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sans = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
  preload: false,
});
const serifTc = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-serif-tc",
  display: "swap",
  preload: false,
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getStore();
  return {
    title: { default: settings.shopName, template: `%s · ${settings.shopName}` },
    description: settings.tagline || settings.shopName,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${display.variable} ${sans.variable} ${serifTc.variable}`}>
      <body>{children}</body>
    </html>
  );
}
