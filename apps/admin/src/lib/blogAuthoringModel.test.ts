import assert from 'node:assert/strict';
import { getEffectiveBlogWritingTarget, getBlogWritingTargets, insertBlogWritingBody, reflowBlogRootGrowth, updateBlogEditorialText, updateBlogWritingTarget } from './blogAuthoringModel';
import type { CanvasElement } from '@/types/editor';

const node = (id: string, y: number, height: number, extras: Partial<CanvasElement> = {}): CanvasElement => ({
  id, type: 'paragraph', x: 0, y, width: 700, height, zIndex: 1, props: { content: 'Original', unknownProp: { keep: true } }, ...extras,
});
const payload = [{ type: 'h2', children: [{ text: 'New section' }] }, { type: 'p', children: [{ text: 'Marked', bold: true }, { text: ' code', code: true }] }, { type: 'table', children: [{ type: 'tr', children: [{ type: 'td', children: [{ type: 'p', children: [{ text: 'Cell' }] }] }] }] }];
const tree = [
  node('site-header', 0, 88, { type: 'header', children: [node('brand', 0, 30)] }),
  node('article-body', 88, 400, { type: 'section', props: { padding: 0, unknownContainer: 123 }, responsive: { mobile: { y: 100, height: 400, props: { preserve: 'mobile' } } }, children: [
    node('blog-article-lede', 40, 100, { responsive: { mobile: { y: 40, height: 100, width: 300 } }, assetIds: ['keep-asset'], tokenRefs: { color: 'body' } }),
    node('following-quote', 180, 100, { type: 'quote', responsive: { mobile: { y: 180, height: 100 } } }),
    node('overlapping-design', 20, 50, { type: 'image' }),
  ] }),
  node('site-footer', 488, 168, { type: 'footer', responsive: { mobile: { y: 500, height: 168, props: { keep: 'footer' } } }, children: [node('footer-copy', 20, 40)] }),
];
const before = JSON.stringify(tree);
const updated = updateBlogWritingTarget(tree, 'blog-article-lede', payload, 300);
assert.equal(JSON.stringify(tree), before, 'Writing must not mutate existing source/undo snapshot');
assert.deepEqual(updated[1].children![0].props.content, payload, 'Keep full rich document including marks/tables');
assert.deepEqual(updated[1].children![0].props.unknownProp, { keep: true });
assert.deepEqual(updated[1].children![0].assetIds, ['keep-asset']);
assert.deepEqual(updated[1].children![0].tokenRefs, { color: 'body' });
assert.equal(updated[1].height, 600);
assert.equal(updated[1].children![1].y, 380);
assert.equal(updated[1].children![2], tree[1].children![2], 'Preserve overlapping authored design');
assert.equal(updated[2].y, 688, 'Footer follows article growth');
assert.equal(updated[2].responsive!.mobile!.y, 700, 'Mobile footer follows article growth');
assert.equal(updated[1].children![1].responsive!.mobile!.y, 380);
assert.deepEqual(updated[2].responsive!.mobile!.props, { keep: 'footer' });
assert.deepEqual(updated[1].responsive!.mobile!.props, { preserve: 'mobile' });
assert.equal(updated[0], tree[0], 'Chrome stays untouched');
const mobileOnly = updateBlogWritingTarget(tree, 'blog-article-lede', payload, { desktop: 90, tablet: 250, mobile: 500 });
assert.equal(mobileOnly[1].height, 400, 'Mobile wrapping must not inflate desktop geometry');
assert.equal(mobileOnly[1].children![0].height, 100);
assert.equal(mobileOnly[1].children![0].responsive!.mobile!.height, 500);
assert.equal(mobileOnly[1].children![1].y, 180);
assert.equal(mobileOnly[1].children![1].responsive!.mobile!.y, 580);
assert.equal(mobileOnly[1].responsive!.mobile!.height, 800);
assert.equal(mobileOnly[2].y, 488);
assert.equal(mobileOnly[2].responsive!.mobile!.y, 900, 'Mobile-only growth must move the mobile footer');
assert.equal(mobileOnly[2].responsive!.tablet!.y, 638, 'Tablet wraps independently');
assert.equal(updateBlogWritingTarget(mobileOnly, 'blog-article-lede', payload, { desktop: 90, tablet: 250, mobile: 500 }), mobileOnly, 'No-op measurements cannot create phantom edits');
const responsiveContent = node('responsive-body', 0, 100, { props: { content: payload, fontSize: 20 }, styles: { fontFamily: 'Base Font' }, responsive: { mobile: { width: 320, props: { content: [{ type: 'p', children: [{ text: 'Mobile-only copy' }] }], fontSize: 24 }, styles: { fontFamily: 'Mobile Font' } } } });
const effectiveMobile = getEffectiveBlogWritingTarget(responsiveContent, 'mobile');
assert.equal(effectiveMobile.width, 320);
assert.equal(effectiveMobile.props.fontSize, 24);
assert.equal(effectiveMobile.styles!.fontFamily, 'Mobile Font');
assert.deepEqual(effectiveMobile.props.content, responsiveContent.responsive!.mobile!.props!.content);
const preservedResponsive = updateBlogWritingTarget([responsiveContent], responsiveContent.id, payload, { desktop: 100, tablet: 100, mobile: 300 });
assert.deepEqual(preservedResponsive[0].responsive!.mobile!.props!.content, responsiveContent.responsive!.mobile!.props!.content, 'Measured fitting never rewrites intentional mobile content');
assert.deepEqual(getBlogWritingTargets(tree).map((element) => element.id), ['blog-article-lede', 'following-quote']);
assert.deepEqual(getBlogWritingTargets([
  node('unrelated-id', 0, 100, { type: 'section', props: { chromeRole: 'site.header' }, children: [node('unrelated-copy', 0, 40)] }),
  node('hidden-parent', 0, 100, { type: 'section', visible: false, children: [node('hidden-copy', 0, 40)] }),
  node('locked-parent', 0, 100, { type: 'section', locked: true, children: [node('locked-copy', 0, 40)] }),
]), [], 'Semantic chrome and locked/hidden ancestors are excluded from writing');
const capturedWritingTree = [node('unknown-captured-section', 0, 500, { type: 'section', children: [
  ...['title', 'excerpt', 'publishedAt', 'coverImage'].flatMap((field, index) => [
    node(`captured-field-${index}`, index * 40, 30, { props: { content: `Saved ${field}`, binding: `post.${field}` } }),
    node(`captured-spaced-field-${index}`, index * 40, 30, { props: { content: `Saved ${field}`, binding: ` \tpost.${field}\n ` } }),
  ]),
  node('unknown-captured-body', 200, 120, { props: { content: payload, binding: 'post.content' } }),
  node('unknown-nested-section', 340, 120, { type: 'section', children: [node('unknown-authored-copy', 0, 80)] }),
] })];
const capturedBefore = JSON.stringify(capturedWritingTree);
assert.deepEqual(getBlogWritingTargets(capturedWritingTree).map((element) => element.id), ['unknown-captured-body', 'unknown-authored-copy'],
  'Captured metadata-bound title, excerpt, publication date and cover fields must stay out of Write, including bindings trimmed by public rendering; body and nested authored text remain editable without generated ids');
