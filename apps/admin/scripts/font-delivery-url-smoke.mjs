import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const file = new URL(
    "../src/components/editor/fontCatalog.ts",
    import.meta.url,
  ),
  module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file.pathname,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { module, exports: module.exports, URL },
);
const api = module.exports,
  media = (url) => ({
    id: "proof",
    name: "Proof.woff2",
    type: "font",
    url,
    metadata: { fontFamily: "Proof" },
  });
for (const url of [
  "https://assets.example.test/Proof.woff2?version=2&signature=synthetic",
  "/api/sites/site/media/proof/file?token=synthetic",
  "assets/Proof.woff2?v=3#face",
]) {
  const font = api
    .getFontFamilyOptions([media(url)])
    .find((f) => f.mediaId === "proof");
  assert(font);
  assert.equal(font.url, url);
  assert.equal(font.format, "woff2");
  assert.equal(font.faces[0].url, url);
  assert(
    api
      .buildCustomFontFaces([font])
      .includes(`src: url("${url}") format("woff2")`),
  );
}
for (const url of [
  "javascript:alert(1)",
  "data:text/html,unsafe",
  "https://user:password@example.test/proof.woff2",
  "https://example.test/a.woff2\nunsafe",
  "https://example.test/</style>.woff2",
])
  assert(
    !api.getFontFamilyOptions([media(url)]).some((f) => f.mediaId === "proof"),
  );
const variants = api
  .getFontFamilyOptions([
    media("https://assets.example.test/Proof.woff2?face=regular"),
    {
      ...media("https://assets.example.test/Proof.woff2?face=bold"),
      id: "bold",
      metadata: { fontFamily: "Proof", fontWeight: "700" },
    },
  ])
  .find((f) => f.mediaId === "proof");
assert.equal(variants.faces.length, 2);
const css = api.buildCustomFontFaces([variants]);
assert(css.includes("?face=regular"));
assert(css.includes("?face=bold"));
assert(css.includes("font-weight: 700"));
console.log(
  "Actual font catalog delivery URLs preserve signed/version query and variants while extension parsing remains correct; unsupported protocols, credentials and CSS/control payloads refused. PASS. No provider/browser network claim.",
);
