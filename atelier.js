(() => {
  const api = window.LICHT_CMS_API;
  const $ = s => document.querySelector(s);
  const loginScreen = $('#loginScreen');
  const editorShell = $('#editorShell');
  const loginForm = $('#loginForm');
  const loginStatus = $('#loginStatus');
  const saveStatus = $('#saveStatus');
  const preview = $('#preview');
  const layersList = $('#layersList');
  const revisionList = $('#revisionList');
  const inspectorForm = $('#inspectorForm');
  const emptyInspector = $('#emptyInspector');
  const imageInput = $('#imageInput');

  let session = JSON.parse(localStorage.getItem('licht-atelier-session') || 'null');
  let config = { version: 1, managed: {}, customElements: [] };
  let selectedKey = null;
  let history = [];
  let historyIndex = -1;
  let drag = null;
  let resize = null;

  const fields = {
    name: $('#fieldName'), x: $('#fieldX'), y: $('#fieldY'), width: $('#fieldWidth'),
    z: $('#fieldZ'), opacity: $('#fieldOpacity'), rotation: $('#fieldRotation'),
    text: $('#fieldText'), href: $('#fieldHref'), visible: $('#fieldVisible')
  };

  const labels = {
    heroArt:'Hero artwork', environmentGroup:'Environment group', clouds:'Clouds', mountains:'Mountains',
    architecture:'Architecture', floatingIsland:'Floating island', foliageGroup:'Foliage group', treeLeft:'Left tree',
    topBranches:'Top branches', hangingLeaves:'Hanging leaves', greenRibbonA:'Green ribbon 01',
    greenRibbonB:'Green ribbon 02', windyLeaves:'Windy leaves', characterGroup:'Character group',
    heroCharacter:'Hero character', deskGroup:'Desk group', window:'Window', sketches:'Sketches', bird:'Bird',
    heroDesk:'Drawing desk', pens:'Art pens', inkBottles:'Ink bottles', lantern:'Lantern',
    foregroundGroup:'Foreground group', foregroundWood:'Foreground wood', foregroundLeaves:'Foreground leaves',
    heroCopy:'Hero copy group', heroTitle:'Hero headline', heroSubtitle:'Hero subtitle', heroButton:'Hero CTA'
  };

  function withTimeout(promise, ms = 12000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Login timed out. Please try again.')), ms))
    ]);
  }

  async function apiCall(body, auth = true) {
    const headers = { 'content-type':'application/json' };
    if (auth && session?.access_token) headers.authorization = 'Bearer ' + session.access_token;
    let res;
    try {
      res = await fetch(api, { method:'POST', headers, body:JSON.stringify(body) });
    } catch {
      throw new Error('CMS connection unavailable. Refresh the page and try again.');
    }
    if (res.status === 401 && auth && session?.refresh_token && body.action !== 'refresh') {
      const rr = await fetch(api, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'refresh', refresh_token:session.refresh_token}) });
      if (rr.ok) {
        const refreshed = await rr.json();
        session = { ...session, ...refreshed };
        localStorage.setItem('licht-atelier-session', JSON.stringify(session));
        headers.authorization = 'Bearer ' + session.access_token;
        try {
          res = await fetch(api, { method:'POST', headers, body:JSON.stringify(body) });
        } catch {
          throw new Error('CMS connection unavailable. Refresh the page and try again.');
        }
      }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function snapshot() {
    const copy = JSON.stringify(config);
    if (history[historyIndex] === copy) return;
    history = history.slice(0, historyIndex + 1);
    history.push(copy);
    if (history.length > 40) history.shift();
    historyIndex = history.length - 1;
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    config = JSON.parse(history[historyIndex]);
    sendPreview();
    renderLayers();
    selectLayer(selectedKey);
    setStatus('Undid change');
  }

  function setStatus(text) { saveStatus.textContent = text; }

  function scheduleSelectionBox() {
    requestAnimationFrame(() => requestAnimationFrame(updateSelectionBox));
  }

  function sendPreview() {
    preview.contentWindow?.postMessage({ type:'licht-preview-config', config }, location.origin);
    scheduleSelectionBox();
  }

  function iframeDoc() { return preview.contentDocument || preview.contentWindow?.document; }
  function heroEl() { return iframeDoc()?.querySelector('.hero'); }

  function readComputedState(key) {
    const doc = iframeDoc();
    const el = doc?.querySelector('[data-editor-key="' + CSS.escape(key) + '"]');
    if (!el) return { mode:'offset', dx:0, dy:0, scale:1, opacity:1, z:5, rotation:0, flipX:false, flipY:false, visible:true };
    const cs = preview.contentWindow.getComputedStyle(el);
    let text = '';
    if (key === 'heroTitle') text = el.innerText.trim();
    else if (key === 'heroSubtitle') text = el.textContent?.trim() || '';
    else if (key === 'heroButton') text = el.querySelector('span')?.textContent || el.textContent || '';
    return {
      mode: 'offset',
      dx: 0,
      dy: 0,
      scale: 1,
      opacity: Number(cs.opacity || 1),
      z: Number(cs.zIndex === 'auto' ? 5 : cs.zIndex),
      rotation: 0,
      flipX: false,
      flipY: false,
      visible: cs.display !== 'none',
      ...(text ? { text } : {}),
      ...(el.matches('a') ? { href:el.getAttribute('href') || '#' } : {})
    };
  }

  function stateFor(key) {
    if (!key) return null;
    if (key.startsWith('custom:')) {
      return config.customElements.find(x => 'custom:' + x.id === key) || null;
    }
    if (!config.managed[key]) {
      config.managed[key] = readComputedState(key);
    } else if (config.managed[key].mode !== 'offset') {
      // Migrate the old absolute positioning model to safe offsets.
      // Keep visual properties, but discard legacy x/y/width that caused jumps.
      const old = config.managed[key];
      config.managed[key] = {
        ...old,
        mode: 'offset',
        dx: 0,
        dy: 0,
        scale: 1
      };
      delete config.managed[key].x;
      delete config.managed[key].y;
      delete config.managed[key].width;
    }

    const editableTextKeys = new Set(['heroTitle', 'heroSubtitle', 'heroButton']);
    if (!editableTextKeys.has(key)) {
      delete config.managed[key].text;
      delete config.managed[key].href;
    } else if (key !== 'heroButton') {
      delete config.managed[key].href;
    }

    return config.managed[key];
  }

  function parentKeyFor(key) {
    const doc = iframeDoc();
    const el = doc?.querySelector('[data-editor-key="' + CSS.escape(key) + '"]');
    if (!el) return 'hero';
    const parentEditor = el.parentElement?.closest?.('[data-editor-key]');
    return parentEditor?.dataset?.editorKey || 'hero';
  }

  function allLayerKeys() {
    const doc = iframeDoc();
    const dom = doc ? [...doc.querySelectorAll('[data-editor-key]')].map(el => el.dataset.editorKey).filter(Boolean) : [];
    const custom = (config.customElements || []).map(x => 'custom:' + x.id);
    return [...new Set([...dom, ...custom])];
  }

  function zFor(key) {
    const state = stateFor(key);
    return Number(state?.z ?? 0);
  }

  function keysInStack(parentKey) {
    return allLayerKeys()
      .filter(key => parentKeyFor(key) === parentKey)
      .sort((a, b) => zFor(b) - zFor(a));
  }

  function normalizeStack(keys) {
    const count = keys.length;
    keys.forEach((key, index) => {
      const state = stateFor(key);
      if (state) state.z = (count - index) * 10;
    });
  }

  function reorderLayer(sourceKey, targetKey, after = false) {
    const parent = parentKeyFor(sourceKey);
    if (parent !== parentKeyFor(targetKey) || sourceKey === targetKey) return;
    const keys = keysInStack(parent).filter(key => key !== sourceKey);
    let index = keys.indexOf(targetKey);
    if (index < 0) return;
    if (after) index += 1;
    keys.splice(index, 0, sourceKey);
    normalizeStack(keys);
    snapshot();
    sendPreview();
    renderLayers();
    selectLayer(sourceKey);
    setStatus('Layer order changed');
  }

  function moveSelectedLayer(mode) {
    if (!selectedKey) return;
    const parent = parentKeyFor(selectedKey);
    const keys = keysInStack(parent);
    const index = keys.indexOf(selectedKey);
    if (index < 0 || keys.length < 2) return;

    keys.splice(index, 1);
    let nextIndex = index;
    if (mode === 'front') nextIndex = 0;
    if (mode === 'forward') nextIndex = Math.max(0, index - 1);
    if (mode === 'backward') nextIndex = Math.min(keys.length, index + 1);
    if (mode === 'back') nextIndex = keys.length;
    keys.splice(nextIndex, 0, selectedKey);

    normalizeStack(keys);
    snapshot();
    sendPreview();
    renderLayers();
    selectLayer(selectedKey);
    setStatus('Layer order changed');
  }

  function renderLayers() {
    const keys = allLayerKeys();
    const topLevel = keys.filter(key => parentKeyFor(key) === 'hero').sort((a, b) => zFor(b) - zFor(a));
    const used = new Set();
    const rows = [];

    const row = (key, child = false) => {
      if (used.has(key)) return;
      used.add(key);
      const state = stateFor(key);
      const name = key.startsWith('custom:')
        ? ((state?.type || 'element') + ' · ' + key.slice(7,13))
        : (labels[key] || key);
      rows.push(
        '<button class="layer-item ' + (child ? 'child ' : '') + (key === selectedKey ? 'active' : '') +
        '" draggable="true" data-key="' + key + '">' +
        '<span class="layer-handle">⋮⋮</span><span class="layer-dot"></span>' +
        '<span class="layer-name">' + name + '</span><span class="layer-z">z' + Math.round(zFor(key)) + '</span></button>'
      );
    };

    topLevel.forEach(parent => {
      row(parent, false);
      keysInStack(parent).forEach(child => row(child, true));
    });

    keys.filter(key => !used.has(key)).sort((a,b) => zFor(b)-zFor(a)).forEach(key => row(key, false));
    layersList.innerHTML = rows.join('');

    let dragKey = null;
    layersList.querySelectorAll('.layer-item').forEach(btn => {
      btn.onclick = () => selectLayer(btn.dataset.key);
      btn.addEventListener('dragstart', event => {
        dragKey = btn.dataset.key;
        btn.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragKey);
      });
      btn.addEventListener('dragend', () => {
        dragKey = null;
        btn.classList.remove('dragging');
        layersList.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      });
      btn.addEventListener('dragover', event => {
        const source = dragKey || event.dataTransfer.getData('text/plain');
        if (!source || parentKeyFor(source) !== parentKeyFor(btn.dataset.key)) return;
        event.preventDefault();
        btn.classList.add('drag-over');
        event.dataTransfer.dropEffect = 'move';
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
      btn.addEventListener('drop', event => {
        event.preventDefault();
        btn.classList.remove('drag-over');
        const source = dragKey || event.dataTransfer.getData('text/plain');
        const rect = btn.getBoundingClientRect();
        reorderLayer(source, btn.dataset.key, event.clientY > rect.top + rect.height / 2);
      });
    });
  }

  function selectLayer(key) {
    selectedKey = key;
    renderLayers();
    const state = stateFor(key);
    if (!state) {
      inspectorForm.hidden = true;
      emptyInspector.hidden = false;
      return;
    }
    emptyInspector.hidden = true;
    inspectorForm.hidden = false;
    const isCustom = key.startsWith('custom:');
    fields.name.value = isCustom ? (state.type || 'custom') : (labels[key] || key);
    $('#labelX').textContent = isCustom ? 'Position X %' : 'X offset px';
    $('#labelY').textContent = isCustom ? 'Position Y %' : 'Y offset px';
    $('#labelWidth').textContent = isCustom ? 'Width %' : 'Scale %';
    fields.x.step = isCustom ? '.1' : '1';
    fields.y.step = isCustom ? '.1' : '1';
    fields.width.step = isCustom ? '.1' : '1';
    fields.x.value = round(isCustom ? state.x : state.dx);
    fields.y.value = round(isCustom ? state.y : state.dy);
    fields.width.value = round(isCustom ? state.width : ((state.scale ?? 1) * 100));
    fields.z.value = state.z ?? 5;
    fields.opacity.value = state.opacity ?? 1;
    fields.rotation.value = state.rotation ?? 0;
    $('#flipXBtn').classList.toggle('active', state.flipX === true);
    $('#flipYBtn').classList.toggle('active', state.flipY === true);
    fields.text.value = state.text ?? '';
    fields.href.value = state.href ?? '';
    fields.visible.checked = state.visible !== false;
    $('#textWrap').hidden = !(state.text != null || key === 'heroTitle' || key === 'heroSubtitle' || key === 'heroButton' || state.type === 'text' || state.type === 'button');
    $('#hrefWrap').hidden = !(key === 'heroButton' || state.type === 'button');
    highlightPreview(key);
  }

  function round(n) { return Math.round(Number(n || 0) * 10) / 10; }

  function ensureSelectionBox() {
    const doc = iframeDoc();
    if (!doc) return null;

    let box = doc.getElementById('lichtSelectionBox');
    if (box) return box;

    box = doc.createElement('div');
    box.id = 'lichtSelectionBox';
    box.innerHTML = '<span class="licht-resize-handle" title="Drag to resize proportionally"></span>';
    doc.body.appendChild(box);

    const handle = box.querySelector('.licht-resize-handle');
    handle.addEventListener('pointerdown', event => {
      if (!selectedKey) return;
      const target = doc.querySelector('[data-editor-key="' + CSS.escape(selectedKey) + '"]');
      const state = stateFor(selectedKey);
      if (!target || !state) return;

      const isCustom = selectedKey.startsWith('custom:');
      const isCustomImage = isCustom && state.type === 'image';
      if (isCustom && !isCustomImage) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = target.getBoundingClientRect();
      const startDistance = Math.max(24, Math.hypot(event.clientX - rect.left, event.clientY - rect.top));
      resize = {
        key: selectedKey,
        isCustom,
        startDistance,
        anchorX: rect.left,
        anchorY: rect.top,
        startScale: Number(state.scale ?? 1),
        startWidth: Number(state.width ?? 18)
      };

      handle.setPointerCapture?.(event.pointerId);
      setStatus('Resizing…');
    });

    return box;
  }

  function updateSelectionBox() {
    const doc = iframeDoc();
    if (!doc) return;

    const box = ensureSelectionBox();
    if (!box) return;

    const target = selectedKey
      ? doc.querySelector('[data-editor-key="' + CSS.escape(selectedKey) + '"]')
      : null;

    if (!target || preview.contentWindow.getComputedStyle(target).display === 'none') {
      box.style.display = 'none';
      return;
    }

    const state = stateFor(selectedKey);
    const isCustom = selectedKey.startsWith('custom:');
    const canResize = !isCustom || state?.type === 'image';
    const rect = target.getBoundingClientRect();

    box.style.display = 'block';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = Math.max(1, rect.width) + 'px';
    box.style.height = Math.max(1, rect.height) + 'px';
    box.querySelector('.licht-resize-handle').style.display = canResize ? 'block' : 'none';
  }

  function highlightPreview(key) {
    const doc = iframeDoc();
    if (!doc) return;
    doc.querySelectorAll('[data-editor-key]').forEach(el => el.style.outline = '');
    updateSelectionBox();
  }

  function updateSelected(push = true) {
    const state = stateFor(selectedKey);
    if (!state) return;
    const isCustom = selectedKey?.startsWith('custom:');

    if (isCustom) {
      state.x = Number(fields.x.value || 0);
      state.y = Number(fields.y.value || 0);
      state.width = Math.max(1, Number(fields.width.value || 1));
    } else {
      state.mode = 'offset';
      state.dx = Number(fields.x.value || 0);
      state.dy = Number(fields.y.value || 0);
      state.scale = Math.max(.05, Number(fields.width.value || 100) / 100);
      delete state.x;
      delete state.y;
      delete state.width;
    }

    state.z = Number(fields.z.value || 0);
    state.opacity = Math.max(0, Math.min(1, Number(fields.opacity.value || 1)));
    state.rotation = Number(fields.rotation.value || 0);
    state.visible = fields.visible.checked;
    if (!$('#textWrap').hidden) state.text = fields.text.value;
    if (!$('#hrefWrap').hidden) state.href = fields.href.value;
    sendPreview();
    if (push) snapshot();
    setStatus('Unsaved changes');
  }

  Object.values(fields).forEach(field => {
    if (!field || field === fields.name) return;
    field.addEventListener(field.type === 'checkbox' ? 'change' : 'input', () => updateSelected(false));
    field.addEventListener('change', () => {
      updateSelected(false);
      snapshot();
      if (field === fields.z) {
        renderLayers();
        selectLayer(selectedKey);
      }
    });
  });

  async function loadDraft() {
    const data = await apiCall({ action:'draft-get' });
    config = data.config || { version:1, managed:{}, customElements:[] };
    if (!config.managed) config.managed = {};
    if (!Array.isArray(config.customElements)) config.customElements = [];
    Object.keys(config.managed).forEach(key => stateFor(key));
    history = [JSON.stringify(config)];
    historyIndex = 0;
    sendPreview();
    setStatus('Draft loaded');
    setTimeout(renderLayers, 250);
    loadRevisions();
  }

  async function saveDraft() {
    setStatus('Saving…');
    await apiCall({ action:'draft-save', config });
    setStatus('Draft saved');
  }

  async function publish() {
    setStatus('Publishing…');
    await apiCall({ action:'publish', config });
    setStatus('Published ✓');
    loadRevisions();
  }

  async function loadRevisions() {
    const data = await apiCall({ action:'revisions' });
    revisionList.innerHTML = (data.revisions || []).map(r => '<div class="revision"><span>' + new Date(r.published_at).toLocaleString() + '</span><button data-id="' + r.id + '">Restore</button></div>').join('') || '<p>No revisions yet.</p>';
    revisionList.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const rev = data.revisions.find(x => String(x.id) === btn.dataset.id);
        if (!rev) return;
        config = rev.config;
        snapshot();
        sendPreview();
        renderLayers();
        setStatus('Revision loaded as draft');
      };
    });
  }

  function addCustom(type, extra = {}) {
    const id = (crypto.randomUUID?.() || Date.now().toString(36));
    const item = { id, type, x:45, y:42, width:type === 'image' ? 18 : 16, opacity:1, z:25, rotation:0, flipX:false, flipY:false, visible:true, ...extra };
    config.customElements.push(item);
    snapshot();
    sendPreview();
    setTimeout(() => { renderLayers(); selectLayer('custom:' + id); }, 80);
    setStatus('Unsaved changes');
  }

  async function uploadImage(file) {
    if (!file) return;
    setStatus('Uploading asset…');
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const result = await apiCall({ action:'upload', name:file.name, contentType:file.type, base64 });
    addCustom('image', { src:result.url, alt:file.name });
    setStatus('Image added');
  }

  function deleteSelected() {
    if (!selectedKey) return;
    if (selectedKey.startsWith('custom:')) {
      const id = selectedKey.slice(7);
      config.customElements = config.customElements.filter(x => x.id !== id);
      selectedKey = null;
    } else {
      const state = stateFor(selectedKey);
      state.visible = false;
    }
    snapshot(); sendPreview(); renderLayers(); selectLayer(selectedKey); setStatus('Unsaved changes');
  }

  function toggleFlip(axis) {
    const state = stateFor(selectedKey);
    if (!state) return;
    if (axis === 'x') state.flipX = state.flipX !== true;
    if (axis === 'y') state.flipY = state.flipY !== true;
    snapshot();
    sendPreview();
    selectLayer(selectedKey);
    setStatus(axis === 'x' ? 'Horizontal flip changed' : 'Vertical flip changed');
  }

  function duplicateSelected() {
    const state = stateFor(selectedKey);
    if (!state) return;
    if (selectedKey.startsWith('custom:')) {
      const clone = structuredClone(state);
      delete clone.id;
      addCustom(state.type, { ...clone, x:(state.x||0)+2, y:(state.y||0)+2 });
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function handleUndoShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.key.toLowerCase() !== 'z') return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    undo();
  }

  function wirePreview() {
    const doc = iframeDoc();
    const hero = heroEl();
    if (!doc || !hero) return;

    const style = doc.createElement('style');
    style.textContent = `
      [data-editor-key]{pointer-events:auto!important;cursor:move!important}
      .hero a[data-editor-key]{pointer-events:auto!important}
      #lichtSelectionBox{
        position:fixed;
        z-index:2147483646;
        pointer-events:none;
        border:1.5px solid #42e84f;
        box-shadow:0 0 0 1px rgba(4,18,7,.45);
      }
      #lichtSelectionBox::before,
      #lichtSelectionBox::after{
        content:"";
        position:absolute;
        width:6px;
        height:6px;
        border:1px solid #42e84f;
        background:#0b130d;
      }
      #lichtSelectionBox::before{left:-4px;top:-4px}
      #lichtSelectionBox::after{right:-4px;top:-4px}
      .licht-resize-handle{
        position:absolute;
        width:13px;
        height:13px;
        right:-7px;
        bottom:-7px;
        border:2px solid #071009;
        border-radius:3px;
        background:#42e84f;
        pointer-events:auto;
        cursor:nwse-resize;
        box-shadow:0 0 0 1px #42e84f;
      }
    `;
    doc.head.appendChild(style);

    ensureSelectionBox();

    doc.addEventListener('keydown', handleUndoShortcut, true);

    doc.addEventListener('pointerdown', event => {
      if (event.target.closest?.('#lichtSelectionBox')) return;
      const el = event.target.closest?.('[data-editor-key]');
      if (!el) return;

      event.preventDefault();
      event.stopPropagation();

      const key = el.dataset.editorKey;
      selectLayer(key);
      const state = stateFor(key);
      const isCustom = key.startsWith('custom:');

      drag = {
        key,
        isCustom,
        startX:event.clientX,
        startY:event.clientY,
        x:Number(isCustom ? (state.x || 0) : (state.dx || 0)),
        y:Number(isCustom ? (state.y || 0) : (state.dy || 0))
      };

      el.setPointerCapture?.(event.pointerId);
    }, true);

    doc.addEventListener('pointermove', event => {
      if (resize) {
        const state = stateFor(resize.key);
        if (!state) return;

        const currentDistance = Math.max(
          8,
          Math.hypot(event.clientX - resize.anchorX, event.clientY - resize.anchorY)
        );
        const ratio = Math.max(.05, Math.min(8, currentDistance / resize.startDistance));

        if (resize.isCustom) {
          state.width = Math.max(1, resize.startWidth * ratio);
          fields.width.value = round(state.width);
        } else {
          state.mode = 'offset';
          state.scale = Math.max(.05, resize.startScale * ratio);
          fields.width.value = round(state.scale * 100);
        }

        sendPreview();
        setStatus('Resizing…');
        return;
      }

      if (!drag) return;

      const state = stateFor(drag.key);
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;

      if (drag.isCustom) {
        const target = doc.querySelector('[data-editor-key="' + CSS.escape(drag.key) + '"]');
        const parent = target?.offsetParent || target?.parentElement || hero;
        const parentRect = parent.getBoundingClientRect();
        state.x = drag.x + (deltaX / parentRect.width) * 100;
        state.y = drag.y + (deltaY / parentRect.height) * 100;
        fields.x.value = round(state.x);
        fields.y.value = round(state.y);
      } else {
        state.mode = 'offset';
        state.dx = drag.x + deltaX;
        state.dy = drag.y + deltaY;
        fields.x.value = round(state.dx);
        fields.y.value = round(state.dy);
      }

      sendPreview();
      setStatus('Unsaved changes');
    }, true);

    doc.addEventListener('pointerup', () => {
      if (resize) {
        resize = null;
        snapshot();
        sendPreview();
        setStatus('Unsaved changes');
        return;
      }

      if (!drag) return;
      drag = null;
      snapshot();
      sendPreview();
    }, true);

    preview.contentWindow.addEventListener('scroll', scheduleSelectionBox, { passive:true });
    preview.contentWindow.addEventListener('resize', scheduleSelectionBox);
    preview.contentWindow.addEventListener('licht:config-applied', scheduleSelectionBox);

    sendPreview();
    setTimeout(() => {
      renderLayers();
      updateSelectionBox();
    }, 100);
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    loginStatus.textContent = 'Signing in…';
    try {
      session = await withTimeout(apiCall({ action:'login', email:$('#email').value, password:$('#password').value }, false));
      localStorage.setItem('licht-atelier-session', JSON.stringify(session));
      loginScreen.hidden = true;
      editorShell.hidden = false;
      loginStatus.textContent = '';
      await loadDraft();
    } catch (err) {
      loginStatus.textContent = err.message || 'Login failed.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  $('#saveBtn').onclick = () => saveDraft().catch(e => setStatus(e.message));
  $('#publishBtn').onclick = () => publish().catch(e => setStatus(e.message));
  $('#undoBtn').onclick = undo;
  window.addEventListener('keydown', handleUndoShortcut, true);
  $('#logoutBtn').onclick = () => { localStorage.removeItem('licht-atelier-session'); location.reload(); };
  $('#refreshLayers').onclick = renderLayers;
  $('#addText').onclick = () => addCustom('text', { text:'New text' });
  $('#addButton').onclick = () => addCustom('button', { text:'Button', href:'#work' });
  $('#addImage').onclick = () => imageInput.click();
  imageInput.onchange = () => uploadImage(imageInput.files?.[0]).catch(e => setStatus(e.message));
  $('#deleteBtn').onclick = deleteSelected;
  $('#duplicateBtn').onclick = duplicateSelected;
  $('#flipXBtn').onclick = () => toggleFlip('x');
  $('#flipYBtn').onclick = () => toggleFlip('y');
  $('#toFrontBtn').onclick = () => moveSelectedLayer('front');
  $('#forwardBtn').onclick = () => moveSelectedLayer('forward');
  $('#backwardBtn').onclick = () => moveSelectedLayer('backward');
  $('#toBackBtn').onclick = () => moveSelectedLayer('back');

  document.querySelectorAll('.device').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.device').forEach(x => x.classList.toggle('active', x === btn));
    preview.style.width = btn.dataset.width;
    $('#zoomLabel').textContent = btn.textContent;
  });

  preview.addEventListener('load', wirePreview);

  async function boot() {
    if (!session?.access_token) return;
    try {
      loginScreen.hidden = true; editorShell.hidden = false;
      await loadDraft();
    } catch {
      localStorage.removeItem('licht-atelier-session');
      session = null;
      loginScreen.hidden = false; editorShell.hidden = true;
    }
  }
  boot();
})();