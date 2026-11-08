export const MEDIA_BUFFERED_DELIVERY_MAX_BYTES = 50 * 1024 * 1024;
export const MEDIA_DELIVERY_STREAM_CHUNK_BYTES = 64 * 1024;
export type MediaByteSelection = { status: 200 | 206; start: number; endExclusive: number } | { status: 416 };

/** One byte range only. Unknown units are ignored; malformed/multiple byte ranges fail closed. */
export function selectMediaBytes(request: Request, size: number, etag: string): MediaByteSelection {
  const whole = { status: 200 as const, start: 0, endExclusive: size };
  if (request.method !== 'GET') return whole;
  const range = request.headers.get('range');
  if (!range) return whole;
  // No date validator is advertised. Only the current strong entity tag can
  // validate a partial response; dates, weak tags and stale tags fall back to GET.
  const ifRange = request.headers.get('if-range');
  if (ifRange && (ifRange.trim().startsWith('W/') || ifRange.trim() !== etag)) return whole;
  if (!/^bytes=/i.test(range.trim())) return whole;
  if (range.length > 256) return { status: 416 };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return { status: 416 };
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return { status: 416 };
    return { status: 206, start: Number(suffix >= length ? 0n : length - suffix), endExclusive: size };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return { status: 416 };
  return { status: 206, start: Number(start), endExclusive: Number(end >= length ? length : end + 1n) };
}

/** Response streaming only: the adapter has already read the bounded original into memory. */
export function streamMediaBytes(bytes: Uint8Array, start: number, endExclusive: number, signal?: AbortSignal) {
  let source: Uint8Array | null = bytes, offset = start;
  let onAbort: (() => void) | undefined;
  const release = () => { source = null; if (onAbort) signal?.removeEventListener('abort', onAbort); };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => { release(); controller.error(new Error('Media request aborted')); };
      if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
    },
    pull(controller) {
      if (!source) return;
      if (offset >= endExclusive) { release(); controller.close(); return; }
      const next = Math.min(endExclusive, offset + MEDIA_DELIVERY_STREAM_CHUNK_BYTES);
      // Copy only the next chunk, rather than making a second whole-file copy.
      controller.enqueue(new Uint8Array(source.subarray(offset, next)));
      offset = next;
      if (offset === endExclusive) { release(); controller.close(); }
    },
    cancel() { release(); },
  });
}
