import React from 'react';
import { BACKY_CODE_HIGHLIGHT_THEMES, isBackyDataFigureKey, normalizeBackyCodeLanguage, resolveBackyVideoSource, tokenizeBackyCodeLine } from '@backy-cms/core';
import type { BackyDataFigureConfig } from '@backy-cms/core';

type RichNode = Record<string, unknown>;
const record = (value: unknown): value is RichNode => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const string = (value: unknown) => typeof value === 'string' ? value : '';

/** URLs from saved rich content are untrusted. Never render executable/data protocols. */
const safeUrl = (value: unknown, media = false): string | undefined => {
  const source = string(value).trim();
  if (!source || /[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith('//')) return undefined;
  if (/^(?:\/(?!\/)|\.\.?\/|#)/.test(source)) return source;
  try {
    const url = new URL(source);
    return (['http:', 'https:'].includes(url.protocol) || (!media && ['mailto:', 'tel:'].includes(url.protocol))) ? source : undefined;
  } catch { return undefined; }
};
const color = (value: unknown): string | undefined => {
  const source = string(value);
  return /^(?:#[a-f0-9]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/i.test(source) ? source : undefined;
};
const length = (value: unknown): string | number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 512) return value;
  const source = string(value);
  return /^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(source) && Number.parseFloat(source) <= 512 ? source : undefined;
};
const styleFor = (node: RichNode): React.CSSProperties => ({
  color: color(node.color),
  backgroundColor: color(node.backgroundColor),
  fontSize: length(node.fontSize),
  fontFamily: /^[a-z0-9 ,'"-]+$/i.test(string(node.fontFamily)) ? string(node.fontFamily) : undefined,
  textAlign: ['left', 'right', 'center', 'justify', 'start', 'end'].includes(string(node.align)) ? node.align as React.CSSProperties['textAlign'] : undefined,
  ...(typeof node.indent === 'number' && node.indent > 0 && node.indent <= 20 ? { marginLeft: node.indent * 24 } : {}),
});
const plainText = (value: unknown, depth = 0): string => {
  if (depth > 40) return '';
  if (Array.isArray(value)) return value.map((child) => plainText(child, depth + 1)).join('');
  if (!record(value)) return string(value);
  return typeof value.text === 'string' ? value.text : plainText(value.children, depth + 1);
};

/** Safe Slate/Plate rendering. Inline mode preserves marks inside canvas headings/quotes. */
export interface BackyRichTextRenderProps {
  value: unknown;
  inline?: boolean;
  renderInteractive?: (node: Record<string, unknown>) => React.ReactNode;
  renderDataFigure?: (config: BackyDataFigureConfig) => React.ReactNode;
}
export function BackyRichTextContent({ value, inline = false, renderInteractive, renderDataFigure }: BackyRichTextRenderProps) {
  let remainingNodes = 10_000;
  const render = (value: unknown, key: string, depth = 0): React.ReactNode => {
    if (depth > 40 || --remainingNodes < 0) return null;
    if (Array.isArray(value)) return value.map((child, index) => <React.Fragment key={`${key}-${index}`}>{render(child, `${key}-${index}`, depth + 1)}</React.Fragment>);
    if (!record(value)) return string(value);
    if (typeof value.text === 'string') {
      let text: React.ReactNode = value.text;
      if (value.code === true) text = <code>{text}</code>;
      if (value.bold === true) text = <strong>{text}</strong>;
      if (value.italic === true || value.fontStyle === 'italic') text = <em>{text}</em>;
      if (value.underline === true) text = <u>{text}</u>;
      if (value.strikethrough === true) text = <s>{text}</s>;
      return <span style={styleFor(value)}>{text}</span>;
    }
    const type = string(value.type) || 'p';
    const children = () => render(value.children, `${key}-children`, depth + 1);
    if (type === 'a' || type === 'link') {
      const href = safeUrl(value.url ?? value.href);
      return href ? <a href={href} target={value.target === '_blank' ? '_blank' : undefined} rel={value.target === '_blank' ? 'noopener noreferrer' : undefined} style={styleFor(value)}>{children()}</a> : <>{children()}</>;
    }
    if (inline) return <>{children()}</>;
    if (type === 'interactive_component') return renderInteractive ? renderInteractive(value) : <p role="status" data-backy-unsupported-rich-node={type}>Registered component renderer is unavailable.</p>;
    if (type === 'data_figure' && isBackyDataFigureKey(value.componentKey)) return renderDataFigure ? renderDataFigure(value as unknown as BackyDataFigureConfig) : <p role="status" data-backy-unsupported-rich-node={type}>Data figure renderer is unavailable.</p>;
    if (type === 'collapsible') return <details open={value.defaultOpen === true} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, margin: '1em 0' }}><summary>{string(value.title) || 'Details'}</summary><div style={{ marginTop: 8 }}>{children()}</div></details>;
    if (type === 'img' || type === 'image') {
      const src = safeUrl(value.url ?? value.src, true);
      if (!src) return null;
      const caption = plainText(value.caption);
      return <figure style={{ margin: '1em 0' }}><img src={src} alt={string(value.alt)} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />{caption ? <figcaption>{caption}</figcaption> : null}</figure>;
    }
    if (['media_embed', 'mediaEmbed', 'video', 'audio'].includes(type)) {
      const source = resolveBackyVideoSource(value.url ?? value.src, { controls: true });
      const embed = ['youtube', 'vimeo', 'drive'].includes(source.kind) ? source.src : undefined;
      const src = safeUrl(value.url ?? value.src, true);
      const caption = plainText(value.caption);
      let media: React.ReactNode = null;
      if (embed) media = <iframe src={embed} title={string(value.title) || 'Embedded video'} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen style={{ width: '100%', aspectRatio: '16 / 9', border: 0 }} />;
      else if (src && type === 'audio') media = <audio src={src} controls preload="metadata" />;
      else if (source.kind === 'native' && type !== 'audio') media = <video src={source.src} controls preload="metadata" style={{ maxWidth: '100%' }} />;
      return media ? <figure style={{ margin: '1em 0' }}>{media}{caption ? <figcaption>{caption}</figcaption> : null}</figure> : null;
    }
    if (['code_block', 'codeBlock', 'pre'].includes(type)) {
      const lines = Array.isArray(value.children) ? value.children.map((child) => plainText(child)).join('\n') : plainText(value.children);
      const language = normalizeBackyCodeLanguage(value.lang ?? value.language ?? 'text');
      return <pre style={{ overflowX: 'auto', whiteSpace: 'pre', background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6 }}><code data-language={language}>{lines.split('\n').map((line, lineIndex) => <React.Fragment key={`${key}-line-${lineIndex}`}>{lineIndex > 0 ? '\n' : ''}{tokenizeBackyCodeLine(line, language).map((token, index) => <span key={`${key}-token-${lineIndex}-${index}`} data-backy-code-token={token.type} style={token.type === 'plain' ? undefined : { color: BACKY_CODE_HIGHLIGHT_THEMES.dark[token.type] }}>{token.text}</span>)}</React.Fragment>)}</code></pre>;
    }
    if (type === 'table') {
      const hasSections = Array.isArray(value.children) && value.children.some((child) => record(child) && ['thead', 'tbody', 'tfoot'].includes(string(child.type)));
      return <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>{plainText(value.caption) ? <caption>{plainText(value.caption)}</caption> : null}{hasSections ? children() : <tbody>{children()}</tbody>}</table></div>;
    }
    if (type === 'td' || type === 'th') {
      const span = (input: unknown) => typeof input === 'number' && Number.isInteger(input) && input > 0 && input <= 100 ? input : undefined;
      return React.createElement(type, { colSpan: span(value.colSpan ?? value.colspan), rowSpan: span(value.rowSpan ?? value.rowspan), style: { ...styleFor(value), border: '1px solid #cbd5e1', padding: 8 } }, children());
    }
    const tags: Record<string, string> = { p: 'p', paragraph: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', ul: 'ul', ol: 'ol', li: 'li', item: 'li', blockquote: 'blockquote', quote: 'blockquote', tr: 'tr', thead: 'thead', tbody: 'tbody', tfoot: 'tfoot', code_line: 'div', code: 'code' };
    return React.createElement(tags[type] || 'div', { style: styleFor(value) }, children());
  };
  return <>{render(value, 'rich')}</>;
}
