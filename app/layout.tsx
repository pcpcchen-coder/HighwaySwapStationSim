import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HighwaySwapSim · 雙服務區能源與營運測算",
  description: "高速公路換電站供電設計、補能需求、效率與獲利能力工程工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
