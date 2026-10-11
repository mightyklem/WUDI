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
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the manifest, so the browser chrome and the installed app agree.
  themeColor: '#1B7E8D',
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
