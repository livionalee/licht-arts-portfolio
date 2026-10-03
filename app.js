const projects = [
  {
    title: 'Lumen Studio',
    category: 'identity',
    categoryLabel: 'Brand Identity',
    description: 'A conceptual brand and visual system exploring clarity, creative energy, and forward momentum.',
    art: 'art-identity',
    tags: ['Identity', 'Art Direction', 'Visual System']
  },
  {
    title: 'Fragments of a Brighter Tomorrow',
    category: 'editorial',
    categoryLabel: 'Editorial Design',
    description: 'A visual series about growth, perspective, and change — built around spatial typography and luminous green contrasts.',
    art: 'art-editorial',
    tags: ['Editorial', 'Layout', 'Typography']
  },
  {
    title: 'Digital Garden',
    category: 'game',
    categoryLabel: 'Game / Digital',
    description: 'A dark interface and key-art experiment combining environmental storytelling with a controlled neon accent system.',
    art: 'art-game',
    tags: ['Game Art', 'Interface', 'Key Visual']
  },
  {
    title: 'Living Signal',
    category: 'identity',
    categoryLabel: 'Visual System',
    description: 'An evolving identity study built from light, motion, high-contrast fields, and adaptable composition rules.',
    art: 'art-motion',
    tags: ['Motion', 'Identity', 'Campaign']
  },
  {
    title: 'Afterlight Archive',
    category: 'editorial',
    categoryLabel: 'Editorial / Archive',
    description: 'A publication concept where image, white space, and pace work together like a cinematic sequence.',
    art: 'art-editorial',
    tags: ['Publication', 'Editorial', 'Grid']
  },
  {
    title: 'Neon Habitat',
    category: 'game',
    categoryLabel: 'Game / Digital',
    description: 'An immersive art direction study for digital worlds: crisp interface logic against atmospheric environments.',
    art: 'art-game',
    tags: ['Environment', 'HUD', 'Digital Art']
  }
];

const root = document.documentElement;
const body = document.body;
const projectGrid = document.querySelector('#projectGrid');
const filters = [...document.querySelectorAll('.filter')];
const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = document.querySelector('.theme-icon');
const header = document.querySelector('.site-header');
const dialog = document.querySelector('#projectDialog');
const dialogArt = document.querySelector('#dialogArt');
const dialogMeta = document.querySelector('#dialogMeta');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogDescription = document.querySelector('#dialogDescription');
const dialogTags = document.querySelector('#dialogTags');
const slideNumber = document.querySelector('#slideNumber');
const progressBar = document.querySelector('#progressBar');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeFilter = 'all';
let slide = 1;

function renderProjects() {
  const visible = projects.filter(project => activeFilter === 'all' || project.category === activeFilter);
  projectGrid.innerHTML = visible.map((project, index) => `
    <article class="project-card reveal" tabindex="0" role="button" aria-label="Open ${project.title}" data-project="${projects.indexOf(project)}">
      <div class="project-art ${project.art}"></div>
      <div class="project-info">
        <span class="project-index">${String(index + 1).padStart(2,'0')} / ${project.categoryLabel}</span>
        <h3>${project.title}</h3>
        <p>${project.description}</p>
        <span class="project-arrow">↗</span>
      </div>
    </article>
  `).join('');

  observeReveals();
  [...projectGrid.querySelectorAll('.project-card')].forEach(card => {
    card.addEventListener('click', () => openProject(Number(card.dataset.project)));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProject(Number(card.dataset.project));
      }
    });
  });
}

function openProject(index) {
  const project = projects[index];
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
  themeIcon.textContent = theme === 'dark' ? '☼' : '☾';
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#061107' : '#f5f6f1';
}

const savedTheme = localStorage.getItem('licht-theme');
setTheme(savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

themeToggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

filters.forEach(button => {
  button.addEventListener('click', () => {
    filters.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    renderProjects();
  });
});

document.querySelector('#showAllWork').addEventListener('click', () => {
  activeFilter = 'all';
  filters.forEach(item => item.classList.toggle('active', item.dataset.filter === 'all'));
  renderProjects();
  projectGrid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
});

function changeSlide(direction) {
  slide += direction;
  if (slide > 3) slide = 1;
  if (slide < 1) slide = 3;
  body.dataset.slide = String(slide);
  slideNumber.textContent = `0${slide}`;
  progressBar.style.width = `${slide * 33.333}%`;
}

document.querySelector('#nextSlide').addEventListener('click', () => changeSlide(1));
document.querySelector('#prevSlide').addEventListener('click', () => changeSlide(-1));

let revealObserver;
function observeReveals() {
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
}

const sectionObserver = new IntersectionObserver(entries => {
  const current = entries
    .filter(entry => entry.isIntersecting)
    .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!current) return;
  const section = current.target.dataset.section;
  document.querySelectorAll('.rail-item').forEach(link => link.classList.toggle('active', link.dataset.section === section));
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${section}`));
}, { rootMargin: '-25% 0px -45% 0px', threshold: [0.1,0.35,0.7] });

document.querySelectorAll('.section-observed').forEach(section => sectionObserver.observe(section));
window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 24), { passive:true });

if (!prefersReducedMotion && window.matchMedia('(pointer:fine)').matches) {
  const stage = document.querySelector('.art-stage');
  let raf = 0;
  stage.addEventListener('pointermove', event => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      document.querySelectorAll('.poster').forEach(poster => {
        const depth = Number(poster.dataset.depth || .5);
        poster.style.translate = `${x * 12 * depth}px ${y * 10 * depth}px`;
      });
      raf = 0;
    });
  });
  stage.addEventListener('pointerleave', () => document.querySelectorAll('.poster').forEach(poster => poster.style.translate = '0 0'));
}

renderProjects();
observeReveals();
