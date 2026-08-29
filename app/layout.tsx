import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PDR Lab — Kriptografik Erişim Yönetişimi',
  description: 'Çift anahtar-sarmalama ve sorgu düzeyinde erişim yönetişimi için etkileşimli laboratuvar.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: 'PDR Lab — Kriptografik Erişim Yönetişimi',
    description: 'Sorgu düzeyinde erişim, çift DEK sarması ve denetim bütünlüğünü deneyin.',
    type: 'website',
    locale: 'tr_TR',
    images: [{ url: new URL('/og.png', siteUrl).toString(), width: 1200, height: 630, alt: 'PDR Lab sosyal paylaşım kartı' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PDR Lab — Kriptografik Erişim Yönetişimi',
    description: 'Sorgu düzeyinde erişim, çift DEK sarması ve denetim bütünlüğünü deneyin.',
    images: [new URL('/og.png', siteUrl).toString()],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
