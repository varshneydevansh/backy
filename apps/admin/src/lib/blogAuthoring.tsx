import type { Editor } from 'slate';
import { getInteractiveComponentRegistry } from '@/lib/adminContentApi';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BackyEditor, normalizeNestedRichTextLists, createToolbarFocusScheduler, insertRichArticleBlock, type PlateEditor, type BackyInteractiveRegistryEntry, type BackyInteractiveComponentRenderer } from '@backy-cms/editor';
import { loadBackyPublicDataFigureRecords } from '@backy-cms/core';
import { Button } from '@/components/ui/Button';
import { MediaLibraryModal, type MediaContext } from '@/components/editor/MediaLibraryModal';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import { getAdminApiBase } from '@/lib/adminContentApi';
import type { MediaAsset } from '@/stores/mockStore';
import type { CanvasElement } from '@/types/editor';
import { blogRichTextFingerprint, cloneBlogRichTextValue, preserveBlogRichTextIdentities } from './blogAuthoringSync';
import { watchBlogTitleSize } from './blogAuthoringTitleSize';
import { blogMediaSelection, isBlogMediaSessionCurrent, type BlogMediaKind, type BlogMediaSelection, type BlogMediaSession } from './blogAuthoringMedia';
import { loadBlogDataFigureCollections, type BlogDataFigureCollection } from './blogAuthoringDataFigure';
import { authoringInteractiveEntries, blogInteractiveMeasurementKey } from './blogAuthoringInteractive';
import { BlogInteractivePreview } from './BlogInteractivePreview';
import './blogAuthoring.css';

import { blogWritingPlainText, getEffectiveBlogWritingTarget, getBlogWritingTargets, getBlogWritingValue, isBlogHtmlContent, updateBlogWritingTarget, insertBlogWritingBody, type BlogWritingBreakpoint, type BlogWritingMeasurements } from './blogAuthoringModel';

const writingBreakpoints: BlogWritingBreakpoint[] = ['desktop', 'tablet', 'mobile'];
const contentFingerprint = (value: any[]) => blogRichTextFingerprint(normalizeNestedRichTextLists(value));
const textPresentationStyle = (element: CanvasElement): CSSProperties => ({
  fontFamily: element.props.fontFamily ?? element.styles?.fontFamily ?? 'inherit',
  fontSize: element.props.fontSize ?? element.styles?.fontSize ?? 16,
  lineHeight: element.props.lineHeight ?? element.styles?.lineHeight,
  fontWeight: element.props.fontWeight ?? element.styles?.fontWeight ?? 'normal',
  fontStyle: element.props.fontStyle ?? element.styles?.fontStyle,
  letterSpacing: element.props.letterSpacing ?? element.styles?.letterSpacing,
  wordSpacing: element.props.wordSpacing ?? element.styles?.wordSpacing,
  textIndent: element.props.textIndent ?? element.styles?.textIndent,
  textAlign: element.props.textAlign ?? element.styles?.textAlign,
  textTransform: element.props.textTransform ?? element.styles?.textTransform,
  color: element.props.color ?? element.styles?.color,
});

