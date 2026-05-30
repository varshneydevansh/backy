export const CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA = 'backy.custom-frontend-agent-handoff.v1';

export const CUSTOM_FRONTEND_AGENT_BRIEF_SCHEMA = 'backy.custom-frontend-agent-brief.v1';

export const CUSTOM_FRONTEND_COMPONENT_API_CONTRACT_SCHEMA = 'backy.canvas-component-api-contract.v1';

export const CUSTOM_FRONTEND_ROUTING_HANDOFF_SCHEMA = 'backy.custom-frontend-routing-handoff.v1';

export const CUSTOM_FRONTEND_AGENT_HANDOFF_DOC = 'specs/custom-frontend-agent-handoff.md';

export const CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS = [
  'content.contentDocument',
  'content.elements',
  'content.canvas',
  'content.customCSS',
  'content.customJS',
  'content.themeTokenRefs',
  'content.assets',
  'content.animations',
  'content.interactions',
  'content.dataBindings',
  'content.editableMap',
  'content.seo',
  'content.metadata',
  'meta.frontendDesign*',
] as const;

export const CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS = [
  'element.id',
  'element.type',
  'element.name',
  'element.parentId',
  'element.x',
  'element.y',
  'element.width',
  'element.height',
  'element.rotation',
  'element.zIndex',
  'element.visible',
  'element.locked',
  'element.props',
  'element.componentKey',
  'element.version',
  'element.controls',
  'element.fallback',
  'element.renderCapabilities',
  'element.styles',
  'element.responsive',
  'element.tokenRefs',
  'element.assetIds',
  'element.animation',
  'element.actions',
  'element.dataBindings',
  'element.bindingSlots',
  'element.accessibility',
  'element.permissions',
  'element.metadata',
  'element.children[]',
  'content.contentDocument.nodes',
  'content.editableMap',
  'meta.frontendDesignEditableMap',
] as const;

export const CUSTOM_FRONTEND_COMPONENT_API_FAMILIES = [
  'layout',
  'typography',
  'media',
  'forms',
  'commerce',
  'collections',
  'navigation',
  'comments',
  'embeds',
  'interactive-components',
  'custom-code',
] as const;

const COMMON_COMPONENT_STYLE_PATHS = [
  'styles.*',
  'tokenRefs.*',
  'responsive.*.styles.*',
  'responsive.*.tokenRefs.*',
] as const;

const COMMON_COMPONENT_RESPONSIVE_PATHS = [
  'responsive.desktop',
  'responsive.tablet',
  'responsive.mobile',
  'responsive.*.x',
  'responsive.*.y',
  'responsive.*.width',
  'responsive.*.height',
  'responsive.*.props.*',
  'responsive.*.styles.*',
] as const;

const COMMON_COMPONENT_BINDING_PATHS = [
  'bindingSlots[]',
  'dataBindings[]',
  'content.editableMap.*',
  'meta.frontendDesignEditableMap.*',
] as const;

const COMPONENT_DEFAULT_SIZE_BY_TYPE: Record<string, { width: number; height: number }> = {
  heading: { width: 560, height: 88 },
  text: { width: 520, height: 72 },
  paragraph: { width: 640, height: 120 },
  quote: { width: 620, height: 140 },
  list: { width: 480, height: 160 },
  button: { width: 180, height: 52 },
  link: { width: 220, height: 40 },
  image: { width: 420, height: 280 },
  video: { width: 520, height: 292 },
  icon: { width: 64, height: 64 },
  map: { width: 560, height: 320 },
  container: { width: 720, height: 360 },
  section: { width: 1200, height: 420 },
  header: { width: 1200, height: 96 },
  footer: { width: 1200, height: 260 },
  box: { width: 360, height: 220 },
  columns: { width: 900, height: 320 },
  spacer: { width: 1200, height: 64 },
  divider: { width: 640, height: 16 },
  nav: { width: 430, height: 52 },
  form: { width: 520, height: 520 },
  input: { width: 360, height: 72 },
  textarea: { width: 420, height: 140 },
  select: { width: 360, height: 72 },
  checkbox: { width: 360, height: 96 },
  radio: { width: 360, height: 120 },
  repeater: { width: 960, height: 420 },
  comment: { width: 560, height: 380 },
  embed: { width: 560, height: 320 },
  html: { width: 560, height: 320 },
  table: { width: 720, height: 360 },
  interactiveFigure: { width: 640, height: 420 },
  codeBlock: { width: 640, height: 300 },
  codeComponent: { width: 640, height: 420 },
};