assert.equal(JSON.stringify(capturedWritingTree), capturedBefore, 'Discovering writing targets must preserve unknown captured ids, bindings and content');
const htmlTree = [node('legacy-html', 0, 160, { props: { content: '<p>Existing <strong>formatted</strong> article</p>', unknown: 'preserve' } }), node('literal-prose', 180, 80, { props: { content: 'Use x < 10 and y > 20.' } })];
assert.deepEqual(getBlogWritingTargets(htmlTree).map((element) => element.id), ['literal-prose'], 'Preserve HTML sources without treating ordinary comparison prose as markup');
assert.equal(updateBlogWritingTarget(htmlTree, 'legacy-html', payload), htmlTree, 'Writing cannot silently flatten legacy HTML');
assert.equal(htmlTree[0].props.content, '<p>Existing <strong>formatted</strong> article</p>');
assert.equal(updateBlogWritingTarget(updated, 'missing', payload), updated, 'Absent targets cannot erase work');
const inserted = insertBlogWritingBody([tree[0], tree[2]]);
assert.equal(inserted[1].y, tree[2].y + 280, 'Explicit insert makes room before footer');
assert.equal(inserted[2].type, 'paragraph');
assert.equal(inserted[2].y, tree[2].y);
assert.equal(inserted[1].responsive!.mobile!.y, 780);
const appended = reflowBlogRootGrowth(tree, [tree[0], { ...tree[1], height: 800 }, tree[2]]);
assert.equal(appended[2].y, 888, 'Adding a section moves the existing footer without remounting the canvas');
assert.equal(appended[2].responsive!.mobile!.y, 900);
assert.equal(appended[1].responsive!.mobile!.height, 800);
assert.deepEqual(appended[2].responsive!.mobile!.props, { keep: 'footer' });
const appendedFallback = reflowBlogRootGrowth([tree[0], tree[2]], [tree[0], tree[2], node('new-media', tree[2].y, 320, { type: 'image' })]);
assert.equal(appendedFallback[1].y, 848, 'Captured layouts without a known body region insert new media before the footer');
assert.equal(appendedFallback[1].responsive!.mobile!.y, 860);
const editorial = [node('captured', 0, 100, { type: 'section', children: [node('bound-title', 0, 30, { props: { content: 'Placeholder title', binding: 'post.title', fontFamily: 'Preserved Font' } }), node('fixed-copy', 40, 30, { props: { content: '<strong>Fixed masthead</strong>' } }), node('bound-excerpt', 80, 30, { props: { content: 'Placeholder excerpt', binding: 'post.excerpt' } })] })];
const syncedEditorial = updateBlogEditorialText(editorial, { title: 'New title', excerpt: '' });
assert.equal(syncedEditorial[0].children![0].props.content, 'New title');
assert.equal(syncedEditorial[0].children![0].props.fontFamily, 'Preserved Font');
assert.equal(syncedEditorial[0].children![1], editorial[0].children![1], 'Fixed captured template copy retains exact markup');
assert.equal(syncedEditorial[0].children![2].props.content, '', 'Empty excerpt clears bound placeholder');
assert.equal(updateBlogEditorialText(syncedEditorial, { title: 'New title', excerpt: '' }), syncedEditorial, 'Matching metadata must not create a phantom canvas edit');
console.log('Blog authoring model: rich content, immutable snapshots, responsive reflow, chrome preservation and explicit body insertion passed.');
