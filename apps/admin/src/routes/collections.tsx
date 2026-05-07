import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Database,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  createCollection,
  createCollectionRecord,
  deleteCollection,
  deleteCollectionRecord,
  exportCollectionRecordsCsv,
  importCollectionRecordsCsv,
  listCollectionRecords,
  listCollections,
  updateCollection,
  updateCollectionRecord,
  type Collection,
  type CollectionField,
  type CollectionFieldType,
  type CollectionPermissions,
  type CollectionRecord,
} from '@/lib/adminContentApi';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useStore } from '@/stores/mockStore';
import { formatDate } from '@/lib/utils';

export const Route = createFileRoute('/collections')({
  component: CollectionsPage,
});

const FIELD_TYPES: CollectionFieldType[] = [
  'text',
  'richText',
  'number',
  'boolean',
  'date',
  'datetime',
  'image',
  'video',
  'file',
  'reference',
  'multiReference',
  'select',
  'tags',
  'url',
  'email',
  'phone',
  'slug',
  'json',
];

const DEFAULT_PERMISSIONS: CollectionPermissions = {
  publicRead: true,
  publicCreate: false,
  publicUpdate: false,
  publicDelete: false,
};

const normalizeSlug = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const createEmptyField = (sortOrder: number): CollectionField => ({
  key: `field_${sortOrder}`,
  label: `Field ${sortOrder}`,
  type: 'text',
  required: false,
  unique: false,
  sortOrder,
  helpText: null,
});

const getPublicBaseUrl = () => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const envBase = env.VITE_BACKY_PUBLIC_API_BASE_URL || env.VITE_PUBLIC_API_URL || env.VITE_API_BASE_URL || '';
  if (envBase) {
    return envBase.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3001';
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const parseRecordValue = (field: CollectionField, value: string): unknown => {
  if (field.type === 'number') {
    return value.trim().length > 0 ? Number(value) : null;
  }
  if (field.type === 'boolean') {
    return value === 'true';
  }
  if (field.type === 'tags' || field.type === 'multiReference') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (field.type === 'json') {
    if (!value.trim()) return {};
    return JSON.parse(value);
  }
  return value;
};

const formatFieldOptions = (options: string[] | undefined) => (options || []).join('\n');

const parseFieldOptions = (value: string) => (
  value
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean)
);

type RecordStatusFilter = CollectionRecord['status'] | '';