const COMPONENT_DEFAULT_PROPS_BY_TYPE: Record<string, Record<string, unknown>> = {
  heading: { content: 'Heading text', level: 2, fontSize: 56, fontWeight: 700, color: '#111827', lineHeight: 1.1 },
  text: { content: 'Text block', fontSize: 18, fontWeight: 400, color: '#334155', lineHeight: 1.55, textAlign: 'left' },
  paragraph: { content: 'Paragraph text', fontSize: 18, color: '#334155', lineHeight: 1.65, textAlign: 'left' },
  quote: { content: 'Quote text', cite: '', fontSize: 24, color: '#111827', lineHeight: 1.45, fontStyle: 'italic' },
  list: { items: ['List item'], content: '', listType: 'unordered', fontSize: 18, color: '#334155', gap: 8 },
  button: { content: 'Button', label: 'Button', href: '/', target: '_self', rel: '', variant: 'primary', action: 'navigate', fileMediaId: '', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: 700 },
  link: { content: 'Link', href: '/', target: '_self', rel: '', download: false, fileMediaId: '', color: '#2563eb', fontSize: 16, underline: true },
  image: { src: '', mediaId: '', alt: '', objectFit: 'cover', focalPoint: { x: 0.5, y: 0.5 }, caption: '' },
  video: { src: '', mediaId: '', poster: '', posterMediaId: '', controls: true, autoplay: false, loop: false, objectFit: 'cover' },
  icon: { icon: 'sparkles', name: 'Icon', color: '#111827', size: 32, strokeWidth: 2 },
  map: { address: '', src: '', zoom: 12, markerLabel: '', latitude: null, longitude: null },
  container: { layout: 'vertical', gap: 24, padding: 32, backgroundColor: 'transparent' },
  section: { contentRole: 'section', layout: 'vertical', backgroundColor: '#ffffff', borderRadius: 0, padding: 64, anchorId: '' },
  header: { chromeRole: 'site-header', position: 'top', width: 'full', showBrand: true, navigationBinding: 'site.navigation.primary', backgroundColor: '#ffffff', borderColor: '#e5e7eb', padding: 16 },
  footer: { chromeRole: 'site-footer', width: 'full', showSocial: true, newsletterBinding: 'site.newsletter', backgroundColor: '#111827', color: '#ffffff', padding: 24 },
  box: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#d9e2ec', borderStyle: 'solid', borderWidth: 1, shadow: 'none', boxShadow: 'none', contentRole: 'box' },
  columns: { columns: 2, gap: 32, stackOnMobile: true, columnWidths: ['1fr', '1fr'] },
  spacer: { size: 64, axis: 'vertical' },
  divider: { orientation: 'horizontal', color: '#d9e2ec', borderColor: '#d9e2ec', thickness: 1, style: 'solid', margin: '16px' },
  nav: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Blog', href: '/blog' },
    ],
    navItems: ['Home', 'Blog'],
    navigationSource: 'site',
    navigationBinding: 'site.navigation.primary',
    chromeRole: 'site.header.navigation',
    backgroundColor: 'transparent',
    color: '#111827',
    padding: 16,
    direction: 'horizontal',
    gap: 24,
    ariaLabel: 'Primary navigation',
  },
  form: {
    formId: '',
    formTitle: 'Contact form',
    formName: 'contact-form',
    formDescription: '',
    formActive: true,
    formAudience: 'public',
    actionUrl: '',
    schema: {},
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
    submitLabel: 'Submit',
    successMessage: 'Thanks, your submission was received.',
    newsletterTopicIds: [],
    moderationMode: 'manual',
    enableHoneypot: true,
    enableCaptcha: false,
    contactShareEnabled: false,
    contactShareNameField: '',
    contactShareEmailField: 'email',
    contactSharePhoneField: '',
    contactShareNotesField: '',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 18,
  },
  input: { name: 'field', label: 'Field', type: 'text', inputType: 'text', placeholder: '', required: false, value: '', borderColor: '#d1d5db', borderRadius: 4 },
  textarea: { name: 'message', label: 'Message', placeholder: '', required: false, rows: 4, value: '', borderColor: '#d1d5db', borderRadius: 4 },
  select: { name: 'option', label: 'Option', options: ['Option 1'], placeholder: 'Choose an option', required: false, value: '', borderColor: '#d1d5db', borderRadius: 4 },
  checkbox: { name: 'choices', label: 'Choices', options: ['Option 1'], required: false, value: [] },
  radio: { name: 'choice', label: 'Choice', options: ['Option 1'], required: false, value: '' },
  repeater: { collectionId: '', datasetId: '', limit: 6, columns: 3, gap: 16, titleField: 'title', imageField: 'image', descriptionField: 'description', emptyMessage: 'No records yet.' },
  comment: { resourceType: 'page', resourceId: '', moderationMode: 'review', allowReplies: true, requireName: true, requireEmail: true, commentTitle: 'Comments', commentAllowGuests: true, commentRequireName: true, commentRequireEmail: false, commentAllowReplies: true, commentModerationMode: 'manual', commentSortOrder: 'newest' },
  embed: { src: '', html: '', allowedHosts: [], allow: '', sandbox: 'allow-scripts allow-same-origin', loading: 'lazy', borderRadius: 8 },
  html: { html: '<div>Custom HTML</div>', title: 'Custom HTML preview', sandbox: 'allow-scripts', allowedHosts: [], backgroundColor: '#ffffff', borderRadius: 8 },
  table: { html: '', title: 'Table preview', rows: [['Header', 'Value']], columns: ['Header', 'Value'], caption: '', backgroundColor: '#ffffff', borderRadius: 8 },
  interactiveFigure: { registryId: '', runtimeUrl: '', config: {}, datasetId: '', sandbox: 'allow-scripts allow-same-origin', componentKey: 'backy.figure.custom', version: '1.0.0', title: 'Interactive figure', fallbackText: 'Static fallback for this interactive figure.', fallback: {}, controls: [], renderCapabilities: {}, series: [], steps: [] },
  codeBlock: { code: '', language: 'text', filename: '', caption: '', showLineNumbers: true, wrapLines: false, copyEnabled: true, highlightTheme: 'dark', backgroundColor: '#0f172a', color: '#e2e8f0' },
  codeComponent: { code: '', html: '', css: '', js: '', sandbox: 'allow-scripts', allowedHosts: [], config: {}, componentKey: 'backy.custom.sandboxed', version: '1.0.0', title: 'Sandboxed component', sandboxUrl: '', fallbackText: 'This custom component needs a configured sandbox runtime to hydrate.', fallback: {}, controls: [], renderCapabilities: {} },
};

const fallbackComponentPropValue = (propName: string): unknown => {
  if (/(items|fields|options|newsletterTopicIds|allowedHosts|rows|columns|columnWidths)$/u.test(propName)) return [];
  if (/(config|schema|focalPoint)$/u.test(propName)) return {};
  if (/(required|controls|autoplay|loop|download|stackOnMobile|showBrand|showSocial|allowReplies|requireName|requireEmail)$/u.test(propName)) return false;
  if (/(fontSize|fontWeight|lineHeight|gap|padding|zoom|size|strokeWidth|thickness|limit)$/u.test(propName)) return 0;
  if (/(latitude|longitude)$/u.test(propName)) return null;
  return '';
};

