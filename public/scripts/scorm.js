(() => {
  const STORAGE_KEY = 'tfg-regulatory-readiness-progress-v1';
  const scriptUrl = new URL(document.currentScript.src, window.location.href);
  const courseRoot = new URL('../', scriptUrl);
  let api = null;
  let initialized = false;
  let terminated = false;

  const findApi = (startWindow) => {
    let candidate = startWindow;
    for (let attempts = 0; attempts < 500 && candidate; attempts += 1) {
      try {
        if (candidate.API) return candidate.API;
        if (!candidate.parent || candidate.parent === candidate) break;
        candidate = candidate.parent;
      } catch {
        break;
      }
    }
    return null;
  };

  try {
    api = findApi(window) || (window.opener ? findApi(window.opener) : null);
  } catch {
    api = null;
  }

  const call = (method, value = '') => {
    if (!api || typeof api[method] !== 'function') return '';
    try { return api[method](value); } catch { return ''; }
  };
  const getValue = (name) => {
    if (!initialized) return '';
    try { return api.LMSGetValue(name) || ''; } catch { return ''; }
  };
  const setValue = (name, value) => {
    if (!initialized) return false;
    try { return api.LMSSetValue(name, String(value)) === 'true'; } catch { return false; }
  };
  const commit = () => initialized && call('LMSCommit') === 'true';
  const relativeLocation = () => {
    const rootPath = courseRoot.pathname.endsWith('/') ? courseRoot.pathname : `${courseRoot.pathname}/`;
    const currentPath = window.location.pathname;
    return currentPath.startsWith(rootPath) ? currentPath.slice(rootPath.length) || 'index.html' : 'index.html';
  };

  if (api) {
    initialized = call('LMSInitialize') === 'true';
    if (initialized) {
      const suspendData = getValue('cmi.suspend_data');
      if (suspendData) {
        try {
          const restored = JSON.parse(suspendData);
          if (restored && Array.isArray(restored.completed)) localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        } catch {}
      }
      setValue('cmi.core.lesson_status', 'completed');
      commit();
    }
  }

  const saveState = (state) => {
    if (!initialized) return;
    setValue('cmi.suspend_data', JSON.stringify(state));
    setValue('cmi.core.lesson_location', relativeLocation());
    setValue('cmi.core.lesson_status', 'completed');
    setValue('cmi.core.exit', 'suspend');
    commit();
  };
  const bookmark = () => {
    if (!initialized) return;
    setValue('cmi.core.lesson_location', relativeLocation());
    commit();
  };
  const normalizeSavedLocation = (savedLocation) => {
    const path = savedLocation.trim().replace(/^[./\\]+/, '').replace(/\\/g, '/').split(/[?#]/, 1)[0];
    if (!path || path === 'index.html') return 'index.html';
    const legacyLesson = path.match(/^lessons\/([a-z0-9-]+)(?:\/index\.html|\/)?$/i);
    if (legacyLesson) return `lessons/${legacyLesson[1]}.html`;
    return /^lessons\/[a-z0-9-]+\.html$/i.test(path) ? path : 'index.html';
  };
  const resume = () => {
    if (!initialized) return false;
    const savedLocation = normalizeSavedLocation(getValue('cmi.core.lesson_location'));
    if (!savedLocation || savedLocation === 'index.html') return false;
    const target = new URL(savedLocation, courseRoot);
    if (target.href === window.location.href) return false;
    window.location.replace(target.href);
    return true;
  };
  const finish = () => {
    if (!initialized || terminated) return;
    terminated = true;
    setValue('cmi.core.lesson_status', 'completed');
    setValue('cmi.core.exit', 'suspend');
    commit();
    call('LMSFinish');
    initialized = false;
  };

  window.TFGScorm = { connected: initialized, courseRoot: courseRoot.href, saveState, bookmark, resume, finish };
  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);
})();