type BlogFigureLoader = (collectionId: string, options: { signal: AbortSignal; requestedFields?: string[] }) => Promise<unknown[]>;
function BlogTextMeasurement({ element, breakpoint, epoch, onMeasure, loadDataFigureRecords, renderInteractiveComponent }: { element: CanvasElement; breakpoint: BlogWritingBreakpoint; epoch: string; onMeasure: (breakpoint: BlogWritingBreakpoint, height: number, epoch: string) => void; loadDataFigureRecords?: BlogFigureLoader; renderInteractiveComponent?: BackyInteractiveComponentRenderer }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<PlateEditor | null>(null);
  const handleReady = useCallback((editor: PlateEditor) => { editorRef.current = editor; }, []);
  const value = getBlogWritingValue(element);
  const fingerprint = contentFingerprint(value);
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && contentFingerprint(editor.children) !== fingerprint) editor.tf.setValue(cloneBlogRichTextValue(value));
  }, [fingerprint]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    let active = true;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!active || !host.getClientRects().length) return;
        onMeasure(breakpoint, Math.ceil(Math.max(host.scrollHeight, host.getBoundingClientRect().height)), epoch);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    host.addEventListener('load', measure, true);
    host.addEventListener('error', measure, true);
    document.fonts?.addEventListener('loadingdone', measure);
    document.fonts?.ready.then(() => { if (active) measure(); });
    measure();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('load', measure, true);
      host.removeEventListener('error', measure, true);
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, [breakpoint, element.width, epoch, fingerprint, onMeasure]);

  return <div ref={hostRef} aria-hidden="true" data-testid={`blog-writing-measure-${breakpoint}`} style={{
    ...textPresentationStyle(element), position: 'fixed', left: -100000, top: 0, width: element.width,
    height: 'auto', display: 'flow-root', visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box',
    padding: element.props.padding ?? element.styles?.padding,
  }}><BackyEditor value={value} readOnly onEditorReady={handleReady} loadDataFigureRecords={loadDataFigureRecords} renderInteractiveComponent={renderInteractiveComponent} /></div>;
}

export interface BlogArticleWriterProps {
  elements: CanvasElement[];
  disabled: boolean;
  active: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  onChange: (elements: CanvasElement[]) => void;
  mediaContext?: MediaContext;
  canViewMedia: boolean;
  canCreateMedia: boolean;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
}