const buildComponentPropsTemplate = (
  propPaths: readonly string[],
  defaultProps: Record<string, unknown>,
) => propPaths.reduce<Record<string, unknown>>((template, path) => {
  const propName = path.match(/^props\.([^.[\]]+)/u)?.[1];
  if (!propName) return template;
  template[propName] = Object.prototype.hasOwnProperty.call(defaultProps, propName)
    ? defaultProps[propName]
    : fallbackComponentPropValue(propName);
  return template;
}, {});

const buildComponentCreationHints = (
  type: string,
  label: string,
  propPaths: readonly string[],
  options: {
    supportsChildren?: boolean;
    flowParticipation?: 'absolute-layer' | 'root-section-flow';
  } = {},
) => {
  const defaultSize = COMPONENT_DEFAULT_SIZE_BY_TYPE[type] || (
    options.flowParticipation === 'root-section-flow'
      ? { width: 1200, height: 320 }
      : { width: 320, height: 160 }
  );
  const defaultProps = COMPONENT_DEFAULT_PROPS_BY_TYPE[type] || {};
  const propsTemplate = buildComponentPropsTemplate(propPaths, defaultProps);
  const requiredFields = ['id', 'type', 'x', 'y', 'width', 'height', 'props', 'styles', 'responsive'];
  const minimalElement: Record<string, unknown> = {
    id: `${type}-element`,
    type,
    name: label,
    x: 0,
    y: 0,
    width: defaultSize.width,
    height: defaultSize.height,
    rotation: 0,
    zIndex: 1,
    visible: true,
    locked: false,
    props: propsTemplate,
    styles: {},
    responsive: {},
    tokenRefs: {},
    assetIds: [],
    dataBindings: [],
    bindingSlots: [],
    accessibility: {},
    metadata: {},
  };

  if (options.supportsChildren) {
    minimalElement.children = [];
    requiredFields.push('children');
  }

  return {
    defaultSize,
    defaultProps,
    propsTemplate,
    minimalElement,
    requiredFields,
    writeRule: 'Create with minimalElement, then only mutate fields advertised by propPaths, stylePaths, responsivePaths, bindingPaths, and stable element fields.',
  };
};

const componentTypeContract = (
  type: string,
  family: typeof CUSTOM_FRONTEND_COMPONENT_API_FAMILIES[number],
  label: string,
  propPaths: readonly string[],
  options: {
    supportsChildren?: boolean;
    supportsMediaAssets?: boolean;
    supportsDataBinding?: boolean;
    supportsCustomCode?: boolean;
    bindingPaths?: readonly string[];
    flowParticipation?: 'absolute-layer' | 'root-section-flow';
    sharedSiteChrome?: boolean;
    sharedChromeBindings?: readonly string[];
  } = {},
) => ({
  type,
  family,
  label,
  apiReadable: true,
  apiWritable: true,
  propPaths,
  stylePaths: COMMON_COMPONENT_STYLE_PATHS,
  responsivePaths: COMMON_COMPONENT_RESPONSIVE_PATHS,
  bindingPaths: options.bindingPaths || COMMON_COMPONENT_BINDING_PATHS,
  supportsChildren: Boolean(options.supportsChildren),
  supportsMediaAssets: Boolean(options.supportsMediaAssets),
  supportsDataBinding: options.supportsDataBinding !== false,
  supportsCustomCode: Boolean(options.supportsCustomCode),
  flowParticipation: options.flowParticipation || 'absolute-layer',
  sharedSiteChrome: Boolean(options.sharedSiteChrome),
  sharedChromeBindings: options.sharedChromeBindings || [],
  creationHints: buildComponentCreationHints(type, label, propPaths, {
    supportsChildren: options.supportsChildren,
    flowParticipation: options.flowParticipation,
  }),
});

