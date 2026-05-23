import type { ThemeConfig } from './types';
import { BACKY_THEME_SCHEMA_VERSION } from './content-contract';

export const BACKY_THEME_DISCOVERY_SCHEMA_VERSION = 'backy.theme-discovery.v1' as const;

type BackyThemeInput = Partial<Pick<ThemeConfig, 'colors' | 'fonts' | 'spacing' | 'customCSS' | 'motion'>> & {
  spacing?: ThemeConfig['spacing'];
  customCSS?: string;
};

const pageDefaultWidth = 1200;

const defaultThemeInput = {
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textMuted: '#64748b',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  fonts: {
    heading: 'Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  spacing: {
    unit: 4,
    scale: 1.5,
  },
  motion: {
    duration: {
      fast: '120ms',
      normal: '200ms',
      slow: '320ms',
    },
    easing: {
      standard: 'cubic-bezier(0.2, 0, 0, 1)',
      emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
    },
  },
  customCSS: '',
} satisfies BackyThemeInput;

const toCssNumber = (value: unknown, fallback: number) => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const toKebab = (value: string) => (
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
);

const assignVariables = (
  output: Record<string, string>,
  prefix: string,
  values: Record<string, unknown> | undefined,
  mapValue: (value: unknown) => string | null = (value) => (
    typeof value === 'string' || typeof value === 'number' ? String(value) : null
  ),
) => {
  Object.entries(values || {}).forEach(([key, value]) => {
    const normalizedKey = toKebab(key);
    const normalizedValue = mapValue(value);
    if (normalizedKey && normalizedValue) {
      output[`--backy-${prefix}-${normalizedKey}`] = normalizedValue;
    }
  });
};

const assignTokenReferences = (
  output: Record<string, string>,
  prefix: string,
  pathPrefix: string,
  values: Record<string, unknown> | undefined,
) => {
  Object.keys(values || {}).forEach((key) => {
    const normalizedKey = toKebab(key);
    if (normalizedKey) {
      output[`${pathPrefix}.${key}`] = `var(--backy-${prefix}-${normalizedKey})`;
    }
  });
};

const mergeStringRecord = (
  defaults: Record<string, string>,
  values: Record<string, unknown> | undefined,
) => {
  const output = { ...defaults };
  Object.entries(values || {}).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      output[key] = value;
    }
  });
  return output;
};

export const buildBackyThemeTokens = (theme: BackyThemeInput) => {
  const spacingUnit = toCssNumber(theme.spacing?.unit, defaultThemeInput.spacing?.unit || 4);
  const spacingScale = toCssNumber(theme.spacing?.scale, defaultThemeInput.spacing?.scale || 1.5);
  const colors = mergeStringRecord(defaultThemeInput.colors, theme.colors);
  const fonts = mergeStringRecord(defaultThemeInput.fonts, theme.fonts);
  const motionDuration = mergeStringRecord(defaultThemeInput.motion.duration, theme.motion?.duration);
  const motionEasing = mergeStringRecord(defaultThemeInput.motion.easing, theme.motion?.easing);

  return {
    schemaVersion: BACKY_THEME_SCHEMA_VERSION,
    colors,
    typography: {
      families: fonts,
      customFonts: theme.fonts?.custom || [],
      scale: {
        h1: '44px',
        h2: '32px',
        body: '16px',
      },
      lineHeights: {
        tight: 1.15,
        body: 1.6,
      },
      weights: {
        regular: 400,
        medium: 500,
        bold: 700,
      },
    },
    spacing: {
      xs: `${spacingUnit}px`,
      sm: `${spacingUnit * 2}px`,
      md: `${spacingUnit * 4}px`,
      lg: `${spacingUnit * 8}px`,
      scale: String(spacingScale),
    },
    radii: {
      sm: '4px',
      md: '8px',
      lg: '12px',
    },
    shadows: {
      page: '0 18px 55px rgba(15,23,42,0.16)',
    },
    motion: {
      duration: motionDuration,
      easing: motionEasing,
    },
    breakpoints: {
      mobile: 390,
      tablet: 768,
      desktop: pageDefaultWidth,
      wide: 1440,
    },
    customCss: theme.customCSS || '',
  };
};

export type BackyThemeTokenContract = ReturnType<typeof buildBackyThemeTokens>;

export const buildBackyThemeCssVariables = (tokens: BackyThemeTokenContract) => {
  const variables: Record<string, string> = {};

  assignVariables(variables, 'color', tokens.colors);
  assignVariables(variables, 'font', tokens.typography.families);
  assignVariables(variables, 'font-size', tokens.typography.scale);
  assignVariables(variables, 'line-height', tokens.typography.lineHeights);
  assignVariables(variables, 'font-weight', tokens.typography.weights);
  assignVariables(variables, 'spacing', tokens.spacing);
  assignVariables(variables, 'radius', tokens.radii);
  assignVariables(variables, 'shadow', tokens.shadows);
  assignVariables(variables, 'duration', tokens.motion.duration);
  assignVariables(variables, 'easing', tokens.motion.easing);
  assignVariables(variables, 'breakpoint', tokens.breakpoints, (value) => (
    typeof value === 'number' && Number.isFinite(value) ? `${value}px` : null
  ));

  return variables;
};

