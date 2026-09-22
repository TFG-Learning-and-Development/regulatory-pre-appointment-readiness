const base = 'http://127.0.0.1:4321';
const target = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let sequence = 0;
const pending = new Map();
const eventWaiters = new Map();
const errors = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(`Exception: ${message.params.exceptionDetails.text}`);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(`Console: ${message.params.args.map((arg) => arg.value || arg.description).join(' ')}`);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
  const waiters = eventWaiters.get(message.method) || [];
  waiters.splice(0).forEach((resolve) => resolve(message.params));
};

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((resolve) => {
  const waiters = eventWaiters.get(method) || [];
  waiters.push(resolve);
  eventWaiters.set(method, waiters);
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const navigate = async (path) => {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `${base}${path}` });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 2000))]);
  await new Promise((resolve) => setTimeout(resolve, 250));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const viewports = [];
for (const width of [375, 768, 1024, 1440]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await navigate('/lessons/conflict-of-interest/');
  viewports.push(await evaluate(`(() => {
    const offenders = [...document.querySelectorAll('body *')].map((el) => ({
      tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 100),
      left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width)
    })).filter((item) => item.right > innerWidth + 1 || item.left < -1).slice(0, 10);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
  })()`));
}

await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate('/lessons/why-this-course-matters/');
const flip = await evaluate(`(() => { const el=document.querySelector('[data-flip-card]'); el.click(); return {pressed:el.getAttribute('aria-pressed'), flipped:el.classList.contains('flipped')}; })()`);
const scrollComplete = await evaluate(`new Promise((resolve) => { document.querySelector('[data-lesson-complete-marker]').scrollIntoView(); setTimeout(() => resolve(JSON.parse(localStorage.getItem('tfg-regulatory-readiness-progress-v1')).completed.includes('why-this-course-matters')), 400); })`);

await navigate('/lessons/appointment-readiness/');
const tabs = await evaluate(`(() => { const list=[...document.querySelectorAll('[data-tab-button]')]; list[1].click(); const clickSelected=list.map((el)=>el.getAttribute('aria-selected')); list[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})); return {clickSelected, keyboardSelected:list.map((el)=>el.getAttribute('aria-selected')), hidden:[...document.querySelectorAll('[data-tab-panel]')].map((el)=>el.hidden)}; })()`);

await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await navigate('/lessons/appointment-readiness/');
const mobileMenu = await evaluate(`(() => { const button=document.querySelector('[data-menu-toggle]'); const before=getComputedStyle(button).display; button.click(); return {display:before, expanded:button.getAttribute('aria-expanded'), open:document.querySelector('[data-course-menu]').classList.contains('open')}; })()`);

await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate('/lessons/conflict-of-interest/');
const knowledge = await evaluate(`(() => {
  const check=document.querySelector('[data-knowledge-check]');
  const inputs=[...check.querySelectorAll('input')]; inputs[1].click(); check.querySelector('[data-check-answer]').click();
  const wrongVisible=!check.querySelector('[data-incorrect-feedback]').hidden;
  check.querySelector('[data-try-again]').click(); inputs[0].click(); check.querySelector('[data-check-answer]').click();
  return {wrongVisible, correctVisible:!check.querySelector('[data-correct-feedback]').hidden};
})()`);

await navigate('/lessons/debarment/');
const accordion = await evaluate(`(() => { const details=[...document.querySelectorAll('.accordion details')]; details[1].querySelector('summary').click(); return {count:details.length, secondOpen:details[1].open}; })()`);

const interactionSweep = {};
for (const path of ['/lessons/conflict-of-interest/','/lessons/permissible-financial-interests/','/lessons/disclosure-mechanisms/','/lessons/debarment/']) {
  await navigate(path);
  interactionSweep[path] = await evaluate(`(() => {
    const checks=[...document.querySelectorAll('[data-knowledge-check]')].map((check) => {
      const inputs=[...check.querySelectorAll('input')]; const correct=Number(check.dataset.correctIndex); const wrong=(correct+1)%inputs.length;
      inputs[wrong].click(); check.querySelector('[data-check-answer]').click(); const incorrectShown=!check.querySelector('[data-incorrect-feedback]').hidden;
      check.querySelector('[data-try-again]').click(); inputs[correct].click(); check.querySelector('[data-check-answer]').click(); const correctShown=!check.querySelector('[data-correct-feedback]').hidden;
      return {correctIndex:correct, incorrectShown, correctShown};
    });
    const tabGroups=[...document.querySelectorAll('[data-tabs]')].map((group) => {
      const buttons=[...group.querySelectorAll('[data-tab-button]')]; buttons.forEach((button)=>button.click());
      return {count:buttons.length, finalSelected:buttons.at(-1)?.getAttribute('aria-selected')};
    });
    const flipCards=[...document.querySelectorAll('[data-flip-card]')]; flipCards.forEach((card)=>card.click());
    const accordions=[...document.querySelectorAll('.accordion details')]; accordions.forEach((details)=>{if(!details.open) details.querySelector('summary').click()});
    return {checks, tabGroups, flipCards:flipCards.length, flipsOpen:flipCards.every((card)=>card.getAttribute('aria-pressed')==='true'), accordions:accordions.length, accordionsOpen:accordions.every((details)=>details.open)};
  })()`);
}

