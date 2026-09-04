import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SYNFORMA — Software that learns how your organization works",
    template: "%s · SYNFORMA",
  },
  description:
    "Synforma autonomously learns the relationship between people, software and work, then continuously determines the best way for humans and AI to accomplish organizational outcomes together.",
  icons: { icon: "/brand/synforma-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: "font-sans" }} />
      </body>
    </html>
  );
}
