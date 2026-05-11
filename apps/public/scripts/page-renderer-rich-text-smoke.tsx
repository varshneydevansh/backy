import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const content: PageContent = {
  canvasSize: { width: 900, height: 360 },
  elements: [
    {
      id: 'rich-heading',
      type: 'heading',
      x: 24,
      y: 24,
      width: 420,
      height: 64,
      props: {
        level: 'h2',
        content: [
          {
            type: 'h2',
            children: [{ text: 'Slate Heading Rendered' }],
          },
        ],
      },
    },
    {
      id: 'rich-paragraph',
      type: 'paragraph',
      x: 24,
      y: 104,
      width: 520,
      height: 80,
      props: {
        tag: 'p',
        content: [
          {
            type: 'p',
            children: [{ text: 'Slate paragraph for custom frontend output.' }],
          },
        ],
      },
    },
    {
      id: 'rich-quote',
      type: 'quote',
      x: 24,
      y: 204,
      width: 520,
      height: 96,
      props: {
        content: [
          {
            type: 'blockquote',
            children: [{ text: 'Slate quote for public renderer.' }],
          },
        ],
        citation: 'Renderer Smoke',
        quoteBorderColor: '#7c3aed',
        quoteBorderWidth: 6,
      },
    },
  ],
};

const html = renderToStaticMarkup(<PageRenderer content={content} isPreview />);

assert(html.includes('Slate Heading Rendered'), `Heading Slate content was not rendered: ${html}`);
assert(html.includes('Slate paragraph for custom frontend output.'), `Paragraph Slate content was not rendered: ${html}`);
assert(html.includes('Slate quote for public renderer.'), `Quote Slate content was not rendered: ${html}`);
assert(html.includes('Renderer Smoke'), `Quote citation was not rendered: ${html}`);
assert(html.includes('border-left:6px solid #7c3aed'), `Quote border styling was not rendered: ${html}`);

console.log(JSON.stringify({
  ok: true,
  rendered: {
    heading: true,
    paragraph: true,
    quote: true,
    citation: true,
  },
}, null, 2));
