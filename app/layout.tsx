import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  // metadataBase resolves relative Open Graph and canonical URLs. Without it
  // Next drops them silently, so every share of a public page — the home page,
  // a programme, a verified certificate — rendered without a preview.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com'),
  // Default only. Public pages set their own; this is what a staff screen and
  // anything unlabelled inherits. Deliberately not a title template — the
  // public pages already end their titles with "| Knowsia" and a template
  // would double it.
  title: 'Knowsia',
  description: 'Course registration, payments and certificates for Knowsia training programmes.',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
