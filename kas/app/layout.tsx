import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kas Kelas · Transparan dan Terbuka",
  description: "Pantau iuran, pengeluaran, saldo, dan riwayat kas kelas secara terbuka.",
  applicationName: "Kas Kelas",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kas Kelas",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  other: { "mobile-web-app-capable": "yes" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
