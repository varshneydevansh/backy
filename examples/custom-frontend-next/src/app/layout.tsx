import type { ReactNode } from "react";

import { backy } from "../lib/backy";

import "./styles.css";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const manifest = await backy.manifest();

  const siteId = typeof manifest.data.site.id === "string" ? manifest.data.site.id : String(manifest.data.site.id || "");
  const locale = typeof manifest.data.site.locale === "string" ? manifest.data.site.locale : "en";

  return (
    <html lang={locale}>
      <body data-backy-site-id={siteId}>{children}</body>
    </html>
  );
}
