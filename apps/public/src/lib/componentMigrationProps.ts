import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export interface MigrationPropsFinding {
  targetType: "page" | "post";
  targetId: string;
  elementPath: string;
  instancePath: string;
  keyword: string;
}
const metadataFields = [
  "componentKey",
  "version",
  "propsSchema",
  "controls",
  "fallback",
  "fallbackText",
  "renderCapabilities",
  "dataBindings",
  "sandboxUrl",
  "runtimeUrl",
  "registryId",
  "title",
];
/** Registry metadata is authoritative. Never use the saved source node's schema for admission. */
export function migrationTargetPropsSchema(
  target: Record<string, any>,
): unknown {
  return (
    target.propsSchema ??
    (object(target.dependencyMetadata)
      ? target.dependencyMetadata.propsSchema
      : undefined)
  );
}
/** Refresh definitions while preserving authored values and unrelated control metadata. */
export function migratedComponentAuthoringMetadata(
  current: Record<string, any>,
  target: Record<string, any>,
) {
  const schema = migrationTargetPropsSchema(target);
  const metadata = object(target.dependencyMetadata)
    ? target.dependencyMetadata
    : {};
  const targetControls = Array.isArray(target.controls)
    ? target.controls
    : Array.isArray(metadata.controls)
      ? metadata.controls
      : [];
  const currentControls = Array.isArray(current.controls)
    ? current.controls.filter(object)
    : [];
  const properties =
    object(schema) && object(schema.properties) ? schema.properties : {};
  const keys = [
    ...new Set([
      ...targetControls.filter(object).map((control) => control.key),
      ...Object.keys(properties),
    ]),
  ].filter(
    (key): key is string =>
      typeof key === "string" &&
      !!key &&
      !["__proto__", "constructor", "prototype"].includes(key),
  );
  const controls = keys.map((key) => {
    const previous = {
      ...currentControls.find((control) => control.key === key),
    };
    for (const field of [
      "type",
      "options",
      "min",
      "max",
      "step",
      "default",
      "defaultValue",
      "required",
    ])
      delete previous[field];
    const field = object(properties[key]) ? properties[key] : {};
    const declared =
      targetControls.find(
        (control) => object(control) && control.key === key,
      ) || {};
    const type = Array.isArray(field.enum)
      ? "select"
      : ["object", "array"].includes(field.type)
        ? "json"
        : field.type === "integer"
          ? "number"
          : field.type;
    const control: Record<string, any> = {
      ...previous,
      key,
      label: field.title || previous.label || key,
      ...(type ? { type } : {}),
      ...(field.enum ? { options: field.enum } : {}),
      ...(field.minimum !== undefined ? { min: field.minimum } : {}),
      ...(field.maximum !== undefined ? { max: field.maximum } : {}),
      ...(field.type === "integer" ? { step: 1 } : {}),
      ...(field.default !== undefined ? { defaultValue: field.default } : {}),
      ...declared,
    };
    const old = currentControls.find((control) => control.key === key);
    if (old && Object.prototype.hasOwnProperty.call(old, "value"))
      control.value = old.value;
    return control;
  });
  return {
    ...(schema !== undefined ? { propsSchema: schema } : {}),
    ...(schema !== undefined ||
    target.controls !== undefined ||
    metadata.controls !== undefined
      ? { controls }
      : {}),
  };
}
export function componentMigrationPropsFindings(
  targets: Array<{ type: "page" | "post"; id: string; content: unknown }>,
  sourceKey: string,
  sourceVersion: string,
  target: Record<string, any>,
  matches: (value: Record<string, any>) => boolean = (value) =>
    value.componentKey === sourceKey && String(value.version) === sourceVersion,
): MigrationPropsFinding[] {
  const schema = migrationTargetPropsSchema(target);
  if (schema === undefined || (object(schema) && !Object.keys(schema).length))
    return [];
  const findings: MigrationPropsFinding[] = [];
  let validate: ValidateFunction | undefined,
    schemaError = false;
  try {
    if (typeof schema !== "boolean" && !object(schema))
      throw Error("Invalid schema");
    const serialized = JSON.stringify(schema);
    if (serialized.length > 131072) throw Error("Schema too large");
    const options = {
      allErrors: true,
      strictSchema: true,
      strictTypes: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    } as const;
    const engine =
      object(schema) && /2020-12/.test(String(schema.$schema || ""))
        ? new Ajv2020(options)
        : new Ajv(options);
    validate = engine.compile(schema);
    if ((validate as ValidateFunction & { $async?: boolean }).$async)
      throw Error("Async schema is unsupported");
  } catch {
    schemaError = true;
  }
  const properties =
    object(schema) && object(schema.properties) ? schema.properties : {};
  for (const document of targets) {
    const walk = (value: any, path: string) => {
      if (findings.length >= 64) return;
      if (Array.isArray(value)) {
        value.forEach((child, index) => walk(child, `${path}[${index}]`));
        return;
      }
      if (!object(value)) return;
      if (matches(value)) {
        const props =
          typeof value.type === "string" && object(value.props)
            ? { ...value.props }
            : { ...value };
        for (const key of metadataFields)
          if (!(key in properties)) delete props[key];
        const errors: Array<Pick<ErrorObject, "instancePath" | "keyword">> =
          schemaError
            ? [{ instancePath: "", keyword: "unsupported-target-schema" }]
            : validate!(props)
              ? []
              : validate!.errors || [];
        for (const error of errors.slice(0, 16)) {
          if (findings.length >= 64) break;
          const pointer = error.instancePath || "";
          const params = "params" in error ? (error as ErrorObject).params : {};
          const field =
            error.keyword === "required"
              ? params.missingProperty
              : error.keyword === "additionalProperties"
                ? params.additionalProperty
                : undefined;
          findings.push({
            targetType: document.type,
            targetId: document.id,
            elementPath: path,
            instancePath: (
              pointer +
              (typeof field === "string"
                ? "/" + field.replace(/~/g, "~0").replace(/\//g, "~1")
                : "")
            ).slice(0, 500),
            keyword: error.keyword.slice(0, 80),
          });
        }
      }
      for (const [key, child] of Object.entries(value))
        if (key !== "fallback") walk(child, path ? `${path}.${key}` : key);
    };
    // Match the exact content surfaces migrated by the route; fallback remains authored.
    if (object(document.content)) {
      if (Array.isArray(document.content.elements))
        walk(document.content.elements, "elements");
      if (
        object(document.content.contentDocument) &&
        Array.isArray(document.content.contentDocument.elements)
      )
        walk(
          document.content.contentDocument.elements,
          "contentDocument.elements",
        );
    }
  }
  return findings;
}
