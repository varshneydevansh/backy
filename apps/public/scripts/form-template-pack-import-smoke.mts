import { validateFormTemplatePackResponse } from "./form-template-pack-contract-validation.mts";
import { execFileSync } from "node:child_process";
import { fixture } from "./admin-access-test-fixtures.mts";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";
import vm from "node:vm";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  root = process.cwd(),
  scratch = mkdtempSync(join(tmpdir(), "backy-form-pack-"));
process.chdir(scratch);
let count = 0;
const check = (fn: () => void) => {
  fn();
  count++;
};
const asyncCheck = async (fn: () => Promise<void>) => {
  await fn();
  count++;
};
try {
  const storeModule: any = await import("../src/lib/backyStore.ts"),
    store = storeModule.default || storeModule;
  const helperModule: any =
      await import("../src/lib/formTemplatePackImport.ts"),
    helper = helperModule.default || helperModule;
  const site = store.createAdminSite({
      name: "Form import proof",
      slug: "form-pack-proof",
    }),
    foreign = store.createAdminSite({
      name: "Foreign",
      slug: "foreign-form-pack",
    });
  const layout = {
    elements: [
      {
        id: "group",
        type: "section",
        x: 0,
        y: 0,
        width: 600,
        height: 350,
        props: { layoutMode: "flow" },
        children: [
          {
            id: "form-block",
            type: "form",
            width: 500,
            height: 250,
            props: {
              formId: "source-form",
              formName: "source",
              fields: [
                { key: "email", label: "Email", type: "email", required: true },
              ],
              extension: { keep: [false, 0] },
            },
            responsive: { mobile: { width: 320 } },
            children: [],
          },
        ],
      },
    ],
    canvasSize: { width: 600, height: 400 },
  };
  const manifest = (id: string) => ({
    schemaVersion: "backy.form-template.v1",
    id,
    title: `Template ${id}`,
    audience: "public",
    isActive: true,
    fields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        unknownField: { deep: [false, 0] },
      },
    ],
    spamSettings: { minFillMs: 321 },
    consentSettings: { retentionDays: 12 },
    successMessage: "Received",
    customRoot: { keep: true },
    editorFormBlockProps: {
      formId: "source",
      fields: [],
      extension: { keep: true },
    },
  });
  const pack = {
    schemaVersion: "backy.form-template-pack.v1",
    site: { id: foreign.id, privateScope: "source only" },
    export: { format: "json" },
    builtInTemplates: [manifest("simple")],
    frontendTemplates: [
      {
        schemaVersion: "backy.frontend-form-template.v1",
        template: {
          id: "captured",
          name: "Captured",
          source: { type: "custom" },
          extension: { keep: true },
        },
        form: manifest("capture-form"),
        settings: {
          frontendDesignTemplateId: "missing-source-registry",
          frontendDesignElements: layout.elements,
          frontendDesignCanvasSize: layout.canvasSize,
          frontendDesignTokens: { fonts: { body: "Georgia" } },
          frontendDesignMetadata: { externalSchema: "x.v9" },
          unknownSettings: { keep: [false, 0] },
        },
      },
    ],
  };
  let actualAccess: any = null;
  let permissionDeny = "",
    demo = true,
    auditFailure = false,
    reads = 0;
  const permissions: string[] = [];
  function loadRoute() {
    const file = fileURLToPath(
        new URL(
          "../src/app/api/admin/sites/[siteId]/forms/template-pack/import/route.ts",
          import.meta.url,
        ),
      ),
      module = { exports: {} as any };
    const mocks: any = {
      "next/server": { NextResponse },
      "@/lib/adminAccess": {
        requireAdminAccess: async (_r: any, _id: any, o: any) => {
          if (actualAccess) return actualAccess.requireAdminAccess(_r, _id, o);
          permissions.push(o.permission);
          return permissionDeny === o.permission
            ? NextResponse.json({ success: false }, { status: 403 })
            : { session: { user: { id: "synthetic-owner" } } };
        },
      },
      "@/lib/backyStore": store,
      "@/lib/formTemplatePackImport": helper,
      "@/lib/adminAudit": {
        recordAdminAudit: async () => {
          if (auditFailure) throw new Error("PRIVATE audit token");
        },
      },
      "@/lib/repositoryRuntime": {
        shouldUseDemoStoreFallback: () => demo,
        getRequiredDatabaseRepositories: async () => {
          reads++;
          return repos;
        },
      },
    };
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
        Buffer,
        process,
        JSON,
        require: (id: string) => mocks[id] || require(id),
      },
    );
    return module.exports;
  }
  const repos: any = {
    sites: {
      getById: async (id: string) => (id === site.id ? site : null),
      getBySlug: async () => null,
    },
    settings: { get: async () => store.getAdminSettings() },
    forms: {
      list: async () => ({
        items: [],
        pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
      }),
    },
  };
  const route = loadRoute();
  const base = {
    action: "review",
    pack,
    selection: ["builtin:simple", "frontend:captured"],
    names: {},
    references: {},
    acknowledgeUnverified: false,
  };
  async function call(body: any = base, urlSite = site.id) {
    const response = await route.POST(
      new NextRequest(
        `http://fixture.invalid/api/admin/sites/${urlSite}/forms/template-pack/import`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ siteId: urlSite }) },
    );
    const value = await response.json();
    validateFormTemplatePackResponse(response.status, value);
    return { status: response.status, body: value, headers: response.headers };
  }
  const before = store.listFormsBySite(site.id),
    review = await call();
  check(() => assert.equal(review.status, 200));
  check(() => assert.equal(review.body.data.canApply, true));
  check(() => assert.deepEqual(store.listFormsBySite(site.id), before));
  check(() =>
    assert.equal(review.headers.get("cache-control"), "private, no-store"),
  );
  const applied = await call({
    ...base,
    action: "apply",
    reviewVersion: review.body.data.reviewVersion,
  });
  check(() => assert.equal(applied.status, 201));
  check(() => assert.equal(applied.body.data.forms.length, 2));
  const captured = applied.body.data.forms.find(
    (x: any) => x.importId === "frontend:captured",
  ).form;
  check(() => assert.equal(captured.siteId, site.id));
  check(() => assert.equal(captured.pageId, null));
  check(() => assert.equal(captured.isActive, false));
  check(() =>
    assert.deepEqual(captured.fields[0].unknownField, { deep: [false, 0] }),
  );
  check(() =>
    assert.deepEqual(captured.settings.unknownSettings, { keep: [false, 0] }),
  );
  check(() =>
    assert.deepEqual(captured.settings.formTemplateImport.manifest.customRoot, {
      keep: true,
    }),
  );
  check(() =>
    assert.equal(
      captured.settings.frontendDesignElements[0].children[0].props.formId,
      captured.id,
    ),
  );
  check(() =>
    assert.equal(
      captured.settings.frontendDesignTemplateId,
      "missing-source-registry",
    ),
  );
  check(() =>
    assert.equal(
      captured.settings.frontendDesignElements[0].children[0].responsive.mobile
        .width,
      320,
    ),
  );
  const persisted = JSON.parse(
    readFileSync(join(scratch, "data/backy/admin-content.json"), "utf8"),
  );
  check(() =>
    assert.deepEqual(
      persisted.forms.find((f: any) => f.id === captured.id).settings,
      captured.settings,
    ),
  );
  // Exact reviewed intent and current destination are bound. Changed names/package/current inventory cannot reuse an old review.
  const stale = await call({
    ...base,
    action: "apply",
    reviewVersion: review.body.data.reviewVersion,
  });
  check(() => assert.equal(stale.status, 409));
  check(() =>
    assert.equal(store.listFormsBySite(site.id).length, before.length + 2),
  );
  const nameConflict = await call(base);
  check(() => assert.equal(nameConflict.body.data.canApply, false));
  check(() =>
    assert(
      nameConflict.body.data.issues.some(
        (x: any) => x.code === "FORM_NAME_CONFLICT",
      ),
    ),
  );
  const renamed = {
    ...base,
    names: {
      "builtin:simple": "fresh-simple",
      "frontend:captured": "fresh-captured",
    },
  };
  const fresh = await call(renamed),
    changed = await call({
      ...renamed,
      action: "apply",
      reviewVersion: fresh.body.data.reviewVersion,
      names: { ...renamed.names, "builtin:simple": "unreviewed-name" },
    });
  check(() => assert.equal(changed.status, 409));
  const mutation = structuredClone(renamed);
  mutation.pack.builtInTemplates[0].fields[0].label = "Changed after preview";
  await asyncCheck(async () =>
    assert.equal(
      (
        await call({
          ...mutation,
          action: "apply",
          reviewVersion: fresh.body.data.reviewVersion,
        })
      ).status,
      409,
    ),
  );
  const sourceRef = structuredClone(renamed);
  sourceRef.pack.builtInTemplates[0].fields[0].mediaId = "source-media";
  const blocked = await call(sourceRef);
  check(() => assert.equal(blocked.body.data.canApply, false));
  check(() =>
    assert(
      blocked.body.data.issues.some(
        (x: any) => x.code === "REFERENCE_MAPPING_REQUIRED",
      ),
    ),
  );
  const media = store.createMediaItem(site.id, {
    type: "image",
    name: "Proof image",
    originalName: "proof.png",
    mimeType: "image/png",
    sizeBytes: 12,
    filename: "proof.png",
    url: "/uploads/current/proof.png",
    visibility: "public",
    metadata: {},
  });
  const mapped = {
    ...sourceRef,
    references: { media: { "source-media": media.id } },
  };
  const mappedReview = await call(mapped);
  check(() => assert.equal(mappedReview.body.data.canApply, true));
  check(() =>
    assert.equal(
      mappedReview.body.data.targets[0].form.fields[0].mediaId,
      media.id,
    ),
  );
  const foreignMedia = store.createMediaItem(foreign.id, {
    type: "image",
    name: "Foreign image",
    originalName: "foreign.png",
    mimeType: "image/png",
    sizeBytes: 12,
    filename: "proof.png",
    url: "/uploads/foreign/proof.png",
    visibility: "public",
    metadata: {},
  });
  for (const key of ["fontMediaId", "posterMediaId", "fileMediaId"]) {
    const referenced = structuredClone(renamed);
    referenced.pack.frontendTemplates[0].settings.frontendDesignElements[0].children[0].props[
      key
    ] = "source-reference";
    const unmapped = await call(referenced);
    check(() => assert.equal(unmapped.body.data.canApply, false));
    check(() =>
      assert(
        unmapped.body.data.issues.some(
          (i: any) =>
            i.code === "REFERENCE_MAPPING_REQUIRED" &&
            i.path.endsWith("." + key),
        ),
      ),
    );
    const resolved = await call({
      ...referenced,
      references: { media: { "source-reference": media.id } },
    });
    check(() => assert.equal(resolved.body.data.canApply, true));
    check(() =>
      assert.equal(
        resolved.body.data.targets.find(
          (t: any) => t.id === "frontend:captured",
        ).form.settings.frontendDesignElements[0].children[0].props[key],
        media.id,
      ),
    );
    const foreignReference = await call({
      ...referenced,
      references: { media: { "source-reference": foreignMedia.id } },
    });
    check(() => assert.equal(foreignReference.body.data.canApply, false));
    permissionDeny = "media.view";
    const noMediaPermission = await call(referenced);
    check(() => assert.equal(noMediaPermission.status, 403));
    permissionDeny = "";
  }
  const deniedRef = await call({
    ...sourceRef,
    references: { media: { "source-media": foreignMedia.id } },
  });
  check(() => assert.equal(deniedRef.body.data.canApply, false));
  permissionDeny = "media.view";
  const deniedPermission = await call(mapped);
  check(() => assert.equal(deniedPermission.status, 403));
  permissionDeny = "forms.view";
  await asyncCheck(async () => assert.equal((await call()).status, 403));
  permissionDeny = "forms.create";
  await asyncCheck(async () =>
    assert.equal(
      (
        await call({
          ...renamed,
          action: "apply",
          reviewVersion: fresh.body.data.reviewVersion,
        })
      ).status,
      403,
    ),
  );
  permissionDeny = "";
  const invalid = await call("{bad");
  check(() => assert.equal(invalid.status, 400));
  const prototype = await call(
    '{"action":"review","pack":{"schemaVersion":"backy.form-template-pack.v1","__proto__":{}},"selection":[]}',
  );
  check(() => assert.equal(prototype.status, 400));
  const credentials = structuredClone(renamed);
  credentials.pack.builtInTemplates[0].settings = {
    apiKey: "PRIVATE-SYNTHETIC",
  };
  const credentialResult = await call(credentials);
  check(() => assert.equal(credentialResult.status, 400));
  check(() =>
    assert(!JSON.stringify(credentialResult).includes("PRIVATE-SYNTHETIC")),
  );
  await asyncCheck(async () =>
    assert.equal(
      (await call(JSON.stringify({ ...renamed, padding: "x".repeat(2100000) })))
        .status,
      413,
    ),
  );
  const unsupported = { ...renamed, selection: ["builtin:simple"] };
  demo = false;
  const sqlReview = await call(unsupported);
  check(() => assert.equal(sqlReview.status, 200));
  const unavailable = await call({
    ...unsupported,
    action: "apply",
    reviewVersion: sqlReview.body.data.reviewVersion,
  });
  check(() => assert.equal(unavailable.status, 503));
  check(() =>
    assert.equal(
      unavailable.body.error.code,
      "FORM_TEMPLATE_IMPORT_UNAVAILABLE",
    ),
  );
  demo = true;
  // Demo memory/disk publish only after strict complete file write. Rename failure leaves exact old bytes and state.
  const adminPath = join(scratch, "data/backy/admin-content.json");
  let disk = JSON.parse(readFileSync(adminPath, "utf8"));
  disk.unknownStoreRoot = { keep: [false, 0] };
  writeFileSync(adminPath, JSON.stringify(disk));
  const finalReview = await call(renamed);
  auditFailure = true;
  const finalApply = await call({
    ...renamed,
    action: "apply",
    reviewVersion: finalReview.body.data.reviewVersion,
  });
  check(() => assert.equal(finalApply.status, 201));
  check(() =>
    assert.deepEqual(finalApply.body.data.completionWarnings, [
      "FORM_TEMPLATE_AUDIT_PENDING",
    ]),
  );
  check(() =>
    assert.deepEqual(
      JSON.parse(readFileSync(adminPath, "utf8")).unknownStoreRoot,
      { keep: [false, 0] },
    ),
  );
  check(() =>
    assert(!JSON.stringify(finalApply.body).includes("PRIVATE audit")),
  );
  const snapshot = store.listFormsBySite(site.id);
  const old = readFileSync(adminPath, "utf8");
  const broken = {
    ...renamed,
    names: {
      "builtin:simple": "rollback-simple",
      "frontend:captured": "rollback-captured",
    },
  };
  const rollbackReview = await call(broken);
  // Deny staging writes in this owned directory after review; no memory or existing file changes are published.
  const fs = await import("node:fs");
  const dir = join(scratch, "data/backy");
  fs.chmodSync(dir, 0o500);
  let rollback: any;
  try {
    rollback = await call({
      ...broken,
      action: "apply",
      reviewVersion: rollbackReview.body.data.reviewVersion,
    });
  } finally {
    fs.chmodSync(dir, 0o700);
  }
  check(() => assert.equal(rollback.status, 500));
  check(() => assert.equal(readFileSync(adminPath, "utf8"), old));
  check(() => assert.deepEqual(store.listFormsBySite(site.id), snapshot));
  const coldScript = join(scratch, "cold-reopen.mts"),
    repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  writeFileSync(
    coldScript,
    `import assert from 'node:assert/strict';const module=await import(${JSON.stringify(fileURLToPath(new URL("../src/lib/backyStore.ts", import.meta.url)))}),store=module.default||module;assert(store.getSiteByIdOrSlug(${JSON.stringify(site.id)}));const form=store.getFormById(${JSON.stringify(site.id)},${JSON.stringify(captured.id)});assert(form);assert.equal(form.isActive,false);assert.deepEqual(form.fields[0].unknownField,{deep:[false,0]});assert.deepEqual(form.settings.unknownSettings,{keep:[false,0]});assert.equal(form.settings.frontendDesignElements[0].children[0].props.formId,form.id);assert.deepEqual(form.settings.frontendDesignElements[0].children[0].responsive.mobile,{width:320});`,
  );
  execFileSync(
    join(repositoryRoot, "node_modules/.bin/tsx"),
    [
      "--tsconfig",
      join(repositoryRoot, "apps/public/tsconfig.json"),
      coldScript,
    ],
    { cwd: scratch, stdio: "pipe", timeout: 30000 },
  );
  count++;
  const edgeInput = {
    ...renamed,
    names: {
      "builtin:simple": "edge-simple",
      "frontend:captured": "edge-captured",
    },
  };
  const invalidTree = structuredClone(edgeInput);
  invalidTree.pack.frontendTemplates[0].settings.frontendDesignElements[0].children[0].id =
    "group";
  const badTreeReview = await call(invalidTree);
  check(() => assert.equal(badTreeReview.body.data.canApply, false));
  check(() =>
    assert(
      badTreeReview.body.data.issues.some(
        (i: any) => i.code === "INVALID_CAPTURED_LAYOUT",
      ),
    ),
  );
  const customRuntime = structuredClone(edgeInput);
  const unknownElement = structuredClone(edgeInput);
  unknownElement.pack.frontendTemplates[0].settings.frontendDesignElements[0].children[0].type =
    "source-only-react-widget";
  const unknownReview = await call(unknownElement);
  check(() => assert.equal(unknownReview.body.data.canApply, false));
  check(() =>
    assert(
      unknownReview.body.data.issues.some(
        (i: any) =>
          i.code === "CAPTURED_ELEMENT_RUNTIME_UNVERIFIED" &&
          i.path === "settings.frontendDesignElements[0].children[0].type",
      ),
    ),
  );
  const unknownAcknowledged = await call({
    ...unknownElement,
    acknowledgeUnverified: true,
  });
  check(() => assert.equal(unknownAcknowledged.body.data.canApply, true));
  check(() =>
    assert.equal(
      unknownAcknowledged.body.data.targets.find(
        (t: any) => t.id === "frontend:captured",
      ).form.settings.frontendDesignElements[0].children[0].type,
      "source-only-react-widget",
    ),
  );
  const missingComponentIdentity = structuredClone(edgeInput);
  missingComponentIdentity.pack.frontendTemplates[0].settings.frontendDesignElements[0].children[0].type =
    "codeComponent";
  const identityReview = await call({
    ...missingComponentIdentity,
    acknowledgeUnverified: true,
  });
  check(() => assert.equal(identityReview.body.data.canApply, false));
  check(() =>
    assert(
      identityReview.body.data.issues.some(
        (i: any) => i.code === "COMPONENT_IDENTITY_REQUIRED",
      ),
    ),
  );
  const invalidProps = structuredClone(edgeInput);
  invalidProps.pack.frontendTemplates[0].settings.frontendDesignElements[0].children[0].props =
    [] as any;
  const propsReview = await call(invalidProps);
  check(() => assert.equal(propsReview.body.data.canApply, false));
  check(() =>
    assert(
      propsReview.body.data.issues.some(
        (i: any) =>
          i.code === "INVALID_CAPTURED_LAYOUT" && i.path.endsWith(".props"),
      ),
    ),
  );
  customRuntime.pack.frontendTemplates[0].settings.frontendDesignCustomJs =
    'console.log("unverified imported code")';
  const customReview = await call(customRuntime);
  check(() => assert.equal(customReview.body.data.canApply, false));
  check(() =>
    assert(
      customReview.body.data.issues.some(
        (i: any) => i.code === "CUSTOM_RUNTIME_UNVERIFIED",
      ),
    ),
  );
  const acknowledged = await call({
    ...customRuntime,
    acknowledgeUnverified: true,
  });
  check(() => assert.equal(acknowledged.body.data.canApply, true));
  const unselectedResource = structuredClone(edgeInput);
  unselectedResource.selection = ["builtin:simple"];
  unselectedResource.pack.frontendTemplates[0].settings.mediaId =
    "unselected-source-media";
  permissionDeny = "media.view";
  const earlierPermissions = permissions.length;
  const unselectedReview = await call(unselectedResource);
  check(() => assert.equal(unselectedReview.status, 200));
  check(() =>
    assert(!permissions.slice(earlierPermissions).includes("media.view")),
  );
  permissionDeny = "";
  const invalidConfiguration = structuredClone(edgeInput);
  invalidConfiguration.pack.builtInTemplates[0].title = { invalid: true };
  invalidConfiguration.pack.builtInTemplates[0].fields[0].required = "yes";
  const configReview = await call(invalidConfiguration);
  check(() => assert.equal(configReview.body.data.canApply, false));
  const invalidTitleTarget = configReview.body.data.targets.find(
    (target: any) => target.id === "builtin:simple",
  );
  check(() => assert.equal(invalidTitleTarget.title, "edge-simple"));
  check(() => assert.equal(invalidTitleTarget.form.title, "edge-simple"));
  check(() =>
    assert.deepEqual(
      invalidTitleTarget.form.settings.formTemplateImport.manifest.title,
      { invalid: true },
    ),
  );
  check(() =>
    assert(
      configReview.body.data.issues.some(
        (i: any) => i.code === "INVALID_FORM_CONFIGURATION",
      ),
    ),
  );
  check(() =>
    assert(
      configReview.body.data.issues.some(
        (i: any) => i.path === "fields[0].required",
      ),
    ),
  );
  const scope = fixture({ actorRole: "admin" });
  scope.settings().auth.userSiteGrants = [
    {
      userId: scope.actor.id,
      scope: {
        version: 1,
        revision: 1,
        mode: "selected-sites",
        grants: [{ siteId: scope.site.id, permissions: ["forms.view"] }],
        expiresAt: null,
      },
    },
  ];
  actualAccess = scope.access;
  const scopedDenied = await call(base, scope.otherSite.id);
  check(() => assert.equal(scopedDenied.status, 403));
  check(() =>
    assert.equal(store.listFormsBySite(site.id).length, snapshot.length),
  );
  const scopedWriteDenied = await call(
    {
      ...renamed,
      action: "apply",
      reviewVersion: fresh.body.data.reviewVersion,
    },
    scope.site.id,
  );
  check(() => assert.equal(scopedWriteDenied.status, 403));
  const scopedMediaDenied = await call(mapped, scope.site.id);
  check(() => assert.equal(scopedMediaDenied.status, 403));
  check(() => assert.equal(scope.effects.writes, 0));
  actualAccess = null;
  const fieldPolicy: any = await import("../src/lib/adminFormFieldPolicy.ts");
  check(() =>
    assert.deepEqual(
      (fieldPolicy.default || fieldPolicy).parseFormFields(captured.fields)[0]
        .unknownField,
      { deep: [false, 0] },
    ),
  );
  console.log(
    `Form template pack actual handler/demo acceptance passed ${count} checks: read-only preview, exact intent/current state, inactive standalone captured tree, reference/permission denial, safe JSON bounds, unknown-field/store preservation, unavailable adapter, strict persistence failure and safe postcommit audit warning. Synthetic auth; no provider.`,
  );
} finally {
  process.chdir(root);
  rmSync(scratch, { recursive: true, force: true });
}
