(() => {
  const api = window.LICHT_CMS_API;
  const hero = document.querySelector('.hero');
  if (!api || !hero) return;

  const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

  function applyBox(el, state = {}) {
    if (!el) return;

    const isCustom = el.dataset.cmsCustom === 'true';
    const isScene = el.matches('.scene-img[data-depth]');
    const key = el.dataset.editorKey || '';
    const usesOffsetModel = !isCustom && state.mode === 'offset';
    const flipX = state.flipX === true;
    const flipY = state.flipY === true;
    const rotation = num(state.rotation, 0);

    if (isCustom) {
      if (state.x != null) { el.style.left = num(state.x) + '%'; el.style.right = 'auto'; }
      if (state.y != null) { el.style.top = num(state.y) + '%'; el.style.bottom = 'auto'; }
      if (state.width != null) el.style.width = Math.max(1, num(state.width, 10)) + '%';

      const sx = flipX ? -1 : 1;
      const sy = flipY ? -1 : 1;
      el.style.transform = `rotate(${rotation}deg) scale(${sx}, ${sy})`;
      el.style.translate = '';
      el.style.scale = '';
      el.style.rotate = '';
    } else {
      // Preserve the authored CSS anchors/sizing. Movement is additive.
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('width');

      const magnitude = usesOffsetModel ? Math.max(.05, num(state.scale, 1)) : 1;
      const sx = magnitude * (flipX ? -1 : 1);
      const sy = magnitude * (flipY ? -1 : 1);
      const dx = usesOffsetModel ? num(state.dx, 0) : 0;
      const dy = usesOffsetModel ? num(state.dy, 0) : 0;

      if (isScene) {
        // Scene layers share one transform pipeline with parallax.
        el.style.setProperty('--cms-x', dx + 'px');
        el.style.setProperty('--cms-y', dy + 'px');
        el.style.setProperty('--cms-scale-x', String(sx));
        el.style.setProperty('--cms-scale-y', String(sy));
        el.style.setProperty('--cms-rotate', rotation + 'deg');
        el.style.translate = '';
        el.style.scale = '';
        el.style.rotate = '';
        el.style.removeProperty('transform');
      } else {
        // Text/groups do not participate in parallax, so a direct transform is safe.
        el.style.translate = dx + 'px ' + dy + 'px';
        el.style.transform = `rotate(${rotation}deg) scale(${sx}, ${sy})`;
        el.style.scale = '';
        el.style.rotate = '';
      }
    }

    if (state.opacity != null) el.style.opacity = String(Math.max(0, Math.min(1, num(state.opacity, 1))));
    if (state.z != null) el.style.zIndex = String(Math.round(num(state.z, 1)));
    if (state.visible != null) el.style.display = state.visible ? '' : 'none';
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

  function applyHomepageContent(content) {
    const values = content && typeof content === 'object' ? content : {};

    document.querySelectorAll('[data-home-content]').forEach(el => {
      const key = el.dataset.homeContent;
      if (Object.prototype.hasOwnProperty.call(values,key)) {
        el.textContent = String(values[key] ?? '');
      }
    });

    document.querySelectorAll('[data-home-image]').forEach(el => {
      const key = el.dataset.homeImage;
      if (!Object.prototype.hasOwnProperty.call(values,key)) return;
      const src = String(values[key] || '').trim();

      if (key === 'contactMarkImage') {
        const mark = el.closest('.contact-mark');
        if (src) {
          el.src = src;
          el.hidden = false;
          mark?.classList.add('has-custom-image');
        } else {
          el.removeAttribute('src');
          el.hidden = true;
          mark?.classList.remove('has-custom-image');
        }
        return;
      }

      if (src) el.src = src;
    });

    document.querySelectorAll('[data-home-link]').forEach(el => {
      const key = el.dataset.homeLink;
      if (Object.prototype.hasOwnProperty.call(values,key) && el.matches('a')) {
        el.href = String(values[key] || '#');
      }
    });
  }

  function applyConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    Object.entries(cfg.managed || {}).forEach(([key, state]) => {
      applyBox(document.querySelector('[data-editor-key="' + CSS.escape(key) + '"]'), state);
    });
    applyHomepageContent(cfg.content || {});
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