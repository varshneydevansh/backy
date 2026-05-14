import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '../package.json');
const smokePath = path.resolve(__dirname, 'editor-drag-smoke.mjs');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const smokeSource = fs.readFileSync(smokePath, 'utf8');
const editorScripts = Object.entries(packageJson.scripts ?? {})
  .filter(([name]) => name.startsWith('test:editor'))
  .map(([name, command]) => ({ name, command }));

const ignoredEnvNames = new Set([
  'BACKY_EDITOR_SMOKE_SITE_ID',
  'BACKY_EDITOR_SMOKE_PATH',
]);

const envNames = [...new Set([...smokeSource.matchAll(/process\.env\.(BACKY_EDITOR_[A-Z0-9_]+_SMOKE)/g)]
  .map((match) => match[1]))]
  .filter((name) => !ignoredEnvNames.has(name))
  .sort();

const commandText = editorScripts.map(({ command }) => command).join('\n');
const missingEnvScripts = envNames.filter((name) => !commandText.includes(name));

const componentHandlerBlock = smokeSource.match(/const componentSmokeHandlers = \{([\s\S]*?)\n    \};\n    const componentSmoke =/);
const componentHandlerNames = componentHandlerBlock
  ? [...componentHandlerBlock[1].matchAll(/^\s{6}['"]?([a-z0-9-]+)['"]?: \{/gm)].map((match) => match[1]).sort()
  : [];
const componentScript = packageJson.scripts?.['test:editor-components'] ?? '';
const componentScriptNames = [...componentScript.matchAll(/BACKY_EDITOR_COMPONENT_SMOKE=\$component|for component in ([^;]+);/g)]
  .flatMap((match) => (match[1] ? match[1].trim().split(/\s+/) : []))
  .sort();
const missingComponentScripts = componentHandlerNames.filter((name) => !componentScriptNames.includes(name));

const workflowExclusions = new Set([
  'test:editor-drag',
  'test:editor-save-publish',
  'test:editor-workflows',
]);
const collectReachableScripts = (scriptName, reachable = new Set()) => {
  if (reachable.has(scriptName)) {
    return reachable;
  }

  reachable.add(scriptName);
  const command = packageJson.scripts?.[scriptName] ?? '';
  for (const match of command.matchAll(/npm run (test:editor[-:a-z0-9]+)/g)) {
    collectReachableScripts(match[1], reachable);
  }

  return reachable;
};

const workflowReachableScripts = collectReachableScripts('test:editor-workflows');
const missingWorkflowScripts = editorScripts
  .map(({ name }) => name)
  .filter((name) => !workflowExclusions.has(name))
  .filter((name) => !workflowReachableScripts.has(name));

if (missingEnvScripts.length || missingWorkflowScripts.length || missingComponentScripts.length) {
  console.error(JSON.stringify({
    ok: false,
    missingEnvScripts,
    missingWorkflowScripts,
    missingComponentScripts,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  editorSmokeEnvCount: envNames.length,
  editorComponentSmokeCount: componentHandlerNames.length,
  editorWorkflowScriptCount: editorScripts.length - workflowExclusions.size,
}, null, 2));
