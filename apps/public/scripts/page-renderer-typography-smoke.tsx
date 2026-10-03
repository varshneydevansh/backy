import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const importedStyle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 31, fontWeight: '600', lineHeight: 1.7,
  color: '#123456', textAlign: 'right', letterSpacing: 2 };
function typography(type: string, props: Record<string, unknown> = {}, styles = importedStyle): string {
  const content: PageContent = { canvasSize: { width: 760, height: 460 }, elements: [{
    id: 'saved-typography', type, x: 36, y: 36, width: 650, height: 100, styles,
    props: { level: 'h2', tag: 'p', content: 'Saved typography fixture', ...props },
  }] };
  const html = renderToStaticMarkup(<PageRenderer content={content} siteId="site-demo" />);
  const match = html.match(/<(?:h2|p)\b[^>]*style="([^"]*)"[^>]*>Saved typography fixture<\/(?:h2|p)>/);
  assert(match, 'Rendered fixture must expose its actual text style');
  return match[1];
}
for (const type of ['heading', 'text']) {
  const saved = typography(type);
  for (const declaration of ['font-family:Georgia, serif', 'font-size:31px', 'font-weight:600', 'line-height:1.7',
    'color:#123456', 'text-align:right', 'letter-spacing:2px']) {
    assert(saved.includes(declaration), `${type} must retain saved ${declaration}; got ${saved}`);
  }
  const edited = typography(type, { fontFamily: 'Courier New, monospace', fontSize: 24, textAlign: 'center', lineHeight: 1.4 });
  for (const declaration of ['font-family:Courier New, monospace', 'font-size:24px', 'text-align:center', 'line-height:1.4']) {
    assert(edited.includes(declaration), `Explicit editor property must override imported styles: ${declaration}`);
  }
  assert(edited.includes('color:#123456'), 'Editing one typography property must retain other saved styles');
  assert(!typography(type, { fontFamily: '' }).includes('font-family:'), 'An explicit empty property still clears the saved font override');
  assert(typography(type, { fontSize: 0 }).includes('font-size:0px'), 'An explicit zero must remain a valid property override');
}
console.log('Public typography rendering passed: saved styles, explicit editor precedence, reset, and zero values');
