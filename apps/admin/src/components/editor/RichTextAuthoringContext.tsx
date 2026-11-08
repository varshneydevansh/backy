import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { BackyInteractiveComponentRenderer, BackyInteractiveRegistryEntry, BackyMediaRequest } from '@backy-cms/editor';
import { MediaLibraryModal, type MediaContext } from './MediaLibraryModal';
import { BlogInteractivePreview } from '@/lib/BlogInteractivePreview';
import { blogMediaSelection, isBlogMediaSessionCurrent, type BlogMediaKind, type BlogMediaSelection, type BlogMediaSession } from '@/lib/blogAuthoringMedia';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import type { MediaAsset } from '@/stores/mockStore';

export interface RichTextAuthoringAdapter {
  interactiveComponents: BackyInteractiveRegistryEntry[];
  interactiveComponentsLoading?: boolean;
  interactiveComponentsError?: string;
  onReloadInteractiveComponents?: () => void;
  renderInteractiveComponent: BackyInteractiveComponentRenderer;
  requestMedia: (elementId: string, kind: Parameters<BackyMediaRequest>[0]) => ReturnType<BackyMediaRequest>;
}
const Context = createContext<RichTextAuthoringAdapter | null>(null);
export const useRichTextAuthoring = () => useContext(Context);

/** One host adapter and media dialog for all rich text descendants of a Canvas editor. */
export function RichTextAuthoringProvider({ children, entries, loading, error, reload, apiBaseUrl, mediaContext, selectedId, disabled, canViewMedia, canCreateMedia, mediaViewDisabledReason, mediaCreateDisabledReason }: {
 children: React.ReactNode; entries: BackyInteractiveRegistryEntry[]; loading?: boolean; error?: string; reload?: () => void; apiBaseUrl: string; mediaContext?: MediaContext; selectedId: string | null; disabled: boolean; canViewMedia: boolean; canCreateMedia: boolean; mediaViewDisabledReason?: string; mediaCreateDisabledReason?: string;
}): React.ReactElement {
 const [kind, setKind] = useState<BlogMediaKind | null>(null);
 const [notice, setNotice] = useState('');
 type Session = BlogMediaSession & { scope?: string };
 const sessionRef = useRef<Session>({ siteId: '', targetId: '', scopeTargetId: '', active: false, disabled: true, canView: false });
 sessionRef.current = { siteId: mediaContext?.siteId || '', targetId: selectedId || '', scopeTargetId: mediaContext?.targetId || '', scope: mediaContext?.scope, active: !disabled, disabled, canView: canViewMedia };
 const pending = useRef<{ kind: BlogMediaKind; session: Session; resolve: (selection: BlogMediaSelection | null) => void } | null>(null);
 const current = (requested: Session) => isBlogMediaSessionCurrent(requested, sessionRef.current) && requested.scope === sessionRef.current.scope;
 const close = useCallback(() => { pending.current?.resolve(null); pending.current = null; setKind(null); }, []);
 useEffect(() => () => { pending.current?.resolve(null); pending.current = null; }, []);
 useEffect(() => { if (pending.current && !current(pending.current.session)) close(); }, [selectedId, disabled, canViewMedia, mediaContext?.siteId, mediaContext?.targetId, mediaContext?.scope, close]);
 const requestMedia = useCallback<RichTextAuthoringAdapter['requestMedia']>((elementId, requestedKind) => {
  const session = { ...sessionRef.current };
  if (elementId !== session.targetId || !isBlogMediaSessionCurrent(session, session)) { setNotice(mediaViewDisabledReason || 'Select an editable text block in this site before choosing media.'); return Promise.resolve(null); }
  close(); setNotice(''); setKind(requestedKind);
  return new Promise((resolve) => { pending.current = { kind: requestedKind, session, resolve }; });
 }, [close, mediaViewDisabledReason]);
 const select = useCallback((media: MediaAsset) => {
  const request = pending.current;
  if (!request || !current(request.session)) { close(); return; }
  const result = blogMediaSelection(media, request.kind, request.session.siteId, getPublicMediaFileUrl);
  if (!result) { setNotice('Choose a public asset of the requested media type.'); close(); return; }
  pending.current = null; request.resolve(result); setKind(null);
 }, [close]);
 const renderInteractiveComponent = useCallback<BackyInteractiveComponentRenderer>((node) => <BlogInteractivePreview node={node} entries={entries} apiBaseUrl={apiBaseUrl} siteId={mediaContext?.siteId || ''} loading={loading} error={error} />, [entries, apiBaseUrl, mediaContext?.siteId, loading, error]);
 const adapter = useMemo(() => ({ interactiveComponents: entries, interactiveComponentsLoading: loading, interactiveComponentsError: error, onReloadInteractiveComponents: reload, renderInteractiveComponent, requestMedia }), [entries, loading, error, reload, renderInteractiveComponent, requestMedia]);
 return <Context.Provider value={adapter}>{children}{notice && <div role="status" className="fixed bottom-4 left-1/2 z-[110] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">{notice}<button type="button" className="ml-3 min-h-11 px-2" onClick={() => setNotice('')}>Dismiss</button></div>}<div data-backy-inline-media-picker="true" className="ignore-click-outside/toolbar"><MediaLibraryModal isOpen={kind !== null} onClose={close} onSelect={select} allowedTypes={kind || 'image'} initialUploadFilter={kind || 'image'} initialScopeFilter="all" showCanvasInsertionControls={false} mediaContext={mediaContext} canView={canViewMedia} canCreate={canCreateMedia} viewDisabledReason={mediaViewDisabledReason} createDisabledReason={mediaCreateDisabledReason} allowPrivateSelection={false} /></div></Context.Provider>;
}
