function lockDesktopProportions() {
  const root = document.documentElement;
  const finePointer = window.matchMedia('(pointer:fine)').matches;
  const desktopDevice = Math.max(screen.width || 0, screen.height || 0) >= 1024;

  if (!finePointer || !desktopDevice) return;

  const logicalWidth = Math.max(screen.availWidth || window.innerWidth, 1181);
  const logicalHeight = Math.max(screen.availHeight || window.innerHeight, 700);

  const applyScale = () => {
    const scale = Math.min(1, window.innerWidth / logicalWidth);

    root.dataset.proportionLock = 'desktop';
    root.style.setProperty('--layout-width', logicalWidth + 'px');
    root.style.setProperty('--layout-vw', (logicalWidth / 100) + 'px');
    root.style.setProperty('--layout-svh', (logicalHeight / 100) + 'px');
    root.style.setProperty('--layout-scale', String(scale));

    root.style.removeProperty('--layout-page-height');
  };

  applyScale();
  window.addEventListener('resize', applyScale, { passive:true });
}

lockDesktopProportions();

const fallbackProjects = [
  {
    title: 'Beyond the Clouds',
    category: 'illustration',
    categoryLabel: 'Digital Illustration',
    description: 'A tranquil mountain-world study built around atmosphere, scale, and layered environmental storytelling.',
    art: 'ref-1',
    tags: ['Illustration', 'Environment', 'Visual Storytelling']
  },
  {
    title: 'Quiet Growth',
    category: 'identity',
    categoryLabel: 'Brand & Visual Design',
    description: 'An organic visual-system exploration using botanical forms, grids, negative space, and a restrained green palette.',
    art: 'ref-2',
    tags: ['Identity', 'Visual System', 'Art Direction']
  },
  {
    title: 'Daily Fragments',
    category: 'illustration',
    categoryLabel: 'Illustration Series',
    description: 'Sketchbook-inspired fragments where observation, nature, and small visual details become a larger story.',
    art: 'ref-3',
    tags: ['Illustration', 'Sketchbook', 'Series']
  },
  {
    title: 'Verdant Signal',
    category: 'digital',
    categoryLabel: 'Digital Experience',
    description: 'A luminous digital-art study exploring movement, atmosphere, and expressive interface composition.',
    art: 'ref-4',
    tags: ['Digital', 'Motion', 'Interface']
  },
  {
    title: 'Field Notes',
    category: 'identity',
    categoryLabel: 'Editorial / Identity',
    description: 'A flexible visual language combining clean editorial structure with hand-made botanical details.',
    art: 'ref-5',
    tags: ['Editorial', 'Branding', 'Typography']
  },
  {
    title: 'Green Horizon',
    category: 'digital',
    categoryLabel: 'Environment & Key Art',
    description: 'A scenic key-art exploration designed to feel expansive, calm, and slightly otherworldly.',
    art: 'ref-6',
    tags: ['Key Art', 'Environment', 'Digital Art']
  }
];

let projects = [...fallbackProjects];

