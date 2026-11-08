/** Reviewed data-only form import; captured layouts still require renderer verification. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: 'string' };
const retained = { type: 'object', additionalProperties: true };
const object = (properties: Record<string, unknown>, required: string[]) => ({ ...retained, properties, required });
const revision = { ...text, pattern: '^form-pack-v1:[a-f0-9]{64}$' };
const selection = { type: 'array', maxItems: 64, uniqueItems: true, items: { ...text, pattern: '^(builtin|frontend):.+' } };
const boundary = { enum: ['database-serializable-transaction', 'demo-single-process'] };
const publication = { const: 'inactive-standalone' };
const envelope = (data: unknown) => object({ success: { const: true }, requestId: text, data }, ['success', 'requestId', 'data']);
export const formTemplatePackSchemas = {
  FormTemplatePack: object({ schemaVersion: { const: 'backy.form-template-pack.v1' }, site: retained, builtInTemplates: { type: 'array', maxItems: 64, items: retained }, frontendTemplates: { type: 'array', maxItems: 64, items: object({ schemaVersion: text, template: retained, form: retained, settings: retained }, ['schemaVersion', 'template', 'form']) } }, ['schemaVersion']),
  FormTemplatePackImportRequest: object({ action: { enum: ['review', 'apply'] }, pack: ref('FormTemplatePack'), selection, names: { ...retained, maxProperties: 64, additionalProperties: text }, references: object(Object.fromEntries(['collections', 'pages', 'posts', 'media', 'components'].map(kind => [kind, { ...retained, maxProperties: 512, propertyNames: { maxLength: 2048 }, additionalProperties: text }])), []), acknowledgeUnverified: { type: 'boolean', default: false }, reviewVersion: revision }, ['action', 'pack', 'selection']),
  FormTemplatePackIssue: object({ code: text, severity: { enum: ['blocking', 'unverified'] }, path: text, message: text, targetId: text }, ['code', 'severity', 'path', 'message']),
  FormTemplatePackTarget: object({ id: text, title: text, name: text, source: { enum: ['builtin', 'frontend'] }, selected: { type: 'boolean' }, form: retained, fieldCount: { type: 'integer', minimum: 0, maximum: 128 }, hasCapturedLayout: { type: 'boolean' } }, ['id', 'title', 'name', 'source', 'selected', 'form', 'fieldCount', 'hasCapturedLayout']),
  FormTemplatePackReviewEnvelope: envelope(object({ schemaVersion: { const: 'backy.form-template-pack-review.v1' }, siteId: text, reviewVersion: revision, selection, targets: { type: 'array', items: ref('FormTemplatePackTarget') }, issues: { type: 'array', items: ref('FormTemplatePackIssue') }, canApply: { type: 'boolean' }, publication, concurrencyBoundary: boundary }, ['schemaVersion', 'siteId', 'reviewVersion', 'selection', 'targets', 'issues', 'canApply', 'publication', 'concurrencyBoundary'])),
  FormTemplatePackApplyEnvelope: envelope(object({ schemaVersion: { const: 'backy.form-template-pack-applied.v1' }, siteId: text, reviewVersion: revision, forms: { type: 'array', items: object({ importId: text, form: ref('FormDefinition'), editUrl: text }, ['importId', 'form', 'editUrl']) }, publication, completionWarnings: { type: 'array', items: text }, concurrencyBoundary: boundary }, ['schemaVersion', 'siteId', 'reviewVersion', 'forms', 'publication', 'completionWarnings', 'concurrencyBoundary'])),
};
export function formTemplatePackPaths(siteId: string) {
  const response = (description: string, schema: string) => ({ description, content: { 'application/json': { schema: ref(schema) } } });
  return { [`/api/admin/sites/${siteId}/forms/template-pack/import`]: { post: {
    operationId: 'reviewOrApplyAdminFormTemplatePack', tags: ['Forms'], summary: 'Review a form template pack and atomically import inactive standalone forms',
    description: 'Review writes nothing. Apply requires the exact reviewVersion and unchanged package, selection, names, references, acknowledgement and destination inventory. New IDs preserve captured nested layouts; source registry records are not imported. No automatic publishing, runtime execution or overwrite. JSON limits:2 MiB,60000 values,depth64,64 forms,128 fields per form. Stale409 requires fresh review.',
    security: [{ BackyAdminSession: [] }, { BackyAdminKey: [] }], 'x-backy-permission': 'forms.view',
    'x-backy-action-permissions': { review: ['forms.view'], apply: ['forms.view', 'forms.create'], collectionReview: ['collections.view'], collectionApply: ['collections.edit'], mediaReferences: ['media.view'], pagePostComponentReferences: ['pages.view'] },
    requestBody: { required: true, content: { 'application/json': { schema: ref('FormTemplatePackImportRequest') } } },
    responses: { '200': response('Private read-only review with blocking/unverified findings', 'FormTemplatePackReviewEnvelope'), '201': response('Inactive standalone forms committed; audit warning does not reverse commit', 'FormTemplatePackApplyEnvelope'), ...Object.fromEntries(Object.entries({ '400': 'Invalid pack, selection or required apply reviewVersion', '401': 'Authentication required', '403': 'Site/action/reference permission denied', '404': 'Site not found', '409': 'FORM_TEMPLATE_REVIEW_STALE: review again', '413': 'FORM_TEMPLATE_LIMIT: bounded request exceeded', '422': 'FORM_TEMPLATE_REVIEW_BLOCKED: resolve selected findings', '503': 'Complete inventory or atomic import unavailable', '500': 'Import failed' }).map(([status, description]) => [status, response(description, 'ErrorEnvelope')])) },
  } } };
}
