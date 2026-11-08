export type BackyVideoSource =
  | { kind: 'native'; src: string }
  | { kind: 'youtube' | 'vimeo' | 'drive'; src: string }
  | { kind: 'empty' | 'invalid'; src: ''; message: string };

type Playback = { controls?: boolean; autoplay?: boolean; muted?: boolean; loop?: boolean; playsInline?: boolean };

/** Classify media without fetching it. Hosting permissions and codecs remain the provider's responsibility. */
export function resolveBackyVideoSource(value: unknown, playback: Playback = {}): BackyVideoSource {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return { kind: 'empty', src: '', message: 'Add a video URL or select a video from the media library.' };
  const invalid = (): BackyVideoSource => ({ kind: 'invalid', src: '', message: 'Use a direct video URL or a supported YouTube, Vimeo or Google Drive video link.' });
  if (/[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith('//')) return invalid();
  if (/^\/(?!\/)/.test(source) || /^\.\.?\//.test(source)) return { kind: 'native', src: source };
  let url: URL;
  try { url = new URL(source); } catch { return invalid(); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return invalid();
  const host = url.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
    const segments = url.pathname.split('/').filter(Boolean);
    const id = host.endsWith('youtu.be') ? segments[0]
      : url.pathname === '/watch' ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(segments[0]) ? segments[1] : '';
    if (!id || !/^[a-z0-9_-]{11}$/i.test(id)) return invalid();
    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    const flags = { controls: playback.controls !== false, autoplay: playback.autoplay === true, mute: playback.muted === true, loop: playback.loop === true, playsinline: playback.playsInline !== false };
    Object.entries(flags).forEach(([key, enabled]) => embed.searchParams.set(key, enabled ? '1' : '0'));
    if (playback.loop) embed.searchParams.set('playlist', id);
    const start = url.searchParams.get('start') || url.searchParams.get('t');
    if (start && /^\d+s?$/.test(start)) embed.searchParams.set('start', String(Number.parseInt(start, 10)));
    return { kind: 'youtube', src: embed.toString() };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const segments = url.pathname.split('/').filter(Boolean);
    const id = host === 'player.vimeo.com' && segments[0] === 'video' ? segments[1] : segments[0];
    if (!id || !/^\d+$/.test(id)) return invalid();
    const embed = new URL(`https://player.vimeo.com/video/${id}`);
    const unlisted = url.searchParams.get('h') || (host === 'player.vimeo.com' ? '' : segments[1]);
    if (unlisted && /^[a-f0-9]{6,32}$/i.test(unlisted)) embed.searchParams.set('h', unlisted);
    if (playback.autoplay) embed.searchParams.set('autoplay', '1');
    if (playback.muted) embed.searchParams.set('muted', '1');
    if (playback.loop) embed.searchParams.set('loop', '1');
    return { kind: 'vimeo', src: embed.toString() };
  }
  if (host === 'drive.google.com') {
    const match = url.pathname.match(/^\/file\/d\/([a-z0-9_-]+)\/(?:view|preview)$/i);
    const id = match?.[1] || (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : '');
    if (!id || !/^[a-z0-9_-]{8,}$/i.test(id)) return invalid();
    return { kind: 'drive', src: `https://drive.google.com/file/d/${id}/preview` };
  }
  return { kind: 'native', src: source };
}
