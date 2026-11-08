"use client";
import React from 'react';
import { BackyRichTextContent } from '@backy-cms/editor/rich-text';
import { BackyDataFigure } from './BackyDataFigure';
import { RegisteredRichInteractiveComponent } from './RegisteredRichInteractiveComponent';

/** Public configuration only; never accepts admin credentials or authored runtime URLs. */
export function BackyPortableRichText({ value, inline = false, siteId, apiBaseUrl }: {
  value: unknown; inline?: boolean; siteId: string; apiBaseUrl: string;
}) {
  let base = '';
  try {
    const url = new URL(apiBaseUrl);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash)
      base = url.href.replace(/\/+$/, '');
  } catch { /* Invalid runtime configuration keeps figures unavailable. */ }
  return <BackyRichTextContent value={value} inline={inline}
    renderInteractive={base ? node => <RegisteredRichInteractiveComponent node={node} siteId={siteId} apiBaseUrl={base} /> : undefined}
    renderDataFigure={base ? config => <BackyDataFigure config={config} siteId={siteId} apiBaseUrl={base} /> : undefined} />;
}