const root = document.documentElement;
const projectGrid = document.querySelector('#projectGrid');
const filters = [...document.querySelectorAll('.filter')];
const themeToggle = document.querySelector('.theme-toggle');
const header = document.querySelector('.site-header');
const dialog = document.querySelector('#projectDialog');
const dialogMeta = document.querySelector('#dialogMeta');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogTopTitle = document.querySelector('#dialogTopTitle');
const dialogDescription = document.querySelector('#dialogDescription');
const dialogTags = document.querySelector('#dialogTags');
const dialogPublishedDate = document.querySelector('#dialogPublishedDate');
const dialogRelatedProjects = document.querySelector('#dialogRelatedProjects');
const dialogAppreciationCount = document.querySelector('#dialogAppreciationCount');
const dialogLikeCount = document.querySelector('#dialogLikeCount');
const dialogViewCount = document.querySelector('#dialogViewCount');
const dialogOwnerProjectTitle = document.querySelector('#dialogOwnerProjectTitle');
const dialogOwnerProjectMeta = document.querySelector('#dialogOwnerProjectMeta');
const projectSaveAction = document.querySelector('#projectSaveAction');
const projectShareAction = document.querySelector('#projectShareAction');
const projectAppreciateAction = document.querySelector('#projectAppreciateAction');
const projectToolsAction = document.querySelector('#projectToolsAction');
const projectCommentInput = document.querySelector('#projectCommentInput');
const projectCommentButton = document.querySelector('#projectCommentButton');
const projectCommentName = document.querySelector('#projectCommentName');
const projectCommentAvatar = document.querySelector('#projectCommentAvatar');
const projectCommentIdentity = document.querySelector('#projectCommentIdentity');
const projectCommentStatus = document.querySelector('#projectCommentStatus');
const projectCommentsList = document.querySelector('#projectCommentsList');
const projectReplyContext = document.querySelector('#projectReplyContext');
const projectReplyLabel = document.querySelector('#projectReplyLabel');
const projectReplyCancel = document.querySelector('#projectReplyCancel');
const projectPrimaryOwnerAction = document.querySelector('#projectPrimaryOwnerAction');
const projectMoreOwnerAction = document.querySelector('#projectMoreOwnerAction');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeFilter = 'all';
let activeProjectIndex = -1;
let activeReplyParentId = null;
let activeComments = [];
let viewerRolePromise = null;
let viewerRole = { isEditor:false, session:null };
const behanceProfileUrl = 'https://www.behance.net/louirodila';

function escapeProjectText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[char]));
}

