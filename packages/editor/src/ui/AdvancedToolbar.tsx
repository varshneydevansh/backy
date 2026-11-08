import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InteractiveComponentChooser } from '../InteractiveComponentBlock';
import type { BackyInteractiveRegistryEntry } from '../interactiveComponent';
import { createPortal } from 'react-dom';
import { getToolbarMenuFocusIndex, useToolbarPopoverPosition } from './toolbarPopover';
import { useEditorRef, useEditorSelection, useEditorSelector } from '@udecode/plate/react';
import {
    Bold, Italic, Underline, Strikethrough, Code, Link, List, ListOrdered, Image,
    Undo, Redo, AlignLeft, AlignCenter, AlignRight, Table, ChevronDown,
    Palette, Highlighter, Video, Plus, MoreHorizontal, Quote, RemoveFormatting, X, LineChart, BarChart3,
} from 'lucide-react';
import { cn } from '../utils';
import { Editor, Transforms, Element as SlateElement, Range } from 'slate';
import { ColorPicker } from './ColorPicker';
import { FontDropdown } from './FontDropdown';
import { insertRichCodeBlock, insertRichCollapsible, insertRichMediaEmbed, insertRichDataFigure, insertRichInteractiveComponent } from './richBlockTransforms';
import {
    captureToolbarSelection, restoreToolbarSelection, insertToolbarImage, createToolbarFocusScheduler,
    insertToolbarLink, insertToolbarTable,
} from './toolbarEditing';
import type { BackyMediaRequest } from './toolbarEditing';

type InsertMode = 'link' | 'image' | 'media';
const controlClass = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

const Btn = ({ onClick, children, active, title, disabled }: {
    onClick?: () => void; children: React.ReactNode; active?: boolean; title: string; disabled?: boolean;
}) => <button type="button" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onClick={onClick} disabled={disabled} className={cn(controlClass, active && 'bg-teal-50 text-teal-800')}
    title={title} aria-label={title} aria-pressed={active}>{children}</button>;

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return <div role="group" aria-label={label} className="flex min-w-0 max-w-full shrink-0 flex-col gap-1">
        <span className="px-1 text-[11px] font-medium leading-4 text-slate-500">{label}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">{children}</div>
    </div>;
}

