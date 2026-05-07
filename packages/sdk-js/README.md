# Backy JavaScript SDK

Small TypeScript client for custom/generated frontends that consume Backy through public APIs.

```ts
import { createBackyClient } from '@backy/sdk-js';

const backy = createBackyClient({ baseUrl: 'https://your-backy-host.com' });

await backy.discoverSite('demo');
const manifest = await backy.manifest();
const page = await backy.render('/');
```

The SDK intentionally does not import admin/editor code. It wraps the public site bootstrap, manifest/OpenAPI discovery, route resolution, render payload, media, collection, form, comment, report, and event endpoints documented in `specs/backy-api-contracts.md`.

## Local validation

```sh
npm run build --workspace @backy/sdk-js
npm run test:smoke --workspace @backy/sdk-js
```

`test:smoke` expects a running Backy public app at `http://localhost:3001` unless `BACKY_SDK_BASE_URL` is set.