export const CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS = [
  componentTypeContract('heading', 'typography', 'Heading', ['props.content', 'props.level', 'props.fontSize', 'props.fontWeight', 'props.color', 'props.lineHeight']),
  componentTypeContract('text', 'typography', 'Text', ['props.content', 'props.fontSize', 'props.fontWeight', 'props.color', 'props.lineHeight', 'props.textAlign']),
  componentTypeContract('paragraph', 'typography', 'Paragraph', ['props.content', 'props.fontSize', 'props.color', 'props.lineHeight', 'props.textAlign']),
  componentTypeContract('quote', 'typography', 'Quote', ['props.content', 'props.cite', 'props.fontSize', 'props.color', 'props.lineHeight', 'props.fontStyle']),
  componentTypeContract('list', 'typography', 'List', ['props.items', 'props.content', 'props.listType', 'props.fontSize', 'props.color', 'props.gap']),
  componentTypeContract('button', 'typography', 'Button', ['props.content', 'props.label', 'props.href', 'props.target', 'props.rel', 'props.variant', 'props.action', 'props.fileMediaId', 'props.backgroundColor', 'props.color', 'props.borderRadius', 'props.fontSize', 'props.fontWeight']),
  componentTypeContract('link', 'typography', 'Link', ['props.content', 'props.href', 'props.target', 'props.rel', 'props.download', 'props.fileMediaId', 'props.color', 'props.fontSize', 'props.underline']),
  componentTypeContract('image', 'media', 'Image', ['props.src', 'props.mediaId', 'props.alt', 'props.objectFit', 'props.focalPoint', 'props.caption'], { supportsMediaAssets: true }),
  componentTypeContract('video', 'media', 'Video', ['props.src', 'props.mediaId', 'props.poster', 'props.posterMediaId', 'props.controls', 'props.autoplay', 'props.loop', 'props.objectFit'], { supportsMediaAssets: true }),
  componentTypeContract('icon', 'media', 'Icon', ['props.icon', 'props.name', 'props.color', 'props.size', 'props.strokeWidth']),
  componentTypeContract('map', 'media', 'Map', ['props.address', 'props.src', 'props.zoom', 'props.markerLabel', 'props.latitude', 'props.longitude']),
  componentTypeContract('container', 'layout', 'Container', ['props.layout', 'props.gap', 'props.padding', 'props.backgroundColor'], { supportsChildren: true }),
  componentTypeContract('section', 'layout', 'Section', ['props.contentRole', 'props.layout', 'props.backgroundColor', 'props.borderRadius', 'props.padding', 'props.anchorId'], { supportsChildren: true, flowParticipation: 'root-section-flow' }),
  componentTypeContract('header', 'layout', 'Header', ['props.chromeRole', 'props.position', 'props.width', 'props.showBrand', 'props.navigationBinding', 'props.backgroundColor', 'props.borderColor', 'props.padding'], { supportsChildren: true, flowParticipation: 'root-section-flow', sharedSiteChrome: true, sharedChromeBindings: ['props.chromeRole', 'props.navigationBinding', 'site.navigation.primary'] }),
  componentTypeContract('footer', 'layout', 'Footer', ['props.chromeRole', 'props.width', 'props.showSocial', 'props.newsletterBinding', 'props.backgroundColor', 'props.color', 'props.padding'], { supportsChildren: true, flowParticipation: 'root-section-flow', sharedSiteChrome: true, sharedChromeBindings: ['props.chromeRole', 'props.newsletterBinding', 'site.footer', 'site.newsletter'] }),
  componentTypeContract('box', 'layout', 'Box', ['props.backgroundColor', 'props.borderRadius', 'props.borderColor', 'props.borderStyle', 'props.borderWidth', 'props.shadow', 'props.boxShadow', 'props.contentRole'], { supportsChildren: true }),
  componentTypeContract('columns', 'layout', 'Columns', ['props.columns', 'props.gap', 'props.stackOnMobile', 'props.columnWidths'], { supportsChildren: true }),
  componentTypeContract('spacer', 'layout', 'Spacer', ['props.size', 'props.axis']),
  componentTypeContract('divider', 'layout', 'Divider', ['props.orientation', 'props.color', 'props.borderColor', 'props.thickness', 'props.style', 'props.margin']),
  componentTypeContract('nav', 'navigation', 'Navigation', ['props.items', 'props.navItems', 'props.navigationSource', 'props.navigationBinding', 'props.chromeRole', 'props.backgroundColor', 'props.color', 'props.padding', 'props.direction', 'props.gap', 'props.ariaLabel'], { flowParticipation: 'root-section-flow', sharedSiteChrome: true, sharedChromeBindings: ['props.items', 'props.navItems', 'props.navigationSource', 'props.navigationBinding', 'props.chromeRole', 'site.navigation.primary', 'site.navigation.footer'] }),
  componentTypeContract('form', 'forms', 'Form', ['props.formId', 'props.formTitle', 'props.formName', 'props.formDescription', 'props.formActive', 'props.formAudience', 'props.actionUrl', 'props.schema', 'props.fields', 'props.submitLabel', 'props.successMessage', 'props.newsletterTopicIds', 'props.moderationMode', 'props.enableHoneypot', 'props.enableCaptcha', 'props.contactShareEnabled', 'props.contactShareNameField', 'props.contactShareEmailField', 'props.contactSharePhoneField', 'props.contactShareNotesField', 'props.backgroundColor', 'props.borderColor', 'props.borderRadius', 'props.padding'], { supportsChildren: true }),
  componentTypeContract('input', 'forms', 'Input field', ['props.name', 'props.label', 'props.type', 'props.inputType', 'props.placeholder', 'props.required', 'props.value', 'props.borderColor', 'props.borderRadius']),
  componentTypeContract('textarea', 'forms', 'Textarea field', ['props.name', 'props.label', 'props.placeholder', 'props.required', 'props.rows', 'props.value', 'props.borderColor', 'props.borderRadius']),
  componentTypeContract('select', 'forms', 'Select field', ['props.name', 'props.label', 'props.options', 'props.placeholder', 'props.required', 'props.value', 'props.borderColor', 'props.borderRadius']),
  componentTypeContract('checkbox', 'forms', 'Checkbox field', ['props.name', 'props.label', 'props.options', 'props.required', 'props.value']),
  componentTypeContract('radio', 'forms', 'Radio field', ['props.name', 'props.label', 'props.options', 'props.required', 'props.value']),
  componentTypeContract('repeater', 'collections', 'Repeater', ['props.collectionId', 'props.datasetId', 'props.limit', 'props.columns', 'props.gap', 'props.titleField', 'props.imageField', 'props.descriptionField', 'props.emptyMessage'], { supportsChildren: true }),
  componentTypeContract('comment', 'comments', 'Comment block', ['props.resourceType', 'props.resourceId', 'props.moderationMode', 'props.allowReplies', 'props.requireName', 'props.requireEmail', 'props.commentTitle', 'props.commentAllowGuests', 'props.commentRequireName', 'props.commentRequireEmail', 'props.commentAllowReplies', 'props.commentModerationMode', 'props.commentSortOrder']),
  componentTypeContract('embed', 'embeds', 'Embed', ['props.src', 'props.html', 'props.allowedHosts', 'props.allow', 'props.sandbox', 'props.loading', 'props.borderRadius']),
  componentTypeContract('html', 'custom-code', 'HTML block', ['props.html', 'props.title', 'props.sandbox', 'props.allowedHosts', 'props.backgroundColor', 'props.borderRadius'], { supportsCustomCode: true }),
  componentTypeContract('table', 'custom-code', 'Table', ['props.html', 'props.title', 'props.rows', 'props.columns', 'props.caption', 'props.backgroundColor', 'props.borderRadius']),
  componentTypeContract('interactiveFigure', 'interactive-components', 'Interactive figure', ['props.registryId', 'props.runtimeUrl', 'props.config', 'props.datasetId', 'props.sandbox', 'props.componentKey', 'props.version', 'props.title', 'props.fallbackText', 'props.fallback', 'props.controls', 'props.renderCapabilities', 'props.series', 'props.steps'], { supportsCustomCode: true }),
  componentTypeContract('codeBlock', 'custom-code', 'Code snippet', ['props.code', 'props.language', 'props.filename', 'props.caption', 'props.showLineNumbers', 'props.wrapLines', 'props.copyEnabled', 'props.highlightTheme', 'props.backgroundColor', 'props.color']),
  componentTypeContract('codeComponent', 'custom-code', 'Code component', ['props.code', 'props.html', 'props.css', 'props.js', 'props.sandbox', 'props.allowedHosts', 'props.config', 'props.componentKey', 'props.version', 'props.title', 'props.sandboxUrl', 'props.fallbackText', 'props.fallback', 'props.controls', 'props.renderCapabilities'], { supportsCustomCode: true }),
] as const;

