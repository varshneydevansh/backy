# Backy JavaScript SDK

Small TypeScript client for custom/generated frontends that consume Backy through public APIs.

```ts
import { createBackyClient } from '@backy/sdk-js';

const backy = createBackyClient({ baseUrl: 'https://your-backy-host.com' });

await backy.discoverSite('demo');
const manifest = await backy.manifest();
const page = await backy.render('/');
const seo = await backy.seo();
const sections = await backy.reusableSections();
const media = await backy.media({ limit: 1 });
const asset = media.data.media[0] ? await backy.mediaAsset(media.data.media[0].id) : null;
const catalog = await backy.commerceCatalog({ featured: true });

page.data.content.elements.forEach((element) => {
  console.log(element.id, element.type);
});

console.log(sections.data.sections.map((section) => section.name));
console.log(asset?.data.media.id);
console.log(catalog.data.products.map((product) => product.title));
console.log(seo.data.sitemap.url);
```

Commerce storefronts can read the normalized product catalog and submit a checkout cart into Backy's private order queue:

```ts
const order = await backy.createCommerceOrder({
  customer: { name: 'Jane Customer', email: 'jane@example.com' },
  items: [{ slug: 'starter-template', quantity: 1 }],
  paymentProvider: 'manual',
});

console.log(order.data.order.orderNumber, order.data.order.paymentStatus);
```

Conditional discovery/render/navigation/SEO/media/data helpers expose Backy's response metadata and handle `If-None-Match` revalidation:

```ts
const first = await backy.renderCached('/');

if (!first.notModified) {
  console.log(first.meta.etag, first.body.data.content.elements);
}

const second = await backy.renderCached('/', { etag: first.meta.etag });

if (second.notModified) {
  console.log('Reuse your cached render payload.');
}

const navFirst = await backy.navigationCached();
const navSecond = await backy.navigationCached({ etag: navFirst.meta.etag });

if (navSecond.notModified) {
  console.log('Reuse your cached navigation tree.');
}

const pageFirst = await backy.pagesCached({ path: '/about' });
const pageSecond = await backy.pagesCached({ path: '/about', etag: pageFirst.meta.etag });

if (pageSecond.notModified) {
  console.log('Reuse your cached page payload.');
}

const blogFirst = await backy.blogCached({ limit: 10 });
const blogSecond = await backy.blogCached({ limit: 10, etag: blogFirst.meta.etag });

if (blogSecond.notModified) {
  console.log('Reuse your cached blog index.');
}

const seoFirst = await backy.seoCached();
const seoSecond = await backy.seoCached({ etag: seoFirst.meta.etag });

if (seoSecond.notModified) {
  console.log('Reuse your cached SEO route index.');
}

const recordsFirst = await backy.recordsCached<{ title: string }>('articles', { limit: 10 });
const recordsSecond = await backy.recordsCached('articles', { limit: 10, etag: recordsFirst.meta.etag });

if (recordsSecond.notModified) {
  console.log('Reuse your cached collection records.');
}

const collectionsFirst = await backy.collectionsCached();
const collectionsSecond = await backy.collectionsCached({ etag: collectionsFirst.meta.etag });

if (collectionsSecond.notModified) {
  console.log('Reuse your cached collection schemas.');
}

const catalogFirst = await backy.commerceCatalogCached({ featured: true });
const catalogSecond = await backy.commerceCatalogCached({ featured: true, etag: catalogFirst.meta.etag });

if (catalogSecond.notModified) {
  console.log('Reuse your cached product catalog.');
}

const fontsFirst = await backy.mediaFontsCached();
const fontsSecond = await backy.mediaFontsCached({ etag: fontsFirst.meta.etag });

if (fontsSecond.notModified) {
  console.log('Reuse your cached uploaded font manifest and CSS.');
}
```

The SDK intentionally does not import admin/editor code. It wraps the public site bootstrap, manifest/OpenAPI discovery, route resolution, render payload, SEO discovery, media, collection, commerce, reusable-section, form, comment, report, and event endpoints documented in `specs/backy-api-contracts.md`.
The default return types expose Backy contract shapes such as `BackyRenderPayload`, `BackyContentDocument`, `BackySeoDiscovery`, `BackyMediaAsset`, `BackyFontManifest`, `BackyCollectionRecord`, `BackyCommerceProduct`, `BackyCommerceOrderSummary`, `BackyReusableSection`, `BackyFormSubmission`, `BackyComment`, `BackyInteractionEvent`, `BackyResponseMeta`, and `BackyConditionalResult`. Collection record reads/writes are generic, so a frontend can pass its own value shape: `backy.records<{ title: string }>(collectionId)`.

## Local validation

```sh
npm run build --workspace @backy/sdk-js
npm run test:smoke --workspace @backy/sdk-js
```

`test:smoke` expects a running Backy public app at `http://localhost:3001` unless `BACKY_SDK_BASE_URL` is set.
By default it also creates and deletes a temporary site through the local admin API so it can verify SDK SEO/reusable-section reads and public writes for collection records, forms, contacts, comments, reports, and events. Set `BACKY_SDK_SKIP_WRITE_SMOKE=1` to run the read-only smoke against an environment where admin fixture setup is unavailable.
