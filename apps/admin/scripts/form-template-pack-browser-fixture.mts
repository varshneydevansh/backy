import { execFileSync } from "node:child_process";
/** Actual import/captured-layout UI leaves + real demo handlers/store. Browser actions use CUA. */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { buildSync } from "esbuild";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { load } from "../../public/scripts/collection-import-postgres-handlers.mjs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
  scratch = mkdtempSync(join(tmpdir(), "backy-form-pack-browser-")),
  cwd = process.cwd(),
  port = 5186;
let server: any;
process.once("exit", () => rmSync(scratch, { recursive: true, force: true }));
try {
  process.chdir(scratch);
  const sm: any = await import("../../public/src/lib/backyStore.ts"),
    store = sm.default || sm,
    hm: any = await import("../../public/src/lib/formTemplatePackImport.ts"),
    helper = hm.default || hm;
  const site = store.createAdminSite({
    id: "form-import-owner",
    name: "Disposable form import",
    slug: "form-import-owner",
  });
  const element = {
    id: "form-layout-group",
    type: "section",
    x: 0,
    y: 0,
    width: 600,
    height: 360,
    props: { layoutMode: "flow", layoutDirection: "column", layoutGap: 16 },
    children: [
      {
        id: "captured-heading",
        type: "text",
        x: 0,
        y: 0,
        width: 540,
        height: 60,
        props: {
          content: "Captured registration layout",
          fontSize: 28,
          extension: { keep: [false, 0] },
        },
        responsive: { mobile: { width: 320 } },
        children: [],
      },
      {
        id: "captured-form",
        type: "form",
        x: 0,
        y: 80,
        width: 540,
        height: 250,
        props: {
          formId: "source-only-form",
          formName: "source-form",
          formTitle: "Registration",
          formActive: true,
          fields: [
            { key: "email", label: "Email", type: "email", required: true },
          ],
          extension: { keep: true },
        },
        children: [],
      },
    ],
  };
  const pack = {
    schemaVersion: "backy.form-template-pack.v1",
    site: { id: "source-site", name: "Source provenance" },
    builtInTemplates: [],
    frontendTemplates: [
      {
        schemaVersion: "backy.frontend-form-template.v1",
        template: {
          id: "portable-registration",
          name: "Portable registration",
          source: { type: "custom" },
        },
        form: {
          schemaVersion: "backy.form-template.v1",
          id: "portable-registration",
          title: "Portable registration",
          audience: "public",
          isActive: true,
          fields: [
            {
              key: "email",
              label: "Email",
              type: "email",
              required: true,
              unknownField: { keep: [false, 0] },
            },
          ],
          spamSettings: { minFillMs: 300 },
          consentSettings: { retentionDays: 15 },
          extension: { keep: true },
        },
        settings: {
          frontendDesignTemplateId: "unavailable-source-template",
          frontendDesignElements: [element],
          frontendDesignCanvasSize: { width: 600, height: 480 },
          frontendDesignTokens: { colors: { primary: "#0f766e" } },
          unknownSettings: { keep: [false, 0] },
        },
      },
    ],
  };
  const packPath = join(scratch, "portable-registration.json");
  writeFileSync(packPath, JSON.stringify(pack, null, 2));
  const calls: any[] = [];
  const mocks: any = {
    "next/server": { NextResponse },
    "@/lib/backyStore": store,
    "./backyStore": store,
    "@/lib/formTemplatePackImport": helper,
    "@/lib/adminAccess": {
      requireAdminAccess: async (request: any, _id: any, options: any) => {
        calls.push({
          permission: options.permission,
          path: new URL(request.url).pathname,
        });
        if (
          new URL(request.url).pathname.includes("/foreign-form-site/") ||
          request.headers.get("x-fixture-deny") === "true"
        )
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "FORBIDDEN_PERMISSION",
                message: "Synthetic site scope denied.",
              },
            },
            { status: 403 },
          );
        return { session: { user: { id: "synthetic-form-owner" } } };
      },
    },
    "@/lib/repositoryRuntime": {
      shouldUseDemoStoreFallback: () => true,
      getRequiredDatabaseRepositories: async () => {
        throw Error("Fixture DB forbidden");
      },
    },
    "@/lib/adminAudit": { recordAdminAudit: async () => ({}) },
    "@/lib/formAttachmentLifecycle": {},
    "@/lib/cacheInvalidation": {
      recordSiteCacheInvalidation: async () => ({}),
    },
    "@/lib/siteWebhookDelivery": { deliverSiteWebhooks: async () => [] },
  };
  // Use native JSON so the actual safe parser receives the same plain prototypes as a normal Next request.
  const req = createRequire(import.meta.url);
  function importRoute(file: string) {
    const module = { exports: {} as any };
    vm.runInNewContext(
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        JSON,
        Buffer,
        process,
        require: (id: string) => mocks[id] || req(id),
      },
    );
    return module.exports;
  }
  const handlers = {
    import: importRoute(
      join(
        root,
        "apps/public/src/app/api/admin/sites/[siteId]/forms/template-pack/import/route.ts",
      ),
    ),
    form: load(
      "../src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts",
      mocks,
    ),
  };
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
  buildSync({
    entryPoints: [join(root, "packages/core/src/index.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: join(scratch, "core.mjs"),
  });
  writeFileSync(
    join(scratch, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
  );
  execFileSync(
    join(root, "node_modules/.bin/tailwindcss"),
    [
      "-c",
      "apps/admin/tailwind.config.js",
      "-i",
      "apps/admin/src/index.css",
      "-o",
      join(scratch, "proof.css"),
      "--content",
      "apps/admin/src/**/*.{ts,tsx}",
    ],
    { cwd: root, stdio: "pipe" },
  );
  writeFileSync(
    join(scratch, "main.tsx"),
    `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{FormTemplatePackImportPanel}from'${join(root, "apps/admin/src/components/forms/FormTemplatePackImportPanel.tsx")}';import{ImportedFormLayoutEditor}from'${join(root, "apps/admin/src/components/forms/ImportedFormLayoutEditor.tsx")}';import'./proof.css';function App(){const[forms,setForms]=useState([]);async function reload(){setForms((await(await fetch('/fixture/saved')).json()).forms)}useEffect(()=>{reload()},[]);return <main className="mx-auto max-w-6xl p-5"><h1 className="mb-4 text-xl font-semibold">Disposable form import acceptance</h1><p className="mb-4 text-sm">Actual import and captured-layout components; synthetic local owner; no provider.</p><FormTemplatePackImportPanel siteId="${site.id}" canImport onApplied={reload}/>{forms.map(f=><div key={f.id}><h2>{f.title} · {f.isActive?'active':'inactive'} · {f.name}</h2><ImportedFormLayoutEditor siteId="${site.id}" form={f} canEdit onSaved={reload}/></div>)}</main>}createRoot(document.getElementById('root')).render(<App/>);`,
  );
  server = await createServer({
    root: scratch,
    plugins: [
      react(),
      {
        name: "owned-form-api",
        configureServer(vite) {
          vite.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url || "/", `http://127.0.0.1:${port}`),
              json = (v: any) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(v));
              };
            if (url.pathname === "/fixture/saved")
              return json({ forms: store.listFormsBySite(site.id), calls });
            const matched = url.pathname.match(
              /^\/api\/admin\/sites\/([^/]+)\/forms\/(template-pack\/import|[^/]+)$/,
            );
            if (matched) {
              try {
                let body = "";
                for await (const chunk of req) body += chunk;
                const params = { siteId: matched[1], formId: matched[2] },
                  request = new NextRequest(url, {
                    method: req.method,
                    headers: req.headers as any,
                    ...(body ? { body } : {}),
                  });
                const response = await (
                  matched[2] === "template-pack/import"
                    ? handlers.import
                    : handlers.form
                )[req.method!](request, { params: Promise.resolve(params) });
                res.statusCode = response.status;
                for (const [k, v] of response.headers) res.setHeader(k, v);
                return res.end(await response.text());
              } catch (e) {
                res.statusCode = 500;
                return json({
                  success: false,
                  error: { message: "Owned fixture handler failed." },
                });
              }
            }
            if (url.pathname.includes("/interactive-components"))
              return json({
                success: true,
                data: {
                  siteId: site.id,
                  components: [],
                  pagination: {
                    total: 0,
                    limit: 100,
                    offset: 0,
                    hasMore: false,
                  },
                },
              });
            if (url.pathname.endsWith("/reusable-sections"))
              return json({
                success: true,
                data: {
                  sections: [],
                  pagination: {
                    total: 0,
                    limit: 100,
                    offset: 0,
                    hasMore: false,
                  },
                },
              });
            if (url.pathname.endsWith("/media"))
              return json({
                success: true,
                data: {
                  media: [],
                  pagination: {
                    total: 0,
                    limit: 100,
                    offset: 0,
                    hasMore: false,
                  },
                },
              });
            if (url.pathname.endsWith("/collections"))
              return json({
                success: true,
                data: {
                  collections: [],
                  pagination: {
                    total: 0,
                    limit: 100,
                    offset: 0,
                    hasMore: false,
                  },
                },
              });
            if (url.pathname === "/api/admin/sites")
              return json({ success: true, data: { sites: [site] } });
            if (url.pathname.endsWith("/frontend-design"))
              return json({
                success: true,
                data: {
                  frontendDesign: {
                    schemaVersion: "backy.frontend-design.v1",
                    templates: [],
                    tokens: {},
                  },
                },
              });
            if (url.pathname.startsWith("/api/")) {
              res.statusCode = 404;
              return json({
                success: false,
                error: { message: "Fixture endpoint not mounted." },
              });
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": join(root, "apps/admin/src"),
        "@backy-cms/core": join(scratch, "core.mjs"),
      },
      dedupe: ["react", "react-dom", "gsap"],
    },
    define: {
      "process.env": "{}",
      "import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL": JSON.stringify(
        `http://127.0.0.1:${port}/api/admin`,
      ),
    },
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      fs: { allow: [root, scratch] },
    },
  });
  await server.listen();
  console.log(
    JSON.stringify({
      ready: true,
      url: `http://127.0.0.1:${port}`,
      packPath,
      scratch,
      scope:
        "Actual import/layout UI leaves and import/detail demo handlers; synthetic site-scoped auth; disposable JSON; no providers",
    }),
  );
  await new Promise((resolve) => {
    process.once("SIGTERM", resolve);
    process.once("SIGINT", resolve);
  });
} finally {
  await server?.close();
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
}