export interface CustomFrontendAgentSiteContext {
  slug?: string | null;
  customDomain?: string | null;
  domainVerificationDomain?: string | null;
}

const normalizeHandoffDomain = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.replace(/\/+$/, '')
    .toLowerCase();
  return host || null;
};

const normalizeHandoffSlug = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const slug = value.trim().replace(/^\/+|\/+$/g, '');
  return slug || fallback;
};

export const buildCustomFrontendAgentAdminEntryPoints = (siteId: string) => ({
  pageBackyCanvas: `/pages/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  pageCustomFrontend: `/pages/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`,
  blogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  blogCustomFrontend: `/blog/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`,
  productBackyCanvas: `/products?siteId=${siteId}&quickCreate=product`,
  productCustomFrontend: `/products?siteId=${siteId}&frontendTemplate=:templateId`,
  formBackyCanvas: `/forms?siteId=${siteId}&quickCreate=blank`,
  formCustomFrontend: `/forms?siteId=${siteId}&frontendTemplate=:templateId`,
  newsletterWorkspace: `/newsletter?siteId=${siteId}`,
  newsletterPageBackyCanvas: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
  newsletterBlogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  collectionBackyCanvas: `/collections?siteId=${siteId}&draft=new`,
  collectionCustomFrontend: `/collections?siteId=${siteId}&frontendTemplate=:templateId`,
  reusableSectionBackyCanvas: `/reusable-sections?siteId=${siteId}`,
  reusableSectionCustomFrontend: `/reusable-sections?siteId=${siteId}&frontendTemplate=:templateId`,
});

export const buildCustomFrontendRoutingHandoff = (
  siteId: string,
  site: CustomFrontendAgentSiteContext = {},
) => {
  const slug = normalizeHandoffSlug(site.slug, siteId);
  const customDomain = normalizeHandoffDomain(site.customDomain);
  const verificationDomain = normalizeHandoffDomain(site.domainVerificationDomain);

  return {
    schemaVersion: CUSTOM_FRONTEND_ROUTING_HANDOFF_SCHEMA,
    siteId,
    identifiers: {
      siteId,
      slug,
      customDomain,
      verificationDomain,
      acceptedPublicIdentifiers: ['siteId', 'slug', 'customDomain', 'domain query parameter', 'Host header'],
    },
    publicResolution: {
      siteDiscovery: `/api/sites?identifier=${customDomain || slug}`,
      managedPath: `/sites/${slug}`,
      resolveBySiteId: `/api/sites/${siteId}/resolve?path=/`,
      renderBySiteId: `/api/sites/${siteId}/render?path=/...`,
      resolveWithHost: `/api/sites/${siteId}/resolve?path=/&domain={host}`,
      renderWithHost: `/api/sites/${siteId}/render?path=/...&domain={host}`,
      hostHeaderSupported: true,
      domainQueryParamSupported: true,
    },
    customDomainManagement: {
      adminSiteRoute: `/sites/${siteId}`,
      adminSiteApi: `/api/admin/sites/${siteId}`,
      adminSettingsApi: `/api/admin/sites/${siteId}/settings`,
      customDomainField: 'site.customDomain',
      verificationField: 'site.settings.domainVerification.domain',
      verificationStatusField: 'site.settings.domainVerification.status',
      dnsRecordEvidenceField: 'site.settings.domainVerification.records',
    },
    subdomainRouting: {
      supported: true,
      model: 'Treat every public host such as blog.example.com, docs.example.com, shop.example.com, or a root apex as a site custom domain/verification host, then resolve Backy content by site id plus Host/domain context.',
      examples: ['blog.example.com', 'docs.example.com', 'shop.example.com'],
      recommendation: 'Use one Backy site per independent public subdomain when content, navigation, SEO, or design tokens differ; reuse the same frontend design template when the subdomains should look related.',
    },
    customFrontendDeployment: {
      publicApiOriginEnv: 'BACKY_PUBLIC_API_BASE_URL',
      siteIdentifierEnv: 'BACKY_SITE_ID',
      hostContextEnv: 'BACKY_SITE_PUBLIC_HOST',
      frontendHostPolicy: 'A Vercel/Next/custom frontend may run on any verified host, but it must read Backy manifest/OpenAPI/render data instead of copying site JSON locally.',
      corsSetting: 'BACKY_CORS_ALLOWED_ORIGINS',
    },
    agentRules: [
      'Start with agent-handoff, manifest, and OpenAPI before choosing routes.',
      'For custom domains or subdomains, pass the browser host as domain={host} or rely on the Host/forwarded-host header when resolving/rendering localized routes.',
      'Keep site id/slug/custom domain as routing inputs; do not fork content or design state into the frontend repository.',
      'Manage domain verification in Backy Sites/Settings and keep DNS/provider credentials outside public payloads.',
    ],
  };
};

export const buildCustomFrontendComponentApiContract = (siteId: string) => ({
  schemaVersion: CUSTOM_FRONTEND_COMPONENT_API_CONTRACT_SCHEMA,
  everyComponentApiAddressable: true,
  everyElementApiAddressable: true,
  source: 'Backy canvas render payload and content document',
  scope: 'Every root, child, reusable-section, blog, page, product, form, collection, and custom-code canvas element keeps a stable API shape.',
  readPointers: {
    renderElements: `/api/sites/${siteId}/render?path=/...#data.content.elements`,
    renderContentDocument: `/api/sites/${siteId}/render?path=/...#data.content.contentDocument`,
    manifestElementActions: `/api/sites/${siteId}/manifest#data.contract.schemas.elementActions`,
    manifestEditableMap: `/api/sites/${siteId}/manifest#data.site.frontendDesign.editableMap`,
    openApiCanvasElement: `/api/sites/${siteId}/openapi#/components/schemas/BackyContentElement`,
    openApiContentPayload: `/api/sites/${siteId}/openapi#/components/schemas/PageResource`,
    editorCompositionHandoff: 'editorCompositionReadiness.agentHandoff',
  },
  writePointers: {
    adminPages: `/api/admin/sites/${siteId}/pages`,
    adminBlog: `/api/admin/sites/${siteId}/blog`,
    adminForms: `/api/admin/sites/${siteId}/forms`,
    adminCollections: `/api/admin/sites/${siteId}/collections`,
    adminProducts: `/api/admin/sites/${siteId}/collections/products/records`,
    adminReusableSections: `/api/admin/sites/${siteId}/reusable-sections`,
    adminFrontendDesign: `/api/admin/sites/${siteId}/frontend-design`,
  },
  elementAddressing: {
    stableIdField: 'id',
    typeField: 'type',
    propsField: 'props',
    styleFieldAliases: ['styles', 'style'],
    responsiveField: 'responsive',
    nestedChildrenField: 'children',
    contentDocumentNodeMap: 'content.contentDocument.nodes',
    editableMapSources: ['content.editableMap', 'meta.frontendDesignEditableMap', 'manifest.data.site.frontendDesign.editableMap'],
  },
  readableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS,
  writableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS,
  componentFamilies: CUSTOM_FRONTEND_COMPONENT_API_FAMILIES,
  componentTypeContracts: CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS,
  requiredAgentBehavior: [
    'Treat every canvas element as structured data keyed by id and type, not as a static screenshot.',
    'Preserve unknown props, styles, responsive overrides, data bindings, asset ids, and metadata during edits.',
    'Use editableMap and bindingSlots to connect custom frontend selectors or generated components back to Backy fields.',
    'When editing root section/header/footer/nav geometry, preserve Backy root-section flow semantics so later root sections move by the resized element bottom delta instead of overlapping.',
    'For header/footer/nav, prefer site navigation/chrome bindings over copying static menu labels so existing and newly created pages keep the shared site chrome.',
    'Create or update content through authenticated admin APIs when a user expects Backy to reopen the result in the canvas editor.',
  ],
  guarantees: [
    'Element props and styles are API-readable from render/content payloads.',
    'Nested children and reusable section composition are preserved as structured JSON.',
    'Responsive overrides and frontend design tokens survive page, post, product, form, collection, and reusable-section creation.',
    'Root section, header, footer, and nav resize operations are documented as flow-aware so adjacent root sections can be repositioned predictably.',
    'Navigation/header/footer chrome exposes shared binding paths so custom frontends can keep a consistent site menu across pages and subdomains.',
    'Custom frontends can inspect the handoff before generating UI and can keep Backy as the source of truth.',
  ],
  layoutBehavior: {
    schemaVersion: 'backy.canvas-layout-behavior.v1',
    rootFlowElementTypes: ['section', 'header', 'footer', 'nav'],
    absoluteLayerElementTypes: CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS
      .map((contract) => contract.type)
      .filter((type) => !['section', 'header', 'footer', 'nav'].includes(type)),
    resizeReflowPolicy: 'When exactly one root section/header/footer/nav changes y, height, or bottom edge, Backy moves later root elements at or after the previous bottom boundary by the same bottom-edge delta.',
    sharedSiteChromeElementTypes: ['header', 'footer', 'nav'],
    sharedSiteChromeBindings: [
      {
        type: 'header',
        fields: ['props.chromeRole', 'props.navigationBinding', 'site.navigation.primary'],
        policy: 'Use for shared site header/navigation that should stay consistent across existing and newly created pages.',
      },
      {
        type: 'footer',
        fields: ['props.chromeRole', 'props.newsletterBinding', 'site.footer', 'site.newsletter'],
        policy: 'Use for shared footer/newsletter chrome instead of duplicating footer content into every page.',
      },
      {
        type: 'nav',
        fields: ['props.items', 'props.navigationSource', 'props.navigationBinding', 'props.chromeRole', 'site.navigation.primary', 'site.navigation.footer'],
        policy: 'Use props.items for page-local menus and navigationBinding/navigationSource for site-wide menus.',
      },
    ],
    agentWriteRule: 'Do not hard-code a global header/footer/menu into each page unless the user explicitly wants page-local chrome; use the advertised navigation/chrome bindings for shared site UI.',
  },
  secretHandling: 'No provider keys, admin sessions, database URLs, private submission values, or private file tokens are exposed in public component API handoff fields.',
});