function sanitizeProjectHtml(value) {
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
      node.setAttribute('target','_blank');
      node.setAttribute('rel','noopener noreferrer');
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

function projectContentHtml(project) {
  const content = String(project.content || project.description || project.excerpt || '').trim();
  if (!content) return '';
  if (/<[a-z][\s\S]*>/i.test(content)) return sanitizeProjectHtml(content);
  return '<p>' + escapeProjectText(content).replace(/\n\n+/g,'</p><p>').replace(/\n/g,'<br>') + '</p>';
}

function renderProjects() {
  const visibleProjects = projects.filter(project => activeFilter === 'all' || project.category === activeFilter);

  projectGrid.innerHTML = visibleProjects.map((project, index) => {
    const projectIndex = projects.indexOf(project);
    const artClass = project.art || '';
    const artStyle = project.cover
      ? ` style="background-image:url('${String(project.cover).replace(/'/g, '%27')}')"`
      : '';

    return `
      <article class="project-card reveal" tabindex="0" role="button" aria-label="Open ${escapeProjectText(project.title)}" data-project="${projectIndex}">
        <div class="project-art ${artClass}"${artStyle}></div>
        <div class="project-info">
          <span class="project-index">${String(index + 1).padStart(2, '0')}</span>
          <div class="project-copy">
            <h3>${escapeProjectText(project.title)}</h3>
            <p>${escapeProjectText(project.categoryLabel)}</p>
          </div>
          <span class="project-arrow" aria-hidden="true">↗</span>
        </div>
      </article>
    `;
  }).join('');

  observeReveals();

  projectGrid.querySelectorAll('.project-card').forEach(card => {
    const open = () => openProject(Number(card.dataset.project));
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function storedEditorSession() {
  try {
    return JSON.parse(localStorage.getItem('licht-atelier-session') || 'null');
  } catch {
    return null;
  }
}

function saveEditorSession(session) {
  if (!session) return;
  localStorage.setItem('licht-atelier-session', JSON.stringify(session));
}

async function rawCmsPost(body, token = '') {
  const api = window.LICHT_CMS_API;
  if (!api) throw new Error('CMS unavailable');

  const headers = { 'content-type':'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;

  const response = await fetch(api, {
    method:'POST',
    headers,
    body:JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function refreshViewerSession(session) {
  if (!session?.refresh_token) return null;
  const { response, data } = await rawCmsPost({
    action:'refresh',
    refresh_token:session.refresh_token
  });
  if (!response.ok || !data?.access_token) return null;

  const next = { ...session, ...data };
  saveEditorSession(next);
  return next;
}

async function resolveViewerRole(force = false) {
  if (viewerRolePromise && !force) return viewerRolePromise;

  viewerRolePromise = (async () => {
    let session = storedEditorSession();
    if (!session?.access_token) {
      viewerRole = { isEditor:false, session:null };
      return viewerRole;
    }

    let check = await rawCmsPost({ action:'session-check' }, session.access_token);
    if (!check.data?.is_editor && session.refresh_token) {
      const refreshed = await refreshViewerSession(session);
      if (refreshed) {
        session = refreshed;
        check = await rawCmsPost({ action:'session-check' }, session.access_token);
      }
    }

    viewerRole = {
      isEditor:Boolean(check.data?.is_editor),
      session:check.data?.is_editor ? session : null
    };
    return viewerRole;
  })();

  return viewerRolePromise;
}

async function cmsAction(body, { auth = false } = {}) {
  let session = auth ? (viewerRole.session || storedEditorSession()) : null;
  let result = await rawCmsPost(body, session?.access_token || '');

  if (auth && result.response.status === 401 && session?.refresh_token) {
    const refreshed = await refreshViewerSession(session);
    if (refreshed) {
      viewerRole.session = refreshed;
      result = await rawCmsPost(body, refreshed.access_token);
    }
  }

  if (!result.response.ok) throw new Error(result.data?.error || 'Request failed');
  return result.data;
}

function updateOwnerActions(isEditor) {
  [projectPrimaryOwnerAction, projectMoreOwnerAction].forEach(link => {
    if (!link) return;
    link.href = isEditor ? 'workspace.html#projects' : behanceProfileUrl;
    link.textContent = isEditor ? 'Edit Project' : 'Follow on Behance';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.classList.toggle('is-admin-action', isEditor);
  });
}

function ensureGuestKey() {
  let key = localStorage.getItem('licht-comment-guest-key');
  if (!key) {
    key = crypto.randomUUID?.() || ('guest-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    localStorage.setItem('licht-comment-guest-key', key);
  }
  return key;
}

function stringHash(value) {
  let hash = 2166136261;
  for (const char of String(value || 'guest')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function guestAvatarHtml(name, seed, small = false) {
  const label = String(name || 'Guest').trim() || 'Guest';
  const hue = stringHash(seed || label) % 360;
  const initial = escapeProjectText(label.charAt(0).toUpperCase());
  return `<span class="guest-avatar${small ? ' small' : ''}" style="--guest-hue:${hue}"><span>${initial}</span></span>`;
}

function editorAvatarHtml(small = false) {
  return `<span class="brand-mark comment-brand-avatar${small ? ' small' : ''}" aria-hidden="true"><span>L</span></span>`;
}

function updateComposerAvatar() {
  if (!projectCommentAvatar) return;

  if (viewerRole.isEditor) {
    projectCommentAvatar.innerHTML = editorAvatarHtml();
    if (projectCommentIdentity) projectCommentIdentity.hidden = true;
    return;
  }

  if (projectCommentIdentity) projectCommentIdentity.hidden = false;
  const name = projectCommentName?.value.trim() || 'Guest';
  projectCommentAvatar.innerHTML = guestAvatarHtml(name, ensureGuestKey());
}

function updateCommentSubmitState() {
  if (!projectCommentButton) return;
  const hasBody = Boolean(projectCommentInput?.value.trim());
  const hasIdentity = viewerRole.isEditor || Boolean(projectCommentName?.value.trim());
  projectCommentButton.disabled = !(hasBody && hasIdentity);
}

function clearReplyContext() {
  activeReplyParentId = null;
  if (projectReplyContext) projectReplyContext.hidden = true;
  if (projectReplyLabel) projectReplyLabel.textContent = '';
}

function setReplyContext(comment) {
  activeReplyParentId = comment?.id || null;
  if (!activeReplyParentId) return clearReplyContext();
  if (projectReplyLabel) projectReplyLabel.textContent = 'Replying to ' + (comment.author_name || 'comment');
  if (projectReplyContext) projectReplyContext.hidden = false;
  projectCommentInput?.focus();
}

function commentTimeLabel(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year:'numeric', month:'short', day:'numeric',
    hour:'numeric', minute:'2-digit'
  });
}

function commentBadges(comment) {
  const badges = [];
  if (comment.is_pinned) badges.push('<span class="comment-badge pinned">Pinned</span>');
  if (comment.is_hearted) badges.push('<span class="comment-badge hearted">♥ Licht</span>');
  if (Number(comment.admin_rating) > 0) {
    badges.push('<span class="comment-badge rating">' + '★'.repeat(Number(comment.admin_rating)) + '</span>');
  }
  return badges.join('');
}

function commentModerationHtml(comment) {
  if (!viewerRole.isEditor) return '';

  return `
    <div class="comment-moderation">
      <button type="button" data-comment-action="pin" data-comment-id="${comment.id}" data-value="${comment.is_pinned ? '0' : '1'}">${comment.is_pinned ? 'Unpin' : 'Pin'}</button>
      <button type="button" data-comment-action="heart" data-comment-id="${comment.id}" data-value="${comment.is_hearted ? '0' : '1'}">${comment.is_hearted ? 'Unheart' : 'Heart'}</button>
      <label>Rate
        <select data-comment-rating="${comment.id}">
          ${[0,1,2,3,4,5].map(n => `<option value="${n}"${Number(comment.admin_rating)===n?' selected':''}>${n || '—'}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="danger" data-comment-action="delete" data-comment-id="${comment.id}">Delete</button>
    </div>
  `;
}

function renderCommentNode(comment, children, depth = 0, seen = new Set()) {
  if (!comment || seen.has(comment.id) || depth > 4) return '';
  const nextSeen = new Set(seen);
  nextSeen.add(comment.id);

  const avatar = comment.author_type === 'editor'
    ? editorAvatarHtml(true)
    : guestAvatarHtml(comment.author_name, comment.avatar_seed, true);

  const replies = (children.get(comment.id) || [])
    .map(reply => renderCommentNode(reply, children, depth + 1, nextSeen))
    .join('');

  return `
    <article class="project-comment-item${comment.is_pinned ? ' is-pinned' : ''}${comment.author_type === 'editor' ? ' is-editor' : ''}" data-comment-id="${comment.id}" style="--comment-depth:${Math.min(depth,3)}">
      <div class="project-comment-item-avatar">${avatar}</div>
      <div class="project-comment-item-body">
        <div class="project-comment-item-head">
          <strong>${escapeProjectText(comment.author_name)}</strong>
          ${comment.author_type === 'editor' ? '<span class="comment-owner-tag">Owner</span>' : ''}
          <time>${escapeProjectText(commentTimeLabel(comment.created_at))}</time>
        </div>
        <div class="comment-badges">${commentBadges(comment)}</div>
        <p>${escapeProjectText(comment.body)}</p>
        <div class="project-comment-item-actions">
          <button type="button" data-comment-reply="${comment.id}">Reply</button>
        </div>
        ${commentModerationHtml(comment)}
        ${replies ? '<div class="project-comment-replies">' + replies + '</div>' : ''}
      </div>
    </article>
  `;
}

function renderComments() {
  if (!projectCommentsList) return;

  if (!activeComments.length) {
    projectCommentsList.innerHTML = '<p class="project-comments-empty">No comments yet. Start the conversation.</p>';
    return;
  }

  const byId = new Map(activeComments.map(comment => [comment.id, comment]));
  const children = new Map();
  const roots = [];

  activeComments.forEach(comment => {
    if (comment.parent_id && byId.has(comment.parent_id)) {
      const list = children.get(comment.parent_id) || [];
      list.push(comment);
      children.set(comment.parent_id, list);
    } else {
      roots.push(comment);
    }
  });

  roots.sort((a,b) =>
    Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
    new Date(a.created_at) - new Date(b.created_at)
  );

  projectCommentsList.innerHTML = roots.map(comment => renderCommentNode(comment, children)).join('');
}

async function loadProjectComments(project) {
  if (!projectCommentsList) return;

  if (!project?.id) {
    activeComments = [];
    projectCommentsList.innerHTML = '<p class="project-comments-empty">Comments are available on published CMS projects.</p>';
    return;
  }

  projectCommentsList.innerHTML = '<p class="project-comments-empty">Loading comments…</p>';

  try {
    const response = await fetch(
      window.LICHT_CMS_API + '?resource=comments&project_id=' + encodeURIComponent(project.id),
      { cache:'no-store' }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load comments');
    activeComments = Array.isArray(data.comments) ? data.comments : [];
    renderComments();
  } catch (error) {
    activeComments = [];
    projectCommentsList.innerHTML =
      '<p class="project-comments-empty error">' + escapeProjectText(error.message) + '</p>';
  }
}

async function prepareProjectViewer(project) {
  updateOwnerActions(false);
  clearReplyContext();

  if (projectCommentStatus) projectCommentStatus.textContent = '';
  if (projectCommentInput) projectCommentInput.value = '';

  const savedName = localStorage.getItem('licht-comment-guest-name') || '';
  if (projectCommentName) projectCommentName.value = savedName;

  try {
    await resolveViewerRole();
  } catch {
    viewerRole = { isEditor:false, session:null };
  }

  updateOwnerActions(viewerRole.isEditor);
  updateComposerAvatar();
  updateCommentSubmitState();
  await loadProjectComments(project);
}

async function submitProjectComment() {
  const project = projects[activeProjectIndex];
  if (!project?.id) return;

  const bodyText = projectCommentInput?.value.trim() || '';
  if (!bodyText) return;

  const payload = {
    action:'comment-create',
    project_id:project.id,
    parent_id:activeReplyParentId || '',
    body:bodyText
  };

  if (!viewerRole.isEditor) {
    const name = projectCommentName?.value.trim() || '';
    if (!name) {
      if (projectCommentStatus) projectCommentStatus.textContent = 'Enter your name first.';
      projectCommentName?.focus();
      return;
    }

    localStorage.setItem('licht-comment-guest-name', name);
    payload.author_name = name;
    payload.guest_key = ensureGuestKey();
    payload.avatar_seed = payload.guest_key;
  }

  projectCommentButton.disabled = true;
  projectCommentButton.textContent = activeReplyParentId ? 'Posting reply…' : 'Posting…';
  if (projectCommentStatus) projectCommentStatus.textContent = '';

  try {
    await cmsAction(payload, { auth:viewerRole.isEditor });
    projectCommentInput.value = '';
    clearReplyContext();
    if (projectCommentStatus) projectCommentStatus.textContent = 'Posted ✓';
    await loadProjectComments(project);
  } catch (error) {
    if (projectCommentStatus) projectCommentStatus.textContent = error.message;
  } finally {
    projectCommentButton.textContent = 'Post a Comment';
    updateCommentSubmitState();
  }
}

async function moderateComment(action, id, value) {
  if (!viewerRole.isEditor) return;
  const project = projects[activeProjectIndex];
  if (!project?.id) return;

  if (action === 'delete') {
    if (!confirm('Delete this comment and its replies?')) return;
    await cmsAction({ action:'comment-delete', id }, { auth:true });
  } else if (action === 'pin') {
    await cmsAction({ action:'comment-pin', id, value:value === '1' }, { auth:true });
  } else if (action === 'heart') {
    await cmsAction({ action:'comment-heart', id, value:value === '1' }, { auth:true });
  } else if (action === 'rate') {
    await cmsAction({ action:'comment-rate', id, value:Number(value) }, { auth:true });
  }

  await loadProjectComments(project);
}

function projectStorageKey(prefix, project) {
  return 'licht-' + prefix + '-' + String(project?.id || project?.title || 'project');
}

function projectPublishedLabel(project) {
  const raw = project?.updatedAt || project?.createdAt || '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return 'Published: ' + date.toLocaleDateString(undefined, {
    year:'numeric', month:'long', day:'numeric'
  });
}

function projectRelatedHtml(currentIndex) {
  return projects
    .map((project,index)=>({project,index}))
    .filter(item=>item.index!==currentIndex)
    .slice(0,4)
    .map(({project,index})=>{
      const style=project.cover
        ? ` style="background-image:url('${String(project.cover).replace(/'/g,'%27')}')"`
        : '';
      const cls=project.cover?'':(project.art||'');
      return `
        <button type="button" class="project-related-card" data-related-project="${index}">
          <span class="project-related-art ${cls}"${style}></span>
          <strong>${escapeProjectText(project.title)}</strong>
          <small>${escapeProjectText(project.categoryLabel)}</small>
        </button>
      `;
    }).join('');
}

function syncProjectActionState(project) {
  const saved = localStorage.getItem(projectStorageKey('saved',project)) === '1';
  const appreciated = localStorage.getItem(projectStorageKey('appreciated',project)) === '1';
  const likes = appreciated ? 1 : 0;

  projectSaveAction?.classList.toggle('active',saved);
  projectAppreciateAction?.classList.toggle('active',appreciated);

  const saveLabel=projectSaveAction?.querySelector('span');
  const appreciateLabel=projectAppreciateAction?.querySelector('span');
  if (saveLabel) saveLabel.textContent=saved?'Saved':'Save';
  if (appreciateLabel) appreciateLabel.textContent=appreciated?'Appreciated':'Appreciate';

  if (dialogAppreciationCount) dialogAppreciationCount.textContent=String(likes);
  if (dialogLikeCount) dialogLikeCount.textContent=String(likes);
}

function openProject(index) {
  const project = projects[index];
  if (!project) return;

  activeProjectIndex = index;
  dialogMeta.textContent = project.categoryLabel;
  dialogTitle.textContent = project.title;
  if (dialogTopTitle) dialogTopTitle.textContent = project.title;
  if (dialogOwnerProjectTitle) dialogOwnerProjectTitle.textContent = project.title;
  if (dialogOwnerProjectMeta) dialogOwnerProjectMeta.textContent = project.categoryLabel || 'Licht Arts';
  if (dialogPublishedDate) dialogPublishedDate.textContent = projectPublishedLabel(project);
  dialogDescription.innerHTML = projectContentHtml(project);
  dialogTags.innerHTML = (project.tags || []).map(tag => `<span>${escapeProjectText(tag)}</span>`).join('');
  if (dialogRelatedProjects) dialogRelatedProjects.innerHTML = projectRelatedHtml(index);

  const viewKey = projectStorageKey('views',project);
  const views = Math.max(1,Number(localStorage.getItem(viewKey)||0)+1);
  localStorage.setItem(viewKey,String(views));
  if (dialogViewCount) dialogViewCount.textContent=String(views);
  syncProjectActionState(project);

  if (projectCommentInput) projectCommentInput.value='';
  if (projectCommentButton) projectCommentButton.disabled=true;

  const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};
  const style = settings.style && typeof settings.style === 'object' ? settings.style : {};
  const background = /^#[0-9a-f]{6}$/i.test(style.background || '') ? style.background : '';
  const spacing = Number.isFinite(Number(style.spacing)) ? Math.max(0,Math.min(80,Number(style.spacing))) : 28;
  const rounded = style.rounded !== false;

  if (background) {
    const r=parseInt(background.slice(1,3),16);
    const g=parseInt(background.slice(3,5),16);
    const b=parseInt(background.slice(5,7),16);
    const lum=(0.2126*r+0.7152*g+0.0722*b)/255;
    dialog.style.setProperty('--project-bg',background);
    dialog.style.setProperty('--project-fg',lum>.58?'#0b0c0b':'#f4f6f1');
    dialog.style.setProperty('--project-muted',lum>.58?'#59615b':'#aab2aa');
  } else {
    dialog.style.removeProperty('--project-bg');
    dialog.style.removeProperty('--project-fg');
    dialog.style.removeProperty('--project-muted');
  }

  dialog.style.setProperty('--project-spacing',spacing+'px');
  dialog.classList.toggle('project-square',!rounded);

  dialogDescription.querySelectorAll('blockquote[data-project-embed] a').forEach(link => {
    let parsed;
    try { parsed=new URL(link.href); } catch { return; }
    const host=parsed.hostname.replace(/^www\./,'').toLowerCase();
    const allowed=['sketchfab.com','youtube.com','youtu.be','vimeo.com'].some(domain=>host===domain||host.endsWith('.'+domain));
    if (!allowed) return;

    let src=link.href;
    if (host==='youtu.be') src='https://www.youtube.com/embed/'+parsed.pathname.replace(/^\//,'');
    else if (host.endsWith('youtube.com')&&parsed.searchParams.get('v')) src='https://www.youtube.com/embed/'+parsed.searchParams.get('v');
    else if (host.endsWith('vimeo.com')&&!host.startsWith('player.')) src='https://player.vimeo.com/video/'+parsed.pathname.split('/').filter(Boolean).pop();

    const frame=document.createElement('iframe');
    frame.src=src;
    frame.loading='lazy';
    frame.allowFullscreen=true;
    frame.allow='autoplay; fullscreen; xr-spatial-tracking';
    link.closest('blockquote')?.replaceWith(frame);
  });

  if (!dialog.open) dialog.showModal();
  void prepareProjectViewer(project);

  dialogRelatedProjects?.querySelectorAll('[data-related-project]').forEach(card => {
    card.addEventListener('click', () => openProject(Number(card.dataset.relatedProject)));
  });
}

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem('licht-theme', theme);
  const themeColor = theme === 'dark' ? '#081009' : '#f5f3eb';
  document.querySelector('meta[name="theme-color"]').content = themeColor;
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

async function loadCmsProjects() {
  const api = window.LICHT_CMS_API;
  if (!api) return;

  try {
    const response = await fetch(api + '?resource=projects', { cache:'no-store' });
    if (!response.ok) return;

    const data = await response.json();
    if (!Array.isArray(data.projects) || !data.projects.length) return;

    const normalizeCategory = value => {
      const category = String(value || '').toLowerCase();
      if (category.includes('illustr')) return 'illustration';
      if (category.includes('brand') || category.includes('identity') || category.includes('editorial')) return 'identity';
      return 'digital';
    };

    projects = data.projects.map((project, index) => ({
      id: project.id,
      title: project.title,
      category: normalizeCategory(project.category),
      categoryLabel: project.category || 'Project',
      description: project.excerpt || project.description || '',
      excerpt: project.excerpt || project.description || '',
      content: project.content || project.description || '',
      cover: project.cover || '',
      art: project.cover ? '' : fallbackProjects[index % fallbackProjects.length]?.art,
      tags: Array.isArray(project.tags) ? project.tags : [],
      behanceUrl: project.behance_url || '',
      settings: project.settings || {},
      createdAt: project.created_at || '',
      updatedAt: project.updated_at || ''
    }));

    renderProjects();
  } catch {
    // Keep local fallback projects when the CMS is unavailable.
  }
}

setTheme(localStorage.getItem('licht-theme') || 'light');

themeToggle.addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});

filters.forEach(button => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach(filter => filter.classList.toggle('active', filter === button));
    renderProjects();
  });
});

document.querySelector('#showAllWork').addEventListener('click', () => {
  activeFilter = 'all';
  filters.forEach(filter => filter.classList.toggle('active', filter.dataset.filter === 'all'));
  renderProjects();
  projectGrid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());

dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!inside) dialog.close();
});

projectSaveAction?.addEventListener('click', () => {
  const project=projects[activeProjectIndex];
  if(!project) return;
  const key=projectStorageKey('saved',project);
  const next=localStorage.getItem(key)!=='1';
  localStorage.setItem(key,next?'1':'0');
  syncProjectActionState(project);
});

projectAppreciateAction?.addEventListener('click', () => {
  const project=projects[activeProjectIndex];
  if(!project) return;
  const key=projectStorageKey('appreciated',project);
  const next=localStorage.getItem(key)!=='1';
  localStorage.setItem(key,next?'1':'0');
  syncProjectActionState(project);
});

projectShareAction?.addEventListener('click', async () => {
  const project=projects[activeProjectIndex];
  if(!project) return;
  const shareData={title:project.title,text:project.excerpt||project.description||project.title,url:location.href};
  try{
    if(navigator.share) await navigator.share(shareData);
    else{
      await navigator.clipboard.writeText(location.href);
      const label=projectShareAction.querySelector('span');
      if(label){ const old=label.textContent; label.textContent='Copied'; setTimeout(()=>label.textContent=old,1400); }
    }
  }catch{}
});

projectToolsAction?.addEventListener('click', () => {
  dialogTags?.scrollIntoView({behavior:prefersReducedMotion?'auto':'smooth',block:'center'});
});

projectCommentInput?.addEventListener('input', updateCommentSubmitState);

projectCommentName?.addEventListener('input', () => {
  localStorage.setItem('licht-comment-guest-name', projectCommentName.value.trim());
  updateComposerAvatar();
  updateCommentSubmitState();
});

projectReplyCancel?.addEventListener('click', () => {
  clearReplyContext();
  updateCommentSubmitState();
});

projectCommentButton?.addEventListener('click', () => {
  void submitProjectComment();
});

projectCommentsList?.addEventListener('click', event => {
  const replyButton = event.target.closest('[data-comment-reply]');
  if (replyButton) {
    const comment = activeComments.find(item => item.id === replyButton.dataset.commentReply);
    if (comment) setReplyContext(comment);
    return;
  }

  const actionButton = event.target.closest('[data-comment-action]');
  if (!actionButton) return;

  void moderateComment(
    actionButton.dataset.commentAction,
    actionButton.dataset.commentId,
    actionButton.dataset.value
  ).catch(error => {
    if (projectCommentStatus) projectCommentStatus.textContent = error.message;
  });
});

projectCommentsList?.addEventListener('change', event => {
  const select = event.target.closest('[data-comment-rating]');
  if (!select) return;

  void moderateComment('rate', select.dataset.commentRating, select.value).catch(error => {
    if (projectCommentStatus) projectCommentStatus.textContent = error.message;
  });
});

let revealObserver;

function observeReveals() {
  if (revealObserver) revealObserver.disconnect();

  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal:not(.visible)').forEach(element => revealObserver.observe(element));
}

const sectionObserver = new IntersectionObserver(entries => {
  const current = entries
    .filter(entry => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

  if (!current) return;

  const section = current.target.dataset.section;

  document.querySelectorAll('.rail-item').forEach(link => {
    link.classList.toggle('active', link.dataset.section === section);
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${section}`);
  });
}, {
  rootMargin: '-24% 0px -48% 0px',
  threshold: [0.1, 0.35, 0.65]
});

document.querySelectorAll('.section-observed').forEach(section => sectionObserver.observe(section));

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 18);
}, { passive: true });

function cleanSectionUrl() {
  if (!location.hash) return;
  history.replaceState(null, '', location.pathname + location.search);
}

function scrollToSection(target, behavior = prefersReducedMotion ? 'auto' : 'smooth') {
  if (!target) return;
  target.scrollIntoView({ behavior, block: 'start' });
  cleanSectionUrl();
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();
    scrollToSection(target);
  });
});

