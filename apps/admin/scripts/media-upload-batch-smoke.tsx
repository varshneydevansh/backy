import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runMediaUploadBatch, type MediaUploadRow } from '../src/lib/mediaUploadBatch';
import { MediaUploadQueue } from '../src/components/media/MediaUploadQueue';

const files = ['same.png', 'same.png', 'blocked.exe', 'last.woff2'].map((name, index) => new File([`${index}`], name) as unknown as globalThis.File);
const snapshots: MediaUploadRow[][] = [];
const calls: string[] = [];
const result = await runMediaUploadBatch({ files, reject: file => file.name.endsWith('.exe') ? 'Format not allowed.' : undefined,
  shouldContinue: () => true, onRows: rows => snapshots.push(rows), upload: async file => {
    calls.push(file.name); if (calls.length === 2) throw Error('Scanner unavailable.'); return { name: file.name, id: calls.length };
  },
});
assert.deepEqual(calls, ['same.png', 'same.png', 'last.woff2']);
assert.deepEqual(result.rows.map(row => row.status), ['saved', 'failed', 'skipped', 'saved']);
assert.equal(result.uploaded.length, 2);
assert.equal(result.rows[1].message, 'Scanner unavailable. Check the library before trying again.');
assert.equal(snapshots[0][0].status, 'queued', 'Snapshots must not mutate after later progress.');
assert.deepEqual(result.rows.map(row => row.id), [0, 1, 2, 3], 'Duplicate names must remain distinct.');

let continueBatch = true;
let release!: () => void;
const hold = new Promise<void>(resolve => { release = resolve; });
const stoppedCalls: string[] = [];
const stoppedRows: MediaUploadRow[][] = [];
const stopped = runMediaUploadBatch({ files, reject: () => undefined, shouldContinue: () => continueBatch,
  onRows: rows => stoppedRows.push(rows), upload: async file => { stoppedCalls.push(file.name); await hold; return 'confirmed-save'; },
});
assert.equal(stoppedRows.at(-1)?.[0].status, 'uploading');
continueBatch = false;
release();
const stoppedResult = await stopped;
assert.deepEqual(stoppedCalls, ['same.png']);
assert.deepEqual(stoppedResult.rows.map(row => row.status), ['saved', 'stopped', 'stopped', 'stopped']);
assert.deepEqual(stoppedResult.uploaded, ['confirmed-save'], 'Stopping cannot erase or relabel an admitted save.');
const denied = await runMediaUploadBatch({ files, reject: () => undefined, shouldContinue: () => false,
  onRows: () => {}, upload: async () => { throw Error('Must not execute without admission.'); },
});
assert.equal(denied.rows.every(row => row.status === 'stopped'), true);
const uncertainCalls: string[] = [];
const uncertain = await runMediaUploadBatch({ files: files.slice(0, 1), reject: () => undefined, shouldContinue: () => true,
  onRows: () => {}, upload: async file => { uncertainCalls.push(file.name); throw new TypeError('Failed to fetch'); },
});
assert.equal(uncertainCalls.length, 1, 'An ambiguous completion must never be automatically retried.');
assert.equal(uncertain.rows[0].status, 'failed');

const html = renderToStaticMarkup(<MediaUploadQueue rows={result.rows} active={false} stopping={false} onStop={() => {}} />);
assert.match(html, /Upload results/);
assert.match(html, /4 of 4 files processed/);
assert.match(html, /Scanner unavailable/);
assert.match(html, /Needs review/);
assert.match(html, /<progress[^>]*value="4"[^>]*max="4"/);
assert.equal((html.match(/same.png/g) || []).length, 2);
const active = renderToStaticMarkup(<MediaUploadQueue rows={snapshots[1]} active stopping={false} onStop={() => {}} />);
assert.match(active, /Stop pending uploads/);
assert.match(active, /Uploading and scanning/);
const stopping = renderToStaticMarkup(<MediaUploadQueue rows={snapshots[1]} active stopping onStop={() => {}} />);
assert.match(stopping, /disabled/);
assert.match(stopping, /current upload will finish/);
assert.equal(renderToStaticMarkup(<MediaUploadQueue rows={[]} active={false} stopping={false} onStop={() => {}} />), '');
console.log('Media upload batch PASS: distinct per-file progress, partial failure, scanner rejection, stop pending without losing admitted save, admission loss, no ambiguous retry, immutable snapshots and rendered queue controls. Real scanner/storage and hosted UI are separate gates.');
