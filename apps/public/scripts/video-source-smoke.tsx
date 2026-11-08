import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveBackyVideoSource } from '../../../packages/core/src/video-source';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const youtube = resolveBackyVideoSource('https://www.youtube.com/watch?v=abcdefghijk&t=42s', { controls: false, autoplay: true, muted: true, loop: true });
assert.equal(youtube.kind, 'youtube');
const youtubeUrl = new URL(youtube.src);
assert.equal(youtubeUrl.origin, 'https://www.youtube-nocookie.com');
assert.equal(youtubeUrl.pathname, '/embed/abcdefghijk');
for (const [key, value] of Object.entries({ start: '42', controls: '0', autoplay: '1', mute: '1', loop: '1', playlist: 'abcdefghijk' })) assert.equal(youtubeUrl.searchParams.get(key), value);
for (const source of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk', youtube.src]) assert.equal(resolveBackyVideoSource(source).kind, 'youtube');
assert.equal(resolveBackyVideoSource('https://www.youtube.com/watch?v=bad').kind, 'invalid');
const vimeo = resolveBackyVideoSource('https://player.vimeo.com/video/123456789');
assert.equal(vimeo.kind, 'vimeo');
assert.equal(new URL(vimeo.src).searchParams.has('h'), false, 'Video ID is not an unlisted token.');
assert.equal(new URL(resolveBackyVideoSource('https://vimeo.com/123456789/abcdef1234').src).searchParams.get('h'), 'abcdef1234');
for (const source of ['https://drive.google.com/file/d/examplefile123/view?usp=sharing', 'https://drive.google.com/open?id=examplefile123', 'https://drive.google.com/uc?id=examplefile123']) {
  assert.deepEqual(resolveBackyVideoSource(source), { kind: 'drive', src: 'https://drive.google.com/file/d/examplefile123/preview' });
}
for (const source of ['/uploads/video.mp4', './video.webm', 'https://cdn.example.test/video.mp4?signature=test']) assert.deepEqual(resolveBackyVideoSource(source), { kind: 'native', src: source });
for (const source of ['javascript:alert(1)', 'data:text/html,attack', '//evil.example.test/video', 'https://user:password@example.test/video', 'https://example.test/\\evil', 'https://example.test/video\n.mp4']) assert.equal(resolveBackyVideoSource(source).kind, 'invalid');
assert.equal(resolveBackyVideoSource('').kind, 'empty');
assert.equal(resolveBackyVideoSource('https://youtube.com.evil.test/video.mp4').kind, 'native', 'Lookalike host is never trusted as an embed provider.');

const render = (src: string, props = {}) => renderToStaticMarkup(<PageRenderer content={{
  canvasSize: { width: 800, height: 500 },
  elements: [{ id: 'video-fixture', type: 'video', x: 0, y: 0, width: 640, height: 360, props: { src, ...props } }],
} as PageContent} />);
const native = render('/uploads/video.mp4', { controls: true, autoplay: true, muted: true, playsInline: true, poster: '/uploads/poster.jpg' });
for (const expected of ['<video', 'src="/uploads/video.mp4"', 'controls=""', 'autoplay=""', 'muted=""', 'playsinline=""', 'poster="/uploads/poster.jpg"']) assert(native.includes(expected), expected);
for (const [src, provider] of [['https://youtu.be/abcdefghijk', 'youtube'], ['https://vimeo.com/123456789', 'vimeo'], ['https://drive.google.com/file/d/examplefile123/view', 'drive']]) {
  const output = render(src);
  assert(output.includes('<iframe') && output.includes(`data-backy-video-provider="${provider}"`));
  assert(output.includes('sandbox="allow-scripts allow-same-origin allow-presentation"'));
  assert(!output.includes('<video'), 'Hosted share links use the provider player.');
}
const rejected = render('javascript:alert(1)');
assert(!rejected.includes('<video') && !rejected.includes('<iframe') && rejected.includes('role="note"'));
console.log('Video source behavior passed: native playback attributes, canonical hosted embeds, URL guards and renderer selection.');