export const buildBackyThemeTokenReferences = (tokens: BackyThemeTokenContract) => {
  const references: Record<string, string> = {};

  assignTokenReferences(references, 'color', 'colors', tokens.colors);
  assignTokenReferences(references, 'font', 'typography.families', tokens.typography.families);
  assignTokenReferences(references, 'font-size', 'typography.scale', tokens.typography.scale);
  assignTokenReferences(references, 'line-height', 'typography.lineHeights', tokens.typography.lineHeights);
  assignTokenReferences(references, 'font-weight', 'typography.weights', tokens.typography.weights);
  assignTokenReferences(references, 'spacing', 'spacing', tokens.spacing);
  assignTokenReferences(references, 'radius', 'radii', tokens.radii);
  assignTokenReferences(references, 'shadow', 'shadows', tokens.shadows);
  assignTokenReferences(references, 'duration', 'motion.duration', tokens.motion.duration);
  assignTokenReferences(references, 'easing', 'motion.easing', tokens.motion.easing);

  return references;
};

export const BACKY_THEME_TOKEN_STYLE_TARGETS = {
  color: 'color',
  'props.color': 'color',
  'styles.color': 'color',
  backgroundColor: 'backgroundColor',
  'props.backgroundColor': 'backgroundColor',
  'styles.backgroundColor': 'backgroundColor',
  borderColor: 'borderColor',
  'props.borderColor': 'borderColor',
  'styles.borderColor': 'borderColor',
  fontFamily: 'fontFamily',
  'props.fontFamily': 'fontFamily',
  'styles.fontFamily': 'fontFamily',
  fontSize: 'fontSize',
  'props.fontSize': 'fontSize',
  'styles.fontSize': 'fontSize',
  lineHeight: 'lineHeight',
  'props.lineHeight': 'lineHeight',
  'styles.lineHeight': 'lineHeight',
  fontWeight: 'fontWeight',
  'props.fontWeight': 'fontWeight',
  'styles.fontWeight': 'fontWeight',
  padding: 'padding',
  'props.padding': 'padding',
  'styles.padding': 'padding',
  margin: 'margin',
  'props.margin': 'margin',
  'styles.margin': 'margin',
  borderRadius: 'borderRadius',
  'props.borderRadius': 'borderRadius',
  'styles.borderRadius': 'borderRadius',
  boxShadow: 'boxShadow',
  'props.boxShadow': 'boxShadow',
  'styles.boxShadow': 'boxShadow',
} as const;

const normalizeTokenReferenceValue = (
  tokenReference: string,
  tokenReferences: Record<string, string>,
) => tokenReferences[tokenReference] || (tokenReference.startsWith('var(') ? tokenReference : '');

export const buildBackyThemeTokenRefStyle = (
  tokenRefs: Record<string, string> | undefined,
  tokenReferences: Record<string, string>,
) => {
  const style: Record<string, string> = {};

  Object.entries(tokenRefs || {}).forEach(([targetPath, tokenReference]) => {
    const styleProperty = BACKY_THEME_TOKEN_STYLE_TARGETS[targetPath as keyof typeof BACKY_THEME_TOKEN_STYLE_TARGETS];
    const value = normalizeTokenReferenceValue(tokenReference, tokenReferences);
    if (styleProperty && value) {
      style[styleProperty] = value;
    }
  });

  return style;
};

export const buildBackyThemeStyleSheet = (
  tokens: BackyThemeTokenContract,
  selectors: { root?: string; scoped?: string } = {},
) => {
  const rootSelector = selectors.root || ':root';
  const scopedSelector = selectors.scoped || '[data-backy-theme]';
  const declarations = Object.entries(buildBackyThemeCssVariables(tokens))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  const baseBlock = `${rootSelector},\n${scopedSelector} {\n${declarations}\n}`;
  return tokens.customCss ? `${baseBlock}\n\n${tokens.customCss}` : baseBlock;
};

export const buildBackyThemeDiscovery = (theme: BackyThemeInput) => {
  const tokens = buildBackyThemeTokens(theme);
  const selectors = {
    root: ':root',
    scoped: '[data-backy-theme]',
  };

  return {
    schemaVersion: BACKY_THEME_DISCOVERY_SCHEMA_VERSION,
    tokenSchemaVersion: BACKY_THEME_SCHEMA_VERSION,
    tokens,
    cssVariables: buildBackyThemeCssVariables(tokens),
    tokenReferences: buildBackyThemeTokenReferences(tokens),
    styleSheet: buildBackyThemeStyleSheet(tokens, selectors),
    selectors,
    inheritance: {
      elementTokenRefPath: 'tokenRefs',
      documentTokenRefPath: 'themeTokenRefs',
      legacyElementTokenRefPath: 'themeTokenRefs',
      fallbackOrder: ['element.tokenRefs', 'element.styles', 'element.props', 'document.themeTokenRefs', 'site.theme'],
      supportedElementPaths: [
        'styles.color',
        'styles.backgroundColor',
        'styles.borderColor',
        'styles.fontFamily',
        'styles.fontSize',
        'styles.lineHeight',
        'styles.fontWeight',
        'styles.padding',
        'styles.margin',
        'styles.borderRadius',
        'styles.boxShadow',
        'animation.duration',
        'animation.easing',
      ],
    },
    editableFields: [
      'colors.primary',
      'colors.secondary',
      'colors.background',
      'colors.surface',
      'colors.text',
      'colors.textMuted',
      'fonts.heading',
      'fonts.body',
      'fonts.mono',
      'spacing.unit',
      'spacing.scale',
      'motion.duration.fast',
      'motion.duration.normal',
      'motion.duration.slow',
      'motion.easing.standard',
      'motion.easing.emphasized',
      'customCSS',
    ],
    capabilities: {
      cssVariables: true,
      customCss: true,
      typographyFamilies: true,
      spacingScale: true,
      liveEditable: true,
      frontendDesignOverrides: true,
      styleSheet: true,
      tokenReferences: true,
      perBlockTokenRefs: true,
      animationTokenRefs: true,
    },
  };
};

export type BackyThemeDiscoveryContract = ReturnType<typeof buildBackyThemeDiscovery>;
