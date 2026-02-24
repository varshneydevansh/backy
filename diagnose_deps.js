
const fs = require('fs');
const path = require('path');

function checkModule(moduleName, searchPath) {
    try {
        const resolved = require.resolve(moduleName, { paths: [searchPath] });
        console.log(`[SUCCESS] Resolved ${moduleName} from ${searchPath}: ${resolved}`);
        return true;
    } catch (e) {
        console.error(`[ERROR] Failed to resolve ${moduleName} from ${searchPath}: ${e.message}`);
        // Try to list node_modules in the search path to see what's there
        const nmPath = path.join(searchPath, 'node_modules');
        if (fs.existsSync(nmPath)) {
            console.log(`Contents of ${nmPath}:`, fs.readdirSync(nmPath).filter(n => n.startsWith('@')));
            const scopePath = path.join(nmPath, moduleName.split('/')[0]);
            if (fs.existsSync(scopePath)) {
                console.log(`Contents of ${scopePath}:`, fs.readdirSync(scopePath));
            }
        } else {
            console.log(`node_modules does not exist at ${nmPath}`);
        }
        return false;
    }
}

const adminPath = path.resolve(__dirname, 'apps/admin');
const editorPath = path.resolve(__dirname, 'packages/editor');

console.log('--- Checking apps/admin dependencies ---');
checkModule('@dnd-kit/core', adminPath);
checkModule('@dnd-kit/utilities', adminPath);

console.log('\n--- Checking packages/editor dependencies ---');
checkModule('@udecode/plate-paragraph', editorPath);
