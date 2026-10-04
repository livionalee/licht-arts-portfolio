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
const dialogArt = document.querySelector('#dialogArt');
const dialogMeta = document.querySelector('#dialogMeta');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogDescription = document.querySelector('#dialogDescription');
const dialogTags = document.querySelector('#dialogTags');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeFilter = 'all';

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

function openProject(index) {
  const project = projects[index];
  if (!project) return;

  // The project cover is only a gallery thumbnail.
  // Rich-content images belong inside the case-study body.
  dialogArt.hidden = true;
  dialogArt.className = 'dialog-art';
  dialogArt.style.backgroundImage = '';
  dialogMeta.textContent = project.categoryLabel;
  dialogTitle.textContent = project.title;
  dialogDescription.innerHTML = projectContentHtml(project);
  dialogTags.innerHTML = (project.tags || []).map(tag => `<span>${escapeProjectText(tag)}</span>`).join('');

  if (!dialog.open) dialog.showModal();
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
      behanceUrl: project.behance_url || ''
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
