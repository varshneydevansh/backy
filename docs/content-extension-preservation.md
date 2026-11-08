# Content extension preservation

Canvas conversion preserves unknown JSON fields at their authored element and
document root paths, including nested component fields and versioned frontend
contracts. Canonical → editor canvas payload → canonical conversion, embedded
content documents, and minimal updates with a fallback document retain these
extensions. Declared fields such as identity, layout, children, props and
component version keep their existing normalization rules and take precedence.

New root extensions are no longer moved into `metadata.legacy`. Existing
`metadata.legacy` values remain there; conversion does not guess which historical
fields should be promoted back to the root. Recovering already-relocated fields
requires an explicit migration with collision reporting.

Extensions support strings, booleans, finite numbers, null, arrays and plain JSON
objects, including null-prototype and native plain objects from another realm.
Copies use own enumerable data properties and do not execute getters or
`toJSON`. Prototype-control keys (`__proto__`, `constructor`, `prototype`),
accessors, symbols, functions, bigint, non-finite numbers, dates, custom class or
prototype instances and cyclic references are excluded. Unsupported object
properties are omitted; unsupported array entries become null to retain later
entries' positions. These unsupported values are outside the JSON extension
contract, so their original executable/object identity is not preserved.

Extension cloning and asset discovery use iterative traversal without a silent
JSON depth cutoff. The declared element tree and existing declared-field
normalizers retain their existing validation and runtime limits. This repair is
transport preservation, not validation of new component render behavior.

Verification commands:

```sh
npm run test:content-contract --workspace @backy-cms/core
npm run test:content-extension-roundtrip --workspace @backy/public
```

The repository adapter checks exercise actual page/post adapters and JSON storage
round-trips with fixtures. They do not certify a live database save or a deployed
frontend render.
