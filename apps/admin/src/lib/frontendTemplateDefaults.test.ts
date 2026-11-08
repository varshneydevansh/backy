import assert from 'node:assert/strict';
import type { SiteFrontendDesignContract } from '@backy-cms/core';
import { readFrontendTemplateDefaultDraft, setFrontendTemplateDefaultDraft } from './frontendTemplateDefaults';

const template = (id: string, type: 'page' | 'blogPost' | 'product' = 'page') => ({
  id, type, name: id, status: 'active', content: { elements: [{ id: `${id}-body`, type: 'section', props: { unknown: { keep: true } } }], customCSS: '.keep { color: red; }' },
});
const contract: SiteFrontendDesignContract = {
  schemaVersion: 'backy.frontend-design.v1', status: 'synced', source: { type: 'custom-frontend' }, tokens: {}, chrome: {}, editableMap: [],
  templates: [...Array.from({ length: 12 }, (_, i) => template(`page-${i}`)), { ...template('article', 'blogPost'), isDefault: true }, template('product', 'product')],
};
const json = JSON.stringify(contract.templates);
const before = JSON.stringify(contract);
const draft = readFrontendTemplateDefaultDraft(json, contract);
assert.equal(draft.groups[0].options.length, 12, 'Default choices are not capped at eight templates');
assert.equal(draft.groups[0].effective, undefined, 'Multiple unmarked layouts do not select arbitrarily');
assert.equal(draft.groups[1].selectedId, 'article');
assert.equal(draft.groups[2].selectedId, '', 'A sole automatic layout is distinct from an explicit default');
assert.equal(draft.groups[2].effective?.id, 'product');

const unsaved = contract.templates.map((entry) => entry.id === 'page-11'
  ? { ...entry, name: 'Unsaved name', content: { ...entry.content, localDraftField: { keep: 'value' } } } : entry);
const changed = setFrontendTemplateDefaultDraft(JSON.stringify(unsaved), contract, 'page', 'page-11');
assert.equal(changed.templates.filter(t => t.type === 'page' && t.isDefault).length, 1);
assert.equal(changed.templates.find(t => t.id === 'page-11')?.name, 'Unsaved name');
assert.deepEqual(changed.templates.find(t => t.id === 'page-11')?.content?.localDraftField, { keep: 'value' });
assert.deepEqual(changed.templates.find(t => t.id === 'article'), contract.templates.find(t => t.id === 'article'), 'Other resource defaults and content are preserved');
assert.equal(JSON.stringify(contract), before, 'Selection cannot mutate the saved contract');
const second = setFrontendTemplateDefaultDraft(changed.templatesJson, contract, 'page', 'page-3');
assert.equal(second.templates.find(t => t.id === 'page-11')?.isDefault, false);
assert.equal(second.templates.find(t => t.id === 'page-3')?.isDefault, true);
const automatic = setFrontendTemplateDefaultDraft(second.templatesJson, contract, 'page', '');
assert.equal(automatic.templates.filter(t => t.type === 'page' && t.isDefault).length, 0);

const conflicts = JSON.stringify([{ ...template('one'), isDefault: true }, { ...template('two'), isDefault: true }]);
assert.equal(readFrontendTemplateDefaultDraft(conflicts, contract).groups[0].ambiguous, true);
assert.equal(readFrontendTemplateDefaultDraft(conflicts, contract).groups[0].effective, undefined);
assert.equal(setFrontendTemplateDefaultDraft(conflicts, contract, 'page', 'two').templates.filter(t => t.isDefault).length, 1, 'Choosing resolves conflicting flags');

const ineligible = JSON.stringify([{ id: 'descriptor', type: 'page', name: 'Descriptor', isDefault: true, content: { editableMap: {} } }, { ...template('archived'), status: 'archived' }]);
assert.equal(readFrontendTemplateDefaultDraft(ineligible, contract).groups[0].options.length, 0);
assert.equal(readFrontendTemplateDefaultDraft(ineligible, contract).groups[0].effective, undefined);
assert.throws(() => setFrontendTemplateDefaultDraft(ineligible, contract, 'page', 'descriptor'), /active template/);
assert.throws(() => setFrontendTemplateDefaultDraft('[unfinished', contract, 'page', 'page-1'), /draft is unchanged/);
assert.throws(() => readFrontendTemplateDefaultDraft('{}', contract), /draft is unchanged/);
assert.throws(() => readFrontendTemplateDefaultDraft(JSON.stringify([{ ...template('unknown'), type: 'unknown' }]), contract), /draft is unchanged/);
assert.throws(() => readFrontendTemplateDefaultDraft(JSON.stringify([{ ...template('unnamed'), name: ' ' }]), contract), /draft is unchanged/);
assert.throws(() => readFrontendTemplateDefaultDraft(JSON.stringify([template('duplicate'), template('duplicate')]), contract), /unique/);
assert.throws(() => setFrontendTemplateDefaultDraft(json, contract, 'page', 'not-registered'), /draft is unchanged/);
console.log('Frontend default selector: eligibility, all choices, unique defaults, automatic/ambiguous states, invalid drafts and unsaved field preservation passed.');
