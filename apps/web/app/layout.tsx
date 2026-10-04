import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Learnovize — live trainings with verifiable certificates',
  description: 'Host live trainings, track real attendance, issue verifiable certificates.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
