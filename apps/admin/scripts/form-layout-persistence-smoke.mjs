import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const core = require("@backy-cms/core");
function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      JSON,
      Object,
      structuredClone,
      require: (id) => {
        if (!(id in mocks)) throw Error("Unexpected import: " + id);
        return mocks[id];
      },
    },
  );
  return module.exports;
}
const catalog = load("../src/components/editor/editorCatalog.ts", {
  "@/lib/utils": { generateId: () => "fixture-id" },
  "@backy-cms/core": core,
});
const elements = [
  {
    id: "heading",
    type: "text",
    x: 0,
    y: 0,
    width: 300,
    height: 80,
    props: { content: "Before", extension: { keep: [false, 0] } },
    children: [],
  },
];
const size = { width: 600, height: 480, layout: "fixed" };
const doc = core.canvasElementsToBackyContentDocument({
  id: "source-doc",
  kind: "page",
  elements,
  canvasSize: size,
  locale: "hi",
  version: { id: "captured-v4", number: 4, source: "import" },
  customCSS: ".captured { color: teal; }",
  customJS: "// preserved only",
  assets: { extension: { keep: true } },
  themeTokenRefs: { extension: "source-token" },
  interactions: { extension: { keep: true } },
  dataBindings: { extension: { keep: true } },
  editableMap: { extension: { keep: true } },
  seo: { title: "Captured", extension: { keep: true } },
  metadata: { extension: { keep: true } },
});
doc.rootExtension = { keep: [false, 0] };
let saved,
  states = 0,
  savedNotifications = 0;
const CanvasEditor = () => null;
const render = (type, props, key) => ({ type, props, key });
const wrapper = load("../src/components/forms/ImportedFormLayoutEditor.tsx", {
  react: {
    useMemo: (fn) => fn(),
    useState: () => [states++ === 0 ? true : "", () => {}],
  },
  "react/jsx-runtime": { jsx: render, jsxs: render },
  "@/lib/adminContentApi": {
    updateForm: async (site, id, payload) => {
      assert.equal(site, "site");
      assert.equal(id, "form");
      saved = payload;
    },
  },
  "@/components/editor/CanvasEditor": { CanvasEditor },
  "@/components/editor/editorCatalog": catalog,
});
const form = {
  id: "form",
  name: "portable",
  title: "Portable",
  updatedAt: "2026-10-06T00:00:00Z",
  settings: {
    formTemplateImport: { source: "provenance" },
    unknownSettings: { keep: [false, 0] },
    frontendDesignContentDocument: doc,
  },
};
const tree = wrapper.ImportedFormLayoutEditor({
  siteId: "site",
  form,
  canEdit: true,
  onSaved: async () => {
    savedNotifications++;
  },
});
function find(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === CanvasEditor) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child);
    if (match) return match;
  }
}
const editor = find(tree);
assert(editor);
assert.equal(editor.key, "site:form");
assert.equal(editor.props.savePersistence, "editor");
const edited = structuredClone(editor.props.initialElements);
edited[0].props.content = "Edited and saved";
await editor.props.onSave(edited, {}, size);
assert.equal(savedNotifications, 1);
const stored = saved.settings.frontendDesignContentDocument;
const json = (value) => JSON.parse(JSON.stringify(value));
for (const key of [
  "assets",
  "themeTokenRefs",
  "interactions",
  "dataBindings",
  "editableMap",
  "seo",
  "rootExtension",
])
  assert.deepEqual(json(stored[key]), json(doc[key]), key);
assert.equal(stored.locale, "hi");
assert.deepEqual(json(stored.version), { id: "captured-v4", number: 4, source: "import" });
assert.equal(stored.metadata.customCSS, doc.metadata.customCSS);
assert.equal(stored.metadata.customJS, doc.metadata.customJS);
assert.deepEqual(json(stored.metadata.extension), { keep: true });
assert.equal(stored.elements[0].props.content, "Edited and saved");
assert.deepEqual(json(saved.settings.unknownSettings), { keep: [false, 0] });
assert.deepEqual(json(saved.settings.formTemplateImport), {
  source: "provenance",
});
console.log(
  "Actual imported form layout wrapper save: shared serializer preserves canonical assets/tokens/bindings/interactions/SEO/CSS/JS/locale/version/unknown roots and settings, edits persisted through parent PATCH callback. Mock React/API transport; browser/cold-store proof separate. PASS.",
);
