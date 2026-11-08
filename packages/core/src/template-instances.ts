import { serializeTemplateRevisionValue } from "./template-history";

export interface BackyTemplateInstanceProvenance {
  schemaVersion: "backy.template-instance.v1";
  templateId: string;
  templateFingerprint: string;
  templateVersion: string | number | null;
  baseContentFingerprint: string;
  baseContent: Record<string, unknown>;
  /** Added for section baselines; legacy page/blog pins remain compatible. */
  instanceType?: "section" | "product" | "form" | "collection";
  seedContext?: {
    title: string;
    description?: string | null;
    excerpt?: string | null;
  };
}
export interface BackyTemplateInstanceConflict {
  path: string;
  code:
    | "VALUE_CONFLICT"
    | "ELEMENT_CONFLICT"
    | "ORDER_CONFLICT"
    | "UNPINNED_INSTANCE"
    | "INVALID_PROVENANCE"
    | "SCHEMA_INCOMPATIBLE";
}
export interface BackyTemplateInstanceTarget {
  type: "page" | "post" | "section" | "product" | "form" | "collection";
  collectionId?: string;
  id: string;
  title: string;
  status: string;
  pinnedFingerprint: string | null;
  contentFingerprint: string;
  changedPaths: string[];
  conflicts: BackyTemplateInstanceConflict[];
  state: "ready" | "current" | "blocked";
}
export interface BackyTemplateInstanceReview {
  siteId: string;
  templateId: string;
  targetRevisionId: string;
  targetFingerprint: string;
  reviewVersion: string;
  targets: BackyTemplateInstanceTarget[];
  canApply: boolean;
  scanned: { pages: number; posts: number; sections?: number; products?: number; forms?: number; collections?: number };
}
export interface BackyTemplateInstanceOutcome extends BackyTemplateInstanceReview {
  action: "review" | "apply";
  appliedTargets: Array<{ type: "page" | "post" | "section" | "product" | "form" | "collection"; id: string; collectionId?: string }>;
  failedTargets: Array<{
    type: "page" | "post" | "section" | "product" | "form" | "collection";
    collectionId?: string;
    id: string;
    code: "CONTENT_CONFLICT" | "WRITE_UNAVAILABLE" | "WRITE_FAILED";
  }>;
  completionWarnings: string[];
  outcome: "complete" | "partial";
  concurrencyBoundary: "database-per-document-row-lock" | "demo-single-process";
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown) =>
  serializeTemplateRevisionValue(a) === serializeTemplateRevisionValue(b);
const copy = (value: unknown): any =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const unsafe = new Set(["__proto__", "prototype", "constructor"]);
const identity = new Set([
  "id",
  "title",
  "slug",
  "status",
  "version",
  "kind",
  "createdAt",
  "updatedAt",
]);
/** Three-way merge: never resolve an overlapping author/template change by guessing. */
export function mergeBackyTemplateInstance(
  base: Record<string, unknown>,
  authored: Record<string, unknown>,
  target: Record<string, unknown>,
) {
  const conflicts: BackyTemplateInstanceConflict[] = [],
    changedPaths: string[] = [];
  let values = 0;
  const conflict = (
    path: string,
    code: BackyTemplateInstanceConflict["code"],
  ) => {
    if (conflicts.length < 64)
      conflicts.push({ path: path.slice(0, 500), code });
  };
  const merge = (
    old: any,
    current: any,
    next: any,
    path: string,
    depth: number,
  ): any => {
    if (++values > 60000 || depth > 64)
      throw new Error("TEMPLATE_INSTANCE_LIMIT");
    if (same(old, next)) return copy(current);
    if (same(current, next)) return copy(current);
    if (same(old, current)) {
      if (changedPaths.length < 128) changedPaths.push(path.slice(0, 500));
      return copy(next);
    }
    if (object(old) && object(current) && object(next)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(old),
        ...Object.keys(current),
        ...Object.keys(next),
      ])) {
        if (unsafe.has(key)) {
          conflict(path, "VALUE_CONFLICT");
          continue;
        }
        const child = path + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1");
        const value =
          path === "" && identity.has(key)
            ? copy(current[key])
            : merge(old[key], current[key], next[key], child, depth + 1);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (Array.isArray(old) && Array.isArray(current) && Array.isArray(next)) {
      const keyed = [old, current, next].every(
        (items) =>
          items.every(
            (item) =>
              object(item) &&
              typeof item.id === "string" &&
              item.id &&
              !unsafe.has(item.id),
          ) && new Set(items.map((item) => item.id)).size === items.length,
      );
      if (keyed) {
        const a = new Map(old.map((item) => [item.id, item])),
          b = new Map(current.map((item) => [item.id, item])),
          c = new Map(next.map((item) => [item.id, item]));
        const result = new Map<string, any>();
        for (const id of new Set([...a.keys(), ...b.keys(), ...c.keys()])) {
          const value = merge(
            a.get(id),
            b.get(id),
            c.get(id),
            path + "/@" + String(id).replace(/~/g, "~0").replace(/\//g, "~1"),
            depth + 1,
          );
          if (value !== undefined) result.set(id, value);
        }
        const retained = old
          .map((item) => item.id)
          .filter((id) => result.has(id));
        const authoredOrder = current
          .map((item) => item.id)
          .filter((id) => retained.includes(id));
        const targetOrder = next
          .map((item) => item.id)
          .filter((id) => retained.includes(id));
        const authorMoved = !same(
          retained.filter((id) => b.has(id)),
          authoredOrder,
        );
        const templateMoved = !same(
          retained.filter((id) => c.has(id)),
          targetOrder,
        );
        if (authorMoved && templateMoved && !same(authoredOrder, targetOrder))
          conflict(path, "ORDER_CONFLICT");
        const primary = templateMoved && !authorMoved ? next : current;
        const order = primary
          .map((item) => item.id)
          .filter((id) => result.has(id));
        // Insert new siblings relative to their declared neighbors without moving author-owned siblings.
        for (const list of [next, current])
          for (let index = 0; index < list.length; index++) {
            const id = list[index].id;
            if (!result.has(id) || order.includes(id)) continue;
            const after = list
              .slice(index + 1)
              .find((item) => order.includes(item.id));
            if (after) order.splice(order.indexOf(after.id), 0, id);
            else order.push(id);
          }
        return order.map((id) => result.get(id));
      }
      conflict(path, "ELEMENT_CONFLICT");
      return copy(current);
    }
    conflict(path, "VALUE_CONFLICT");
    return copy(current);
  };
  const strip = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !identity.has(key)),
    );
  const content = merge(
    strip(base),
    strip(authored),
    strip(target),
    "",
    0,
  ) as Record<string, unknown>;
  for (const key of identity)
    if (Object.prototype.hasOwnProperty.call(authored, key))
      content[key] = copy(authored[key]);
  return { content, conflicts, changedPaths };
}
