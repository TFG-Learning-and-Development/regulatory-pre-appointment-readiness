(() => {
  const STORAGE_KEY = 'tfg-regulatory-readiness-progress-v1';
  const lessonIds = ['why-this-course-matters','appointment-readiness','conflict-of-interest','permissible-financial-interests','disclosure-mechanisms','debarment','course-conclusion'];

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { completed: [] }; }
    catch { return { completed: [] }; }
  };
  const writeState = (state) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };
  const markComplete = (id) => {
    if (!id) return;
    const state = readState();
    if (!state.completed.includes(id)) state.completed.push(id);
    writeState(state);
    renderProgress();
  };
  const renderProgress = () => {
    const state = readState();
    const completed = lessonIds.filter((id) => state.completed.includes(id));
    const percent = Math.round((completed.length / lessonIds.length) * 100);
    document.querySelectorAll('[data-progress-label]').forEach((node) => node.textContent = `${percent}%`);
    document.querySelectorAll('[data-progress-bar]').forEach((node) => node.style.width = `${percent}%`);
    document.querySelectorAll('[data-complete-count]').forEach((node) => node.textContent = String(completed.length));
    lessonIds.forEach((id) => {
      document.querySelectorAll(`[data-nav-lesson="${id}"], [data-home-lesson="${id}"]`).forEach((node) => node.classList.toggle('complete', completed.includes(id)));
    });
    document.querySelectorAll('[data-home-progress]').forEach((node) => node.textContent = `${percent}%`);
  };

  document.querySelector('[data-menu-toggle]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const menu = document.querySelector('[data-course-menu]');
    const isOpen = menu.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('[data-flip-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const flipped = card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', String(flipped));
    });
  });

  document.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const buttons = [...tabs.querySelectorAll('[data-tab-button]')];
    const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
    const activate = (index, focus = false) => {
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === index));
        button.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
      if (focus) buttons[index].focus();
    };
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activate(index));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        activate(nextIndex, true);
      });
    });
  });

  const lightbox = document.querySelector('[data-image-lightbox]');
  if (lightbox) {
    const lightboxImage = lightbox.querySelector('[data-lightbox-image]');
    const closeButton = lightbox.querySelector('[data-lightbox-close]');
    let opener = null;
    document.querySelectorAll('[data-lightbox-trigger]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        opener = trigger;
        lightboxImage.src = trigger.dataset.lightboxSrc;
        lightboxImage.alt = trigger.dataset.lightboxAlt || '';
        lightbox.showModal();
        document.body.style.overflow = 'hidden';
        closeButton.focus();
      });
    });
    closeButton.addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('close', () => {
      document.body.style.overflow = '';
      lightboxImage.removeAttribute('src');
      const elementToFocus = opener;
      setTimeout(() => elementToFocus?.focus(), 0);
    });
  }

  document.querySelectorAll('[data-knowledge-check]').forEach((check) => {
    const correctIndex = Number(check.dataset.correctIndex);
    const options = [...check.querySelectorAll('[data-option]')];
    const submit = check.querySelector('[data-check-answer]');
    const retry = check.querySelector('[data-try-again]');
    const correct = check.querySelector('[data-correct-feedback]');
    const incorrect = check.querySelector('[data-incorrect-feedback]');
    options.forEach((option) => option.querySelector('input').addEventListener('change', () => {
      options.forEach((node) => node.classList.toggle('selected', node.querySelector('input').checked));
    }));
    submit.addEventListener('click', () => {
      const selected = options.findIndex((option) => option.querySelector('input').checked);
      if (selected < 0) { submit.textContent = 'Choose an answer first'; setTimeout(() => submit.textContent = 'Check answer', 1600); return; }
      const isCorrect = selected === correctIndex;
      options.forEach((option, index) => {
        option.classList.remove('correct','incorrect');
        if (index === selected) option.classList.add(isCorrect ? 'correct' : 'incorrect');
        option.querySelector('input').disabled = true;
      });
      correct.hidden = !isCorrect;
      incorrect.hidden = isCorrect;
      retry.hidden = isCorrect;
      submit.hidden = true;
      (isCorrect ? correct : incorrect).focus?.();
    });
    retry.addEventListener('click', () => {
      options.forEach((option) => { option.classList.remove('selected','correct','incorrect'); const input = option.querySelector('input'); input.checked = false; input.disabled = false; });
      correct.hidden = true; incorrect.hidden = true; retry.hidden = true; submit.hidden = false;
    });
  });

  document.querySelector('[data-finish-course]')?.addEventListener('click', (event) => {
    event.preventDefault();
    const state = readState();
    state.completed = [...lessonIds];
    state.finished = true;
    writeState(state);
    window.location.href = '/';
  });

  const current = document.documentElement.dataset.currentLesson;
  if (current && document.documentElement.dataset.completionMode !== 'manual') {
    const marker = document.querySelector('[data-lesson-complete-marker]');
    if (marker && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { markComplete(current); observer.disconnect(); } }, { threshold: .5 });
      observer.observe(marker);
    } else if (marker) markComplete(current);
  }
  renderProgress();
})();
