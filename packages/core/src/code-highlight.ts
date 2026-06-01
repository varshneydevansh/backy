export type BackyCodeHighlightTheme = 'dark' | 'light';

export type BackyCodeTokenType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'number'
  | 'boolean'
  | 'null'
  | 'function'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'tag'
  | 'attribute'
  | 'variable';

export interface BackyCodeToken {
  text: string;
  type: BackyCodeTokenType;
}

export const BACKY_CODE_HIGHLIGHT_THEMES: Record<
  BackyCodeHighlightTheme,
  Record<BackyCodeTokenType, string>
> = {
  dark: {
    plain: '#e2e8f0',
    comment: '#94a3b8',
    string: '#86efac',
    keyword: '#93c5fd',
    number: '#fbbf24',
    boolean: '#fbbf24',
    null: '#fbbf24',
    function: '#c4b5fd',
    property: '#67e8f9',
    operator: '#cbd5e1',
    punctuation: '#cbd5e1',
    tag: '#fda4af',
    attribute: '#fcd34d',
    variable: '#e2e8f0',
  },
  light: {
    plain: '#1e293b',
    comment: '#64748b',
    string: '#15803d',
    keyword: '#1d4ed8',
    number: '#b45309',
    boolean: '#b45309',
    null: '#b45309',
    function: '#7e22ce',
    property: '#0e7490',
    operator: '#334155',
    punctuation: '#475569',
    tag: '#be123c',
    attribute: '#a16207',
    variable: '#1e293b',
  },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'shell',
  cjs: 'javascript',
  console: 'shell',
  css3: 'css',
  html5: 'html',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  shellscript: 'shell',
  ts: 'typescript',
  tsx: 'typescript',
  yml: 'yaml',
  zsh: 'shell',
};

const C_LIKE_KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'of',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'switch',
  'this',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const SHELL_KEYWORDS = new Set([
  'case',
  'do',
  'done',
  'elif',
  'else',
  'esac',
  'export',
  'fi',
  'for',
  'function',
  'if',
  'in',
  'local',
  'then',
  'while',
]);

export const normalizeBackyCodeHighlightTheme = (value: unknown): BackyCodeHighlightTheme => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'light' ? 'light' : 'dark';
};

export const normalizeBackyCodeLanguage = (value: unknown): string => {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9#+.-]/g, '')
    : '';
  return LANGUAGE_ALIASES[normalized] || normalized || 'text';
};

const isShellLanguage = (language: string): boolean => (
  language === 'shell' || language === 'yaml' || language === 'markdown'
);

const isHtmlLanguage = (language: string): boolean => (
  language === 'html' || language === 'xml' || language === 'svg'
);

const isCssLanguage = (language: string): boolean => (
  language === 'css' || language === 'scss' || language === 'sass'
);

const keywordSetForLanguage = (language: string): Set<string> => {
  if (language === 'python' || language === 'ruby') return PYTHON_KEYWORDS;
  if (isShellLanguage(language)) return SHELL_KEYWORDS;
  return C_LIKE_KEYWORDS;
};

const classifyIdentifier = (
  value: string,
  language: string,
  source: string,
  startIndex: number,
): BackyCodeTokenType => {
  if (value === 'true' || value === 'false' || value === 'True' || value === 'False') return 'boolean';
  if (value === 'null' || value === 'undefined' || value === 'None' || value === 'nil') return 'null';
  if (keywordSetForLanguage(language).has(value)) return 'keyword';
  if (isHtmlLanguage(language) && source[startIndex - 1] === '<') return 'tag';
  if (isHtmlLanguage(language) && /^\s*=/.test(source.slice(startIndex + value.length))) return 'attribute';
  if (isCssLanguage(language) && /^\s*:/.test(source.slice(startIndex + value.length))) return 'property';
  if (/^\s*\(/.test(source.slice(startIndex + value.length))) return 'function';
  if (source[startIndex - 1] === '.') return 'property';
  if (isShellLanguage(language) && value.startsWith('$')) return 'variable';
  return 'plain';
};

const tokenTypeForMatch = (
  text: string,
  language: string,
  source: string,
  startIndex: number,
): BackyCodeTokenType => {
  if (/^\s+$/.test(text)) return 'plain';
  if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('<!--')) return 'comment';
  if (isShellLanguage(language) && text.startsWith('#')) return 'comment';
  if (/^["'`]/.test(text)) return 'string';
  if (/^-?\d/.test(text)) return 'number';
  if (/^[{}[\]().,:;<>]$/.test(text)) return 'punctuation';
  if (/^[=+*/%!&|?-]+$/.test(text)) return 'operator';
  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(text)) {
    return classifyIdentifier(text, language, source, startIndex);
  }
  return 'plain';
};

export const tokenizeBackyCodeLine = (line: string, languageValue: unknown): BackyCodeToken[] => {
  if (!line) {
    return [{ text: '', type: 'plain' }];
  }

  const language = normalizeBackyCodeLanguage(languageValue);
  const shellComment = isShellLanguage(language) ? String.raw`|#[^\n]*` : '';
  const pattern = new RegExp(
    String.raw`<!--.*?-->|/\*.*?\*/|//[^\n]*${shellComment}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|` +
      "`(?:\\\\.|[^`\\\\])*`|-?\\d+(?:\\.\\d+)?(?:[a-zA-Z%]+)?|[A-Za-z_$][A-Za-z0-9_$-]*|[{}\\[\\]().,:;<>]|[=+*/%!&|?-]+|\\s+|.",
    'g',
  );

  return Array.from(line.matchAll(pattern), (match) => {
    const text = match[0];
    return {
      text,
      type: tokenTypeForMatch(text, language, line, match.index || 0),
    };
  });
};
