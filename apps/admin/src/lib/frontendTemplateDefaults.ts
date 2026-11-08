import { selectDefaultFrontendDesignTemplate, type SiteFrontendDesignContract } from '@backy-cms/core';

type Template = SiteFrontendDesignContract['templates'][number];
const TEMPLATE_TYPES = ['page', 'blogPost', 'form', 'product', 'collection', 'section'];
export type DefaultTemplateType = 'page' | 'blogPost' | 'product';
export const DEFAULT_TEMPLATE_TYPES: Array<{ type: DefaultTemplateType; label: string }> = [
  { type: 'page', label: 'New pages' },
  { type: 'blogPost', label: 'New blog posts' },
  { type: 'product', label: 'New products' },
];

export const readFrontendTemplateDefaultDraft = (json: string, contract: SiteFrontendDesignContract) => {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Fix the Templates JSON before choosing a default layout. Your draft is unchanged.'); }
  if (!Array.isArray(parsed) || parsed.some((template) => !template || typeof template !== 'object'
    || Array.isArray(template) || typeof template.id !== 'string' || !template.id.trim()
    || typeof template.type !== 'string' || !TEMPLATE_TYPES.includes(template.type)
    || typeof template.name !== 'string' || !template.name.trim())) {
    throw new Error('Templates must be an array of named templates with an id and type. Your draft is unchanged.');
  }
  const templates = parsed as Template[];
  const identities = new Set<string>();
  for (const template of templates) {
    const identity = `${template.type}:${template.id}`;
    if (identities.has(identity)) throw new Error('Template ids must be unique within each type before choosing defaults. Your draft is unchanged.');
    identities.add(identity);
  }
  return {
    templates,
    groups: DEFAULT_TEMPLATE_TYPES.map(({ type, label }) => {
      // Reuse creation's exact eligibility rule instead of offering metadata-only shells.
      const options = templates.filter((template) => template.type === type
        && selectDefaultFrontendDesignTemplate({ ...contract, templates: [template] }, type));
      const marked = options.filter((template) => template.isDefault === true);
      const effective = selectDefaultFrontendDesignTemplate({ ...contract, templates }, type);
      return { type, label, options, selectedId: marked.length === 1 ? marked[0].id : '', effective,
        ambiguous: marked.length > 1 };
    }),
  };
};

/** Edits the current JSON draft, preserving every unrelated field and resource type. */
export const setFrontendTemplateDefaultDraft = (
  json: string,
  contract: SiteFrontendDesignContract,
  type: DefaultTemplateType,
  templateId: string,
) => {
  const draft = readFrontendTemplateDefaultDraft(json, contract);
  const group = draft.groups.find((entry) => entry.type === type)!;
  if (templateId && !group.options.some((template) => template.id === templateId)) {
    throw new Error('Choose an active template with an editable canvas layout. Your draft is unchanged.');
  }
  const templates = draft.templates.map((template) => template.type === type
    ? { ...template, isDefault: Boolean(templateId) && template.id === templateId }
    : template);
  return { templates, templatesJson: JSON.stringify(templates, null, 2) };
};
