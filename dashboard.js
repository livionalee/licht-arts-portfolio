(() => {
  const api = window.LICHT_CMS_API;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const login = $('#dashLogin');
  const shell = $('#dashboardShell');
  const loginForm = $('#dashLoginForm');
  const loginStatus = $('#dashLoginStatus');
  const syncPill = $('#syncPill');
  const title = $('#dashboardTitle');

  const projects = [
    { title:'Beyond the Clouds', type:'Digital Illustration', image:'assets/work-1.webp', description:'Environmental illustration and visual storytelling.' },
    { title:'Quiet Growth', type:'Brand & Visual Design', image:'assets/work-2.webp', description:'Botanical identity and visual-system exploration.' },
    { title:'Daily Fragments', type:'Illustration Series', image:'assets/work-3.webp', description:'Sketchbook-inspired observational illustration series.' },
    { title:'Verdant Signal', type:'Digital Experience', image:'assets/work-1.webp', description:'Digital-art and interface composition study.' },
    { title:'Field Notes', type:'Editorial / Identity', image:'assets/work-2.webp', description:'Editorial structure mixed with botanical details.' },
    { title:'Green Horizon', type:'Environment & Key Art', image:'assets/work-3.webp', description:'Scenic key-art and environment exploration.' }
  ];

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
    title.textContent = ({overview:'Overview',projects:'Projects',media:'Media',settings:'Site Settings'})[name] || 'Dashboard';
    history.replaceState(null, '', '#' + name);
  }

  function renderProjects() {
    $('#projectAdminGrid').innerHTML = projects.map(function(project, index) {
      return '<article class="project-admin-card">' +
        '<div class="project-admin-art" style="background-image:url(\'' + project.image + '\')"></div>' +
        '<div class="project-admin-copy">' +
        '<span>' + String(index + 1).padStart(2,'0') + ' · ' + project.type + '</span>' +
        '<h3>' + project.title + '</h3>' +
        '<p>' + project.description + '</p>' +
        '</div></article>';
    }).join('');
  }

  async function hydrateDashboard() {
    syncPill.classList.remove('ok');
    syncPill.innerHTML = '<i></i>Checking…';

    const [published, draft, revisions] = await Promise.all([
      publicConfig(),
      apiCall({ action:'draft-get' }),
      apiCall({ action:'revisions' })
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
      await hydrateDashboard();
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

  renderProjects();

  async function boot() {
    const hash = location.hash.replace('#','');
    if (['overview','projects','media','settings'].includes(hash)) setTab(hash);

    if (!session?.access_token) return;

    try {
      login.hidden = true;
      shell.hidden = false;
      await hydrateDashboard();
    } catch {
      localStorage.removeItem('licht-atelier-session');
      session = null;
      login.hidden = false;
      shell.hidden = true;
    }
  }

  boot();
})();