export const buildCustomFrontendAgentBrief = (siteId: string) => ({
  schemaVersion: CUSTOM_FRONTEND_AGENT_BRIEF_SCHEMA,
  title: 'Copy this brief into any AI or custom frontend builder before it writes UI.',
  copyPrompt: [
    `You are building a frontend for Backy site ${siteId}. Start by fetching GET /api/sites/${siteId}/agent-handoff.`,
    `Then read /api/sites/${siteId}/manifest, /api/sites/${siteId}/openapi, and /api/sites/${siteId}/render?path=/... before writing UI, routes, templates, or editable content.`,
    'Every Backy canvas element is API-addressable: read and write id, type, geometry, props, styles, responsive overrides, tokenRefs, assetIds, animation, dataBindings, bindingSlots, accessibility, metadata, and children[].',
    'Use componentApiContract.componentTypeContracts as the per-element property map. Render from the advertised propPaths/stylePaths/responsivePaths/bindingPaths, create from creationHints.minimalElement, and write edits back to those same paths.',
    'Use componentApiContract.layoutBehavior for section resize flow and shared header/footer/nav binding rules: root sections reflow by bottom-edge delta, while shared chrome should use site navigation/chrome bindings instead of copied static menus.',
    'Keep Backy as the source of truth. Preserve content.contentDocument, content.elements, content.canvas, custom CSS/JS, assets, animations, interactions, data bindings, editable maps, SEO, metadata, and meta.frontendDesign* when creating or editing.',
    'Use manifest.data.site.frontendDesign and the authenticated /api/admin/sites/:siteId/frontend-design contract for fonts, colors, spacing, motion, chrome, templates, and editable maps so future pages keep the same site design.',
    'For writes use authenticated /api/admin/sites/:siteId/* endpoints or the advertised contentCreation.adminEntryPoints. Public endpoints are for discovery, render, and visitor interactions only.',
    'For newsletters use Backy newsletter/form subscriber APIs and keep mail-provider secrets, SMTP/API keys, unsubscribe signing, bounces, complaints, and webhooks server/provider-side.',
  ].join('\n'),
  requiredReads: [
    `/api/sites/${siteId}/agent-handoff`,
    `/api/sites/${siteId}/manifest`,
    `/api/sites/${siteId}/openapi`,
    `/api/sites/${siteId}/render?path=/...`,
    `/api/sites/${siteId}/frontend-design`,
  ],
  adminWriteBoundary: {
    requiresAuth: true,
    endpointFamily: `/api/admin/sites/${siteId}/*`,
    frontendDesign: `/api/admin/sites/${siteId}/frontend-design`,
    contentEntryPoints: buildCustomFrontendAgentAdminEntryPoints(siteId),
  },
  componentGuarantee: {
    everyComponentApiAddressable: true,
    everyElementApiAddressable: true,
    sourcePointer: 'componentApiContract',
    typeContractPointer: 'componentApiContract.componentTypeContracts',
    readableWritableFields: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS,
    families: CUSTOM_FRONTEND_COMPONENT_API_FAMILIES,
  },
  designStateGuarantee: {
    sourcePointer: 'designState',
    preserveFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    styleSources: [
      'manifest.data.site.frontendDesign',
      'frontendDesign.tokens.*',
      'frontendDesign.chrome',
      'frontendDesign.templates',
      'frontendDesign.editableMap',
    ],
  },
  verification: {
    resolve: `/api/sites/${siteId}/resolve?path=/`,
    render: `/api/sites/${siteId}/render?path=/...`,
    expectation: 'After generating or editing a frontend, verify Backy resolve/render payloads still expose the same element ids, props, styles, responsive overrides, bindings, and frontend design envelope.',
  },
  noSecretBoundary: 'Public handoff fields contain endpoint templates and field names only. Provider keys, mail credentials, database URLs, admin sessions, private order/submission values, and private file tokens stay server-side.',
});

