import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { listMediaUploadTransfers, discardMediaUploadTransfer, type MediaUploadTransfer } from '@/lib/mediaApi';
import { formatBytes } from '@/lib/utils';

/** Explicit load/discard keeps uploader-specific filenames out of other contexts. */
export function MediaUploadTransfers({siteId,enabled,revision=0}:{siteId:string;enabled:boolean;revision?:number}) {
  const generation=useRef(0);
  const [rows,setRows]=useState<MediaUploadTransfer[]>([]),[error,setError]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
  useEffect(()=>{generation.current++;setRows([]);setError(null);setLoaded(false);setBusy(false);setOffset(0);setHasMore(false);return()=>{generation.current++;};},[siteId,enabled,revision]);
  const load=async(nextOffset=0)=>{
    if(!enabled || busy)return;
    const current=++generation.current;setBusy(true);setError(null);
    try {const result=await listMediaUploadTransfers(siteId,nextOffset);if(current!==generation.current)return;setRows(result.uploads);setOffset(nextOffset);setHasMore(result.pagination.hasMore);setLoaded(true);}
    catch(reason){if(current===generation.current){setRows([]);setLoaded(false);setError(reason instanceof Error?reason.message:'Unable to read transfers.');}}
    finally{if(current===generation.current)setBusy(false);}
  };
  const discard=async(row:MediaUploadTransfer)=>{
    if(!enabled || busy)return;
    const current=++generation.current;setBusy(true);setError(null);
    try {await discardMediaUploadTransfer(siteId,row.id);if(current!==generation.current)return;setRows(values=>values.filter(value=>value.id!==row.id));}
    catch(reason){if(current===generation.current){setRows([]);setLoaded(false);setError(reason instanceof Error?reason.message:'Unable to discard transfer.');}}
    finally{if(current===generation.current)setBusy(false);}
  };
  if(!enabled)return null;
  return <details className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Unfinished transfers</summary>
    <div className="space-y-3 border-t border-border p-4">
      <p className="max-w-3xl text-sm text-muted-foreground">Select the same file with the same upload options to resume. Transfers support up to50 MiB and expire after24 hours. Discard removes unpublished staging; saved media and storage recovery journals remain.</p>
      <Button variant="outline" size="md" disabled={busy} onClick={()=>void load(offset)}>{busy?'Checking…':loaded?'Refresh transfers':'Load my transfers'}</Button>
      {error?<Notice tone="error">{error}</Notice>:null}
      {loaded && !rows.length?<p className="text-sm text-muted-foreground">No unfinished transfers on this page.</p>:null}
      {rows.map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{row.filename}</p><p className="text-xs text-muted-foreground">{formatBytes(row.offset)} / {formatBytes(row.sizeBytes)} · {row.state==='uploading' && Date.parse(row.expiresAt)<=Date.now()?'Expired':row.state==='completing'?'Completion needs review':row.state}</p></div>
        <Button variant="outline" size="md" disabled={busy} onClick={()=>void discard(row)}>Discard staging</Button>
      </div>)}
      {loaded && (offset>0 || hasMore)?<div className="flex gap-2"><Button variant="outline" size="md" disabled={busy || offset===0} onClick={()=>void load(Math.max(0,offset-25))}>Previous</Button><Button variant="outline" size="md" disabled={busy || !hasMore} onClick={()=>void load(offset+25)}>Next</Button></div>:null}
    </div>
  </details>;
}