type MenuAction = { label: string; icon: React.ReactNode; onSelect: () => void; active?: boolean; disabled?: boolean };
function ToolbarMenu({ label, icon, actions, onBeforeOpen, testId }: {
    label: string; icon: React.ReactNode; actions: MenuAction[]; onBeforeOpen: () => void; testId: string;
}) {
    const [open, setOpen] = useState(false);
    const hostRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const keyboardOpenRef = useRef(false);
    const popupStyle = useToolbarPopoverPosition(open, triggerRef, menuRef, 240, 448);
    useEffect(() => {
        if (!open) return;
        const focusFrame = keyboardOpenRef.current ? requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })) : null;
        const outside = (event: MouseEvent) => { if (!hostRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', outside);
        return () => { document.removeEventListener('mousedown', outside); if (focusFrame !== null) cancelAnimationFrame(focusFrame); };
    }, [open]);
    const close = (focusTrigger = false) => { setOpen(false); if (focusTrigger) triggerRef.current?.focus(); };
    return <div ref={hostRef} className="relative">
        <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${label} menu`}
            data-testid={testId} onMouseDown={(event) => { event.preventDefault(); onBeforeOpen(); }}
            onClick={(event) => { onBeforeOpen(); keyboardOpenRef.current = event.detail === 0; setOpen((value) => !value); }}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); onBeforeOpen(); keyboardOpenRef.current = true; setOpen(true); }
                if (event.key === 'Escape') close();
            }} className={cn(controlClass, 'gap-1.5 px-2.5', label === 'Insert' && 'bg-teal-700 text-white hover:bg-teal-800 hover:text-white')}>
            {icon}{label === 'Insert' && <span className="font-semibold">Insert</span>}<ChevronDown className="h-3.5 w-3.5" />
        </button>
        {open && typeof document !== 'undefined' && createPortal(<div ref={menuRef} role="menu" aria-label={label} data-testid={`${testId}-menu`}
            className="ignore-click-outside/toolbar rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
            style={popupStyle}
            onKeyDown={(event) => {
                const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = getToolbarMenuFocusIndex(event.key, index, buttons.length);
                if (next !== null) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
            }}>
            {actions.map((action) => <button key={action.label} type="button" role={action.active === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={action.active} disabled={action.disabled} onMouseDown={(event) => event.preventDefault()}
                onClick={() => { action.onSelect(); close(); }} className={cn(controlClass, 'w-full justify-start gap-3 px-3 text-left', action.active && 'bg-teal-50 text-teal-800')} style={{ minHeight: 44, width: '100%', display: 'flex', gap: 12 }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex' }}>{action.icon}</span><span style={{ whiteSpace: 'nowrap' }}>{action.label}</span>
            </button>)}
        </div>, document.body)}
    </div>;
}

const isMarkActive = (editor: Editor, format: string) => Boolean((Editor.marks(editor) as Record<string, unknown> | null)?.[format]);
const toggleMark = (editor: Editor, format: string) => {
    if (isMarkActive(editor, format)) Editor.removeMark(editor, format);
    else Editor.addMark(editor, format, true);
};
const markValue = (editor: Editor, format: string): string | undefined => {
    const value = (Editor.marks(editor) as Record<string, unknown> | null)?.[format];
    return typeof value === 'string' ? value : undefined;
};
const setMarkValue = (editor: Editor, format: string, value: string) => {
    const nextValue = value.trim();
    if (!nextValue) { Editor.removeMark(editor, format); return; }
    Editor.addMark(editor, format, nextValue);
};
const toggleBlock = (editor: Editor, format: string) => {
    const isList = ['ul', 'ol'].includes(format);
    Editor.withoutNormalizing(editor, () => {
        Transforms.unwrapNodes(editor, { match: (node) => SlateElement.isElement(node) && ['ul', 'ol'].includes((node as any).type), split: true });
        Transforms.setNodes(editor, { type: isList ? 'li' : format } as any, { match: (node) => SlateElement.isElement(node) && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'].includes((node as any).type) });
        if (isList) Transforms.wrapNodes(editor, { type: format, children: [] } as any, { match: (node) => SlateElement.isElement(node) && (node as any).type === 'li' });
    });
};

export const AdvancedToolbar = ({ className, onRequestMedia, interactiveComponents = [], interactiveComponentsLoading, interactiveComponentsError, onReloadInteractiveComponents, onFocusEditor }: { className?: string; onRequestMedia?: BackyMediaRequest; interactiveComponents?: BackyInteractiveRegistryEntry[]; interactiveComponentsLoading?: boolean; interactiveComponentsError?: string; onReloadInteractiveComponents?: () => void; onFocusEditor?: () => void }) => {
    const editor = useEditorRef() as any;
    const focusScheduler = useMemo(() => createToolbarFocusScheduler({ request: (callback) => typeof window === 'undefined' ? 0 : window.requestAnimationFrame(callback), cancel: (id) => { if (typeof window !== 'undefined') window.cancelAnimationFrame(id); } }), []);
    useEffect(() => () => focusScheduler.cancel(), [focusScheduler, editor]);
    const focusEditor = () => focusScheduler.schedule(editor, onFocusEditor || (() => editor.tf?.focus?.()));
    const selection = useEditorSelection() as Range | null;
    const formatting = useEditorSelector((currentEditor) => {
        const marks = Editor.marks(currentEditor as unknown as Editor) as Record<string, unknown> | null;
        const block = currentEditor.selection ? Editor.above(currentEditor as unknown as Editor, { match: (node) => SlateElement.isElement(node) && Editor.isBlock(currentEditor as unknown as Editor, node), mode: 'lowest' })?.[0] as any : undefined;
        return JSON.stringify({ marks: marks || {}, type: block?.type || 'p', align: block?.align || 'left' });
    }, []);
    const state = JSON.parse(formatting) as { marks: Record<string, unknown>; type: string; align: string };
    const [interactiveOpen, setInteractiveOpen] = useState(false);
    const componentSelectionRef = useRef<ReturnType<typeof Editor.rangeRef> | null>(null);
    useEffect(() => () => { componentSelectionRef.current?.unref(); }, [editor]);
    const [insertMode, setInsertMode] = useState<InsertMode | null>(null);
    const [insertUrl, setInsertUrl] = useState('');
    const [message, setMessage] = useState('');
    const [mediaPending, setMediaPending] = useState(false);
    const mediaRequestGeneration = useRef(0);
    const mediaRequestInFlight = useRef<number | null>(null);
    const mediaRequestCounter = useRef(0);
    useEffect(() => { mediaRequestGeneration.current += 1; mediaRequestInFlight.current = null; setMediaPending(false); return () => { mediaRequestGeneration.current += 1; }; }, [onRequestMedia]);
    const [sizeDraft, setSizeDraft] = useState('');
    const savedSelectionRef = useRef<Range | null>(null);
    const sizeRef = useRef<HTMLInputElement>(null);
    const urlRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (selection) savedSelectionRef.current = captureToolbarSelection(editor); }, [editor, selection]);
    useEffect(() => {
        if (typeof document === 'undefined' || document.activeElement !== sizeRef.current) setSizeDraft(typeof state.marks.fontSize === 'string' ? state.marks.fontSize.replace(/px$/, '') : '');
    }, [state.marks.fontSize]);
    useEffect(() => { if (insertMode) urlRef.current?.focus(); }, [insertMode]);
    if (!editor) return null;

    const captureSelection = () => { const captured = captureToolbarSelection(editor); if (captured) savedSelectionRef.current = captured; };
    const runAction = (action: () => void, options: { focus?: boolean; allowAppend?: boolean } = {}) => {
        if (!restoreToolbarSelection(editor, savedSelectionRef.current) && !options.allowAppend) {
            setMessage('Place the cursor in your article or select text first.'); return false;
        }
        action(); captureSelection(); setMessage('');
        if (options.focus !== false) focusEditor();
        return true;
    };
    const closeComponentChooser = () => { componentSelectionRef.current?.unref(); componentSelectionRef.current = null; setInteractiveOpen(false); };
    const openComponentChooser = () => {
        captureSelection(); componentSelectionRef.current?.unref();
        const captured = savedSelectionRef.current;
        componentSelectionRef.current = captured && restoreToolbarSelection(editor, captured) ? Editor.rangeRef(editor, captured, { affinity: 'forward' }) : null;
        setInsertMode(null); setInteractiveOpen(true); setMessage('');
    };
    const chooseComponent = (component: BackyInteractiveRegistryEntry) => {
        const tracked = componentSelectionRef.current;
        if (tracked && !restoreToolbarSelection(editor, tracked.current)) { setMessage('The insertion position changed. Place the cursor and choose the component again.'); closeComponentChooser(); return; }
        try { insertRichInteractiveComponent(editor, component); closeComponentChooser(); captureSelection(); setMessage(''); focusEditor(); } catch { setMessage('Choose an active registered component.'); }
    };
    const closeInsertForm = () => { setInsertMode(null); setInsertUrl(''); setMessage(''); };
    const openInsertForm = (mode: InsertMode) => { closeComponentChooser(); captureSelection(); setInsertMode(mode); setInsertUrl(''); setMessage(''); };
    const submitInsertForm = () => {
        let inserted = false;
        runAction(() => {
            inserted = insertMode === 'link' ? insertToolbarLink(editor, insertUrl) : insertMode === 'image' ? insertToolbarImage(editor, insertUrl) : insertMode === 'media' ? insertRichMediaEmbed(editor, insertUrl) : false;
        }, { focus: false, allowAppend: insertMode !== 'link' });
        if (inserted) { closeInsertForm(); focusEditor(); }
        else setMessage('Enter a supported URL. Use http or https for media, or a page path for links.');
    };
    const requestMedia = async (kind: 'image' | 'video') => {
        if (!onRequestMedia) { openInsertForm(kind === 'image' ? 'image' : 'media'); return; }
        if (mediaRequestInFlight.current) return;
        captureSelection();
        const captured = savedSelectionRef.current;
        const selectionRef = captured && restoreToolbarSelection(editor, captured) ? Editor.rangeRef(editor, captured, { affinity: 'forward' }) : null;
        const generation = mediaRequestGeneration.current;
        const requestId = ++mediaRequestCounter.current;
        mediaRequestInFlight.current = requestId; setMediaPending(true); setMessage('');
        try {
            const selected = await onRequestMedia(kind);
            if (generation !== mediaRequestGeneration.current || !selected) return;
            const currentSelection = selectionRef?.current;
            if (selectionRef && !restoreToolbarSelection(editor, currentSelection || null)) {
                setMessage('The insertion position changed. Place the cursor and choose the media again.'); return;
            }
            const inserted = kind === 'image' ? insertToolbarImage(editor, selected.url, selected) : insertRichMediaEmbed(editor, selected.url, selected);
            if (!inserted) { setMessage('This media source is not supported. Choose another file.'); return; }
            captureSelection(); focusEditor();
        } catch {
            if (generation === mediaRequestGeneration.current) setMessage('Could not open the media library. Try again.');
        } finally {
            selectionRef?.unref();
            if (mediaRequestInFlight.current === requestId) { mediaRequestInFlight.current = null; if (generation === mediaRequestGeneration.current) setMediaPending(false); }
        }
    };
    const commitSize = (focus = false) => {
        const size = Number(sizeDraft);
        if (sizeDraft.trim() && (!Number.isFinite(size) || size < 8 || size > 200)) { setMessage('Font size must be between 8 and 200 pixels.'); return; }
        runAction(() => setMarkValue(editor, 'fontSize', sizeDraft.trim() ? `${size}px` : ''), { focus });
    };
    const iconClass = 'h-4 w-4 shrink-0';
    const moreActions: MenuAction[] = [
        { label: 'Strikethrough', icon: <Strikethrough className={iconClass} />, active: Boolean(state.marks.strikethrough), onSelect: () => runAction(() => toggleMark(editor, 'strikethrough')) },
        { label: 'Inline code', icon: <Code className={iconClass} />, active: Boolean(state.marks.code), onSelect: () => runAction(() => toggleMark(editor, 'code')) },
        ...([['left', 'Align left', AlignLeft], ['center', 'Align center', AlignCenter], ['right', 'Align right', AlignRight]] as const).map(([align, label, Icon]) => ({ label, icon: <Icon className={iconClass} />, active: state.align === align, onSelect: () => runAction(() => Transforms.setNodes(editor, { align } as any, { match: (node) => SlateElement.isElement(node) && Editor.isBlock(editor, node) })) })),
        { label: 'Bulleted list', icon: <List className={iconClass} />, onSelect: () => runAction(() => toggleBlock(editor, 'ul')) },
        { label: 'Numbered list', icon: <ListOrdered className={iconClass} />, onSelect: () => runAction(() => toggleBlock(editor, 'ol')) },
        { label: 'Clear formatting', icon: <RemoveFormatting className={iconClass} />, onSelect: () => runAction(() => ['bold', 'italic', 'underline', 'strikethrough', 'code', 'color', 'backgroundColor', 'fontSize', 'fontFamily'].forEach((mark) => Editor.removeMark(editor, mark))) },
    ];
    const insertActions: MenuAction[] = [
        { label: 'Link', icon: <Link className={iconClass} />, onSelect: () => openInsertForm('link') },
        { label: 'Image', icon: <Image className={iconClass} />, disabled: mediaPending, onSelect: () => { void requestMedia('image'); } },
        { label: 'Video', icon: <Video className={iconClass} />, disabled: mediaPending, onSelect: () => { void requestMedia('video'); } },
        ...(onRequestMedia ? [
            { label: 'Image from URL', icon: <Link className={iconClass} />, onSelect: () => openInsertForm('image') },
            { label: 'Video from URL', icon: <Link className={iconClass} />, onSelect: () => openInsertForm('media') },
        ] : []),
        { label: 'Code block', icon: <Code className={iconClass} />, onSelect: () => runAction(() => insertRichCodeBlock(editor), { allowAppend: true }) },
        { label: 'Table', icon: <Table className={iconClass} />, onSelect: () => runAction(() => insertToolbarTable(editor), { allowAppend: true }) },
        { label: 'Data table', icon: <Table className={iconClass} />, onSelect: () => runAction(() => insertRichDataFigure(editor, 'backy.table.data'), { allowAppend: true }) },
        { label: 'Line chart', icon: <LineChart className={iconClass} />, onSelect: () => runAction(() => insertRichDataFigure(editor, 'backy.chart.line'), { allowAppend: true }) },
        { label: 'Bar chart', icon: <BarChart3 className={iconClass} />, onSelect: () => runAction(() => insertRichDataFigure(editor, 'backy.chart.bar'), { allowAppend: true }) },
        { label: 'Animated diagram', icon: <Code className={iconClass} />, onSelect: openComponentChooser },
        { label: 'Collapsible section', icon: <ChevronDown className={iconClass} />, onSelect: () => runAction(() => insertRichCollapsible(editor), { allowAppend: true }) },
        { label: 'Quote', icon: <Quote className={iconClass} />, onSelect: () => runAction(() => toggleBlock(editor, 'blockquote')) },
    ];
    return <div className={cn('ignore-click-outside/toolbar relative shrink-0 border-b border-slate-200 bg-white text-slate-700', className)}
        data-testid="backy-editor-document-toolbar" onMouseDownCapture={captureSelection}>
        <div role="toolbar" aria-label="Article formatting" className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 px-1 py-3">
            <ToolbarGroup label="History">
                <Btn onClick={() => runAction(() => editor.undo(), { allowAppend: true })} title="Undo" disabled={!editor.history?.undos?.length}><Undo className={iconClass} /></Btn>
                <Btn onClick={() => runAction(() => editor.redo(), { allowAppend: true })} title="Redo" disabled={!editor.history?.redos?.length}><Redo className={iconClass} /></Btn>
            </ToolbarGroup>
            <ToolbarGroup label="Text">
                <select aria-label="Text style" value={['p', 'h1', 'h2', 'h3', 'blockquote'].includes(state.type) ? state.type : 'p'}
                    onFocus={captureSelection} onChange={(event) => runAction(() => toggleBlock(editor, event.target.value))}
                    className={cn(controlClass, 'w-28 border border-slate-200 bg-white px-2')}>
                    <option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option>
                </select>
                <FontDropdown comfortable value={typeof state.marks.fontFamily === 'string' ? state.marks.fontFamily : 'inherit'} onBeforeOpen={captureSelection}
                    onChange={(font) => runAction(() => setMarkValue(editor, 'fontFamily', font === 'inherit' ? '' : font))} />
                <input ref={sizeRef} type="number" inputMode="decimal" min={8} max={200} step={1} value={sizeDraft} placeholder="Auto"
                    aria-label="Font size in pixels" title="Font size in pixels; blank uses the document size" onFocus={captureSelection}
                    onChange={(event) => setSizeDraft(event.target.value)} onBlur={() => commitSize()}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitSize(true); } }}
                    className={cn(controlClass, 'w-16 min-w-0 border border-slate-200 bg-white px-2 font-mono')} />
            </ToolbarGroup>
            <ToolbarGroup label="Format">
                <Btn active={Boolean(state.marks.bold)} onClick={() => runAction(() => toggleMark(editor, 'bold'))} title="Bold"><Bold className={iconClass} /></Btn>
                <Btn active={Boolean(state.marks.italic)} onClick={() => runAction(() => toggleMark(editor, 'italic'))} title="Italic"><Italic className={iconClass} /></Btn>
                <Btn active={Boolean(state.marks.underline)} onClick={() => runAction(() => toggleMark(editor, 'underline'))} title="Underline"><Underline className={iconClass} /></Btn>
                <ColorPicker comfortable value={markValue(editor, 'color')} onBeforeOpen={captureSelection} onChange={(color) => runAction(() => setMarkValue(editor, 'color', color), { focus: false })}
                    icon={<Palette className={iconClass} />} tooltip="Text Color" testId="backy-editor-advanced-text-color" />
                <ColorPicker comfortable value={markValue(editor, 'backgroundColor')} onBeforeOpen={captureSelection} onChange={(color) => runAction(() => setMarkValue(editor, 'backgroundColor', color), { focus: false })}
                    icon={<Highlighter className={iconClass} />} tooltip="Highlight" testId="backy-editor-advanced-highlight-color" />
                <ToolbarMenu label="More formatting" icon={<MoreHorizontal className={iconClass} />} actions={moreActions} onBeforeOpen={captureSelection} testId="backy-editor-advanced-more" />
            </ToolbarGroup>
            <ToolbarGroup label="Blocks">
                <ToolbarMenu label="Insert" icon={<Plus className={iconClass} />} actions={insertActions} onBeforeOpen={captureSelection} testId="backy-editor-advanced-insert" />
            </ToolbarGroup>
        </div>
        {interactiveOpen && <InteractiveComponentChooser entries={interactiveComponents} loading={interactiveComponentsLoading} error={interactiveComponentsError} onSelect={chooseComponent} onCancel={() => { closeComponentChooser(); focusEditor(); }} onReload={onReloadInteractiveComponents} />}
        {insertMode && <div role="group" aria-label="Insert source" className="border-t border-slate-200 bg-slate-50 px-3 py-3" data-testid={`backy-editor-advanced-${insertMode}-form`}
            onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); submitInsertForm(); } }}>
            <label className="mb-2 block text-xs font-medium text-slate-600" htmlFor={`backy-editor-${editor.id}-${insertMode}-url`}>{insertMode === 'link' ? 'Link destination' : insertMode === 'image' ? 'Image source' : 'Video source'}</label>
            <div className="flex min-w-0 flex-wrap gap-2">
                <input ref={urlRef} id={`backy-editor-${editor.id}-${insertMode}-url`} type="text" inputMode="url" value={insertUrl} onChange={(event) => { setInsertUrl(event.target.value); setMessage(''); }}
                    placeholder={insertMode === 'link' ? 'https://example.com or /page' : insertMode === 'media' ? 'Video file, YouTube, Vimeo, or Drive URL' : 'https://example.com/image.jpg'}
                    className="min-h-11 min-w-0 flex-1 basis-48 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                    data-testid={`backy-editor-advanced-${insertMode}-input`} aria-invalid={Boolean(message)} />
                <button type="button" onClick={submitInsertForm} className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" data-testid={`backy-editor-advanced-${insertMode}-insert`}>Insert {insertMode === 'media' ? 'video' : insertMode}</button>
                <button type="button" className={controlClass} aria-label="Cancel insertion" data-testid={`backy-editor-advanced-${insertMode}-cancel`} onClick={() => { closeInsertForm(); focusEditor(); }}><X className={iconClass} /></button>
            </div>
        </div>}
        {mediaPending && <p role="status" className="px-3 pb-3 text-xs leading-5 text-slate-500">Choose a file from the media library.</p>}
        {message && <p role="status" className="px-3 pb-3 text-xs leading-5 text-red-700">{message}</p>}
    </div>;
};
export default AdvancedToolbar;
