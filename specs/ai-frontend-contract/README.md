# Backy AI Frontend Contract

Date: 2026-05-07
Status: starter contract area with machine-readable schemas

This folder is the canonical place an AI or external developer should read before building a frontend that consumes Backy.

The rule is simple: a custom frontend can look completely different from the Backy admin UI, but every rendered page, post, asset, form, comment, token, and interaction must map back to Backy public contracts.

## Allowed assumptions

- Do not import from `apps/admin`.
- Do not depend on admin localStorage, admin mock stores, or editor-only components.
- Consume public APIs, public SDKs, or generated JSON payloads only.
- Treat Backy as the source of truth for content, assets, SEO, theme tokens, and interaction endpoints.
- Render design however the frontend wants, as long as Backy-managed fields remain addressable.

## Public bootstrap flow

1. Resolve the site.
   - `GET /api/sites?identifier=:identifier`
   - Future stable form: `GET /api/public/sites/:identifier`

2. Resolve a route.
   - `GET /api/sites/:siteId/resolve?path=/about`
   - `GET /api/sites/:siteId/pages?slug=:path`
   - `GET /api/sites/:siteId/render?path=/about`
   - Future stable form: `GET /api/public/sites/:siteId/resolve?path=/about`
   - Public route resolution returns published content and scheduled content only after `scheduledAt` has passed. Drafts and future scheduled content require a valid preview token.

3. Fetch supporting data.
   - media: `GET /api/sites/:siteId/media`
   - navigation: `GET /api/sites/:siteId/navigation`
   - blog: `GET /api/sites/:siteId/blog`
   - blog categories: `GET /api/sites/:siteId/blog/categories`
   - blog tags: `GET /api/sites/:siteId/blog/tags`
   - blog authors: `GET /api/sites/:siteId/blog/authors`
   - collections: `GET /api/sites/:siteId/collections`
   - collection records: `GET /api/sites/:siteId/collections/:collectionId/records`
   - comments: `GET /api/sites/:siteId/pages/:pageId/comments?status=approved`

4. Submit interactions.
   - forms: `POST /api/sites/:siteId/forms/:formId/submissions`
   - page comments: `POST /api/sites/:siteId/pages/:pageId/comments`
   - blog comments: `POST /api/sites/:siteId/blog/:postId/comments`

## Current render payload endpoint

The first implementation-backed endpoint is:

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/sites/:siteId/render?path=/blog/example-post`

It returns the `content-payload.schema.json` shape for pages and blog posts from the current public data adapter. This is not yet the final durable database-backed service, but it gives external frontends and AI-generated frontends a stable payload target while Backy replaces seeded/mock persistence.

`npm run test:admin-contract --workspace @backy/public` validates the page and blog post render responses against `content-payload.schema.json` so contract drift is caught during the public API smoke pass.

## Current collection endpoints

Backy now exposes the first implementation-backed CMS collection surface:

- `GET /api/sites/:siteId/collections`
- `GET /api/sites/:siteId/collections/:collectionId`
- `GET /api/sites/:siteId/collections/:collectionId/records?slug=example`
- `GET/POST/PATCH/DELETE /api/admin/sites/:siteId/collections`
- `GET/POST/PATCH/DELETE /api/admin/sites/:siteId/collections/:collectionId/records`

These endpoints make collection schemas and records addressable by custom frontends. Public reads hide draft/private collections and unpublished records. Dataset binding resolution and dynamic item route rendering still need to be wired into the render payload.

## Required payload shape

Backy should expose one public render payload:

```json
{
  "success": true,
  "requestId": "req_123",
  "data": {
    "site": {
      "id": "site_123",
      "slug": "demo",
      "name": "Demo Site",
      "locale": "en",
      "themeTokens": {}
    },
    "navigation": {
      "primary": [
        {
          "id": "nav_page_123",
          "type": "page",
          "pageId": "page_123",
          "label": "About",
          "title": "About",
          "slug": "about",
          "path": "/about",
          "status": "published",
          "isHomepage": false,
          "children": []
        }
      ]
    },
    "route": {
      "type": "page",
      "path": "/about",
      "status": "published",
      "canonical": "/about"
    },
    "content": {
      "schemaVersion": "backy.content.v1",
      "id": "page_123",
      "kind": "page",
      "elements": []
    },
    "assets": {
      "media": [],
      "fonts": []
    },
    "interactions": {
      "forms": [],
      "comments": []
    },
    "seo": {
      "title": "About",
      "description": "",
      "robots": {
        "index": true,
        "follow": true
      }
    },
    "editableMap": {}
  }
}
```

## Element control requirements

Every element in the content document should expose:

- stable `id`;
- `type`;
- optional `name`;
- `children`;
- layout values;
- responsive overrides;
- style token references and raw fallback styles;
- content fields with field IDs;
- asset references by ID, not only raw URLs;
- action definitions for links, forms, media controls, and custom events;
- accessibility fields such as labels, alt text, roles, and aria metadata;
- data bindings for dynamic collections;
- edit permissions for what Backy can modify.

## Editable map

The frontend should be able to tell Backy what a visible thing maps to. Example:

```json
{
  "headline.hero": {
    "elementId": "el_hero_title",
    "field": "props.content",
    "editable": true
  },
  "image.hero": {
    "elementId": "el_hero_image",
    "field": "props.assetId",
    "editable": true
  },
  "button.primary.color": {
    "elementId": "el_cta",
    "field": "styles.backgroundColor",
    "token": "color.primary",
    "editable": true
  }
}
```

This is how Backy can let an AI generate any frontend design while still controlling a single character, image, video, sound, button, theme color, font, spacing value, or interaction from the CMS.

## Machine-readable contract files

- `content-payload.schema.json`: public render payload envelope for any custom frontend.
- `theme-tokens.schema.json`: colors, typography, spacing, radii, shadows, motion, and breakpoints.
- `element-actions.schema.json`: route/link/form/media/custom actions attached to elements.
- `data-bindings.schema.json`: dataset queries and element field bindings for dynamic pages.
- `editable-map.schema.json`: maps visible frontend controls back to Backy-managed fields.
- `examples/page.json`: static page render payload.
- `examples/blog-post.json`: blog post payload with comments and featured media.
- `examples/dynamic-item-page.json`: collection-backed dynamic route payload.
- `examples/form-page.json`: form-enabled page payload.

These schemas are the current external target. Implementation can remain incremental, but custom frontends should not depend on fields outside this folder unless a newer contract version explicitly adds them.
