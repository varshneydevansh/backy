import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormSubmissionAttachments, submissionAttachments } from '../src/components/forms/FormSubmissionAttachments';

const values = { attachment: [{ kind: 'backy.form.attachment.v1', attachmentId: '12345678-1234-1234-1234-123456789abc', filename: '<private>.txt', sizeBytes: 1025 }], message: 'Text submission', legacy: { url: 'https://example.invalid/raw-upload' } };
assert.equal(submissionAttachments(values).length, 1);
const html = renderToStaticMarkup(createElement(FormSubmissionAttachments, { siteId: 'site', formId: 'form', submissionId: 'submission', values }));
assert(html.includes('Private attachments'));
assert(html.includes('&lt;private&gt;.txt'));
assert(html.includes('(2 KB)'));
assert(html.includes('Download &lt;private&gt;.txt'));
assert(!html.includes('https://example.invalid/raw-upload'));
assert(!html.includes('href='));
assert.equal(renderToStaticMarkup(createElement(FormSubmissionAttachments, { siteId: 'site', formId: 'form', submissionId: 'submission', values: { message: 'Text only' } })), '');
console.log('Private form inbox attachment rendering checks passed.');
