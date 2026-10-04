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
  let projectBlocks = [];
  let activeBuilderRange = null;
  let draggedBlockId = null;
  let projectSettings = {
    style:{ background:'', spacing:28, rounded:true },
    categories:[],
    tools:[],
    visibility:'everyone',
    adult:false
  };

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
      'P','BR','STRONG','B','EM','I','U','H2','H3','HR',
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
          (node.tagName === 'DIV' && name === 'data-project-grid') ||
          (node.tagName === 'BLOCKQUOTE' && name === 'data-project-embed') ||
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

  function normalizeProjectSettings(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const style = input.style && typeof input.style === 'object' ? input.style : {};

    return {
      style:{
        background:typeof style.background === 'string' ? style.background : '',
        spacing:Number.isFinite(Number(style.spacing)) ? Math.max(0,Math.min(80,Number(style.spacing))) : 28,
        rounded:style.rounded !== false
      },
      categories:Array.isArray(input.categories) ? input.categories.map(String).map(v=>v.trim()).filter(Boolean).slice(0,3) : [],
      tools:Array.isArray(input.tools) ? input.tools.map(String).map(v=>v.trim()).filter(Boolean) : [],
      visibility:input.visibility === 'private' ? 'private' : 'everyone',
      adult:Boolean(input.adult)
    };
  }

  function currentProjectStyle() {
    return normalizeProjectSettings(projectSettings).style;
  }

  function projectForeground(background) {
    if (!/^#[0-9a-f]{6}$/i.test(background || '')) {
      return {fg:'#eef5ef',muted:'#a7aea5'};
    }
    const r=parseInt(background.slice(1,3),16);
    const g=parseInt(background.slice(3,5),16);
    const b=parseInt(background.slice(5,7),16);
    const lum=(0.2126*r+0.7152*g+0.0722*b)/255;
    return lum > .58 ? {fg:'#0b0c0b',muted:'#59615b'} : {fg:'#f4f6f1',muted:'#aab2aa'};
  }

  function applyBuilderProjectStyle() {
    const main = $('.project-builder-main');
    if (!main) return;
    const style = currentProjectStyle();
    main.style.setProperty('--builder-gap', style.spacing + 'px');
    main.classList.toggle('builder-square', !style.rounded);
    if (style.background) main.style.background = style.background;
    else main.style.removeProperty('background');
  }

  function syncStyleDialogFromState() {
    const style = currentProjectStyle();
    const background = /^#[0-9a-f]{6}$/i.test(style.background) ? style.background : '#081009';
    $('#projectBackgroundColor').value = background;
    $('#projectBackgroundHex').value = background.toUpperCase();
    $('#projectContentSpacing').value = String(style.spacing);
    $('#projectContentSpacingValue').textContent = style.spacing + ' px';
    $('#projectRoundedContent').checked = style.rounded;
  }

  function syncSettingsDialogFromState() {
    $('#settingsProjectTitle').value = $('#projectTitle').value || '';
    $('#settingsProjectTags').value = $('#projectTags').value || '';
    $('#settingsProjectCategories').value = (projectSettings.categories?.length ? projectSettings.categories : [$('#projectCategory').value]).filter(Boolean).join(', ');
    $('#settingsProjectTools').value = (projectSettings.tools || []).join(', ');
    $('#settingsProjectVisibility').value = projectSettings.visibility || 'everyone';
    $('#settingsProjectAdult').checked = Boolean(projectSettings.adult);
  }

  function enhancePreviewEmbeds(container) {
    container.querySelectorAll('blockquote[data-project-embed] a').forEach(link => {
      const href = link.href;
      let parsed;
      try { parsed = new URL(href); } catch { return; }
      const host = parsed.hostname.replace(/^www\./,'').toLowerCase();
      const allowed = ['sketchfab.com','youtube.com','youtu.be','vimeo.com'].some(domain => host === domain || host.endsWith('.'+domain));
      if (!allowed) return;

      let src = href;
      if (host === 'youtu.be') src = 'https://www.youtube.com/embed/' + parsed.pathname.replace(/^\//,'');
      else if (host.endsWith('youtube.com') && parsed.searchParams.get('v')) src = 'https://www.youtube.com/embed/' + parsed.searchParams.get('v');
      else if (host.endsWith('vimeo.com') && !host.startsWith('player.')) src = 'https://player.vimeo.com/video/' + parsed.pathname.split('/').filter(Boolean).pop();

      const frame = document.createElement('iframe');
      frame.src = src;
      frame.loading = 'lazy';
      frame.allowFullscreen = true;
      frame.allow = 'autoplay; fullscreen; xr-spatial-tracking';
      link.closest('blockquote')?.replaceWith(frame);
    });
  }

  function renderWorkspacePreview() {
    const preview = $('#workspaceProjectPreview');
    const content = $('#previewContent');
    const style = currentProjectStyle();
    const bg = style.background || '#081009';
    const colors = projectForeground(bg);

    preview.style.setProperty('--preview-bg', bg);
    preview.style.setProperty('--preview-fg', colors.fg);
    preview.style.setProperty('--preview-muted', colors.muted);
    preview.style.setProperty('--preview-gap', style.spacing + 'px');
    preview.classList.toggle('square', !style.rounded);

    $('#previewCategory').textContent = projectSettings.categories?.[0] || $('#projectCategory').value || 'Project';
    $('#previewTitle').textContent = $('#projectTitle').value || 'Untitled Project';
    content.innerHTML = sanitizeEditorHtml(blocksToHtml());
    enhancePreviewEmbeds(content);
  }

  function extractEmbedUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (/^https:\/\//i.test(raw)) return raw;
    const template = document.createElement('template');
    template.innerHTML = raw;
    const iframe = template.content.querySelector('iframe[src]');
    if (iframe) return iframe.getAttribute('src') || '';
    const link = template.content.querySelector('a[href]');
    return link?.getAttribute('href') || '';
  }

  function blockId() {
    return 'block-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  }

  function defaultTextBlock(html = '<p>Write your project story here…</p>') {
    return { id:blockId(), type:'text', html };
  }

  function contentToBlocks(value) {
    const raw = String(value || '').trim();
    if (!raw) return [defaultTextBlock()];

    const wrapper = document.createElement('div');
    wrapper.innerHTML = sanitizeEditorHtml(raw);

    const blocks = [];

    [...wrapper.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('img')) {
        blocks.push({
          id:blockId(),
          type:'image',
          src:node.getAttribute('src') || '',
          alt:node.getAttribute('alt') || ''
        });
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('[data-project-grid]')) {
        blocks.push({
          id:blockId(),
          type:'grid',
          images:[...node.querySelectorAll('img')].map(img => ({
            src:img.getAttribute('src') || '',
            alt:img.getAttribute('alt') || ''
          })).filter(image => image.src)
        });
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('hr')) {
        blocks.push({ id:blockId(), type:'divider' });
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('blockquote[data-project-embed]')) {
        const link = node.querySelector('a');
        blocks.push({
          id:blockId(),
          type:'embed',
          url:link?.getAttribute('href') || '',
          label:link?.textContent?.trim() || link?.getAttribute('href') || ''
        });
        return;
      }

      const holder = document.createElement('div');
      holder.append(node.cloneNode(true));
      blocks.push(defaultTextBlock(holder.innerHTML));
    });

    return blocks.length ? blocks : [defaultTextBlock()];
  }

  function blocksToHtml() {
    return projectBlocks.map(block => {
      if (block.type === 'text') {
        return sanitizeEditorHtml(block.html || '');
      }

      if (block.type === 'image') {
        if (!block.src) return '';
        return '<img src="' + escapeHtml(block.src) + '" alt="' + escapeHtml(block.alt || '') + '">';
      }

      if (block.type === 'grid') {
        const images = (block.images || []).filter(image => image.src);
        if (!images.length) return '';
        return '<div data-project-grid="' + Math.min(3, Math.max(1, images.length)) + '">' +
          images.map(image => '<img src="' + escapeHtml(image.src) + '" alt="' + escapeHtml(image.alt || '') + '">').join('') +
          '</div>';
      }

      if (block.type === 'divider') {
        return '<hr>';
      }

      if (block.type === 'embed') {
        if (!block.url) return '';
        return '<blockquote data-project-embed="1"><a href="' + escapeHtml(block.url) + '">' +
          escapeHtml(block.label || block.url) + '</a></blockquote>';
      }

      return '';
    }).join('\n');
  }

  function builderBlockLabel(type) {
    return ({text:'TEXT',image:'IMAGE',grid:'PHOTO GRID',divider:'DIVIDER',embed:'EMBED / LINK'})[type] || type.toUpperCase();
  }

  function renderProjectBlocks() {
    const canvas = $('#projectContent');
    if (!canvas) return;

    canvas.innerHTML = projectBlocks.map(block => {
      let body = '';

      if (block.type === 'text') {
        body = '<div class="builder-text-toolbar" role="toolbar">' +
          '<button type="button" data-builder-command="bold"><b>B</b></button>' +
          '<button type="button" data-builder-command="italic"><i>I</i></button>' +
          '<button type="button" data-builder-block="h2">H₂</button>' +
          '<button type="button" data-builder-block="h3">H₃</button>' +
          '<button type="button" data-builder-command="insertUnorderedList">• List</button>' +
          '<button type="button" data-builder-link>↗ Link</button>' +
          '</div>' +
          '<div class="builder-text-editor" contenteditable="true" data-block-text>' +
          (block.html || '<p><br></p>') +
          '</div>';
      } else if (block.type === 'image') {
        body = '<div class="builder-image-frame">' +
          (block.src ? '<img src="' + escapeHtml(block.src) + '" alt="' + escapeHtml(block.alt || '') + '">' : '<span>No image</span>') +
          '</div>';
      } else if (block.type === 'grid') {
        body = '<div class="builder-photo-grid">' +
          (block.images || []).map(image => '<img src="' + escapeHtml(image.src) + '" alt="' + escapeHtml(image.alt || '') + '">').join('') +
          '</div>';
      } else if (block.type === 'divider') {
        body = '<div class="builder-divider"><span></span></div>';
      } else if (block.type === 'embed') {
        body = '<a class="builder-embed-card" href="' + escapeHtml(block.url || '#') + '" target="_blank" rel="noopener noreferrer">' +
          '<span>&lt;/&gt;</span><div><strong>' + escapeHtml(block.label || 'Embedded link') + '</strong><small>' + escapeHtml(block.url || '') + '</small></div>' +
          '</a>';
      }

      return '<section class="builder-block" draggable="true" data-block-id="' + block.id + '">' +
        '<div class="builder-block-head">' +
          '<span class="builder-drag" title="Drag to reorder">⋮⋮</span>' +
          '<b>' + builderBlockLabel(block.type) + '</b>' +
          '<div class="builder-block-actions">' +
            '<button type="button" data-block-up title="Move up">↑</button>' +
            '<button type="button" data-block-down title="Move down">↓</button>' +
            '<button type="button" data-block-delete title="Delete">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="builder-block-body">' + body + '</div>' +
      '</section>';
    }).join('');

    if (!projectBlocks.length) {
      canvas.innerHTML = '<div class="builder-empty">Add content from the panel on the right.</div>';
    }
  }

  function markBuilderDirty() {
    markProjectDirty();
    $('#projectSaveStatus').textContent = 'Unsaved content changes';
  }

  function moveBlock(id, delta) {
    const index = projectBlocks.findIndex(block => block.id === id);
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= projectBlocks.length) return;
    [projectBlocks[index], projectBlocks[target]] = [projectBlocks[target], projectBlocks[index]];
    renderProjectBlocks();
    markBuilderDirty();
  }

  function deleteBlock(id) {
    projectBlocks = projectBlocks.filter(block => block.id !== id);
    if (!projectBlocks.length) projectBlocks.push(defaultTextBlock());
    renderProjectBlocks();
    markBuilderDirty();
  }

  function addBlock(block) {
    projectBlocks.push({ id:blockId(), ...block });
    renderProjectBlocks();
    markBuilderDirty();
    requestAnimationFrame(() => {
      const last = $('#projectContent .builder-block:last-child');
      last?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
  }

  async function uploadBuilderFile(file) {
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

    return result.url;
  }

  async function addImageFiles(files, asGrid = false) {
    const list = [...(files || [])];
    if (!list.length) return;

    $('#projectSaveStatus').textContent = 'Uploading project media…';
    const uploaded = [];

    for (const file of list) {
      uploaded.push({
        src:await uploadBuilderFile(file),
        alt:file.name
      });
    }

    if (asGrid) addBlock({ type:'grid', images:uploaded });
    else addBlock({ type:'image', src:uploaded[0].src, alt:uploaded[0].alt });

    $('#projectSaveStatus').textContent = 'Media inserted · unsaved changes';
  }

  function saveBuilderSelection(editor) {
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      activeBuilderRange = { editor, range:range.cloneRange() };
    }
  }

  function runBuilderCommand(editor, command, value = null) {
    if (!editor) return;
    editor.focus();

    if (activeBuilderRange?.editor === editor) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(activeBuilderRange.range);
    }

    document.execCommand(command, false, value);
    saveBuilderSelection(editor);

    const id = editor.closest('[data-block-id]')?.dataset.blockId;
    const block = projectBlocks.find(item => item.id === id);
    if (block) block.html = sanitizeEditorHtml(editor.innerHTML);
    markBuilderDirty();
  }

  function openProjectEditor(id) {
    const project = adminProjects.find(item => item.id === id);
    if (!project) return;

    activeProjectId = project.id;
    projectDirty = false;
    projectSettings = normalizeProjectSettings(project.settings);
    $('#projectEditorEmpty').hidden = true;
    $('#projectForm').hidden = false;
    $('#projectId').value = project.id;
    $('#projectTitle').value = project.title || '';
    $('#projectCategory').value = project.category || '';
    $('#projectSortOrder').value = project.sort_order ?? 0;
    $('#projectExcerpt').value = project.excerpt || project.description || '';
    projectBlocks = contentToBlocks(project.content || project.description || '');
    renderProjectBlocks();
    $('#projectTags').value = (project.tags || []).join(', ');
    $('#projectCover').value = project.cover || '';
    $('#projectBehance').value = project.behance_url || '';
    $('#projectFormHeading').textContent = project.title || 'Untitled project';
    $('#projectState').textContent = project.is_hidden ? 'HIDDEN' : ((project.status || (project.published ? 'published' : 'draft')).toUpperCase());
    $('#hideProjectBtn').textContent = project.is_hidden ? 'Show' : 'Hide';
    $('#deleteProjectBtn').hidden = false;
    $('#projectSaveStatus').textContent = 'No unsaved changes';
    $('#publishProject').textContent = 'Update Project';
    updateCoverPreview();
    applyBuilderProjectStyle();
    renderProjectList();
  }

  function newProjectEditor() {
    activeProjectId = null;
    projectDirty = false;
    projectSettings = normalizeProjectSettings({});
    $('#projectEditorEmpty').hidden = true;
    $('#projectForm').hidden = false;
    $('#projectId').value = '';
    $('#projectTitle').value = '';
    $('#projectCategory').value = 'Graphic Design';
    $('#projectSortOrder').value = adminProjects.length;
    $('#projectExcerpt').value = '';
    projectBlocks = [defaultTextBlock()];
    renderProjectBlocks();
    $('#projectTags').value = '';
    $('#projectCover').value = '';
    $('#projectBehance').value = '';
    $('#projectFormHeading').textContent = 'New project';
    $('#projectState').textContent = 'DRAFT';
    $('#hideProjectBtn').textContent = 'Hide';
    $('#deleteProjectBtn').hidden = true;
    $('#projectSaveStatus').textContent = 'New unsaved project';
    $('#publishProject').textContent = 'Publish Project';
    updateCoverPreview();
    applyBuilderProjectStyle();
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
      content: blocksToHtml(),
      description: $('#projectExcerpt').value.trim(),
      tags: $('#projectTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      cover: $('#projectCover').value.trim(),
      behance_url: $('#projectBehance').value.trim(),
      images: existing?.images || [],
      settings: normalizeProjectSettings(projectSettings),
      is_hidden: projectSettings.visibility === 'private' ? true : (existing?.is_hidden || false),
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
    const publishButton = $('#publishProject');
    const draftButton = $('#saveProjectDraft');
    const isUpdate = Boolean(activeProjectId);

    if (!payload.title) {
      $('#projectSaveStatus').textContent = 'Title is required';
      $('#projectTitle').focus();
      return;
    }

    publishButton.disabled = true;
    draftButton.disabled = true;

    if (status === 'published') {
      publishButton.textContent = isUpdate ? 'Updating…' : 'Publishing…';
      $('#projectSaveStatus').textContent = isUpdate ? 'Updating project…' : 'Publishing project…';
    } else {
      draftButton.textContent = 'Saving…';
      $('#projectSaveStatus').textContent = 'Saving draft…';
    }

    try {
      const data = await apiCall({ action:'project-save', project:payload });
      if (!data?.project?.id) throw new Error('Project save returned no project record.');

      activeProjectId = data.project.id;
      projectDirty = false;

      // Always re-fetch from Supabase so the editor reflects the actual persisted row,
      // not a stale local object.
      await loadProjects();
      const persisted = adminProjects.find(item => item.id === activeProjectId) || data.project;
      if (!adminProjects.some(item => item.id === persisted.id)) adminProjects.push(persisted);

      openProjectEditor(persisted.id);

      if (status === 'published') {
        $('#projectSaveStatus').textContent = isUpdate ? 'Updated ✓' : 'Published ✓';
        publishButton.textContent = isUpdate ? 'Updated ✓' : 'Published ✓';
      } else {
        $('#projectSaveStatus').textContent = 'Draft saved ✓';
        draftButton.textContent = 'Saved ✓';
      }

      window.setTimeout(() => {
        publishButton.textContent = activeProjectId ? 'Update Project' : 'Publish Project';
        draftButton.textContent = 'Save draft';
      }, 1400);
    } catch (error) {
      $('#projectSaveStatus').textContent = 'Save failed: ' + (error?.message || 'Unknown error');
      publishButton.textContent = activeProjectId ? 'Update Project' : 'Publish Project';
      draftButton.textContent = 'Save draft';
      throw error;
    } finally {
      publishButton.disabled = false;
      draftButton.disabled = false;
    }
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
  $('#saveProjectDraft')?.addEventListener('click', () => saveProject('draft').catch(() => {}));
  $('#publishProject')?.addEventListener('click', () => saveProject('published').catch(() => {}));
  $('#hideProjectBtn')?.addEventListener('click', () => toggleProjectHidden().catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#deleteProjectBtn')?.addEventListener('click', () => deleteActiveProject().catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#uploadProjectCover')?.addEventListener('click', () => $('#projectCoverInput').click());
  $('#projectCoverInput')?.addEventListener('change', () => uploadProjectCover($('#projectCoverInput').files?.[0]).catch(error => $('#projectSaveStatus').textContent = error.message));
  $('#projectCover')?.addEventListener('input', () => { updateCoverPreview(); markProjectDirty(); });
  $('#projectForm')?.querySelectorAll('input,textarea').forEach(field => {
    if (field.id === 'projectCover') return;
    field.addEventListener('input', markProjectDirty);
  });

  $('#projectContent')?.addEventListener('input', event => {
    const editor = event.target.closest('[data-block-text]');
    if (!editor) return;
    const id = editor.closest('[data-block-id]')?.dataset.blockId;
    const block = projectBlocks.find(item => item.id === id);
    if (block) block.html = sanitizeEditorHtml(editor.innerHTML);
    saveBuilderSelection(editor);
    markBuilderDirty();
  });

  $('#projectContent')?.addEventListener('mouseup', event => {
    const editor = event.target.closest('[data-block-text]');
    if (editor) saveBuilderSelection(editor);
  });

  $('#projectContent')?.addEventListener('keyup', event => {
    const editor = event.target.closest('[data-block-text]');
    if (editor) saveBuilderSelection(editor);
  });

  $('#projectContent')?.addEventListener('mousedown', event => {
    const toolbarButton = event.target.closest('.builder-text-toolbar button');
    if (!toolbarButton) return;
    const editor = toolbarButton.closest('[data-block-id]')?.querySelector('[data-block-text]');
    if (editor) saveBuilderSelection(editor);
    event.preventDefault();
  });

  $('#projectContent')?.addEventListener('click', event => {
    const blockElement = event.target.closest('[data-block-id]');
    if (!blockElement) return;
    const id = blockElement.dataset.blockId;

    if (event.target.closest('[data-block-up]')) {
      moveBlock(id,-1);
      return;
    }

    if (event.target.closest('[data-block-down]')) {
      moveBlock(id,1);
      return;
    }

    if (event.target.closest('[data-block-delete]')) {
      deleteBlock(id);
      return;
    }

    const editor = blockElement.querySelector('[data-block-text]');
    const commandButton = event.target.closest('[data-builder-command]');
    const blockButton = event.target.closest('[data-builder-block]');

    if (commandButton && editor) {
      runBuilderCommand(editor, commandButton.dataset.builderCommand);
      return;
    }

    if (blockButton && editor) {
      runBuilderCommand(editor, 'formatBlock', blockButton.dataset.builderBlock.toUpperCase());
      return;
    }

    if (event.target.closest('[data-builder-link]') && editor) {
      const href = prompt('Enter link URL');
      if (href) runBuilderCommand(editor, 'createLink', href);
    }
  });

  $('#projectContent')?.addEventListener('dragstart', event => {
    const block = event.target.closest('[data-block-id]');
    if (!block) return;
    draggedBlockId = block.dataset.blockId;
    block.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });

  $('#projectContent')?.addEventListener('dragend', event => {
    event.target.closest('[data-block-id]')?.classList.remove('dragging');
    draggedBlockId = null;
  });

  $('#projectContent')?.addEventListener('dragover', event => {
    if (!draggedBlockId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });

  $('#projectContent')?.addEventListener('drop', event => {
    if (!draggedBlockId) return;
    event.preventDefault();
    const target = event.target.closest('[data-block-id]');
    if (!target || target.dataset.blockId === draggedBlockId) return;

    const from = projectBlocks.findIndex(block => block.id === draggedBlockId);
    const to = projectBlocks.findIndex(block => block.id === target.dataset.blockId);
    if (from < 0 || to < 0) return;

    const [moved] = projectBlocks.splice(from,1);
    projectBlocks.splice(to,0,moved);
    renderProjectBlocks();
    markBuilderDirty();
  });

  $$('[data-add-project-block]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.addProjectBlock;

      if (type === 'text') {
        addBlock({ type:'text', html:'<p>Write your project story here…</p>' });
      } else if (type === 'divider') {
        addBlock({ type:'divider' });
      } else if (type === 'image') {
        $('#builderImageInput')?.click();
      } else if (type === 'grid') {
        $('#builderGridInput')?.click();
      } else if (type === 'embed') {
        $('#projectEmbedCode').value = '';
        $('#projectEmbedDialog').showModal();
      }
    });
  });

  $('#builderAddTextBottom')?.addEventListener('click', () => {
    addBlock({ type:'text', html:'<p>Write your project story here…</p>' });
  });

  $('#builderImageInput')?.addEventListener('change', () => {
    addImageFiles($('#builderImageInput').files, false)
      .catch(error => $('#projectSaveStatus').textContent = error.message);
    $('#builderImageInput').value = '';
  });

  $('#builderGridInput')?.addEventListener('change', () => {
    addImageFiles($('#builderGridInput').files, true)
      .catch(error => $('#projectSaveStatus').textContent = error.message);
    $('#builderGridInput').value = '';
  });

  $$('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog?.open) dialog.close();
    });
  });

  $('#projectStylesBtn')?.addEventListener('click', () => {
    syncStyleDialogFromState();
    $('#projectStylesDialog').showModal();
  });

  $('#projectSettingsBtn')?.addEventListener('click', () => {
    syncSettingsDialogFromState();
    $('#projectSettingsDialog').showModal();
  });

  $('#projectBackgroundColor')?.addEventListener('input', () => {
    $('#projectBackgroundHex').value = $('#projectBackgroundColor').value.toUpperCase();
  });

  $('#projectBackgroundHex')?.addEventListener('input', () => {
    const value = $('#projectBackgroundHex').value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) $('#projectBackgroundColor').value = value;
  });

  $('#projectContentSpacing')?.addEventListener('input', () => {
    $('#projectContentSpacingValue').textContent = $('#projectContentSpacing').value + ' px';
  });

  $('#projectStylesForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const background = $('#projectBackgroundHex').value.trim();
    projectSettings.style = {
      background:/^#[0-9a-f]{6}$/i.test(background) ? background : '',
      spacing:Number($('#projectContentSpacing').value || 0),
      rounded:$('#projectRoundedContent').checked
    };
    applyBuilderProjectStyle();
    markProjectDirty();
    $('#projectStylesDialog').close();
  });

  $('#projectSettingsForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const categories = $('#settingsProjectCategories').value.split(',').map(v=>v.trim()).filter(Boolean).slice(0,3);
    const tools = $('#settingsProjectTools').value.split(',').map(v=>v.trim()).filter(Boolean);
    const tags = $('#settingsProjectTags').value.split(',').map(v=>v.trim()).filter(Boolean);

    $('#projectTitle').value = $('#settingsProjectTitle').value.trim();
    $('#projectTags').value = tags.join(', ');
    if (categories[0]) $('#projectCategory').value = categories[0];

    projectSettings.categories = categories;
    projectSettings.tools = tools;
    projectSettings.visibility = $('#settingsProjectVisibility').value === 'private' ? 'private' : 'everyone';
    projectSettings.adult = $('#settingsProjectAdult').checked;

    markProjectDirty();
    $('#projectSettingsDialog').close();
  });

  $('#projectEmbedForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const url = extractEmbedUrl($('#projectEmbedCode').value);
    if (!/^https:\/\//i.test(url)) {
      $('#projectEmbedCode').focus();
      return;
    }
    let label=url;
    try { label=new URL(url).hostname.replace(/^www\./,''); } catch {}
    addBlock({type:'embed',url,label});
    $('#projectEmbedDialog').close();
  });

  $('#previewProject')?.addEventListener('click', () => {
    renderWorkspacePreview();
    $('#projectPreviewDialog').showModal();
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