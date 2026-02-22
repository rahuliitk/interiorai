import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OpenLintel',
  description: 'End-to-end home design automation platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
