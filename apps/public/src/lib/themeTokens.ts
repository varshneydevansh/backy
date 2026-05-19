import type { ThemeConfig } from '@backy-cms/core';

export const BACKY_THEME_SCHEMA_VERSION = 'backy.theme.v1' as const;
export const BACKY_THEME_DISCOVERY_SCHEMA_VERSION = 'backy.theme-discovery.v1' as const;

export type BackyThemeTokenContract = ReturnType<typeof buildBackyThemeTokens>;
export type BackyThemeDiscoveryContract = ReturnType<typeof buildBackyThemeDiscovery>;
type BackyThemeInput = Omit<ThemeConfig, 'spacing' | 'customCSS'> & {
  spacing?: ThemeConfig['spacing'];
  customCSS?: string;
};

const pageDefaultWidth = 1200;

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

export const buildBackyThemeTokens = (theme: BackyThemeInput) => {
  const spacingUnit = toCssNumber(theme.spacing?.unit, 4);
  const spacingScale = toCssNumber(theme.spacing?.scale, 1.5);

  return {
    schemaVersion: BACKY_THEME_SCHEMA_VERSION,
    colors: theme.colors,
    typography: {
      families: theme.fonts,
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
    breakpoints: {
      mobile: 390,
      tablet: 768,
      desktop: pageDefaultWidth,
      wide: 1440,
    },
    customCss: theme.customCSS || '',
  };
};

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

export const buildBackyThemeDiscovery = (theme: BackyThemeInput) => {
  const tokens = buildBackyThemeTokens(theme);

  return {
    schemaVersion: BACKY_THEME_DISCOVERY_SCHEMA_VERSION,
    tokenSchemaVersion: BACKY_THEME_SCHEMA_VERSION,
    tokens,
    cssVariables: buildBackyThemeCssVariables(tokens),
    selectors: {
      root: ':root',
      scoped: '[data-backy-theme]',
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
      'customCSS',
    ],
    capabilities: {
      cssVariables: true,
      customCss: true,
      typographyFamilies: true,
      spacingScale: true,
      liveEditable: true,
      frontendDesignOverrides: true,
    },
  };
};
