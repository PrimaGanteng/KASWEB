import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kas Kelas · Transparan dan Terbuka",
  description: "Pantau iuran, pengeluaran, saldo, dan riwayat kas kelas secara terbuka.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
