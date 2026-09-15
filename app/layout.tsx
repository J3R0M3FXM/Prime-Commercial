import type { Metadata } from "next";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/open-sauce-sans/400.css";
import "@fontsource/open-sauce-sans/500.css";
import "@fontsource/open-sauce-sans/600.css";
import "@fontsource/open-sauce-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { CartProvider } from "./components/cart-context";
import SystemFooter from "./components/system-footer";
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Roboto+Condensed:wght@400&display=swap" 
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

