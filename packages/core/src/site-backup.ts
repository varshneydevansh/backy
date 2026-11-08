/** Private recovery package. This is never a public discovery payload. */
export const SITE_BACKUP_TABLES = ['pages','blogPosts','blogCategories','blogTags','mediaFolders','media','mediaVersions','contentCollections','contentCollectionRecords','siteVisitors','formDefinitions','formSubmissions','formContacts','reusableSections','interactiveComponents','contentRevisions','templateRevisions','productDesignRevisions','formDesignRevisions','collectionDesignRevisions','comments','commentBlocklist'] as const;
export type SiteBackupTable = typeof SITE_BACKUP_TABLES[number];
export type SiteBackupRow = Record<string, unknown>;
export type SiteBackupGraph = { site: SiteBackupRow; tables: Record<SiteBackupTable, SiteBackupRow[]> };
export type SiteBackupFile = { id: string; namespace: 'media'|'attachment'; path: string; url: string|null; filename: string; mimeType: string; bytes: number; sha256: string; base64: string };
export type SiteBackupPackage = { contract: 'backy.site-backup.v1'; exportedAt: string; sourceSiteId: string; graph: SiteBackupGraph; files: SiteBackupFile[]; externalLinks: string[]; exclusions: string[] };
export const SITE_BACKUP_LIMITS = { maxRows: 50000, maxFiles: 10000, maxBinaryBytes: 32*1024*1024, maxArchiveBytes: 64*1024*1024, maxDepth: 100 };
export const SITE_BACKUP_EXCLUSIONS = ['Global operator profiles, team membership, permissions, credentials and provider configuration','Visitor provider identities, sessions, recovery challenges, preview tokens and rate-limit state','Verified domains, TLS/deployment verification, live delivery and billing bindings','Operational audit/traffic logs, delivery queues, cache events and storage cleanup jobs','Private comment/form notification attempt/retry journals: source evidence remains authoritative and is not cloned or replayed','Externally linked files: links retained; remote bytes are not copied'];
export const SITE_BACKUP_RESETS = ['New site and content/file identities; original site unchanged','Site, pages, posts, collections and records restored as draft; forms inactive','Visitor attribution retained as removed archive-only memberships; no account access','Registered components disabled and unreviewed; existing review required','Domains, visitor enrollment, delivery/provider credentials and billing bindings disabled','Comment/form notification attempts are not restored; original provider outcomes and retry evidence remain at the source site'];
export class SiteBackupError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
const object = (v: unknown): v is SiteBackupRow => !!v && typeof v === 'object' && !Array.isArray(v);
export function assertSiteBackupGraph(graph: unknown, siteId: string): asserts graph is SiteBackupGraph {
  if (!object(graph) || !object(graph.site) || graph.site.id !== siteId || !object(graph.tables)) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup site identity is invalid.');
  const ids = new Set<string>([siteId]); let count = 0;
  for (const name of SITE_BACKUP_TABLES) {
    // Older v1 archives predate the private product design journal. Absence means no history, never a fabricated baseline.
    if (['productDesignRevisions', 'formDesignRevisions', 'collectionDesignRevisions'].includes(name) && graph.tables[name] === undefined) graph.tables[name] = [];
    const rows = graph.tables[name];
    if (!Array.isArray(rows)) throw new SiteBackupError('SITE_BACKUP_INCOMPLETE',400,`The backup is missing ${name}.`);
    for (const row of rows) {
      if (!object(row) || typeof row.id !== 'string' || !row.id || row.siteId !== siteId || ids.has(row.id)) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup has duplicate or foreign site identities.');
      ids.add(row.id); if (++count > SITE_BACKUP_LIMITS.maxRows) throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'The site exceeds the bounded backup row limit.');
    }
  }
  if (Object.keys(graph.tables).some(k => !SITE_BACKUP_TABLES.includes(k as SiteBackupTable))) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup includes unsupported tables.');
  const references: Partial<Record<SiteBackupTable, Record<string, SiteBackupTable>>> = {
    pages:{parentId:'pages'}, media:{folderId:'mediaFolders'}, mediaFolders:{parentId:'mediaFolders'}, mediaVersions:{mediaId:'media'}, contentCollectionRecords:{collectionId:'contentCollections'}, productDesignRevisions:{collectionId:'contentCollections',recordId:'contentCollectionRecords'},
    formDesignRevisions:{formId:'formDefinitions'}, collectionDesignRevisions:{collectionId:'contentCollections'}, formDefinitions:{pageId:'pages',postId:'blogPosts'}, formSubmissions:{formId:'formDefinitions',pageId:'pages',postId:'blogPosts',visitorMemberId:'siteVisitors'}, formContacts:{formId:'formDefinitions',pageId:'pages',postId:'blogPosts',sourceSubmissionId:'formSubmissions'}, comments:{parentId:'comments',visitorMemberId:'siteVisitors'},
  };
  const tables=graph.tables as Record<SiteBackupTable,SiteBackupRow[]>;
  for (const [table, fields] of Object.entries(references)) for(const row of tables[table as SiteBackupTable]) for(const [field,target] of Object.entries(fields as Record<string,SiteBackupTable>)) {
    if (row[field] != null && row[field] !== '' && !tables[target].some((r: SiteBackupRow) => r.id === row[field])) throw new SiteBackupError('SITE_BACKUP_REFERENCE_INVALID',400,`The backup has an unavailable ${field} reference.`);
  }
}
/** Exact scalar identities/URLs are remapped without flattening opaque editor envelopes. */
export function remapSiteBackupValue(value: unknown, map: ReadonlyMap<string,string>, depth = 0): unknown {
  if (depth > SITE_BACKUP_LIMITS.maxDepth) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup content exceeds its nesting limit.');
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map(v => remapSiteBackupValue(v,map,depth+1));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,remapSiteBackupValue(v,map,depth+1)]));
  return value;
}
const credentials = /^(?:password|passwordHash|secret|clientSecret|apiKey|accessToken|refreshToken|idToken|authToken|serviceRoleKey|authorization|cookie|smtpPassword|webhookSecret)$/i;
/** Strip credential names, while retaining scientific tokenCount/sessionCount authored data. */
export function scrubSiteBackupCredentials(value: unknown, depth = 0): unknown {
  if(depth > SITE_BACKUP_LIMITS.maxDepth) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup content exceeds its nesting limit.');
  if(Array.isArray(value)) return value.map(v => scrubSiteBackupCredentials(v,depth+1));
  if(object(value)) return Object.fromEntries(Object.entries(value).filter(([k]) => !credentials.test(k)).map(([k,v]) => [k,scrubSiteBackupCredentials(v,depth+1)]));
  return value;
}
export function prepareSiteBackupDraft(graph: SiteBackupGraph, map: ReadonlyMap<string,string>, input: { name: string; slug: string; teamId: string; actorId: string|null; remapCollectionTemplatePin?: (original: unknown, remapped: unknown, templateFingerprints: ReadonlyMap<string,string>) => unknown; remapCollectionTemplateRevisionFingerprint?: (original: SiteBackupRow, remapped: SiteBackupRow) => string|null; remapFormTemplatePin?: (original: unknown, remapped: unknown, templateFingerprints: ReadonlyMap<string,string>) => unknown; remapFormTemplateRevisionFingerprint?: (original: SiteBackupRow, remapped: SiteBackupRow) => string|null }): SiteBackupGraph {
  assertSiteBackupGraph(graph,String(graph.site.id));
  const next = remapSiteBackupValue(graph,map) as SiteBackupGraph;
  next.site = {...next.site,name:input.name,slug:input.slug,teamId:input.teamId,customDomain:null,domainStatus:'pending',sslEnabled:false,isPublished:false,publishedAt:null};
  const settings = object(next.site.settings) ? scrubSiteBackupCredentials(next.site.settings) as SiteBackupRow : {};
  for(const key of ['domainVerification','vercelDeployment','billingQuota','billing','integrations','email','smtp','newsletterProvider','providerBindings','delivery','webhooks']) delete settings[key];
  settings.visitorAccounts = {enabled:false,registrationEnabled:false};settings.siteStatus='draft'; next.site.settings=settings;
  for(const name of SITE_BACKUP_TABLES) for(const row of next.tables[name]) {
    for(const field of ['createdBy','updatedBy','uploadedBy','authorId']) if(field in row) row[field]=input.actorId;
    if(['pages','blogPosts','contentCollections','contentCollectionRecords'].includes(name)) { row.status='draft'; row.publishedAt=null; row.scheduledAt=null; }
    if(name==='formDefinitions') {row.isActive=false; row.notificationEmail=null;row.notificationWebhook=null;row.successRedirectUrl=null;}
    if(name==='siteVisitors') {row.providerIssuer='backy:archived-attribution';row.providerSubject=String(row.id);row.status='removed';}
    if(name==='interactiveComponents') {row.status='disabled';row.reviewStatus='draft';row.reviewedBy=null;row.reviewedAt=null;row.integrity={signed:false,signatureRequiredForCustomCode:true};row.runtime={};}
  }
  // Captured submission bindings must describe the newly inactive form, in both
  // the current design and its retained preimages. Other form targets stay exact.
  const restoredForms = new Map(next.tables.formDefinitions.map(form => [form.id,form]));
  const rebindForm = (value: unknown, depth = 0): unknown => {
    if (depth > SITE_BACKUP_LIMITS.maxDepth) throw new SiteBackupError('SITE_BACKUP_INVALID',400,'The backup content exceeds its nesting limit.');
    if (Array.isArray(value)) return value.map(item => rebindForm(item,depth+1));
    if (!object(value)) return value;
    const result = Object.fromEntries(Object.entries(value).map(([key,item]) => [key,rebindForm(item,depth+1)]));
    const form = restoredForms.get(result.formId);
    if (form) {
      if ('formName' in result) result.formName = form.name;
      if ('formActive' in result) result.formActive = false;
    }
    return result;
  };
  if (object(next.site.settings) && object(next.site.settings.frontendDesign)) {
    const design = next.site.settings.frontendDesign;
    if (Array.isArray(design.templates)) design.templates = design.templates.map(template => object(template) && template.type === 'form' ? rebindForm(template) : template);
  }
  const templateFingerprints = new Map<string,string>();
  for (const [index,revision] of next.tables.templateRevisions.entries()) {
    if (!object(revision.snapshot) || revision.snapshot.type !== 'form') continue;
    revision.snapshot = rebindForm(revision.snapshot);
    const fingerprint = input.remapFormTemplateRevisionFingerprint?.(graph.tables.templateRevisions[index],revision);
    if (fingerprint) { templateFingerprints.set(String(graph.tables.templateRevisions[index].fingerprint),fingerprint); revision.fingerprint=fingerprint; }
  }
  const mappedPin = (original: unknown, remapped: unknown) => input.remapFormTemplatePin
    ? input.remapFormTemplatePin(original,remapped,templateFingerprints)
    : JSON.stringify(original) === JSON.stringify(remapped) ? remapped : null;
  for (const [index,form] of next.tables.formDefinitions.entries()) {
    form.settings = rebindForm(form.settings);
    if (object(form.settings) && 'frontendTemplateInstance' in form.settings) {
      const originalSettings = graph.tables.formDefinitions[index].settings;
      const pin = mappedPin(object(originalSettings) ? originalSettings.frontendTemplateInstance : null,form.settings.frontendTemplateInstance);
      if (pin) form.settings.frontendTemplateInstance = pin; else delete form.settings.frontendTemplateInstance;
    }
  }
  for (const [index,revision] of next.tables.formDesignRevisions.entries()) {
    const form = next.tables.formDefinitions.find(row => row.id === revision.formId);
    if (!form || !object(revision.snapshot)) continue;
    revision.snapshot = rebindForm(revision.snapshot);
    const snapshot = revision.snapshot as SiteBackupRow, originalSnapshot = graph.tables.formDesignRevisions[index].snapshot;
    snapshot.pin = mappedPin(object(originalSnapshot) ? originalSnapshot.pin : null,snapshot.pin);
  }
  const collectionFingerprints = new Map<string,string>();
  for (const [index,revision] of next.tables.templateRevisions.entries()) {
    if (!object(revision.snapshot) || revision.snapshot.type !== 'collection') continue;
    const fingerprint = input.remapCollectionTemplateRevisionFingerprint?.(graph.tables.templateRevisions[index],revision);
    if (fingerprint) { collectionFingerprints.set(String(graph.tables.templateRevisions[index].fingerprint),fingerprint); revision.fingerprint=fingerprint; }
  }
  const collectionPin = (original: unknown, remapped: unknown) => input.remapCollectionTemplatePin
    ? input.remapCollectionTemplatePin(original,remapped,collectionFingerprints)
    : JSON.stringify(original) === JSON.stringify(remapped) ? remapped : null;
  for (const [index,collection] of next.tables.contentCollections.entries()) {
    if (object(collection.metadata) && 'frontendTemplateInstance' in collection.metadata) {
      const originalMetadata = graph.tables.contentCollections[index].metadata;
      const pin = collectionPin(object(originalMetadata) ? originalMetadata.frontendTemplateInstance : null,collection.metadata.frontendTemplateInstance);
      if (pin) collection.metadata.frontendTemplateInstance = pin; else delete collection.metadata.frontendTemplateInstance;
    }
  }
  for (const [index,revision] of next.tables.collectionDesignRevisions.entries()) {
    if (!object(revision.snapshot)) continue;
    const originalSnapshot = graph.tables.collectionDesignRevisions[index].snapshot;
    revision.snapshot.pin = collectionPin(object(originalSnapshot) ? originalSnapshot.pin : null,revision.snapshot.pin);
  }
  return next;
}
export type SiteBackupRestoreFile = Omit<SiteBackupFile,'base64'|'url'|'id'> & { namespace:'media'|'attachment'; writeState:'planned'|'writing'|'stored' };
export type SiteBackupRestoreJob = { id: string; sourceSiteId: string; targetSiteId: string; state: 'pending'|'committed'|'settled'; files: SiteBackupRestoreFile[]; storageIdentity: string; remaining: number; createdAt: string };
export interface BackySiteBackupRepository {
  withJobLock<T>(sourceSiteId:string,jobId:string,run:()=>Promise<T>):Promise<T>;
  /** Bounded consistent snapshot; callback may read bytes while managed metadata is locked. */
  snapshot<T>(siteId: string, read: (graph: SiteBackupGraph) => Promise<T>): Promise<T>;
  createJob(input: Omit<SiteBackupRestoreJob,'id'|'state'|'remaining'|'createdAt'>): Promise<SiteBackupRestoreJob>;
  getJob(sourceSiteId: string,jobId: string): Promise<SiteBackupRestoreJob|null>;
  recordFileState(sourceSiteId:string,jobId:string,index:number,state:'writing'|'stored'):Promise<void>;
  listJobs(sourceSiteId: string): Promise<SiteBackupRestoreJob[]>;
  /** Inserts the entire fresh graph and marks its job committed in the same transaction. */
  commit(jobId: string,sourceSiteId: string,graph: SiteBackupGraph): Promise<void>;
  settle(sourceSiteId: string,jobId: string,remaining: number): Promise<void>;
  pruneSettled(sourceSiteId:string):Promise<void>;
}
