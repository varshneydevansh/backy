/** Shared public file limits for transport validation and authoring handoffs. */
export const BACKY_FORM_SUBMISSION_FILE_LIMITS = { maxFiles: 5, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 };
export type FormSubmissionExampleField = { key: string; type: string; label?: string; required?: boolean };
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

/** File bytes belong in multipart parts; saved attachment refs are never visitor input. */
export function buildFormSubmissionExample(input: {
  fields: readonly FormSubmissionExampleField[];
  payload: Record<string, unknown>;
  submitUrl?: string;
  filePaths?: Record<string, string>;
}) {
  const fileFields = input.fields.filter((field) => field.type === 'file');
  const fileKeys = new Set(fileFields.map((field) => field.key));
  const rawValues = input.payload.values && typeof input.payload.values === 'object' && !Array.isArray(input.payload.values)
    ? input.payload.values as Record<string, unknown> : {};
  const payload = { ...input.payload, values: Object.fromEntries(Object.entries(rawValues).filter(([key]) => !fileKeys.has(key))) };
  const multipart = fileFields.length > 0;
  const submissionTransport = multipart ? {
    contentType: 'multipart/form-data' as const,
    payloadField: 'payload',
    fileFields: fileFields.map((field) => ({ key: field.key, label: field.label || field.key, required: Boolean(field.required), multiple: true })),
    limits: { ...BACKY_FORM_SUBMISSION_FILE_LIMITS },
    instructions: 'Put the JSON text fields in the payload part and actual file bytes in parts named by the declared file field keys. Repeat a file part for multiple files. Do not send media IDs, URLs or saved attachment references. Let the browser or cURL set the multipart boundary. Files must meet the site upload and safety scan policy.',
  } : { contentType: 'application/json' as const };
  const curl = !input.submitUrl ? '' : [
    `curl -X POST ${shellQuote(input.submitUrl)}`,
    ...(multipart ? [
      `  --form-string ${shellQuote(`payload=${JSON.stringify(payload)}`)}`,
      ...fileFields.map((field) => `  --form ${shellQuote(`${field.key}=@${input.filePaths?.[field.key] || `./${field.key.replace(/[^a-zA-Z0-9_-]/g, '_') || 'attachment'}.pdf`}`)}`),
    ] : ["  -H 'content-type: application/json'", `  --data ${shellQuote(JSON.stringify(payload, null, 2))}`]),
  ].join(' \\\n');
  return { payload, submissionTransport, curl };
}
