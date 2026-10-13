import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistrar from './components/ServiceWorkerRegistrar';

// Self-hosted by next/font: one variable file, no render-blocking request to Google,
// and no third-party cookie. Works offline and in regions where Google Fonts is blocked.
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Learnovize — live trainings with verifiable certificates',
  description: 'Host live trainings, track real attendance, issue verifiable certificates.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Learnovize',
    // Lets an installed app run without browser chrome on iOS.
    statusBarStyle: 'default',
  },
  icons: {
    // Ordered by preference. The .ico leads because every browser tab asks for
    // it; the SVG follows for browsers that will use it, at any zoom, without
    // the pixelation a 16px PNG can never avoid.
    icon: [
      { url: '/favicon.ico', sizes: '48x48 32x32 16x16' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS does not round an apple-touch-icon, so this one is full-bleed square.
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    other: [{ rel: 'mask-icon', url: '/icon.svg' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the manifest, so the browser chrome and the installed app agree.
  themeColor: 'var(--accent-deep)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
