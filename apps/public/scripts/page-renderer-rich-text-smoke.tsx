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
        fontSize: 42,
        fontWeight: '700',
        color: '#dc2626',
        textAlign: 'center',
        lineHeight: 1.2,
        textTransform: 'uppercase',
        letterSpacing: 2,
        wordSpacing: 4,
        textShadow: '1px 2px 3px rgba(15, 23, 42, 0.35)',
        textIndent: 6,
        textDecoration: 'underline',
        fontStyle: 'italic',
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
    {
      id: 'styled-box',
      type: 'box',
      x: 580,
      y: 24,
      width: 260,
      height: 120,
      props: {
        backgroundColor: '#ecfeff',
        borderRadius: 14,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: '#0891b2',
        padding: 18,
        margin: 4,
        boxShadow: '0 10px 20px rgba(8, 145, 178, 0.25)',
      },
      children: [
        {
          id: 'styled-box-text',
          type: 'text',
          x: 12,
          y: 12,
          width: 180,
          height: 28,
          props: {
            content: 'Styled box child',
          },
        },
      ],
    },
    {
      id: 'styled-button',
      type: 'button',
      x: 580,
      y: 168,
      width: 220,
      height: 56,
      props: {
        label: 'Styled CTA',
        href: '/signup',
        target: '_blank',
        rel: 'noopener noreferrer',
        ariaLabel: 'Open signup',
        title: 'Signup CTA',
        backgroundColor: '#16a34a',
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
        borderRadius: 12,
        padding: 14,
        boxShadow: '0 8px 16px rgba(22, 163, 74, 0.25)',
      },
    },
  ],
};

const html = renderToStaticMarkup(<PageRenderer content={content} isPreview />);

assert(html.includes('Slate Heading Rendered'), `Heading Slate content was not rendered: ${html}`);
assert(html.includes('font-size:42px'), `Heading font size was not rendered: ${html}`);
assert(html.includes('font-weight:700'), `Heading font weight was not rendered: ${html}`);
assert(html.includes('color:#dc2626'), `Heading text color was not rendered: ${html}`);
assert(html.includes('text-align:center'), `Heading text align was not rendered: ${html}`);
assert(html.includes('line-height:1.2'), `Heading line height was not rendered: ${html}`);
assert(html.includes('text-transform:uppercase'), `Heading text transform was not rendered: ${html}`);
assert(html.includes('letter-spacing:2px'), `Heading letter spacing was not rendered: ${html}`);
assert(html.includes('word-spacing:4px'), `Heading word spacing was not rendered: ${html}`);
assert(html.includes('text-shadow:1px 2px 3px rgba(15, 23, 42, 0.35)'), `Heading text shadow was not rendered: ${html}`);
assert(html.includes('text-indent:6px'), `Heading text indent was not rendered: ${html}`);
assert(html.includes('text-decoration:underline'), `Heading text decoration was not rendered: ${html}`);
assert(html.includes('font-style:italic'), `Heading font style was not rendered: ${html}`);
assert(html.includes('Slate paragraph for custom frontend output.'), `Paragraph Slate content was not rendered: ${html}`);
assert(html.includes('Slate quote for public renderer.'), `Quote Slate content was not rendered: ${html}`);
assert(html.includes('Renderer Smoke'), `Quote citation was not rendered: ${html}`);
assert(html.includes('border-left:6px solid #7c3aed'), `Quote border styling was not rendered: ${html}`);
assert(html.includes('Styled box child'), `Styled box child was not rendered: ${html}`);
assert(html.includes('background-color:#ecfeff'), `Container background color was not rendered: ${html}`);
assert(html.includes('border-width:3px'), `Container border width was not rendered: ${html}`);
assert(html.includes('border-style:dashed'), `Container border style was not rendered: ${html}`);
assert(html.includes('border-color:#0891b2'), `Container border color was not rendered: ${html}`);
assert(html.includes('box-shadow:0 10px 20px rgba(8, 145, 178, 0.25)'), `Container shadow was not rendered: ${html}`);
assert(html.includes('href="/signup"'), `Button href was not rendered: ${html}`);
assert(html.includes('aria-label="Open signup"'), `Button aria label was not rendered: ${html}`);
assert(html.includes('Styled CTA'), `Button label was not rendered: ${html}`);
assert(html.includes('background-color:#16a34a'), `Button background was not rendered: ${html}`);
assert(html.includes('font-size:18px'), `Button font size was not rendered: ${html}`);
assert(html.includes('border-radius:12px'), `Button border radius was not rendered: ${html}`);
assert(html.includes('box-shadow:0 8px 16px rgba(22, 163, 74, 0.25)'), `Button shadow was not rendered: ${html}`);

console.log(JSON.stringify({
  ok: true,
  rendered: {
    heading: true,
    headingTypography: true,
    paragraph: true,
    quote: true,
    citation: true,
    styledBox: true,
    styledButton: true,
  },
}, null, 2));
