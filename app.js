const projects = [
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

function renderProjects() {
  const visibleProjects = projects.filter(project => activeFilter === 'all' || project.category === activeFilter);

  projectGrid.innerHTML = visibleProjects.map((project, index) => {
    const projectIndex = projects.indexOf(project);
    return `
      <article class="project-card reveal" tabindex="0" role="button" aria-label="Open ${project.title}" data-project="${projectIndex}">
        <div class="project-art ${project.art}"></div>
        <div class="project-info">
          <span class="project-index">${String(index + 1).padStart(2, '0')}</span>
          <div class="project-copy">
            <h3>${project.title}</h3>
            <p>${project.categoryLabel}</p>
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

  dialogArt.className = `dialog-art project-art ${project.art}`;
  dialogMeta.textContent = project.categoryLabel;
  dialogTitle.textContent = project.title;
  dialogDescription.textContent = project.description;
  dialogTags.innerHTML = project.tags.map(tag => `<span>${tag}</span>`).join('');

  if (!dialog.open) dialog.showModal();
}

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem('licht-theme', theme);
  const themeColor = theme === 'dark' ? '#081009' : '#f5f3eb';
  document.querySelector('meta[name="theme-color"]').content = themeColor;
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
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
observeReveals();
