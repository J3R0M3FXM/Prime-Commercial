import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "./components/cart-context";

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
      <body>
        <CartProvider>
            {children}
        </CartProvider>
      </body>
    </html>
  );
}
