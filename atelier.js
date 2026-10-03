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

  async function apiCall(body, auth = true) {
    const headers = { 'content-type':'application/json' };
    if (auth && session?.access_token) headers.authorization = 'Bearer ' + session.access_token;
    let res = await fetch(api, { method:'POST', headers, body:JSON.stringify(body) });
    if (res.status === 401 && auth && session?.refresh_token && body.action !== 'refresh') {
      const rr = await fetch(api, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'refresh', refresh_token:session.refresh_token}) });
      if (rr.ok) {
        const refreshed = await rr.json();
        session = { ...session, ...refreshed };
        localStorage.setItem('licht-atelier-session', JSON.stringify(session));
        headers.authorization = 'Bearer ' + session.access_token;
        res = await fetch(api, { method:'POST', headers, body:JSON.stringify(body) });
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

  function sendPreview() {
    preview.contentWindow?.postMessage({ type:'licht-preview-config', config }, location.origin);
  }

  function iframeDoc() { return preview.contentDocument || preview.contentWindow?.document; }
  function heroEl() { return iframeDoc()?.querySelector('.hero'); }

  function readComputedState(key) {
    const doc = iframeDoc();
    const el = doc?.querySelector('[data-editor-key="' + CSS.escape(key) + '"]');
    const hero = heroEl();
    if (!el || !hero) return { x:10, y:10, width:20, opacity:1, z:5, rotation:0, visible:true };
    const r = el.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const cs = preview.contentWindow.getComputedStyle(el);
    const isTitle = key === 'heroTitle';
    let text = '';
    if (isTitle) text = el.innerText.trim();
    else if (el.matches('a')) text = el.querySelector('span')?.textContent || el.textContent || '';
    else if (!el.querySelector('img')) text = el.textContent?.trim() || '';
    return {
      x: ((r.left - hr.left) / hr.width) * 100,
      y: ((r.top - hr.top) / hr.height) * 100,
      width: (r.width / hr.width) * 100,
      opacity: Number(cs.opacity || 1),
      z: Number(cs.zIndex === 'auto' ? 5 : cs.zIndex),
      rotation: 0,
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
    if (!config.managed[key]) config.managed[key] = readComputedState(key);
    return config.managed[key];
  }

  function renderLayers() {
    const doc = iframeDoc();
    const keys = doc ? [...doc.querySelectorAll('[data-editor-key]')].map(el => el.dataset.editorKey).filter(Boolean) : [];
    const managedKeys = [...new Set(keys.filter(k => !k.startsWith('custom:')))];
    const custom = (config.customElements || []).map(x => 'custom:' + x.id);
    layersList.innerHTML = [...managedKeys, ...custom].map(key => {
      const name = key.startsWith('custom:') ? ((stateFor(key)?.type || 'element') + ' · ' + key.slice(7,13)) : (labels[key] || key);
      return '<button class="layer-item ' + (key === selectedKey ? 'active' : '') + '" data-key="' + key + '"><span class="layer-dot"></span><span>' + name + '</span></button>';
    }).join('');
    layersList.querySelectorAll('.layer-item').forEach(btn => btn.onclick = () => selectLayer(btn.dataset.key));
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
    fields.name.value = key.startsWith('custom:') ? (state.type || 'custom') : (labels[key] || key);
    fields.x.value = round(state.x);
    fields.y.value = round(state.y);
    fields.width.value = round(state.width);
    fields.z.value = state.z ?? 5;
    fields.opacity.value = state.opacity ?? 1;
    fields.rotation.value = state.rotation ?? 0;
    fields.text.value = state.text ?? '';
    fields.href.value = state.href ?? '';
    fields.visible.checked = state.visible !== false;
    $('#textWrap').hidden = !(state.text != null || key === 'heroTitle' || key === 'heroSubtitle' || key === 'heroButton' || state.type === 'text' || state.type === 'button');
    $('#hrefWrap').hidden = !(key === 'heroButton' || state.type === 'button');
    highlightPreview(key);
  }

  function round(n) { return Math.round(Number(n || 0) * 10) / 10; }

  function highlightPreview(key) {
    const doc = iframeDoc();
    if (!doc) return;
    doc.querySelectorAll('[data-editor-key]').forEach(el => el.style.outline = '');
    const el = doc.querySelector('[data-editor-key="' + CSS.escape(key || '') + '"]');
    if (el) el.style.outline = '2px solid #42e84f';
  }

  function updateSelected(push = true) {
    const state = stateFor(selectedKey);
    if (!state) return;
    state.x = Number(fields.x.value || 0);
    state.y = Number(fields.y.value || 0);
    state.width = Math.max(1, Number(fields.width.value || 1));
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
    field.addEventListener('change', () => { updateSelected(false); snapshot(); });
  });

  async function loadDraft() {
    const data = await apiCall({ action:'draft-get' });
    config = data.config || { version:1, managed:{}, customElements:[] };
    if (!config.managed) config.managed = {};
    if (!Array.isArray(config.customElements)) config.customElements = [];
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
    const item = { id, type, x:45, y:42, width:type === 'image' ? 18 : 16, opacity:1, z:25, rotation:0, visible:true, ...extra };
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

  function duplicateSelected() {
    const state = stateFor(selectedKey);
    if (!state) return;
    if (selectedKey.startsWith('custom:')) {
      addCustom(state.type, { ...structuredClone(state), id:undefined, x:(state.x||0)+2, y:(state.y||0)+2 });
    }
  }

  function wirePreview() {
    const doc = iframeDoc();
    const hero = heroEl();
    if (!doc || !hero) return;
    const style = doc.createElement('style');
    style.textContent = '[data-editor-key]{pointer-events:auto!important;cursor:move!important}.hero a[data-editor-key]{pointer-events:auto!important}';
    doc.head.appendChild(style);

    doc.addEventListener('pointerdown', e => {
      const el = e.target.closest?.('[data-editor-key]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const key = el.dataset.editorKey;
      selectLayer(key);
      const state = stateFor(key);
      drag = { key, startX:e.clientX, startY:e.clientY, x:Number(state.x||0), y:Number(state.y||0) };
      el.setPointerCapture?.(e.pointerId);
    }, true);

    doc.addEventListener('pointermove', e => {
      if (!drag) return;
      const heroRect = hero.getBoundingClientRect();
      const state = stateFor(drag.key);
      state.x = drag.x + ((e.clientX - drag.startX) / heroRect.width) * 100;
      state.y = drag.y + ((e.clientY - drag.startY) / heroRect.height) * 100;
      fields.x.value = round(state.x);
      fields.y.value = round(state.y);
      sendPreview();
      setStatus('Unsaved changes');
    }, true);

    doc.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      snapshot();
    }, true);

    sendPreview();
    setTimeout(renderLayers, 100);
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginStatus.textContent = 'Signing in…';
    try {
      session = await apiCall({ action:'login', email:$('#email').value, password:$('#password').value }, false);
      localStorage.setItem('licht-atelier-session', JSON.stringify(session));
      loginScreen.hidden = true; editorShell.hidden = false;
      await loadDraft();
    } catch (err) { loginStatus.textContent = err.message; }
  });

  $('#saveBtn').onclick = () => saveDraft().catch(e => setStatus(e.message));
  $('#publishBtn').onclick = () => publish().catch(e => setStatus(e.message));
  $('#undoBtn').onclick = undo;
  $('#logoutBtn').onclick = () => { localStorage.removeItem('licht-atelier-session'); location.reload(); };
  $('#refreshLayers').onclick = renderLayers;
  $('#addText').onclick = () => addCustom('text', { text:'New text' });
  $('#addButton').onclick = () => addCustom('button', { text:'Button', href:'#work' });
  $('#addImage').onclick = () => imageInput.click();
  imageInput.onchange = () => uploadImage(imageInput.files?.[0]).catch(e => setStatus(e.message));
  $('#deleteBtn').onclick = deleteSelected;
  $('#duplicateBtn').onclick = duplicateSelected;

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