// Preserve direct section links, but remove the fragment from the address bar
// after the browser has navigated to the requested section.
if (location.hash) {
  const initialTarget = document.querySelector(location.hash);
  if (initialTarget) {
    requestAnimationFrame(() => {
      initialTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
      cleanSectionUrl();
    });
  } else {
    cleanSectionUrl();
  }
}

window.addEventListener('hashchange', () => {
  if (!location.hash) return;
  const target = document.querySelector(location.hash);
  if (target) scrollToSection(target, 'auto');
  else cleanSectionUrl();
});

if (!prefersReducedMotion && window.matchMedia('(pointer:fine)').matches) {
  const hero = document.querySelector('.hero');
  const layers = [...hero.querySelectorAll('.scene-img[data-depth]')];
  let frame = 0;

  hero.addEventListener('pointermove', event => {
    if (frame) return;

    frame = requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;

      layers.forEach(layer => {
        const depth = Number(layer.dataset.depth || 0.25);
        const x = nx * -28 * depth;
        const y = ny * -20 * depth;
        layer.style.setProperty('--layer-x', `${x}px`);
        layer.style.setProperty('--layer-y', `${y}px`);
      });

      frame = 0;
    });
  });

  hero.addEventListener('pointerleave', () => {
    layers.forEach(layer => {
      layer.style.setProperty('--layer-x', '0px');
      layer.style.setProperty('--layer-y', '0px');
    });
  });
}

renderProjects();
loadCmsProjects();
observeReveals();
