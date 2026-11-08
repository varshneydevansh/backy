import React from 'react';
import { BackyRichTextContent } from '@backy-cms/editor/rich-text';
import { BackyDataFigure } from './BackyDataFigure';
import { RegisteredRichInteractiveComponent } from './RegisteredRichInteractiveComponent';

/** Hosted rendering uses the same safe rich-node adapter distributed to custom frontends. */
export function RichTextContent({ value, inline = false, siteId }: { value: unknown; inline?: boolean; siteId?: string }) {
  return <BackyRichTextContent value={value} inline={inline}
    renderInteractive={node => <RegisteredRichInteractiveComponent node={node} siteId={siteId} />}
    renderDataFigure={config => <BackyDataFigure config={config} siteId={siteId} />} />;
}