export const buildCustomFrontendAgentHandoff = (
  siteId: string,
  site: CustomFrontendAgentSiteContext = {},
) => ({
  schemaVersion: CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA,
  source: 'public-manifest-openapi-contract',
  agentBrief: buildCustomFrontendAgentBrief(siteId),
  docs: [
    {
      label: 'Custom frontend agent handoff',
      path: CUSTOM_FRONTEND_AGENT_HANDOFF_DOC,
    },
    {
      label: 'API contracts',
      path: 'specs/backy-api-contracts.md',
    },
    {
      label: 'Editor contract',
      path: 'specs/editor_complete_spec.md',
    },
  ],
  endpoints: {
    agentHandoff: `/api/sites/${siteId}/agent-handoff`,
    manifest: `/api/sites/${siteId}/manifest`,
    openapi: `/api/sites/${siteId}/openapi`,
    resolve: `/api/sites/${siteId}/resolve?path=/`,
    render: `/api/sites/${siteId}/render?path=/...`,
    frontendDesign: `/api/sites/${siteId}/frontend-design`,
    frontendDesignManagement: `/api/admin/sites/${siteId}/frontend-design`,
    templates: `/api/admin/sites/${siteId}/templates`,
    pages: `/api/admin/sites/${siteId}/pages`,
    blog: `/api/admin/sites/${siteId}/blog`,
    forms: `/api/admin/sites/${siteId}/forms`,
    newsletterSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`,
    newsletterSendableSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers?audience=sendable`,
    newsletterContactSync: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
    newsletterManagement: `/newsletter?siteId=${siteId}`,
    collections: `/api/admin/sites/${siteId}/collections`,
    products: `/api/admin/sites/${siteId}/collections/products/records`,
    reusableSections: `/api/admin/sites/${siteId}/reusable-sections`,
  },
  readOrder: [
    {
      step: 'agent-handoff',
      endpointKey: 'agentHandoff',
      purpose: 'Start here when another AI/frontend agent needs the complete Backy API, canvas-first creation, and design-state preservation rules in one small response.',
    },
    {
      step: 'manifest',
      endpointKey: 'manifest',
      purpose: 'Bootstrap site identity, routes, modules, media/font delivery, frontendDesign, template registry, launch readiness, and this agent handoff.',
    },
    {
      step: 'openapi',
      endpointKey: 'openapi',
      purpose: 'Generate typed API clients and use operation/component names instead of guessing URL or payload shapes.',
    },
    {
      step: 'frontend-design',
      endpointKey: 'frontendDesignManagement',
      purpose: 'Read or update the authenticated site design contract: tokens, fonts, colors, chrome, templates, editable maps, and binding hints.',
    },
    {
      step: 'templates',
      endpointKey: 'templates',
      purpose: 'List clone-ready page, blog, form, product, collection, and reusable-section templates before creating new content.',
    },
    {
      step: 'newsletter',
      endpointKey: 'newsletterManagement',
      purpose: 'Use the Newsletter workspace and subscriber APIs for reader signup, consent evidence, issue handoff, and provider sync without exposing mail-provider secrets.',
    },
    {
      step: 'render',
      endpointKey: 'render',
      purpose: 'Verify the public renderer payload for live website routes after content/design changes.',
    },
  ],
  sdk: {
    package: 'packages/sdk-js',
    generatedTypes: 'packages/sdk-js/src/generated-contract-types.ts',
    helpers: [
      'customFrontendAgentHandoff',
      'customFrontendAgentHandoffCached',
      'manifest',
      'openapi',
      'render',
      'adminFrontendDesign',
      'updateAdminFrontendDesign',
      'importAdminFrontendDesign',
      'captureAdminContentTemplate',
      'adminTemplates',
      'buildBackyContentDesignPayload',
      'createAdminPage',
      'createAdminBlogPost',
      'createAdminCommerceProduct',
      'createAdminForm',
      'subscribeNewsletter',
      'unsubscribeNewsletter',
      'newsletterSubscribers',
      'upsertNewsletterSubscriber',
      'syncFormContacts',
      'createAdminCollectionRecord',
      'createAdminReusableSection',
    ],
  },
  contentCreation: {
    templateCloneFields: ['frontendDesignTemplateId', 'designTemplateId'],
    backyCanvasTemplateField: 'templateId',
    customFrontendTemplateField: 'frontendDesignTemplateId',
    adminEntryPoints: buildCustomFrontendAgentAdminEntryPoints(siteId),
    newsletter: {
      workspace: `/newsletter?siteId=${siteId}`,
      signupPageCanvas: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
      writingCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
      publicSubscribers: `/api/sites/${siteId}/newsletter/subscribers`,
      adminSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`,
      sendableSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers?audience=sendable`,
      contactSync: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
      syncBoundarySchema: 'backy.newsletter-sync-boundary.v1',
      providerBoundary: 'Backy owns subscriber records, topics, consent, CSV/export, and sync handoff; mailbox delivery, bounces, complaints, unsubscribe links in sent email, SPF/DKIM/DMARC, and reputation remain provider-side.',
    },
    canvasFirst: {
      editor: 'Backy canvas editor',
      pageAndBlogModeField: 'templateSource',
      backyCanvasValue: 'backy-canvas',
      customFrontendValue: 'custom-frontend',
      customFrontendRouteFieldAliases: ['frontendDesignTemplateId', 'frontendTemplate'],
      routeRevealGuarantee: 'Admin entry points with frontendDesignTemplateId or frontendTemplate reveal the selected captured template and focus the create action.',
      editorOutcome: 'Every created page, post, product, form, collection, or reusable section must reopen in the Backy canvas editor with site fonts, colors, chrome, element geometry, bindings, and editable metadata intact.',
    },
    rule: 'Create page, blog, newsletter signup, product, form, collection, and section content through Backy APIs so every result can reopen in the canvas editor.',
  },
  apiAlignment: {
    schemaVersion: 'backy.custom-frontend-api-alignment.v1',
    readStart: {
      endpointKey: 'agentHandoff',
      method: 'GET',
      endpoint: `/api/sites/${siteId}/agent-handoff`,
      manifestMirror: 'data.contract.customFrontendAgentHandoff',
      openApiMirror: 'x-backy-custom-frontend-agent-handoff',
    },
    publicDiscovery: {
      manifestEndpointKey: 'manifest',
      openApiEndpointKey: 'openapi',
      routeResolveEndpointKey: 'resolve',
      renderEndpointKey: 'render',
      styleSource: 'manifest.data.site.frontendDesign',
    },
    typedClients: {
      sdkPackage: 'packages/sdk-js',
      generatedTypes: 'packages/sdk-js/src/generated-contract-types.ts',
      preferredHelpers: [
        'customFrontendAgentHandoff',
        'manifest',
        'openapi',
        'render',
        'buildBackyContentDesignPayload',
        'subscribeNewsletter',
        'newsletterSubscribers',
        'syncFormContacts',
      ],
    },
    writeBoundary: {
      adminWritesRequireAuth: true,
      publicDiscoveryOnly: true,
      writeEndpointFamily: '/api/admin/sites/:siteId/*',
      noFrontendLocalJsonForks: true,
    },
    creationRoutes: buildCustomFrontendAgentAdminEntryPoints(siteId),
    preserveFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    verification: {
      renderEndpoint: `/api/sites/${siteId}/render?path=/...`,
      resolveEndpoint: `/api/sites/${siteId}/resolve?path=/`,
      expectation: 'After creating or editing custom frontend content, verify the public route through Backy resolve/render payloads and keep the same design envelope writable through admin/live-management APIs.',
    },
  },
  componentApiContract: buildCustomFrontendComponentApiContract(siteId),
  routing: buildCustomFrontendRoutingHandoff(siteId, site),
  designState: {
    roundTripFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    siteStyleSources: [
      'manifest.data.site.frontendDesign',
      'frontendDesign.tokens.colors',
      'frontendDesign.tokens.fonts',
      'frontendDesign.tokens.spacing',
      'frontendDesign.tokens.motion',
      'frontendDesign.tokens.customCss',
      'frontendDesign.chrome',
      'frontendDesign.templates',
      'frontendDesign.editableMap',
    ],
    preserves: [
      'layer geometry',
      'responsive overrides',
      'theme token references',
      'media and font asset identities',
      'animations',
      'interactions',
      'data bindings',
      'editable maps',
      'SEO metadata',
    ],
  },
  rules: [
    'Read manifest and OpenAPI before guessing routes, media, forms, commerce, live-management, or admin-management shapes.',
    'Preserve the full Backy design envelope when creating or updating editable content.',
    'Use frontendDesignTemplateId or designTemplateId for captured custom-frontend templates.',
    'Do not flatten editable canvas content to plain HTML/text unless the target is a throwaway static export.',
    'Use authenticated admin endpoints for writes and public endpoints for read/render discovery.',
  ],
  privacy: {
    includesSecretValues: false,
    publicDiscoveryOnly: true,
    adminWritesRequireAuth: true,
    secretHandling: 'This handoff exposes endpoint templates and field names only; provider keys, mail-provider credentials, database URLs, admin sessions, order payloads, and submission values stay out of public manifest/OpenAPI responses.',
  },
});
