/** Measure only authored content at the Canvas block's width. This runs on explicit Fit. */
export function measureRichTextWorkspaceContent(host: HTMLElement, authoredWidth: number): number | null {
 const content = host.querySelector<HTMLElement>('[data-slate-editor="true"]');
 if (!content || !Number.isFinite(authoredWidth) || authoredWidth <= 0) return null;
 const document = host.ownerDocument, view = document.defaultView;
 if (!view) return null;
 const style = view.getComputedStyle(host);
 const clone = content.cloneNode(true) as HTMLElement;
 clone.removeAttribute('contenteditable'); clone.setAttribute('aria-hidden', 'true');
 clone.querySelectorAll('[data-backy-authoring-controls]').forEach((control) => control.remove());
 // Read-only widget chrome excludes editor configuration and registry identity.
 clone.querySelectorAll('[data-backy-rich-interactive-component]').forEach((figure) => figure.querySelector(':scope > details')?.remove());
 clone.querySelectorAll('iframe').forEach((frame) => { const placeholder = document.createElement('div'); placeholder.style.height = `${frame.getBoundingClientRect().height || Number.parseFloat(frame.style.height) || Number(frame.getAttribute('height')) || 300}px`; frame.replaceWith(placeholder); });
 clone.querySelectorAll('video, audio').forEach((media) => { media.removeAttribute('autoplay'); media.setAttribute('preload', 'none'); });
 Object.assign(clone.style, { position: 'fixed', left: '-100000px', top: '0', width: `${authoredWidth}px`, height: 'auto', minHeight: '0', maxHeight: 'none', overflow: 'visible', visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box', fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textAlign: style.textAlign, textIndent: style.textIndent, textTransform: style.textTransform, wordSpacing: style.wordSpacing, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing });
 document.body.appendChild(clone);
 try { const height = Math.ceil(Math.max(clone.scrollHeight, clone.getBoundingClientRect().height) + 8); return Number.isFinite(height) && height > 8 ? height : null; } finally { clone.remove(); }
}
