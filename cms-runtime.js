(() => {
  const api = window.LICHT_CMS_API;
  const hero = document.querySelector('.hero');
  if (!api || !hero) return;

  const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

  function applyBox(el, state = {}) {
    if (!el) return;

    const isCustom = el.dataset.cmsCustom === 'true';
    const key = el.dataset.editorKey || '';
    const usesOffsetModel = !isCustom && state.mode === 'offset';
    const flipX = state.flipX === true;
    const flipY = state.flipY === true;

    if (isCustom) {
      if (state.x != null) { el.style.left = num(state.x) + '%'; el.style.right = 'auto'; }
      if (state.y != null) { el.style.top = num(state.y) + '%'; el.style.bottom = 'auto'; }
      if (state.width != null) el.style.width = Math.max(1, num(state.width, 10)) + '%';
      el.style.translate = '';
      el.style.scale = (flipX || flipY) ? `${flipX ? -1 : 1} ${flipY ? -1 : 1}` : '';
    } else {
      // Built-in artwork keeps its original CSS anchors and size.
      // Legacy absolute x/y/width values are intentionally ignored because
      // converting right/bottom anchored art to left/top caused jumps/shrinking.
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('width');
      if (usesOffsetModel) {
        el.style.translate = num(state.dx, 0) + 'px ' + num(state.dy, 0) + 'px';
        const magnitude = Math.max(.05, num(state.scale, 1));
        el.style.scale = `${magnitude * (flipX ? -1 : 1)} ${magnitude * (flipY ? -1 : 1)}`;
      } else {
        el.style.translate = '';
        el.style.scale = '';
      }
    }

    if (state.opacity != null) el.style.opacity = String(Math.max(0, Math.min(1, num(state.opacity, 1))));
    if (state.z != null) el.style.zIndex = String(Math.round(num(state.z, 1)));
    if (state.visible != null) el.style.display = state.visible ? '' : 'none';
    el.style.rotate = state.rotation ? num(state.rotation) + 'deg' : '';
    if (state.depth != null && el.dataset.depth != null) el.dataset.depth = String(num(state.depth, .25));
    const editableBuiltInText = new Set(['heroTitle', 'heroSubtitle', 'heroButton']);
    const mayEditText = isCustom || editableBuiltInText.has(key);

    if (mayEditText && state.text != null) {
      if (key === 'heroTitle') {
        const lines = String(state.text).split('\n');
        el.innerHTML = lines.map((line, i) => i === lines.length - 1 ? '<em>' + escapeHtml(line) + '</em>' : escapeHtml(line)).join('<br>');
      } else if (el.matches('a')) {
        const span = el.querySelector('span');
        if (span) span.textContent = String(state.text);
        else el.textContent = String(state.text);
      } else {
        el.textContent = String(state.text);
      }
    }

    const mayEditHref = isCustom || key === 'heroButton';
    if (mayEditHref && state.href != null && el.matches('a')) {
      el.setAttribute('href', String(state.href || '#'));
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function clearCustom() {
    hero.querySelectorAll('[data-cms-custom="true"]').forEach(el => el.remove());
  }

  function renderCustom(item) {
    if (!item || !item.id) return;
    let el;
    if (item.type === 'image') {
      el = document.createElement('img');
      el.src = item.src || '';
      el.alt = item.alt || '';
      el.decoding = 'async';
    } else if (item.type === 'button') {
      el = document.createElement('a');
      el.href = item.href || '#';
      el.className = 'cms-custom-button';
      el.textContent = item.text || 'Button';
    } else {
      el = document.createElement('div');
      el.className = 'cms-custom-text';
      el.textContent = item.text || 'Text';
    }
    el.dataset.cmsCustom = 'true';
    el.dataset.editorKey = 'custom:' + item.id;
    el.classList.add('cms-custom-element');
    el.style.position = 'absolute';
    applyBox(el, item);
    hero.appendChild(el);
  }

  function applyConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    Object.entries(cfg.managed || {}).forEach(([key, state]) => {
      applyBox(document.querySelector('[data-editor-key="' + CSS.escape(key) + '"]'), state);
    });
    clearCustom();
    (cfg.customElements || []).forEach(renderCustom);
    window.dispatchEvent(new CustomEvent('licht:config-applied', { detail: cfg }));
  }

  window.LichtCMS = { applyConfig, applyBox };

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'licht-preview-config') applyConfig(event.data.config);
  });

  async function load() {
    try {
      const res = await fetch(api, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      applyConfig(data.config);
    } catch {}
  }

  load();
  if (!new URLSearchParams(location.search).has('editorPreview')) {
    setInterval(load, 15000);
  }
})();