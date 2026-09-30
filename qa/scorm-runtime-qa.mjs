import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/scripts/scorm.js', import.meta.url), 'utf8');

function launch(initialValues = {}, withApi = true) {
  const values = { ...initialValues };
  const calls = [];
  const listeners = {};
  const stored = new Map();
  const api = {
    LMSInitialize: (value) => { calls.push(['LMSInitialize', value]); return 'true'; },
    LMSGetValue: (name) => { calls.push(['LMSGetValue', name]); return values[name] || ''; },
    LMSSetValue: (name, value) => { calls.push(['LMSSetValue', name, value]); values[name] = value; return 'true'; },
    LMSCommit: (value) => { calls.push(['LMSCommit', value]); return 'true'; },
    LMSFinish: (value) => { calls.push(['LMSFinish', value]); return 'true'; },
  };
  const location = {
    href: 'https://oracle.example/content/index.html',
    pathname: '/content/index.html',
    replace: (href) => { calls.push(['replace', href]); },
  };
  const window = {
    API: withApi ? api : undefined,
    opener: null,
    location,
    addEventListener: (name, handler) => { listeners[name] = handler; },
  };
  window.parent = window;
  const context = vm.createContext({
    URL,
    window,
    document: { currentScript: { src: 'https://oracle.example/content/scripts/scorm.js' } },
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  new vm.Script(source).runInContext(context);
  return { values, calls, listeners, stored, scorm: window.TFGScorm };
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const statusWrites = (session) => session.calls.filter((call) => call[0] === 'LMSSetValue' && call[1] === 'cmi.core.lesson_status').map((call) => call[2]);

const launchSession = launch({ 'cmi.core.lesson_status': 'not attempted' });
assert(launchSession.scorm.connected, 'SCORM API did not initialize.');
assert(statusWrites(launchSession)[0] === 'completed', 'Launch did not immediately set completed.');
assert(launchSession.calls.some((call) => call[0] === 'LMSCommit'), 'Launch did not commit completion.');

launchSession.scorm.saveState({ completed: ['why-this-course-matters'] });
assert(statusWrites(launchSession).every((status) => status === 'completed'), 'Progress save overwrote completed.');

const saveAndCloseSession = launch({ 'cmi.core.lesson_status': 'completed' });
saveAndCloseSession.listeners.beforeunload();
assert(statusWrites(saveAndCloseSession).every((status) => status === 'completed'), 'Save and Close overwrote completed.');
assert(saveAndCloseSession.calls.filter((call) => call[0] === 'LMSFinish').length === 1, 'Save and Close did not finish exactly once.');

const tabClosureSession = launch({ 'cmi.core.lesson_status': 'completed' });
tabClosureSession.listeners.pagehide();
assert(statusWrites(tabClosureSession).every((status) => status === 'completed'), 'Tab closure overwrote completed.');
assert(tabClosureSession.calls.filter((call) => call[0] === 'LMSFinish').length === 1, 'Tab closure did not finish exactly once.');

const guardedSession = launch({ 'cmi.core.lesson_status': 'completed' });
guardedSession.listeners.beforeunload();
guardedSession.listeners.pagehide();
const finishCalls = guardedSession.calls.filter((call) => call[0] === 'LMSFinish');
assert(finishCalls.length === 1, 'Exit lifecycle did not guard LMSFinish to one call.');
const finishIndex = guardedSession.calls.findIndex((call) => call[0] === 'LMSFinish');
const lastCommitIndex = guardedSession.calls.map((call, index) => call[0] === 'LMSCommit' ? index : -1).filter((index) => index >= 0).at(-1);
assert(lastCommitIndex < finishIndex, 'Exit did not commit before LMSFinish.');

const reopenSession = launch({
  'cmi.core.lesson_status': 'completed',
  'cmi.suspend_data': JSON.stringify({ completed: ['why-this-course-matters'] }),
});
assert(statusWrites(reopenSession).every((status) => status === 'completed'), 'Reopening overwrote completed.');
assert(JSON.parse(reopenSession.stored.get('tfg-regulatory-readiness-progress-v1')).completed.length === 1, 'Suspend data was not restored.');

const legacyBookmarkSession = launch({
  'cmi.core.lesson_status': 'completed',
  'cmi.core.lesson_location': 'lessons/debarment/index.html',
});
assert(legacyBookmarkSession.scorm.resume(), 'Legacy lesson bookmark did not resume.');
assert(legacyBookmarkSession.calls.some((call) => call[0] === 'replace' && call[1] === 'https://oracle.example/content/lessons/debarment.html'), 'Legacy lesson bookmark was not migrated to a physical HTML file.');

const fallbackSession = launch({}, false);
assert(!fallbackSession.scorm.connected, 'Fallback incorrectly reported an LMS connection.');
fallbackSession.scorm.saveState({ completed: [] });
fallbackSession.scorm.finish();

console.log(JSON.stringify({
  launchCompleted: true,
  saveAndCloseCompleted: true,
  tabClosureCompleted: true,
  guardedFinishCalls: finishCalls.length,
  reopenedCompletedAttempt: true,
  suspendDataRestored: true,
  legacyBookmarkMigrated: true,
  apiUnavailableFallback: true,
}, null, 2));
