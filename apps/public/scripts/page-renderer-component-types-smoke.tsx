import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

function render(type: string, props: Record<string, unknown>) {
  return renderToStaticMarkup(<PageRenderer content={{
    canvasSize: { width: 720, height: 420 },
    elements: [{ id: 'component', type, x: 0, y: 0, width: 640, height: 300, props }],
  } as PageContent} siteId="site-demo" />);
}
const sandbox = render('codeComponent', {
  componentKey: 'fixture.widget', version: '1.0.0',
  sandboxUrl: '/api/sites/site-demo/interactive-components/fixture.widget/1.0.0/sandbox',
  renderCapabilities: { hydrationMode: 'sandbox-iframe' },
  fallback: { title: 'Widget fallback', text: 'Static widget summary' },
});
assert(sandbox.includes('<iframe'), 'codeComponent must render the opaque sandbox iframe');
assert(sandbox.includes('sandbox="allow-scripts allow-forms"'), 'Sandbox flags must retain opaque origin isolation');
assert(render('interactiveFigure', { componentKey: 'fixture.figure', fallback: { title: 'Figure fallback', text: 'Static figure summary' } }).includes('Figure fallback'), 'interactiveFigure must retain its figure fallback');
const code = render('codeBlock', { code: 'const answer = 42;', language: 'javascript' });
assert(code.includes('<pre') && code.replace(/<[^>]*>/g, '').includes('const answer = 42;'), 'codeBlock must render the saved code');
console.log('Public component type rendering smoke passed: iframe, figure, and code');
