import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "./components/cart-context";
import Script from "next/script";

export const metadata: Metadata = {
  title: "PRIME Shop",
  description: "Advanced AI-powered E-Commerce.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>
        <CartProvider>
            {children}
        </CartProvider>
      </body>
    </html>
  );
}
