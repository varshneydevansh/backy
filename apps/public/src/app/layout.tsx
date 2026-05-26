import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export const metadata: Metadata = {
    title: 'Backy CMS | Visual website backend for custom frontends',
    description: 'Backy is an open-source visual CMS backend with a rich editor, public APIs, media, forms, commerce, and design metadata for custom frontends.',
    applicationName: 'Backy CMS',
    openGraph: {
        title: 'Backy CMS',
        description: 'A visual website backend for teams shipping custom frontends.',
        type: 'website',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.variable}>{children}</body>
        </html>
    );
}
