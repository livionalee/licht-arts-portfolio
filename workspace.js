(() => {
  const api = window.LICHT_CMS_API;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const login = $('#dashLogin');
  const shell = $('#workspaceShell');
  const loginForm = $('#dashLoginForm');
  const loginStatus = $('#dashLoginStatus');
  const syncPill = $('#syncPill');
  const title = $('#workspaceTitle');

  let adminProjects = [];
  let activeProjectId = null;
  let projectDirty = false;

  let session = JSON.parse(localStorage.getItem('licht-atelier-session') || 'null');

  async function apiCall(body, auth = true) {
    const headers = { 'content-type':'application/json' };
    if (auth && session?.access_token) headers.authorization = 'Bearer ' + session.access_token;

    let response = await fetch(api, {
      method:'POST',
      headers,
      body:JSON.stringify(body)
    });

    if (response.status === 401 && auth && session?.refresh_token && body.action !== 'refresh') {
      const refresh = await fetch(api, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ action:'refresh', refresh_token:session.refresh_token })
      });

      if (refresh.ok) {
        const refreshed = await refresh.json();
        session = { ...session, ...refreshed };
        localStorage.setItem('licht-atelier-session', JSON.stringify(session));
        headers.authorization = 'Bearer ' + session.access_token;
        response = await fetch(api, { method:'POST', headers, body:JSON.stringify(body) });
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function publicConfig() {
    const response = await fetch(api, { cache:'no-store' });
    if (!response.ok) throw new Error('CMS unavailable');
    return response.json();
  }

  function setTab(name) {
    $$('.dash-tab[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    $$('.dash-view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
    title.textContent = ({overview:'Overview',projects:'Projects',media:'Media',settings:'Site Settings'})[name] || 'Workspace';
    history.replaceState(null, '', '#' + name);
  }

  function projectStatus(project) {
    if (project.is_hidden) return 'hidden';
    return project.status === 'published' || project.published ? 'published' : 'draft';
  }

  function filteredProjects() {
    const query = ($('#projectSearch')?.value || '').trim().toLowerCase();
    const filter = $('#projectStatusFilter')?.value || 'all';

    return adminProjects.filter(project => {
      const haystack = [project.title, project.category, ...(project.tags || [])].join(' ').toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (filter !== 'all' && projectStatus(project) !== filter) return false;
      return true;
    });
  }

  function renderProjectList() {
    const list = $('#projectList');
    if (!list) return;

    const visible = filteredProjects();
    list.innerHTML = visible.length ? visible.map(project => {
      const status = projectStatus(project);
      const thumb = project.cover ? "style=\"background-image:url('" + project.cover.replace(/'/g, '%27') + "')\"" : '';
      return '<button class="content-item ' + (project.id === activeProjectId ? 'active' : '') + '" data-project-id="' + project.id + '">' +
        '<span class="content-thumb" ' + thumb + '></span>' +
        '<span class="content-item-copy"><strong>' + escapeHtml(project.title) + '</strong><span>' + escapeHtml(project.category || 'Uncategorized') + '</span></span>' +
        '<span class="content-badge ' + status + '">' + status + '</span>' +
        '</button>';
    }).join('') : '<p class="muted" style="padding:12px">No projects found.</p>';

    list.querySelectorAll('[data-project-id]').forEach(button => {
      button.addEventListener('click', () => openProjectEditor(button.dataset.projectId));
    });

    const badge = document.querySelector('.dash-view[data-view="projects"] .info-badge');
    if (badge) badge.textContent = adminProjects.length + ' projects';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function markProjectDirty() {
    projectDirty = true;
    const status = $('#projectSaveStatus');
    if (status) status.textContent = 'Unsaved changes';
  }

  function updateCoverPreview() {
    const value = ($('#projectCover')?.value || '').trim();
    const preview = $('#projectCoverPreview');
    if (!preview) return;
    preview.style.backgroundImage = value ? "url('" + value.replace(/'/g, '%27') + "')" : '';
    preview.innerHTML = value ? '' : '<span>No cover</span>';
  }

  function sanitizeEditorHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');

    const allowedTags = new Set([
      'P','BR','STRONG','B','EM','I','U','H2','H3',
      'UL','OL','LI','BLOCKQUOTE','A','IMG','DIV'
    ]);

    [...template.content.querySelectorAll('*')].forEach(node => {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }

      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const allowed =
          (node.tagName === 'A' && ['href','target','rel'].includes(name)) ||
          (node.tagName === 'IMG' && ['src','alt'].includes(name)) ||
          (name === 'style' && ['P','DIV','H2','H3','BLOCKQUOTE'].includes(node.tagName));

        if (!allowed) node.removeAttribute(attribute.name);
      });

      if (node.hasAttribute('style')) {
        const align = node.style.textAlign;
        node.removeAttribute('style');
        if (['left','center','right'].includes(align)) node.style.textAlign = align;
      }

      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        try {
          const parsed = new URL(href, location.href);
          if (!['http:','https:','mailto:'].includes(parsed.protocol)) node.removeAttribute('href');
        } catch {
          node.removeAttribute('href');
        }
        node.setAttribute('rel','noopener noreferrer');
        node.setAttribute('target','_blank');
      }

      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        try {
          const parsed = new URL(src, location.href);
          if (!['http:','https:'].includes(parsed.protocol)) node.remove();
        } catch {
          node.remove();
        }
      }
    });

    return template.innerHTML;
  }

  function contentToEditorHtml(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/<[a-z][\s\S]*>/i.test(raw)) return sanitizeEditorHtml(raw);

    return raw
      .split(/\n{2,}/)
      .map(block => '<p>' + escapeHtml(block).replace(/\n/g,'<br>') + '</p>')
      .join('');
  }

  let savedEditorRange = null;

  function saveEditorSelection() {
    const editor = $('#projectContent');
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedEditorRange = range.cloneRange();
  }

  function restoreEditorSelection() {
    const editor = $('#projectContent');
    if (!editor) return;
    editor.focus();

    if (savedEditorRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedEditorRange);
    }
  }

  function runEditorCommand(command, value = null) {
    const editor = $('#projectContent');
    if (!editor) return;

    restoreEditorSelection();

    try {
      document.execCommand(command, false, value);
    } catch (error) {
      console.error('Rich editor command failed:', command, error);
      $('#projectSaveStatus').textContent = 'Formatting command failed';
      return;
    }

    editor.focus();
    saveEditorSelection();
    markProjectDirty();
  }

  async function uploadInlineImage(file) {
    if (!file) return;
    $('#projectSaveStatus').textContent = 'Uploading content image…';

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const result = await apiCall({
      action:'upload',
      name:file.name,
      contentType:file.type,
      base64
    });

    restoreEditorSelection();
    document.execCommand(
      'insertHTML',
      false,
      '<p><img src="' + escapeHtml(result.url) + '" alt="' + escapeHtml(file.name) + '"></p><p><br></p>'
    );
    saveEditorSelection();
    markProjectDirty();
    $('#projectSaveStatus').textContent = 'Image inserted · unsaved changes';
  }


  function openProjectEditor(id) {
    const project = adminProjects.find(item => item.id === id);
    if (!project) return;

    activeProjectId = project.id;
    projectDirty = false;
    $('#projectEditorEmpty').hidden = true;
    $('#projectForm').hidden = false;
    $('#projectId').value = project.id;
    $('#projectTitle').value = project.title || '';
    $('#projectCategory').value = project.category || '';
    $('#projectSortOrder').value = project.sort_order ?? 0;
    $('#projectExcerpt').value = project.excerpt || project.description || '';
    $('#projectContent').innerHTML = contentToEditorHtml(project.content || project.description || '');
    $('#projectTags').value = (project.tags || []).join(', ');
    $('#projectCover').value = project.cover || '';
    $('#projectBehance').value = project.behance_url || '';
    $('#projectFormHeading').textContent = project.title || 'Untitled project';
    $('#projectState').textContent = project.is_hidden ? 'HIDDEN' : ((project.status || (project.published ? 'published' : 'draft')).toUpperCase());
    $('#hideProjectBtn').textContent = project.is_hidden ? 'Show' : 'Hide';
    $('#deleteProjectBtn').hidden = false;
    $('#projectSaveStatus').textContent = 'No unsaved changes';
    updateCoverPreview();
    renderProjectList();
  }

  function newProjectEditor() {
    activeProjectId = null;
    projectDirty = false;
    $('#projectEditorEmpty').hidden = true;
    $('#projectForm').hidden = false;
    $('#projectId').value = '';
    $('#projectTitle').value = '';
    $('#projectCategory').value = 'Graphic Design';
    $('#projectSortOrder').value = adminProjects.length;
    $('#projectExcerpt').value = '';
    $('#projectContent').innerHTML = '';
    $('#projectTags').value = '';
    $('#projectCover').value = '';
    $('#projectBehance').value = '';
    $('#projectFormHeading').textContent = 'New project';
    $('#projectState').textContent = 'DRAFT';
    $('#hideProjectBtn').textContent = 'Hide';
    $('#deleteProjectBtn').hidden = true;
    $('#projectSaveStatus').textContent = 'New unsaved project';
    updateCoverPreview();
    renderProjectList();
  }

  function projectPayload(statusOverride) {
    const existing = adminProjects.find(item => item.id === activeProjectId);
    return {
      id: activeProjectId || undefined,
      title: $('#projectTitle').value.trim(),
      category: $('#projectCategory').value.trim() || 'Graphic Design',
      sort_order: Number($('#projectSortOrder').value || 0),
      excerpt: $('#projectExcerpt').value.trim(),
      content: sanitizeEditorHtml($('#projectContent').innerHTML),
      description: $('#projectExcerpt').value.trim(),
      tags: $('#projectTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      cover: $('#projectCover').value.trim(),
      behance_url: $('#projectBehance').value.trim(),
      images: existing?.images || [],
      is_hidden: existing?.is_hidden || false,
      status: statusOverride || existing?.status || (existing?.published ? 'published' : 'draft')
    };
  }

  async function loadProjects() {
    const data = await apiCall({ action:'project-list' });
    adminProjects = data.projects || [];
    renderProjectList();
    return adminProjects;
  }

  async function saveProject(status) {
    const payload = projectPayload(status);
    if (!payload.title) {
      $('#projectSaveStatus').textContent = 'Title is required';
      $('#projectTitle').focus();
      return;
    }

    $('#projectSaveStatus').textContent = status === 'published' ? 'Publishing…' : 'Saving draft…';
    const data = await apiCall({ action:'project-save', project:payload });
    const saved = data.project;
    const index = adminProjects.findIndex(item => item.id === saved.id);
    if (index >= 0) adminProjects[index] = saved;
    else adminProjects.push(saved);

    activeProjectId = saved.id;
    projectDirty = false;
    openProjectEditor(saved.id);
    $('#projectSaveStatus').textContent = status === 'published' ? 'Published ✓' : 'Draft saved';
  }

  async function toggleProjectHidden() {
    const existing = adminProjects.find(item => item.id === activeProjectId);
    if (!existing) return;
    const payload = { ...projectPayload(existing.status), is_hidden: !existing.is_hidden };
    const data = await apiCall({ action:'project-save', project:payload });
    const index = adminProjects.findIndex(item => item.id === data.project.id);
    if (index >= 0) adminProjects[index] = data.project;
    openProjectEditor(data.project.id);
  }

  async function deleteActiveProject() {
    const existing = adminProjects.find(item => item.id === activeProjectId);
    if (!existing) return;
    if (!confirm('Delete “' + existing.title + '” permanently?')) return;

    await apiCall({ action:'project-delete', id:existing.id });
    adminProjects = adminProjects.filter(item => item.id !== existing.id);
    activeProjectId = null;
    $('#projectForm').hidden = true;
    $('#projectEditorEmpty').hidden = false;
    renderProjectList();
  }

  async function uploadProjectCover(file) {
    if (!file) return;
    $('#projectSaveStatus').textContent = 'Uploading cover…';

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const result = await apiCall({
      action:'upload',
      name:file.name,
      contentType:file.type,
      base64
    });

    $('#projectCover').value = result.url;
    updateCoverPreview();
    markProjectDirty();
    $('#projectSaveStatus').textContent = 'Cover uploaded · unsaved changes';
  }

  async function hydrateWorkspace() {
    syncPill.classList.remove('ok');
    syncPill.innerHTML = '<i></i>Checking…';

    const [published, draft, revisions, projectRows] = await Promise.all([
      publicConfig(),
      apiCall({ action:'draft-get' }),
      apiCall({ action:'revisions' }),
      loadProjects()
    ]);

    const publishedConfig = published.config || { managed:{}, customElements:[] };
    const draftConfig = draft.config || { managed:{}, customElements:[] };
    const same = JSON.stringify(publishedConfig) === JSON.stringify(draftConfig);
    const managedCount = Object.keys(draftConfig.managed || {}).length + (draftConfig.customElements || []).length;
    const revisionItems = revisions.revisions || [];

    $('#statSync').textContent = same ? 'Synced' : 'Draft';
    $('#statSyncNote').textContent = same ? 'Draft matches live site' : 'Unpublished changes exist';
    $('#statManaged').textContent = String(managedCount).padStart(2,'0');
    $('#statRevisions').textContent = String(revisionItems.length).padStart(2,'0');
    const projectStat = document.querySelector('.stats-grid .stat-card:nth-child(2) strong');
    if (projectStat) projectStat.textContent = String(projectRows.length).padStart(2,'0');
    $('#cmsHealth').textContent = 'Online';
    $('#draftStatus').textContent = same ? 'Synced' : 'Changes pending';

    syncPill.classList.add('ok');
    syncPill.innerHTML = '<i></i>' + (same ? 'Live synced' : 'Draft changes');

    $('#recentRevisions').innerHTML = revisionItems.length
      ? revisionItems.slice(0,6).map(function(revision, index) {
          return '<div class="revision-row">' +
            '<span>' + new Date(revision.published_at).toLocaleString() + '</span>' +
            '<strong>' + (index === 0 ? 'Latest publish' : 'Revision #' + revision.id) + '</strong>' +
            '</div>';
        }).join('')
      : '<p class="muted">No published revisions yet.</p>';
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    loginStatus.textContent = '';

    try {
      session = await apiCall({
        action:'login',
        email:$('#dashEmail').value,
        password:$('#dashPassword').value
      }, false);

      localStorage.setItem('licht-atelier-session', JSON.stringify(session));
      login.hidden = true;
      shell.hidden = false;
      await hydrateWorkspace();
    } catch (error) {
      loginStatus.textContent = error.message || 'Login failed.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  $$('.dash-tab[data-tab]').forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  $$('[data-open-tab]').forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.openTab));
  });

  $('#dashLogout').addEventListener('click', () => {
    localStorage.removeItem('licht-atelier-session');
    location.reload();
  });

  $('#newProjectBtn')?.addEventListener('click', newProjectEditor);
  $('#projectSearch')?.addEventListener('input', renderProjectList);
  $('#projectStatusFilter')?.addEventListener('change', renderProjectList);
  $('#saveProjectDraft')?.addEventListener('click', () => saveProject('draft').catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#publishProject')?.addEventListener('click', () => saveProject('published').catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#hideProjectBtn')?.addEventListener('click', () => toggleProjectHidden().catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#deleteProjectBtn')?.addEventListener('click', () => deleteActiveProject().catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#uploadProjectCover')?.addEventListener('click', () => $('#projectCoverInput').click());
  $('#projectCoverInput')?.addEventListener('change', () => uploadProjectCover($('#projectCoverInput').files?.[0]).catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#projectCover')?.addEventListener('input', () => { updateCoverPreview(); markProjectDirty(); });
  $('#projectForm')?.querySelectorAll('input,textarea').forEach(field => {
    if (field.id === 'projectCover') return;
    field.addEventListener('input', markProjectDirty);
  });

  $('#projectContent')?.addEventListener('input', () => {
    saveEditorSelection();
    markProjectDirty();
  });
  $('#projectContent')?.addEventListener('keyup', saveEditorSelection);
  $('#projectContent')?.addEventListener('mouseup', saveEditorSelection);

  $('.rich-editor-toolbar [data-editor-command]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => runEditorCommand(button.dataset.editorCommand));
  });

  $('.rich-editor-toolbar [data-editor-block]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => runEditorCommand('formatBlock', '<' + button.dataset.editorBlock + '>'));
  });

  $('#projectInsertLink')?.addEventListener('mousedown', event => event.preventDefault());
  $('#projectInsertLink')?.addEventListener('click', () => {
    const href = prompt('Enter link URL');
    if (!href) return;
    runEditorCommand('createLink', href);
  });

  $('#projectInsertImage')?.addEventListener('mousedown', event => {
    event.preventDefault();
    saveEditorSelection();
  });
  $('#projectInsertImage')?.addEventListener('click', () => $('#projectInlineImageInput').click());
  $('#projectInlineImageInput')?.addEventListener('change', () => {
    uploadInlineImage($('#projectInlineImageInput').files?.[0])
      .catch(error => $('#projectSaveStatus').textContent = error.message);
    $('#projectInlineImageInput').value = '';
  });

  async function boot() {
    const hash = location.hash.replace('#','');
    if (['overview','projects','media','settings'].includes(hash)) setTab(hash);

    if (!session?.access_token) return;

    try {
      login.hidden = true;
      shell.hidden = false;
      await hydrateWorkspace();
    } catch {
      localStorage.removeItem('licht-atelier-session');
      session = null;
      login.hidden = false;
      shell.hidden = true;
    }
  }

  boot();
})();