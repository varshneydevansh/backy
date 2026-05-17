type InteractiveComponentExportSource = {
  id?: string;
  siteId?: string;
  componentKey: string;
  displayName: string;
  type: string;
  status: string;
  reviewStatus?: string;
  version: string;
  renderMode: string;
  source: string;
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  fallback?: unknown;
  security?: Record<string, unknown>;
  integrity?: unknown;
  runtime?: unknown;
  ownerId?: string | null;
  dependencyMetadata?: Record<string, unknown>;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const jsonClone = <TValue>(value: TValue): TValue => (
  JSON.parse(JSON.stringify(value)) as TValue
);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export const buildInteractiveComponentExportPackage = (
  siteId: string,
  component: InteractiveComponentExportSource,
) => {
  const exportedAt = new Date().toISOString();
  const dependencyMetadata = recordValue(component.dependencyMetadata);
  const runtime: Record<string, unknown> = {
    postMessageProtocol: 'backy.interactive-component.v1',
    ...recordValue(component.runtime),
  };
  const integrity = Object.keys(recordValue(component.integrity)).length > 0
    ? recordValue(component.integrity)
    : { signed: false, signatureRequiredForCustomCode: true };

  return {
    schemaVersion: 'backy.interactive-component-export.v1',
    exportedAt,
    source: {
      siteId,
      componentId: component.id || null,
      componentKey: component.componentKey,
      version: component.version,
      status: component.status,
      reviewStatus: component.reviewStatus || 'draft',
    },
    import: {
      targetEndpoint: '/api/admin/sites/{siteId}/interactive-components',
      method: 'POST',
      requiredPermission: 'pages.edit',
      conflictKey: `${component.componentKey}@${component.version}`,
      conflictBehavior: 'create-new-version-or-reject-existing-version',
      preservesReviewState: false,
    },
    component: {
      componentKey: component.componentKey,
      displayName: component.displayName,
      type: component.type,
      status: 'disabled',
      reviewStatus: 'draft',
      version: component.version,
      renderMode: component.renderMode,
      source: component.source,
      description: component.description || '',
      allowedDataScopes: component.allowedDataScopes || [],
      requiredFields: component.requiredFields || [],
      controls: component.controls || [],
      fallback: recordValue(component.fallback).required === undefined && Object.keys(recordValue(component.fallback)).length === 0
        ? { required: true, supported: [] }
        : recordValue(component.fallback),
      security: {
        ...(component.security || {}),
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity,
      runtime,
      ownerId: component.ownerId || null,
      dependencyMetadata: {
        ...dependencyMetadata,
        importExport: {
          schemaVersion: 'backy.interactive-component-export.v1',
          exportedAt,
          sourceSiteId: siteId,
          sourceComponentId: component.id || null,
          sourceComponentKey: component.componentKey,
          sourceVersion: component.version,
        },
      },
      changelog: component.changelog || null,
      rollbackFromVersion: component.rollbackFromVersion || null,
    },
    dependencies: dependencyMetadata.dependencies || [],
    bundle: {
      bundleUrl: typeof runtime.bundleUrl === 'string' ? runtime.bundleUrl : null,
      sandboxUrl: typeof runtime.sandboxUrl === 'string' ? runtime.sandboxUrl : null,
      integrity,
      runtime,
    },
    usageInventoryEndpoint: `/api/admin/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(component.componentKey)}/${encodeURIComponent(component.version)}/usage`,
  };
};

export const interactiveComponentImportBody = (body: Record<string, unknown>) => {
  const exportPackage = body.exportPackage;
  if (!exportPackage || typeof exportPackage !== 'object' || Array.isArray(exportPackage)) {
    return body;
  }
  const component = (exportPackage as Record<string, unknown>).component;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    return body;
  }

  const imported = jsonClone(component as Record<string, unknown>);
  const importedDependencyMetadata = (
    imported.dependencyMetadata && typeof imported.dependencyMetadata === 'object' && !Array.isArray(imported.dependencyMetadata)
      ? imported.dependencyMetadata as Record<string, unknown>
      : {}
  );

  return {
    ...imported,
    ...body,
    componentKey: body.componentKey || imported.componentKey,
    version: body.version || imported.version,
    displayName: body.displayName || imported.displayName,
    status: body.status || 'disabled',
    reviewStatus: body.reviewStatus || 'draft',
    dependencyMetadata: {
      ...importedDependencyMetadata,
      importExport: {
        ...(
          importedDependencyMetadata.importExport && typeof importedDependencyMetadata.importExport === 'object' && !Array.isArray(importedDependencyMetadata.importExport)
            ? importedDependencyMetadata.importExport
            : {}
        ),
        importedAt: new Date().toISOString(),
        importedFromSchema: String((exportPackage as Record<string, unknown>).schemaVersion || 'backy.interactive-component-export.v1'),
      },
    },
  };
};