const affectedRoutes = [
  '/lessons/why-this-course-matters/',
  '/lessons/appointment-readiness/',
  '/lessons/conflict-of-interest/',
  '/lessons/permissible-financial-interests/',
  '/lessons/disclosure-mechanisms/',
  '/lessons/debarment/',
  '/lessons/course-conclusion/',
];
const responsiveSweep = {};
for (const width of [375, 768, 1024, 1440]) {
  responsiveSweep[width] = {};
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  for (const path of affectedRoutes) {
    await navigate(path);
    responsiveSweep[width][path] = await evaluate(`({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    })`);
  }
}

await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate('/lessons/permissible-financial-interests/');
const changeStructure = await evaluate(`(() => {
  const feeHeading=[...document.querySelectorAll('h2')].find((node)=>node.textContent.trim()==='Understanding Fees');
  const feeCard=feeHeading?.closest('.course-card');
  const example=document.querySelector('.image-example-grid');
  const scenarioBullets=[...document.querySelectorAll('[data-scenario-tabs] li')].map((node)=>node.textContent.trim());
  return {
    feeCards:[...document.querySelectorAll('h2')].filter((node)=>node.textContent.trim()==='Understanding Fees').length,
    feeLists:feeCard?.querySelectorAll('ul').length,
    feeBold:[...feeCard.querySelectorAll('strong')].map((node)=>node.textContent.trim()),
    exampleColumns:example?.children.length,
    cureClubSrc:example?.querySelector('img')?.getAttribute('src'),
    interactionInstruction:document.querySelector('.interaction-instruction strong')?.textContent.trim(),
    scenarioBulletsHaveStops:scenarioBullets.every((text)=>/[.!?]$/.test(text)),
    lowercaseCustomerInScenarios:scenarioBullets.some((text)=>/\bcustomer\b/.test(text)),
  };
})()`);

const lightboxCount = await evaluate(`document.querySelectorAll('[data-lightbox-trigger]').length`);
const lightboxOpen = await evaluate(`(() => {
  const trigger=document.querySelector('[data-lightbox-trigger]');
  trigger.click();
  const dialog=document.querySelector('[data-image-lightbox]');
  return {open:dialog.open, src:dialog.querySelector('[data-lightbox-image]').getAttribute('src'), closeFocused:document.activeElement.matches('[data-lightbox-close]')};
})()`);
const closeRestoresFocus = await evaluate(`(async () => {
  document.querySelector('[data-lightbox-close]').click();
  await new Promise((resolve)=>setTimeout(resolve,20));
  return {open:document.querySelector('[data-image-lightbox]').open, triggerFocused:document.activeElement.matches('[data-lightbox-trigger]'), activeElement:document.activeElement.tagName};
})()`);
await evaluate(`document.querySelector('[data-lightbox-trigger]').click()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
const escapeCloses = await evaluate(`!document.querySelector('[data-image-lightbox]').open`);
const backdropCloses = await evaluate(`(() => {
  document.querySelector('[data-lightbox-trigger]').click();
  const dialog=document.querySelector('[data-image-lightbox]');
  dialog.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return !dialog.open;
})()`);

await navigate('/lessons/appointment-readiness/');
const scenarioLabelRemoved = await evaluate(`![...document.querySelectorAll('.statement strong')].some((node)=>node.textContent.trim()==='Scenario')`);

await navigate('/lessons/disclosure-mechanisms/');
const vantage = await evaluate(`(() => {
  const button=[...document.querySelectorAll('[data-tab-button]')].find((node)=>node.textContent.trim()==='Vantage');
  button.click();
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  return {intro:panel.querySelector('.tab-image-grid > div > p')?.textContent.trim(), bullets:panel.querySelectorAll('li').length, imageTrigger:!!panel.querySelector('[data-lightbox-trigger]')};
})()`);

await navigate('/lessons/conflict-of-interest/');
const policyLinks = await evaluate(`Promise.all([...document.querySelectorAll('.resource-card[href]')].map(async (link) => ({href:link.getAttribute('href'), status:(await fetch(link.href)).status})))`);

await navigate('/lessons/course-conclusion/');
const homeLoaded = once('Page.loadEventFired');
await evaluate(`document.querySelector('[data-finish-course]').click()`);
await homeLoaded;
await new Promise((resolve) => setTimeout(resolve, 200));
const finish = await evaluate(`({path:location.pathname, progress:document.querySelector('[data-home-progress]')?.textContent, state:JSON.parse(localStorage.getItem('tfg-regulatory-readiness-progress-v1'))})`);

console.log(JSON.stringify({ viewports, flip, scrollComplete, tabs, mobileMenu, knowledge, accordion, interactionSweep, responsiveSweep, changeStructure, lightboxCount, lightboxOpen, closeRestoresFocus, escapeCloses, backdropCloses, scenarioLabelRemoved, vantage, policyLinks, finish, errors }, null, 2));
socket.close();
