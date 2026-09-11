import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secure Telegram Shopfront",
  description: "A secure, Telegram-only shopfront application.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
