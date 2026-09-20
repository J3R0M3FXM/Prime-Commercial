import type { Metadata, Viewport } from "next";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/roboto-condensed/400.css";
import "./globals.css";
import CartProvider from "./components/cart-context";
import Script from "next/script";
import SystemFooter from "./components/system-footer";

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "PRIME Shop",
  description: "Advanced AI-powered E-Commerce.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PRIME Shop",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Roboto+Condensed:wght@400;700&display=swap" 
          rel="stylesheet" 
        />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body suppressHydrationWarning className="font-sans bg-slate-950 text-gray-900 antialiased min-h-screen flex justify-center selection:bg-slate-900 selection:text-white">
        <div id="mobile-portrait-viewport" className="w-full max-w-[430px] min-h-screen bg-gray-50 flex flex-col relative shadow-2xl sm:border-x sm:border-slate-800/80">
          <CartProvider>
            {children}
          </CartProvider>
          <SystemFooter />
        </div>
      </body>
    </html>
  );
}

