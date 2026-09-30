import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const targetDirectory = path.resolve(projectRoot, process.argv[2] || 'dist');
const relativeTarget = path.relative(projectRoot, targetDirectory);

if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
  throw new Error('The rewrite target must be inside the project root.');
}

let targetStats;
try {
  targetStats = await stat(targetDirectory);
} catch {
  throw new Error(`Static build directory not found: ${targetDirectory}`);
}
if (!targetStats.isDirectory()) {
  throw new Error(`Static build directory not found: ${targetDirectory}`);
}

async function getHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getHtmlFiles(entryPath));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
      files.push(entryPath);
    }
  }

  return files;
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const rootRelativeUrl = /((?:href|src|data-lightbox-src)=['"])\/(?!\/)/g;
let rewrittenCount = 0;

for (const file of await getHtmlFiles(targetDirectory)) {
  const relativePath = path.relative(targetDirectory, file);
  const depth = relativePath.split(path.sep).length - 1;
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  const content = decoder.decode(await readFile(file));
  const rewritten = content.replace(rootRelativeUrl, `$1${prefix}`);

  if (rewritten !== content) {
    await writeFile(file, encoder.encode(rewritten));
    rewrittenCount += 1;
  }
}

console.log(`LMS-safe relative paths written to ${targetDirectory} (${rewrittenCount} HTML files updated).`);
