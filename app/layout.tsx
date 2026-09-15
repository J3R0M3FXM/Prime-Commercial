import type { Metadata } from "next";
import "@fontsource/roboto-condensed/400.css";
import "./globals.css";
import { CartProvider } from "./components/cart-context";
import Script from "next/script";
import SystemFooter from "./components/system-footer";

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400&display=swap" 
          rel="stylesheet" 
        />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="font-sans bg-gray-50 text-gray-900 antialiased min-h-screen pb-8">
        <CartProvider>
          {children}
        </CartProvider>
        <SystemFooter />
      </body>
    </html>
  );
}

