import type { FontOption } from './fontCatalog';

export function getCustomFontFailures(fonts: FontFaceSet, families: string[]): string[] {
  const registered = new Map(families.map((family) => [family.trim().toLowerCase(), family]));
  const failed = new Set<string>();
  fonts.forEach((face) => {
    const family = face.family.trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
    const name = registered.get(family);
    if (name && face.status === 'error') failed.add(name);
  });
  return Array.from(failed).sort();
}

/** Observe decoded browser font outcomes without changing authored font choices. */
export function observeCustomFontFailures(
  fonts: FontFaceSet,
  families: string[],
  onFailures: (families: string[]) => void,
): () => void {
  let active = true;
  const refresh = () => {
    // Read current faces: a late event from replaced site/token CSS is not a
    // failure of the newly registered face with the same family name.
    if (active) onFailures(getCustomFontFailures(fonts, families));
  };
  fonts.addEventListener('loadingerror', refresh);
  fonts.addEventListener('loadingdone', refresh);
  refresh();
  return () => {
    active = false;
    fonts.removeEventListener('loadingerror', refresh);
    fonts.removeEventListener('loadingdone', refresh);
  };
}

const MAX_FONT_BYTES = 16 * 1024 * 1024;
const MAX_RETRY_BYTES = 32 * 1024 * 1024;

/** Explicit retry bypasses the browser's cached failed FontResource without
 * altering a signed URL or persisting temporary runtime URLs in authored data. */
export async function retryCustomFontDelivery(
  fonts: FontOption[],
  failedFamilies: string[],
  signal: AbortSignal,
  delivery = {
    fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch,
    createObjectURL: (blob: Blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url: string) => URL.revokeObjectURL(url),
  },
): Promise<{ fonts: FontOption[]; failed: string[]; retried: FontOption[]; dispose: () => void; releaseUnused: (retained: Set<string>) => boolean }> {
  const urls = new Set<string>();
  const releaseUnused = (retained: Set<string>) => {
    urls.forEach((url) => {
      if (!retained.has(url)) { delivery.revokeObjectURL(url); urls.delete(url); }
    });
    return urls.size > 0;
  };
  const dispose = () => { releaseUnused(new Set()); };
  const checkActive = () => {
    if (signal.aborted) throw new DOMException('Font retry cancelled', 'AbortError');
  };
  const failed = new Set<string>();
  const retried: FontOption[] = [];
  let totalBytes = 0;
  try {
    const runtimeFonts: FontOption[] = [];
    for (const font of fonts) {
      checkActive();
      if (font.source !== 'custom' || !failedFamilies.includes(font.value)) {
        runtimeFonts.push(font);
        continue;
      }
      const faces = font.faces?.length ? font.faces : font.url ? [{
        url: font.url, format: font.format, weight: font.weight || '400',
        style: (font.style || 'normal') as 'normal' | 'italic' | 'oblique', display: font.display || 'swap',
      }] : [];
      const loadedFaces = [];
      const runtimeFaces = [];
      for (const face of faces) {
        try {
          const parsed = new URL(face.url, typeof location === 'undefined' ? 'https://backy.invalid' : location.href);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u001f\u007f<>"\\]/.test(face.url)) throw new Error('Unsupported font URL');
          // Default fetch credentials/CORS apply; never broaden provider access.
          const response = await delivery.fetch(face.url, { cache: 'no-store', signal });
          if (signal.aborted) await response.body?.cancel();
          checkActive();
          if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_FONT_BYTES) {
            await response.body?.cancel();
            throw new Error('Font delivery unavailable');
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let size = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              checkActive();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              totalBytes += chunk.value.byteLength;
              if (size > MAX_FONT_BYTES || totalBytes > MAX_RETRY_BYTES) throw new Error('Font delivery too large');
              chunks.push(new Uint8Array(chunk.value));
            }
          } catch (error) {
            await reader.cancel();
            throw error;
          } finally {
            reader.releaseLock();
          }
          if (!size) throw new Error('Font delivery empty');
          const url = delivery.createObjectURL(new Blob(chunks));
          urls.add(url);
          checkActive();
          const loadedFace = { ...face, url };
          runtimeFaces.push(loadedFace);
          loadedFaces.push(loadedFace);
        } catch (error) {
          checkActive();
          failed.add(font.value);
          runtimeFaces.push(face);
        }
      }
      if (!faces.length) failed.add(font.value);
      runtimeFonts.push({ ...font, faces: runtimeFaces });
      if (loadedFaces.length) retried.push({ ...font, faces: loadedFaces });
    }
    checkActive();
    return { fonts: runtimeFonts, failed: Array.from(failed), retried, dispose, releaseUnused };
  } catch (error) {
    dispose();
    throw error;
  }
}
