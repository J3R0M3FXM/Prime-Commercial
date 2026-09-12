import type { Metadata } from "next";
import { Oswald, Montserrat } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./components/cart-context";
import Script from "next/script";

const oswald = Oswald({ 
  subsets: ["latin"], 
  variable: "--font-oswald" 
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  variable: "--font-montserrat" 
});

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
      <body className={`${oswald.variable} ${montserrat.variable} font-sans bg-gray-50 text-gray-900 antialiased`}>
        <CartProvider>
            {children}
        </CartProvider>
      </body>
    </html>
  );
}
