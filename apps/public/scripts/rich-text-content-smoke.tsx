import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const leaf = (text: string, marks = {}) => ({ text, ...marks });
const render = (value: unknown, type = 'paragraph', props = {}) => renderToStaticMarkup(<PageRenderer content={{
  canvasSize: { width: 900, height: 2400 },
  elements: [{ id: 'rich-article-fixture', type, x: 0, y: 0, width: 760, height: 2200, props: { content: value, ...props } }],
} as PageContent} />);

const markup = render([
  { type: 'h2', children: [leaf('Section heading')] },
  { type: 'p', children: [leaf('Bold', { bold: true }), leaf('Italic', { italic: true }), leaf('Underline', { underline: true }), leaf('Strike', { strikethrough: true }), leaf('InlineCode', { code: true }), leaf('Color', { color: '#123456', fontSize: '20px' }), { type: 'a', url: 'https://example.test/source', target: '_blank', children: [leaf('Source')] }] },
  { type: 'ul', children: [{ type: 'li', children: [leaf('One'), { type: 'ol', children: [{ type: 'li', children: [leaf('Nested')] }] }] }] },
  { type: 'table', caption: 'Evidence', children: [{ type: 'tr', children: [{ type: 'th', children: [leaf('Name')] }, { type: 'td', colSpan: 2, children: [{ type: 'p', children: [leaf('Cell')] }] }] }] },
  { type: 'code_block', lang: 'javascript', children: [{ type: 'code_line', children: [leaf('const answer = 42;')] }, { type: 'code_line', children: [leaf('console.log("<script>literal</script>");')] }] },
  { type: 'img', url: 'https://example.test/photo.jpg', alt: 'Article photo', caption: [{ text: 'Photo caption' }], children: [leaf('')] },
  { type: 'media_embed', url: 'https://www.youtube.com/watch?v=abcdefghijk', children: [leaf('')] },
  { type: 'audio', src: '/uploads/clip.mp3', caption: 'Recording', children: [leaf('')] },
  { type: 'collapsible', title: 'Evidence details', defaultOpen: true, children: [{ type: 'p', children: [leaf('Collapsible detail body', { bold: true })] }] },
]);
for (const expected of ['<h2>', '<strong>Bold</strong>', '<em>Italic</em>', '<u>Underline</u>', '<s>Strike</s>', '<code>InlineCode</code>', 'color:#123456', 'font-size:20px', '<ul>', '<ol>', '<li>', '<table', '<tbody>', '<th', 'colSpan="2"', '<caption>Evidence</caption>', '<pre', 'data-language="javascript"', 'data-backy-code-token="keyword"', 'photo.jpg', '<figcaption>Photo caption</figcaption>', 'youtube-nocookie.com/embed/abcdefghijk', '<audio', '/uploads/clip.mp3']) {
  assert(markup.includes(expected), `Rich public output is missing ${expected}`);
}
assert(!markup.includes('<script>'), 'Code remains literal text rather than executable HTML.');
assert(markup.includes('target="_blank" rel="noopener noreferrer"'));
assert(!markup.includes('<p><h2'), 'Rich blocks must not be nested inside a paragraph wrapper.');
assert(markup.includes('<details open=""') && markup.includes('<summary>Evidence details</summary>') && markup.includes('<strong>Collapsible detail body</strong>'));
const collapsed = render([{ type: 'collapsible', title: '<script>title</script>', children: [{ type: 'p', children: [leaf('Preserved body')] }] }]);
assert(!/<details[^>]*\sopen[\s=>]/.test(collapsed));
assert(collapsed.includes('&lt;script&gt;title&lt;/script&gt;') && !collapsed.includes('<script>'));
assert(collapsed.includes('Preserved body'), 'Collapsed content stays in public DOM for native disclosure.');
const drive = render([{ type: 'media_embed', url: 'https://drive.google.com/file/d/examplefile123/view', children: [leaf('')] }]);
assert(drive.includes('drive.google.com/file/d/examplefile123/preview'));

const unsafe = render([
  { type: 'p', html: '<script>raw-payload</script>', onClick: 'run()', children: [leaf('<img src=x onerror=run()>', { color: 'red;position:fixed', fontFamily: 'x; background:url(javascript:run())', fontSize: 'expression(run())' }), { type: 'a', url: 'javascript:run()', children: [leaf('Unsafe link text retained')] }, { type: 'a', url: 'data:text/html,attack', children: [leaf('Data link text')] }] },
  { type: 'img', url: 'javascript:run()', children: [leaf('')] },
  { type: 'img', url: 'data:image/svg+xml,attack', children: [leaf('')] },
  { type: 'media_embed', url: 'https://youtube.com.evil.test/watch?v=abcdefghijk', children: [leaf('')] },
  { type: 'iframe', src: 'https://evil.test', children: [leaf('Unknown node text')] },
]);
for (const blocked of ['javascript:', 'data:text/html', 'data:image', '<script', '<iframe', 'onerror=', 'position:fixed', 'background:url', 'expression(']) {
  // The onerror-looking string is legitimate literal text and must be HTML-escaped.
  if (blocked === 'onerror=') continue;
  assert(!unsafe.includes(blocked), `Unsafe rich value leaked into rendered attributes: ${blocked}`);
}
assert(unsafe.includes('&lt;img src=x onerror=run()&gt;'));
assert(unsafe.includes('Unsafe link text retained'));
assert(unsafe.includes('Unknown node text'));

const heading = render([{ type: 'h2', children: [leaf('Heading emphasis', { bold: true })] }], 'heading', { level: 'h2' });
assert(heading.includes('<strong>Heading emphasis</strong>'));
assert.equal((heading.match(/<h2/g) || []).length, 1, 'Canvas heading should contain one heading wrapper.');
const quote = render([{ type: 'blockquote', children: [leaf('Quote emphasis', { italic: true })] }], 'quote', { citation: 'Source witness' });
assert(quote.includes('<em>Quote emphasis</em>') && quote.includes('<cite') && quote.includes('Source witness'));
assert.equal((quote.match(/<blockquote/g) || []).length, 1);
const sections = render([{ type: 'table', children: [{ type: 'tbody', children: [{ type: 'tr', children: [{ type: 'td', children: [leaf('Sectioned cell')] }] }] }] }]);
assert.equal((sections.match(/<tbody/g) || []).length, 1, 'Existing table sections must not receive a second tbody.');
assert(render('<p><strong>Legacy HTML</strong></p>').includes('<strong>Legacy HTML</strong>'), 'Keep the existing sanitized HTML string path.');
let deep: unknown = leaf('deep');
for (let depth = 0; depth < 100; depth++) deep = { type: 'p', children: [deep] };
assert.doesNotThrow(() => render([deep]), 'Bound nested rich content safely.');
console.log('Rich public content: semantic tags, formatting, safe links/media/code, quote citation, legacy HTML and nesting checks passed.');