function CollectionsPage() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'published' as Collection['status'],
    permissions: DEFAULT_PERMISSIONS,
    fields: [createEmptyField(10)],
  });
  const [recordForm, setRecordForm] = useState({
    slug: '',
    status: 'published' as CollectionRecord['status'],
    values: {} as Record<string, string>,
  });
  const [recordFilters, setRecordFilters] = useState({
    search: '',
    status: '' as RecordStatusFilter,
    fieldKey: '',
    fieldValue: '',
    sortBy: 'updatedAt',
    sortDirection: 'desc' as 'asc' | 'desc',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isExportingRecords, setIsExportingRecords] = useState(false);
  const [isImportingRecords, setIsImportingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || 'site-demo';
  const activeSiteSlug = activeSite?.slug || activeSiteId;
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) || null,
    [collections, selectedCollectionId],
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId],
  );
  const dynamicBaseUrl = getPublicBaseUrl();

  useEffect(() => {
    if (!selectedSiteId && sites[0]) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const resetCollectionForm = () => {
    setSelectedCollectionId(null);
    setSelectedRecordId(null);
    setRecords([]);
    setRecordFilters({
      search: '',
      status: '',
      fieldKey: '',
      fieldValue: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    setCollectionForm({
      name: '',
      slug: '',
      description: '',
      status: 'published',
      permissions: DEFAULT_PERMISSIONS,
      fields: [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
  };

  const selectCollection = (collection: Collection) => {
    setSelectedCollectionId(collection.id);
    setSelectedRecordId(null);
    setRecordFilters((prev) => ({
      ...prev,
      fieldKey: '',
      fieldValue: '',
    }));
    setCollectionForm({
      name: collection.name,
      slug: collection.slug,
      description: collection.description || '',
      status: collection.status,
      permissions: collection.permissions,
      fields: collection.fields.length > 0 ? collection.fields : [createEmptyField(10)],
    });
    setRecordForm({ slug: '', status: 'published', values: {} });
  };

  const loadCollections = async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const backendCollections = await listCollections(activeSiteId);
      setCollections(backendCollections);
      const nextSelected = backendCollections.find((collection) => collection.id === selectedCollectionId)
        || backendCollections[0]
        || null;
      if (nextSelected) {
        selectCollection(nextSelected);
      } else {
        resetCollectionForm();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collections');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecords = async (collectionId: string) => {
    setIsRecordsLoading(true);
    setError(null);
    try {
      const backendRecords = await listCollectionRecords(activeSiteId, collectionId, {
        search: recordFilters.search.trim() || undefined,
        status: recordFilters.status || undefined,
        fieldKey: recordFilters.fieldKey || undefined,
        fieldValue: recordFilters.fieldValue.trim() || undefined,
        sortBy: recordFilters.sortBy || undefined,
        sortDirection: recordFilters.sortDirection,
      });
      setRecords(backendRecords);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collection records');
      setRecords([]);
    } finally {
      setIsRecordsLoading(false);
    }
  };

  useEffect(() => {
    void loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    if (selectedCollectionId) {
      void loadRecords(selectedCollectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollectionId, activeSiteId, recordFilters.search, recordFilters.status, recordFilters.fieldKey, recordFilters.fieldValue, recordFilters.sortBy, recordFilters.sortDirection]);

  useEffect(() => {
    if (!selectedRecord || !activeCollection) {
      setRecordForm({ slug: '', status: 'published', values: {} });
      return;
    }

    setRecordForm({
      slug: selectedRecord.slug,
      status: selectedRecord.status,
      values: Object.fromEntries(
        activeCollection.fields.map((field) => [field.key, formatValue(selectedRecord.values[field.key])]),
      ),
    });
  }, [activeCollection, selectedRecord]);

  const updateField = (index: number, updates: Partial<CollectionField>) => {
    setCollectionForm((prev) => ({
      ...prev,
      fields: prev.fields.map((field, fieldIndex) => (
        fieldIndex === index
          ? {
              ...field,
              ...updates,
              key: updates.key ? normalizeSlug(updates.key, field.key).replace(/-/g, '_') : field.key,
            }
          : field
      )),
    }));
  };

  const removeField = (index: number) => {
    setCollectionForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const handleCollectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingCollection(true);
    setError(null);
    setNotice(null);

    const fields = collectionForm.fields
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field, index) => ({
        ...field,
        key: normalizeSlug(field.key, `field_${index + 1}`).replace(/-/g, '_'),
        label: field.label.trim(),
        sortOrder: (index + 1) * 10,
      }));

    try {
      const payload = {
        name: collectionForm.name.trim(),
        slug: normalizeSlug(collectionForm.slug || collectionForm.name, 'collection'),
        description: collectionForm.description.trim() || null,
        status: collectionForm.status,
        permissions: collectionForm.permissions,
        fields,
      };
      const saved = selectedCollectionId
        ? await updateCollection(activeSiteId, selectedCollectionId, payload)
        : await createCollection(activeSiteId, payload);
      setCollections((prev) => {
        const exists = prev.some((collection) => collection.id === saved.id);
        return exists
          ? prev.map((collection) => (collection.id === saved.id ? saved : collection))
          : [saved, ...prev];
      });
      selectCollection(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save collection');
    } finally {
      setIsSavingCollection(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (!confirm(`Delete ${collection.name} and all of its records?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await deleteCollection(activeSiteId, collection.id);
      const remaining = collections.filter((item) => item.id !== collection.id);
      setCollections(remaining);
      if (selectedCollectionId === collection.id) {
        const nextCollection = remaining[0] || null;
        if (nextCollection) {
          selectCollection(nextCollection);
        } else {
          resetCollectionForm();
        }
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection');
    }
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCollection) return;

    setIsSavingRecord(true);
    setError(null);
    setNotice(null);

    try {
      const values = Object.fromEntries(
        activeCollection.fields.map((field) => [
          field.key,
          parseRecordValue(field, recordForm.values[field.key] || ''),
        ]),
      );
      const payload = {
        slug: normalizeSlug(recordForm.slug || formatValue(values.title || values.name), 'record'),
        status: recordForm.status,
        values,
      };
      const saved = selectedRecordId
        ? await updateCollectionRecord(activeSiteId, activeCollection.id, selectedRecordId, payload)
        : await createCollectionRecord(activeSiteId, activeCollection.id, payload);
      setRecords((prev) => {
        const exists = prev.some((record) => record.id === saved.id);
        return exists
          ? prev.map((record) => (record.id === saved.id ? saved : record))
          : [saved, ...prev];
      });
      setSelectedRecordId(saved.id);
      if (activeCollection) {
        void loadRecords(activeCollection.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save collection record');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (record: CollectionRecord) => {
    if (!activeCollection || !confirm(`Delete record ${record.slug}?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await deleteCollectionRecord(activeSiteId, activeCollection.id, record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection record');
    }
  };

  const handleExportRecords = async () => {
    if (!activeCollection) return;

    setIsExportingRecords(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await exportCollectionRecordsCsv(activeSiteId, activeCollection.id, {
        search: recordFilters.search.trim() || undefined,
        status: recordFilters.status || undefined,
        fieldKey: recordFilters.fieldKey || undefined,
        fieldValue: recordFilters.fieldValue.trim() || undefined,
        sortBy: recordFilters.sortBy || undefined,
        sortDirection: recordFilters.sortDirection,
        limit: 1000,
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${activeCollection.slug}-records.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export collection records');
    } finally {
      setIsExportingRecords(false);
    }
  };

  const handleImportRecords = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeCollection) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingRecords(true);
    setError(null);
    setNotice(null);
    try {
      const csv = await file.text();
      const result = await importCollectionRecordsCsv(activeSiteId, activeCollection.id, csv, { upsert: true });
      setNotice(`${result.created} created, ${result.updated} updated, ${result.skipped} skipped from ${file.name}.`);
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        setError(`Row ${firstError.row} skipped: ${firstError.message}`);
      }
      await loadRecords(activeCollection.id);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import collection records');
    } finally {
      setIsImportingRecords(false);
      event.target.value = '';
    }
  };

  return (
    <PageShell
      title="Collections"
      description="Build structured CMS data for custom frontends and dynamic Backy pages."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadCollections()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={resetCollectionForm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New collection
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="collection-site">
          Site
        </label>
        <select
          id="collection-site"
          value={activeSiteId}
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.publicSiteId || site.id}>
              {site.name}
            </option>
          ))}
        </select>
        {isLoading && <span className="text-sm text-muted-foreground">Loading collections...</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Collection library</h2>
          </div>
          <div className="divide-y divide-border">
            {collections.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Database className="mx-auto mb-3 h-8 w-8" />
                No collections
              </div>
            ) : collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => selectCollection(collection)}
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted ${
                  collection.id === selectedCollectionId ? 'bg-primary/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">{collection.name}</div>
                    <div className="text-xs text-muted-foreground">/{collection.slug}</div>
                  </div>
                  <StatusBadge status={collection.status} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {collection.fields.length} fields
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <form onSubmit={handleCollectionSubmit} className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Schema builder</h2>
              <div className="flex items-center gap-2">
                {activeCollection && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(activeCollection)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingCollection}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {isSavingCollection ? 'Saving...' : 'Save schema'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <input
                  value={collectionForm.name}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                    slug: prev.slug || normalizeSlug(event.target.value, 'collection'),
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Slug</span>
                <input
                  value={collectionForm.slug}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    slug: normalizeSlug(event.target.value, 'collection'),
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Status</span>
                <select
                  value={collectionForm.status}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    status: event.target.value as Collection['status'],
                  }))}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={collectionForm.permissions.publicRead}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      publicRead: event.target.checked,
                    },
                  }))}
                />
                Public read
              </label>
              <label className="space-y-1 text-sm lg:col-span-4">
                <span className="font-medium">Description</span>
                <textarea
                  value={collectionForm.description}
                  onChange={(event) => setCollectionForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))}
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
            </div>

            <div className="border-t border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold">Fields</h3>
                <button
                  type="button"
                  onClick={() => setCollectionForm((prev) => ({
                    ...prev,
                    fields: [...prev.fields, createEmptyField((prev.fields.length + 1) * 10)],
                  }))}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Add field
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Key</th>
                      <th className="px-4 py-2">Label</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Options / reference</th>
                      <th className="px-4 py-2">Required</th>
                      <th className="px-4 py-2">Unique</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {collectionForm.fields.map((field, index) => (
                      <tr key={`${field.key}-${index}`}>
                        <td className="px-4 py-2">
                          <input
                            value={field.key}
                            onChange={(event) => updateField(index, { key: event.target.value })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={field.label}
                            onChange={(event) => updateField(index, { label: event.target.value })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={field.type}
                            onChange={(event) => updateField(index, { type: event.target.value as CollectionFieldType })}
                            className="w-full rounded-lg border bg-background px-2 py-1"
                          >
                            {FIELD_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          {field.type === 'select' || field.type === 'tags' ? (
                            <textarea
                              value={formatFieldOptions(field.options)}
                              onChange={(event) => updateField(index, { options: parseFieldOptions(event.target.value) })}
                              className="min-h-16 w-full rounded-lg border bg-background px-2 py-1"
                              placeholder="One option per line"
                            />
                          ) : field.type === 'reference' || field.type === 'multiReference' ? (
                            <select
                              value={field.referenceCollectionId || ''}
                              onChange={(event) => updateField(index, { referenceCollectionId: event.target.value || null })}
                              className="w-full rounded-lg border bg-background px-2 py-1"
                            >
                              <option value="">Choose collection</option>
                              {collections
                                .filter((collection) => collection.id !== selectedCollectionId)
                                .map((collection) => (
                                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                                ))}
                            </select>
                          ) : (
                            <input
                              value={field.helpText || ''}
                              onChange={(event) => updateField(index, { helpText: event.target.value || null })}
                              className="w-full rounded-lg border bg-background px-2 py-1"
                              placeholder="Help text"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) => updateField(index, { required: event.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={field.unique}
                            onChange={(event) => updateField(index, { unique: event.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeField(index)}
                            disabled={collectionForm.fields.length === 1}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </form>

          {activeCollection && (
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Records</h2>
                  <p className="text-xs text-muted-foreground">
                    {records.length} items in {activeCollection.name}
                    {isRecordsLoading ? ' • Loading...' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleImportRecords(event)}
                  />
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={isImportingRecords}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {isImportingRecords ? 'Importing...' : 'Import CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportRecords()}
                    disabled={isExportingRecords}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {isExportingRecords ? 'Exporting...' : 'Export CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(null);
                      setRecordForm({ slug: '', status: 'published', values: {} });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    New record
                  </button>
                </div>
              </div>

              <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(180px,1fr)_150px_160px_minmax(160px,1fr)_180px_140px]">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Search</span>
                  <input
                    value={recordFilters.search}
                    onChange={(event) => setRecordFilters((prev) => ({ ...prev, search: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    placeholder="Search values"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    value={recordFilters.status}
                    onChange={(event) => setRecordFilters((prev) => ({
                      ...prev,
                      status: event.target.value as RecordStatusFilter,
                    }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="">All</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Field</span>
                  <select
                    value={recordFilters.fieldKey}
                    onChange={(event) => setRecordFilters((prev) => ({
                      ...prev,
                      fieldKey: event.target.value,
                      fieldValue: event.target.value ? prev.fieldValue : '',
                    }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="">Any field</option>
                    {activeCollection.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Field value</span>
                  <input
                    value={recordFilters.fieldValue}
                    onChange={(event) => setRecordFilters((prev) => ({ ...prev, fieldValue: event.target.value }))}
                    disabled={!recordFilters.fieldKey}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60"
                    placeholder="Contains"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Sort by</span>
                  <select
                    value={recordFilters.sortBy}
                    onChange={(event) => setRecordFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="updatedAt">Updated</option>
                    <option value="createdAt">Created</option>
                    <option value="slug">Slug</option>
                    <option value="status">Status</option>
                    {activeCollection.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Direction</span>
                  <select
                    value={recordFilters.sortDirection}
                    onChange={(event) => setRecordFilters((prev) => ({
                      ...prev,
                      sortDirection: event.target.value === 'asc' ? 'asc' : 'desc',
                    }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-x-auto border-b border-border xl:border-b-0 xl:border-r">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Slug</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Updated</th>
                        <th className="px-4 py-2">Route</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                            No records
                          </td>
                        </tr>
                      ) : records.map((record) => {
                        const href = `${dynamicBaseUrl}/sites/${activeSiteSlug}/${activeCollection.slug}/${record.slug}`;
                        return (
                          <tr key={record.id} className={record.id === selectedRecordId ? 'bg-primary/5' : ''}>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordId(record.id)}
                                className="font-medium text-foreground hover:text-primary"
                              >
                                {record.slug}
                              </button>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(record.updatedAt || record.createdAt || '')}</td>
                            <td className="px-4 py-3">
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                /{activeCollection.slug}/{record.slug}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => void handleDeleteRecord(record)}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <form onSubmit={handleRecordSubmit} className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{selectedRecord ? 'Edit record' : 'Create record'}</h3>
                    <button
                      type="submit"
                      disabled={isSavingRecord}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingRecord ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Slug</span>
                    <input
                      value={recordForm.slug}
                      onChange={(event) => setRecordForm((prev) => ({
                        ...prev,
                        slug: normalizeSlug(event.target.value, 'record'),
                      }))}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Status</span>
                    <select
                      value={recordForm.status}
                      onChange={(event) => setRecordForm((prev) => ({
                        ...prev,
                        status: event.target.value as CollectionRecord['status'],
                      }))}
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>

                  {activeCollection.fields.map((field) => (
                    <label key={field.key} className="space-y-1 text-sm">
                      <span className="font-medium">{field.label}</span>
                      {field.type === 'boolean' ? (
                        <select
                          value={recordForm.values[field.key] || 'false'}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : field.type === 'select' && field.options?.length ? (
                        <select
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        >
                          <option value="">Choose {field.label}</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'tags' && field.options?.length ? (
                        <select
                          multiple
                          value={(recordForm.values[field.key] || '').split(',').map((item) => item.trim()).filter(Boolean)}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: {
                              ...prev.values,
                              [field.key]: Array.from(event.target.selectedOptions).map((option) => option.value).join(', '),
                            },
                          }))}
                          className="min-h-24 w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        >
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'richText' || field.type === 'json' ? (
                        <textarea
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="min-h-24 w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={recordForm.values[field.key] || ''}
                          onChange={(event) => setRecordForm((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.key]: event.target.value },
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          required={field.required}
                        />
                      )}
                    </label>
                  ))}
                </form>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
