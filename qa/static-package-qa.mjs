import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.resolve(process.argv[2] || 'dist');
const lessons = [
  'why-this-course-matters',
  'understanding-tfg-insure-and-your-regulatory-responsibilities',
  'appointment-readiness',
  'conflict-of-interest',
  'permissible-financial-interests',
  'disclosure-mechanisms',
  'debarment',
  'course-conclusion',
];
const htmlFiles = [path.join(target, 'index.html'), ...lessons.map((slug) => path.join(target, 'lessons', `${slug}.html`))];
const failures = [];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.xml']);
const mojibakePattern = /(?:\u00C3.|\u00C2.|\u00E2.|\u00EF\u00BF\u00BD|\uFFFD|[\u0080-\u009F])/u;

function getTextFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return getTextFiles(entryPath);
    return textExtensions.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
  });
}

for (const file of getTextFiles(target)) {
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(mojibakePattern);
  if (match) {
    failures.push(`${path.relative(target, file)} contains possible mojibake near ${JSON.stringify(match[0])}`);
  }
}

for (const file of htmlFiles) {
  if (!fs.existsSync(file)) {
    failures.push(`Missing HTML file: ${path.relative(target, file)}`);
    continue;
  }

  const html = fs.readFileSync(file, 'utf8');
  if (!/<head>\s*<meta\s+charset=["']?UTF-8["']?/i.test(html)) {
    failures.push(`${path.relative(target, file)} does not declare UTF-8 at the beginning of <head>`);
  }
  const references = [...html.matchAll(/(?:href|src|data-lightbox-src)=["']([^"']*)["']/g)].map((match) => match[1]);
  for (const reference of references) {
    if (!reference || reference.startsWith('#') || /^(?:https?:|mailto:|tel:|data:)/i.test(reference)) continue;
    if (reference.startsWith('/')) {
      failures.push(`${path.relative(target, file)} contains root-relative URL ${reference}`);
      continue;
    }
    const cleanReference = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
    const resolved = path.resolve(path.dirname(file), cleanReference);
    if (!resolved.startsWith(target) || !fs.existsSync(resolved)) {
      failures.push(`${path.relative(target, file)} has unresolved URL ${reference}`);
    }
  }

  const navigationHrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/g)].map((match) => match[1]);
  if (navigationHrefs.some((href) => href.startsWith('/') || href.includes('localhost'))) {
    failures.push(`${path.relative(target, file)} contains an LMS-unsafe navigation link`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Static package QA passed: ${htmlFiles.length} HTML pages use UTF-8, contain no mojibake, and all ${lessons.length} lesson routes resolve with relative URLs.`);
