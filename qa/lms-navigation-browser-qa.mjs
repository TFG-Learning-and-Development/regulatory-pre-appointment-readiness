import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = path.join(projectRoot, 'dist');
const prefix = '/oracle/learning/content/launch/';
const host = '127.0.0.1';
const port = 4387;
const debugPort = 9333;
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tfg-scorm-qa-'));
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const relative = pathname.slice(prefix.length) || 'index.html';
  const file = path.resolve(dist, relative);
  if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
await new Promise((resolve) => server.listen(port, host, resolve));
const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

let socket;
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      target = await fetch(`http://${host}:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
      break;
    } catch {
      await delay(100);
    }
  }
  if (!target) throw new Error('Headless browser did not expose its debugging endpoint.');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('Console error');
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(`${message.params.response.status} ${message.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (url) => {
    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await evaluate('document.readyState === "complete"')) break;
      await delay(50);
    }
    await delay(100);
  };
  const clickAndRead = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await delay(200);
    return evaluate('({ href: location.href, title: document.title, textLength: document.body.innerText.trim().length })');
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const launchUrl = `http://${host}:${port}${prefix}index.html`;
  const lessons = ['why-this-course-matters', 'appointment-readiness', 'conflict-of-interest', 'permissible-financial-interests', 'disclosure-mechanisms', 'debarment', 'course-conclusion'];
  const results = [];

  for (const slug of lessons) {
    await navigate(launchUrl);
    const lesson = await clickAndRead(`[data-home-lesson="${slug}"]`);
    if (!lesson.href.endsWith(`/lessons/${slug}.html`) || lesson.textLength < 100) throw new Error(`Blank or incorrect lesson page for ${slug}`);
    const home = await clickAndRead('.home-link');
    if (!home.href.endsWith('/index.html') || home.textLength < 100) throw new Error(`Home link failed from ${slug}`);
    results.push(slug);
  }

  for (let index = 0; index < lessons.length; index += 1) {
    const slug = lessons[index];
    await navigate(`http://${host}:${port}${prefix}lessons/${slug}.html`);
    const footerLinks = await evaluate(`[...document.querySelectorAll('.lesson-footer a')].map((link) => link.getAttribute('href'))`);
    const expected = [];
    if (index === 0) expected.push('../index.html'); else expected.push(`./${lessons[index - 1]}.html`);
    if (index < lessons.length - 1) expected.push(`./${lessons[index + 1]}.html`);
    if (JSON.stringify(footerLinks) !== JSON.stringify(expected)) throw new Error(`Previous/Next links are incorrect on ${slug}`);
  }

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ nestedLaunchPath: prefix, lessonCardsOpened: results.length, homeLinksOpened: results.length, previousNextPagesChecked: lessons.length, consoleOrNetworkErrors: errors.length }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  server.close();
  await delay(200);
  fs.rmSync(profile, { recursive: true, force: true });
}