export function BlogArticleWriter({ elements, disabled, active, title, onTitleChange, onChange, mediaContext, canViewMedia, canCreateMedia, mediaViewDisabledReason, mediaCreateDisabledReason }: BlogArticleWriterProps) {
  const siteId = mediaContext?.siteId || '';
  const publicApiBase = getAdminApiBase().replace(/\/api\/admin$/, '/api');
  const [dataFigureCollections, setDataFigureCollections] = useState<BlogDataFigureCollection[]>([]);
  const [dataFigureNotice, setDataFigureNotice] = useState('');
  useEffect(() => {
    setDataFigureCollections([]);
    setDataFigureNotice('');
    if (!siteId) return;
    const controller = new AbortController();
    void loadBlogDataFigureCollections(publicApiBase, siteId, controller.signal).then((choices) => {
      if (!controller.signal.aborted) setDataFigureCollections(choices);
    }).catch(() => {
      if (!controller.signal.aborted) setDataFigureNotice('Published collection choices are unavailable. Inline figure data remains available.');
    });
    return () => controller.abort();
  }, [publicApiBase, siteId]);
  const loadFigureRecords = useCallback<BlogFigureLoader>((collectionId, { signal, requestedFields }) => {
    if (!siteId) return Promise.reject(new Error('Select a site before loading figure data.'));
    return loadBackyPublicDataFigureRecords({ apiBaseUrl: publicApiBase, siteId, collectionId, signal, requestedFields });
  }, [publicApiBase, siteId]);
  const interactiveApiBase = import.meta.env.VITE_BACKY_PUBLIC_API_BASE_URL || publicApiBase;
  const [interactiveComponents, setInteractiveComponents] = useState<BackyInteractiveRegistryEntry[]>([]);
  const [interactiveComponentsLoading, setInteractiveComponentsLoading] = useState(false);
  const [interactiveComponentsError, setInteractiveComponentsError] = useState('');
  const [interactiveEpoch, setInteractiveEpoch] = useState(0);
  const reloadInteractiveComponents = useCallback(() => setInteractiveEpoch((current) => current + 1), []);
  useEffect(() => {
    setInteractiveComponents([]); setInteractiveComponentsError('');
    if (!siteId) { setInteractiveComponentsLoading(false); setInteractiveComponentsError('Select a site before choosing an article component.'); return; }
    const controller = new AbortController(); setInteractiveComponentsLoading(true);
    void getInteractiveComponentRegistry(siteId, controller.signal).then(authoringInteractiveEntries).then((entries) => { if (!controller.signal.aborted) setInteractiveComponents(entries); }).catch(() => { if (!controller.signal.aborted) setInteractiveComponentsError('Site components could not load. Try again.'); }).finally(() => { if (!controller.signal.aborted) setInteractiveComponentsLoading(false); });
    return () => controller.abort();
  }, [interactiveApiBase, siteId, interactiveEpoch]);
  const [interactiveHeights, setInteractiveHeights] = useState<Record<string, number>>({});
  const reportInteractiveHeight = useCallback((key: string, height: number) => { setInteractiveHeights((current) => current[key] === height ? current : { ...current, [key]: height }); }, []);
  const renderInteractiveComponent = useCallback<BackyInteractiveComponentRenderer>((node) => <BlogInteractivePreview node={node} entries={interactiveComponents} apiBaseUrl={interactiveApiBase} siteId={siteId} loading={interactiveComponentsLoading} error={interactiveComponentsError} onHeightChange={(height) => reportInteractiveHeight(blogInteractiveMeasurementKey(node), height)} />, [reportInteractiveHeight, interactiveApiBase, siteId, interactiveComponents, interactiveComponentsLoading, interactiveComponentsError]);
  const renderInteractiveMeasurement = useCallback<BackyInteractiveComponentRenderer>((node) => <BlogInteractivePreview node={node} entries={interactiveComponents} apiBaseUrl={interactiveApiBase} siteId={siteId} measurement measuredHeight={interactiveHeights[blogInteractiveMeasurementKey(node)]} />, [interactiveApiBase, siteId, interactiveComponents, interactiveHeights]);
  const targets = useMemo(() => getBlogWritingTargets(elements), [elements]);
  const hasHtmlBlocks = useMemo(() => {
    const containsHtml = (nodes: CanvasElement[]): boolean => nodes.some((element) => isBlogHtmlContent(element.props.content) || !!element.children && containsHtml(element.children));
    return containsHtml(elements);
  }, [elements]);
  const [selectedId, setSelectedId] = useState('');
  const target = targets.find((element) => element.id === selectedId) || targets[0];
  const [mediaKind, setMediaKind] = useState<BlogMediaKind | null>(null);
  const [mediaNotice, setMediaNotice] = useState('');
  const mediaSessionRef = useRef<BlogMediaSession>({ siteId: '', targetId: '', scopeTargetId: '', active: false, disabled: true, canView: false });
  mediaSessionRef.current = { siteId: mediaContext?.siteId || '', targetId: target?.id || '', scopeTargetId: mediaContext?.targetId || '', active, disabled, canView: canViewMedia };
  const pendingMediaRef = useRef<{ kind: BlogMediaKind; session: BlogMediaSession; resolve: (selection: BlogMediaSelection | null) => void } | null>(null);
  const cancelMediaRequest = useCallback(() => {
    pendingMediaRef.current?.resolve(null);
    pendingMediaRef.current = null;
  }, []);
  const closeMediaLibrary = useCallback(() => {
    cancelMediaRequest();
    setMediaKind(null);
  }, [cancelMediaRequest]);
  useEffect(() => () => cancelMediaRequest(), [cancelMediaRequest]);
  useEffect(() => {
    if (pendingMediaRef.current && !isBlogMediaSessionCurrent(pendingMediaRef.current.session, mediaSessionRef.current)) closeMediaLibrary();
  }, [active, disabled, target?.id, mediaContext?.siteId, mediaContext?.targetId, canViewMedia, closeMediaLibrary]);
  const requestMedia = useCallback((kind: BlogMediaKind): Promise<BlogMediaSelection | null> => {
    const session = { ...mediaSessionRef.current };
    if (!isBlogMediaSessionCurrent(session, session)) {
      setMediaNotice(!session.canView ? mediaViewDisabledReason || 'You do not have permission to view media.' : !session.siteId ? 'Select a site before choosing article media.' : 'Resume writing before inserting media.');
      return Promise.resolve(null);
    }
    cancelMediaRequest();
    setMediaNotice('');
    setMediaKind(kind);
    return new Promise((resolve) => { pendingMediaRef.current = { kind, session, resolve }; });
  }, [cancelMediaRequest, mediaViewDisabledReason]);
  const selectMedia = useCallback((media: MediaAsset) => {
    const pending = pendingMediaRef.current;
    if (!pending || !isBlogMediaSessionCurrent(pending.session, mediaSessionRef.current)) { closeMediaLibrary(); return; }
    const selected = blogMediaSelection(media, pending.kind, pending.session.siteId, getPublicMediaFileUrl);
    if (!selected) { setMediaNotice('Choose a public asset of the requested media type.'); closeMediaLibrary(); return; }
    pendingMediaRef.current = null;
    pending.resolve(selected);
    setMediaKind(null);
  }, [closeMediaLibrary]);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<PlateEditor | null>(null);
  const focusScheduler = useMemo(() => createToolbarFocusScheduler({ request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id) }), []);
  useEffect(() => () => focusScheduler.cancel(), [focusScheduler, active, disabled, target?.id]);
  const acknowledgedFingerprintRef = useRef('');
  const lastWrittenTargetRef = useRef<string | null>(null);
  const handleEditorReady = useCallback((editor: PlateEditor) => {
    editorRef.current = editor;
    acknowledgedFingerprintRef.current = contentFingerprint(editor.children);
  }, []);
  const measurementsRef = useRef<{ epoch: string; heights: BlogWritingMeasurements }>({ epoch: '', heights: {} });
  const value = target ? getBlogWritingValue(target) : [];
  const fingerprint = contentFingerprint(value);
  const measurementEpoch = target ? JSON.stringify([target.id, target.width, target.props, target.styles, target.responsive]) : '';

  // Plate takes an initial value. Synchronize Layout changes without replacing the engine on keystrokes.
  useEffect(() => {
    if (!active || !editorRef.current || !target) return;
    const editor = editorRef.current;
    if (contentFingerprint(editor.children) !== fingerprint) {
      editor.tf.setValue(cloneBlogRichTextValue(value));
    }
    acknowledgedFingerprintRef.current = contentFingerprint(editor.children);
  }, [active, fingerprint, target?.id]);

  const write = useCallback((content: any[]) => {
    if (!target || disabled || !active || !editorRef.current) return;
    const nextFingerprint = contentFingerprint(content);
    if (nextFingerprint === acknowledgedFingerprintRef.current || nextFingerprint === contentFingerprint(getBlogWritingValue(target))) return;
    acknowledgedFingerprintRef.current = nextFingerprint;
    lastWrittenTargetRef.current = target.id;
    onChange(updateBlogWritingTarget(elements, target.id, preserveBlogRichTextIdentities(getBlogWritingValue(target), content)));
  }, [active, disabled, elements, onChange, target]);

  const handleMeasurement = useCallback((breakpoint: BlogWritingBreakpoint, height: number, epoch: string) => {
    if (!active || disabled || !target || lastWrittenTargetRef.current !== target.id || epoch !== measurementEpoch) return;
    if (measurementsRef.current.epoch !== epoch) measurementsRef.current = { epoch, heights: {} };
    measurementsRef.current.heights[breakpoint] = height;
    if (!writingBreakpoints.every((key) => typeof measurementsRef.current.heights[key] === 'number')) return;
    const next = updateBlogWritingTarget(elements, target.id, getBlogWritingValue(target), measurementsRef.current.heights);
    if (next !== elements) onChange(next);
  }, [active, disabled, elements, measurementEpoch, onChange, target]);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = titleRef.current;
    if (!input) return;
    return watchBlogTitleSize(input);
  }, [title, active]);

  const documentWords = targets.reduce((count, element) => count + blogWritingPlainText(element.props.content).trim().split(/\s+/).filter(Boolean).length, 0);
  const outline = value.flatMap((node, index) => /^h[1-6]$/.test(node.type) ? [{ index, level: Number(node.type.slice(1)), label: blogWritingPlainText(node).trim() || 'Untitled heading' }] : []);
  const targetLabel = (element: CanvasElement, index: number) => element.name || (/lede|body|transcript/.test(element.id) ? 'Article body' : element.type === 'quote' ? 'Pull quote' : `Text block ${index + 1}`);
  const insertTextBlock = (type: 'p' | 'h2' | 'blockquote' | 'code_block') => {
    const editor = editorRef.current;
    if (!editor || disabled || !active) return;
    insertRichArticleBlock(editor as unknown as Editor, type === 'code_block'
      ? { type, lang: 'text', children: [{ type: 'code_line', children: [{ text: '' }] }] }
      : { type, children: [{ text: '' }] });
    focusScheduler.schedule(editor as unknown as Editor, () => { if (editorRef.current === editor) editorHostRef.current?.querySelector<HTMLElement>('[data-slate-editor="true"]')?.focus({ preventScroll: true }); });
  };
  const jumpToHeading = (index: number) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.tf.select(editor.api.start([index]));
    focusScheduler.schedule(editor as unknown as Editor, () => { if (editorRef.current === editor) editorHostRef.current?.querySelector<HTMLElement>('[data-slate-editor="true"]')?.focus({ preventScroll: true }); });
  };
  const insertBody = () => {
    const next = insertBlogWritingBody(elements);
    setSelectedId(next[next.length - 1].id);
    onChange(next);
  };

  return (
    <div className="blog-writer" data-testid="blog-article-writer" data-target-element-id={target?.id}>
      <aside className="blog-writer-rail" aria-label="Article structure">
        <div className="blog-writer-rail-heading"><span>Document</span><span className="blog-writer-number">{String(targets.length).padStart(2, '0')}</span></div>
        <nav className="blog-writer-blocks" aria-label="Article blocks">
          {targets.map((element, index) => <button type="button" key={element.id} className="blog-writer-block" aria-current={element.id === target?.id ? 'true' : undefined} disabled={disabled} onClick={() => setSelectedId(element.id)}>
            <span className="blog-writer-block-number">{String(index + 1).padStart(2, '0')}</span>
            <span><span className="blog-writer-block-name">{targetLabel(element, index)}</span><span className="blog-writer-block-preview">{blogWritingPlainText(element.props.content).slice(0, 70) || 'Start writing here'}</span></span>
          </button>)}
        </nav>
        {!!target && <>
          <div className="blog-writer-rail-heading blog-writer-rail-divider">Add to article</div>
          <div className="blog-writer-insert" aria-label="Insert article block">
            <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insertTextBlock('p')}><span aria-hidden="true">P</span>Paragraph</button>
            <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insertTextBlock('h2')}><span aria-hidden="true">H2</span>Heading</button>
            <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insertTextBlock('blockquote')}><span aria-hidden="true">“</span>Quote</button>
            <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => insertTextBlock('code_block')}><span aria-hidden="true">&lt;/&gt;</span>Code</button>
          </div>
          <div className="blog-writer-rail-heading blog-writer-rail-divider">Outline</div>
          {outline.length ? <nav className="blog-writer-outline" aria-label="Article headings">{outline.map((heading) => <button type="button" key={heading.index} disabled={disabled} onClick={() => jumpToHeading(heading.index)} style={{ paddingLeft: 12 + Math.max(0, heading.level - 2) * 10 }}>{heading.label}</button>)}</nav> : <p className="blog-writer-rail-note">Headings you add appear here. Select one to continue writing there.</p>}
        </>}
        <div className="blog-writer-rail-footer"><span className="blog-writer-number">{documentWords.toLocaleString()}</span> words <span aria-hidden="true">·</span> {Math.max(1, Math.ceil(documentWords / 200))} min read</div>
      </aside>
      <div className="blog-writer-main">
        <div className="blog-writer-context"><span className="blog-writer-context-label">Article</span><span>{disabled ? 'Read only' : 'Writing workspace'}</span><details className="blog-writer-help"><summary>Writing tips</summary><p>Use the toolbar to format text and insert blocks. Markdown typing shortcuts support # headings, **bold**, - lists, &gt; quotes, and `inline code`. Use Layout for page composition and site chrome.</p></details></div>
        <div className="blog-writer-mobile-selector">
          <label htmlFor="blog-writing-target">Article block</label>
          <select id="blog-writing-target" value={target?.id || ''} disabled={disabled || !targets.length} onChange={(event) => setSelectedId(event.target.value)} data-testid="blog-writing-target">{targets.map((element, index) => <option key={element.id} value={element.id}>{targetLabel(element, index)}</option>)}</select>
        </div>
        <article className="blog-writer-document" aria-label="Article document">
          <label htmlFor="blog-writing-title" className="blog-writer-title-label">Post title</label>
          <textarea ref={titleRef} id="blog-writing-title" rows={1} className="blog-writer-title" value={title} disabled={disabled} onChange={(event) => onTitleChange(event.target.value)} placeholder="Untitled article" data-testid="blog-writing-title" />
          <div className="blog-writer-document-rule" />
          {hasHtmlBlocks && <p className="blog-writer-source-note">Some saved blocks contain HTML. Edit those in Layout; their source is preserved.</p>}
          {mediaNotice && <p className="blog-writer-source-note" role="alert">{mediaNotice}</p>}
          {dataFigureNotice && <p className="blog-writer-source-note" role="status">{dataFigureNotice}</p>}
          {!target ? <div className="blog-writer-empty"><span className="blog-writer-empty-label">Your next draft starts here</span><h2>Give your ideas some room.</h2><p>This layout has no unlocked article text. Add a body and start with a sentence.</p><Button type="button" disabled={disabled} onClick={insertBody}>Insert article body</Button></div> : <>
            <div className="blog-writer-body-label"><span>{targetLabel(target, targets.indexOf(target))}</span><span>Text and rich blocks</span></div>
            <div ref={editorHostRef} className="blog-writer-editor" style={textPresentationStyle(target)}>
              <BackyEditor key={target.id} value={value} onChange={write} onEditorReady={handleEditorReady} onRequestMedia={requestMedia} interactiveComponents={interactiveComponents} interactiveComponentsLoading={interactiveComponentsLoading} interactiveComponentsError={interactiveComponentsError} onReloadInteractiveComponents={reloadInteractiveComponents} renderInteractiveComponent={renderInteractiveComponent} dataFigureCollections={dataFigureCollections} loadDataFigureRecords={loadFigureRecords} readOnly={disabled} showToolbar placeholder="Write your article…" />
            </div>
            {active && !disabled && lastWrittenTargetRef.current === target.id && writingBreakpoints.map((breakpoint) => <BlogTextMeasurement key={`${target.id}-${breakpoint}`} element={getEffectiveBlogWritingTarget(target, breakpoint)} breakpoint={breakpoint} epoch={measurementEpoch} onMeasure={handleMeasurement} loadDataFigureRecords={loadFigureRecords} renderInteractiveComponent={renderInteractiveMeasurement} />)}
          </>}
        </article>
      </div>
      <MediaLibraryModal isOpen={mediaKind !== null} onClose={closeMediaLibrary} onSelect={selectMedia} allowedTypes={mediaKind || 'image'} initialUploadFilter={mediaKind || 'image'} initialScopeFilter="all" showCanvasInsertionControls={false} mediaContext={mediaContext} canView={canViewMedia} canCreate={canCreateMedia} viewDisabledReason={mediaViewDisabledReason} createDisabledReason={mediaCreateDisabledReason} allowPrivateSelection={false} />
    </div>
  );
}
