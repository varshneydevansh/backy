import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const content: PageContent = { canvasSize: { width: 600, height: 400 }, elements: [{
  id: 'attachment-form', type: 'form', x: 0, y: 0, width: 500, height: 350, styles: {},
  props: { formId: 'visitor-form', fields: [{ key: 'attachment', label: 'Supporting files', type: 'file', required: true }, { key: 'message', label: 'Message', type: 'textarea' }] },
}] };
const html = renderToStaticMarkup(createElement(PageRenderer, { content, siteId: 'site-test', pageId: 'page-test' }));
assert(html.includes('/api/sites/site-test/forms/visitor-form/submissions'));
assert(/<input[^>]*type="file"[^>]*name="attachment"[^>]*multiple=""/.test(html));
assert(html.includes('Supporting files'));
assert(html.includes('Up to 5 files and 4 MB total'));
assert(html.includes('data-backy-form-schema-submit'));
console.log('Public form attachment field rendering checks passed.');
