import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GitHub Access Automation',
  description: 'Automated GitHub repository access provisioning after purchase',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
