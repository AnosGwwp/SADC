import { Geist, Geist_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import Providers from "@/components/Providers";
import { BRAND, DESCRIPTION, SITE_URL, TITLE } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

// The icons (favicon.ico, icon.png, apple-icon.png) and the preview image (opengraph-image.js) sit in app/
// and are added to the page automatically.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${TITLE} · TakeTheFloor`,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "TakeTheFloor", title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport = {
  themeColor: BRAND,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
