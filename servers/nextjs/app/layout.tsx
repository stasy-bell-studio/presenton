import type { Metadata } from "next";
import localFont from "next/font/local";
import { Manrope, Syne, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import MixpanelInitializer from "./MixpanelInitializer";
import { Toaster } from "@/components/ui/sonner";
const inter = localFont({
  src: [
    {
      path: "./fonts/Inter.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-inter",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-unbounded",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://presenton.ai"),
  title: "Preza21vek / «21 Век»",
  description:
    "Preza21vek — генератор презентаций с искусственным интеллектом. Создавайте презентации на русском языке с помощью ИИ.",
  keywords: [
    "генератор презентаций",
    "ИИ презентации",
    "создать презентацию",
    "презентация 21 век",
    "Preza21vek",
  ],
  openGraph: {
    title: "Preza21vek / «21 Век»",
    description:
      "Preza21vek — генератор презентаций с искусственным интеллектом. Создавайте презентации на русском языке с помощью ИИ.",
    url: "https://presenton.ai",
    siteName: "Preza21vek",
    images: [
      {
        url: "https://presenton.ai/presenton-feature-graphics.png",
        width: 1200,
        height: 630,
        alt: "Preza21vek Logo",
      },
    ],
    type: "website",
    locale: "ru_RU",
  },
  alternates: {
    canonical: "https://presenton.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preza21vek / «21 Век»",
    description:
      "Preza21vek — генератор презентаций с искусственным интеллектом. Создавайте презентации на русском языке с помощью ИИ.",
    images: ["https://presenton.ai/presenton-feature-graphics.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="ru">
      <body
        className={`${inter.variable} ${syne.variable} ${manrope.variable} ${unbounded.variable} antialiased`}
      >
        <Providers>
          <MixpanelInitializer>

            {children}

          </MixpanelInitializer>
        </Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
