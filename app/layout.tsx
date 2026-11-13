import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { getCatalogStore } from "@/lib/store";
import { publicSiteUrl } from "@/lib/site";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getCatalogStore();
  const description = settings.tagline || `${settings.shopName} 精選商品`;
  return {
    metadataBase: new URL(publicSiteUrl()),
    title: { default: settings.shopName, template: `%s · ${settings.shopName}` },
    description,
    applicationName: settings.shopName,
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: settings.shopName,
      title: settings.shopName,
      description,
      locale: "zh_TW",
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: settings.shopName }],
    },
    twitter: {
      card: "summary_large_image",
      title: settings.shopName,
      description,
      images: ["/og-image.jpg"],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className={display.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Radiant",
              logo: `${publicSiteUrl()}/logo.jpg`,
              image: `${publicSiteUrl()}/og-image.jpg`,
              url: publicSiteUrl(),
            }).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
