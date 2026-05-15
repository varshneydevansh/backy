import type {
  BackyBlogAuthorsResponse,
  BackyBlogCategoriesResponse,
  BackyBlogConditionalResult,
  BackyBlogFeedDiscovery,
  BackyBlogListOptions,
  BackyBlogResponse,
  BackyBlogTagsResponse,
  BackyClient,
  BackyConditionalResult,
  BackyFrontendManifest,
  BackyPostResource,
} from '../src/index';

type AwaitedReturn<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;
type Equal<Left, Right> = (
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
);
type Assert<Condition extends true> = Condition;

type BlogOptions = NonNullable<Parameters<BackyClient['blog']>[0]>;
type BlogCachedOptions = NonNullable<Parameters<BackyClient['blogCached']>[0]>;
type ManifestBlogFeeds = NonNullable<NonNullable<BackyFrontendManifest['modules']['blog']>['feeds']>[number];

type BlogMethodReturnsContract = Assert<Equal<AwaitedReturn<BackyClient['blog']>, BackyBlogResponse>>;
type BlogCachedMethodReturnsContract = Assert<Equal<AwaitedReturn<BackyClient['blogCached']>, BackyBlogConditionalResult>>;
type BlogCategoriesReturnsContract = Assert<Equal<AwaitedReturn<BackyClient['blogCategories']>, BackyBlogCategoriesResponse>>;
type BlogTagsReturnsContract = Assert<Equal<AwaitedReturn<BackyClient['blogTags']>, BackyBlogTagsResponse>>;
type BlogAuthorsReturnsContract = Assert<Equal<AwaitedReturn<BackyClient['blogAuthors']>, BackyBlogAuthorsResponse>>;
type ManifestFeedsUseSdkDiscoveryType = Assert<Equal<ManifestBlogFeeds, BackyBlogFeedDiscovery>>;

const blogFilters = {
  siteId: 'site-demo',
  slug: 'welcome',
  categoryId: 'cat-news',
  categorySlug: 'news',
  tagId: 'tag-release',
  tagSlug: 'release',
  authorId: 'user-admin',
  authorSlug: 'admin',
  q: 'launch',
  search: 'launch',
  year: 2026,
  month: '05',
  limit: 10,
  offset: 0,
  previewToken: 'preview_token',
  requestId: 'typegen-blog-list',
} satisfies BackyBlogListOptions;

const cachedBlogFilters = {
  ...blogFilters,
  etag: '"blog-etag"',
} satisfies BlogCachedOptions;

const feedDiscovery = {
  id: 'blog-rss',
  title: 'Blog RSS',
  format: 'rss',
  version: '2.0',
  rel: 'alternate',
  contentType: 'application/rss+xml; charset=utf-8',
  endpoint: '/api/sites/site-demo/blog/rss',
  hostedPath: '/blog/rss.xml',
  schemaVersion: 'backy.blog-feed.v1',
  scope: 'blog',
  visibility: 'published',
  cache: {
    scope: 'discovery',
    etag: true,
    revisionHeader: 'x-backy-cache-revision',
  },
  limits: {
    queryParam: 'limit',
    default: 20,
    min: 1,
    max: 100,
  },
} satisfies BackyBlogFeedDiscovery;

declare const blogResponse: BackyBlogResponse;
declare const categoryResponse: BackyBlogCategoriesResponse;
declare const tagResponse: BackyBlogTagsResponse;
declare const authorResponse: BackyBlogAuthorsResponse;
declare const cachedResponse: BackyBlogConditionalResult;

const posts: BackyPostResource[] | undefined = blogResponse.data.posts;
const categorySlug: string | undefined = categoryResponse.data.categories[0]?.slug;
const tagSlug: string | undefined = tagResponse.data.tags[0]?.slug;
const authorSlug: string | undefined = authorResponse.data.authors[0]?.slug;
const cachedResult: BackyConditionalResult<BackyBlogResponse> = cachedResponse;
const manifestFeed: ManifestBlogFeeds = feedDiscovery;

// @ts-expect-error unsupported generated-client filters must not silently compile.
const unsupportedBlogFilter = { unknownFilter: 'drafts' } satisfies BlogOptions;

// @ts-expect-error feed endpoint is required by the manifest/OpenAPI blog feed contract.
const invalidFeedDiscovery = { id: 'blog-rss', format: 'rss', contentType: 'application/rss+xml' } satisfies BackyBlogFeedDiscovery;

void cachedBlogFilters;
void posts;
void categorySlug;
void tagSlug;
void authorSlug;
void cachedResult;
void manifestFeed;
void unsupportedBlogFilter;
void invalidFeedDiscovery;
