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
  const lessons = ['why-this-course-matters', 'understanding-tfg-insure-and-your-regulatory-responsibilities', 'appointment-readiness', 'conflict-of-interest', 'permissible-financial-interests', 'disclosure-mechanisms', 'debarment', 'course-conclusion'];
  const results = [];

  for (const slug of lessons) {
    await navigate(launchUrl);
    const lesson = await clickAndRead(`[data-home-lesson="${slug}"]`);
    if (!lesson.href.endsWith(`/lessons/${slug}.html`) || lesson.textLength < 100) throw new Error(`Blank or incorrect lesson page for ${slug}`);
    const visibleStoryboardMarkup = await evaluate(`/[{}]/.test(document.body.innerText)`);
    if (visibleStoryboardMarkup) throw new Error(`Visible storyboard markup found on ${slug}`);
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

  let knowledgeChecksTested = 0;
  for (const slug of lessons) {
    await navigate(`http://${host}:${port}${prefix}lessons/${slug}.html`);
    const checkResults = await evaluate(`[...document.querySelectorAll('[data-knowledge-check]')].map((check) => {
      const inputs=[...check.querySelectorAll('input')];
      const correctIndex=Number(check.dataset.correctIndex);
      const wrongIndex=(correctIndex+1)%inputs.length;
      inputs[wrongIndex].click(); check.querySelector('[data-check-answer]').click();
      const incorrectShown=!check.querySelector('[data-incorrect-feedback]').hidden;
      check.querySelector('[data-try-again]').click(); inputs[correctIndex].click(); check.querySelector('[data-check-answer]').click();
      return {incorrectShown, correctShown:!check.querySelector('[data-correct-feedback]').hidden};
    })`);
    if (checkResults.some((result) => !result.incorrectShown || !result.correctShown)) throw new Error(`Knowledge Check behavior failed on ${slug}`);
    knowledgeChecksTested += checkResults.length;
  }

  const responsiveWidths = [375, 768, 1024, 1440];
  for (const width of responsiveWidths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate(`http://${host}:${port}${prefix}lessons/understanding-tfg-insure-and-your-regulatory-responsibilities.html`);
    const responsive = await evaluate(`({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      outcomes: document.querySelectorAll('.tcf-outcome').length,
      videoControls: document.querySelector('video')?.controls,
      videoAutoplay: document.querySelector('video')?.autoplay,
      videoSrc: document.querySelector('video source')?.getAttribute('src')
    })`);
    if (responsive.scrollWidth > responsive.viewportWidth + 1) throw new Error(`Horizontal overflow at ${width}px`);
    if (responsive.outcomes !== 6) throw new Error(`Expected six TCF outcomes at ${width}px`);
    if (!responsive.videoControls || responsive.videoAutoplay || !responsive.videoSrc?.includes('treating-customers-fairly.mp4')) throw new Error('TCF video configuration is incorrect.');
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`http://${host}:${port}${prefix}lessons/permissible-financial-interests.html`);
  const reflection = await evaluate(`(() => {
    const check=[...document.querySelectorAll('[data-knowledge-check]')].find((node)=>node.querySelector('.kc-label')?.textContent.trim()==='Reflection Question');
    const inputs=[...check.querySelectorAll('input')];
    inputs[0].click(); check.querySelector('[data-check-answer]').click();
    const incorrectShown=!check.querySelector('[data-incorrect-feedback]').hidden;
    check.querySelector('[data-try-again]').click(); inputs[1].click(); check.querySelector('[data-check-answer]').click();
    return {incorrectShown, correctShown:!check.querySelector('[data-correct-feedback]').hidden};
  })()`);
  if (!reflection.incorrectShown || !reflection.correctShown) throw new Error('Reflection Question feedback or Try Again behavior failed.');

  await navigate(`http://${host}:${port}${prefix}lessons/disclosure-mechanisms.html`);
  const vantage = await evaluate(`(async () => {
    const tab=[...document.querySelectorAll('[data-tab-button]')].find((node)=>node.textContent.trim()==='Vantage');
    tab.click();
    const trigger=document.getElementById(tab.getAttribute('aria-controls')).querySelector('[data-lightbox-trigger]');
    const imageStatus=(await fetch(trigger.dataset.lightboxSrc)).status;
    trigger.click();
    const dialog=document.querySelector('[data-image-lightbox]');
    const open=dialog.open;
    dialog.querySelector('[data-lightbox-close]').click();
    return {imageStatus, open};
  })()`);
  if (vantage.imageStatus !== 200 || !vantage.open) throw new Error('Vantage screenshot or lightbox failed.');

  await navigate(`http://${host}:${port}${prefix}lessons/debarment.html`);
  const policyStatus = await evaluate(`(async () => {
    const link=[...document.querySelectorAll('.resource-card[href]')].find((node)=>node.textContent.includes('Debarment Policy May 2026.pdf'));
    return link ? (await fetch(link.href)).status : 0;
  })()`);
  if (policyStatus !== 200) throw new Error('Debarment Policy resource failed.');

  await navigate(launchUrl);
  await evaluate(`localStorage.setItem('tfg-regulatory-readiness-progress-v1', ${JSON.stringify(JSON.stringify({ completed: ['why-this-course-matters', 'appointment-readiness', 'conflict-of-interest', 'permissible-financial-interests', 'disclosure-mechanisms', 'debarment', 'course-conclusion'] }))})`);
  await navigate(launchUrl);
  const legacyProgress = await evaluate(`document.querySelector('[data-home-progress]').textContent.trim()`);
  if (legacyProgress !== '88%') throw new Error(`Existing learner progress should be 88%, received ${legacyProgress}`);
  await evaluate(`localStorage.setItem('tfg-regulatory-readiness-progress-v1', ${JSON.stringify(JSON.stringify({ completed: ['why-this-course-matters', 'understanding-tfg-insure-and-your-regulatory-responsibilities', 'appointment-readiness', 'conflict-of-interest', 'permissible-financial-interests', 'disclosure-mechanisms', 'debarment', 'course-conclusion'] }))})`);
  await navigate(launchUrl);
  const completeProgress = await evaluate(`document.querySelector('[data-home-progress]').textContent.trim()`);
  if (completeProgress !== '100%') throw new Error(`Eight-section progress should be 100%, received ${completeProgress}`);

  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ nestedLaunchPath: prefix, lessonCardsOpened: results.length, homeLinksOpened: results.length, previousNextPagesChecked: lessons.length, knowledgeChecksTested, responsiveWidths, tcfOutcomes: 6, reflectionQuestion: reflection, vantage, debarmentPolicyStatus: policyStatus, legacyProgress, completeProgress, consoleOrNetworkErrors: errors.length }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  server.close();
  await delay(200);
  fs.rmSync(profile, { recursive: true, force: true });
}
