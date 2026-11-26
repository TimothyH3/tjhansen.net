/**
 * =============================================================================
 * Timothy Hansen — Portfolio Engine (tjhansen.net)
 * =============================================================================
 * Architecture:
 * 1. THEME MANAGER: Auto system preference detection + manual dark/light toggle
 * 2. 3-STAGE OPTICAL ENGINE:
 *    - Act 0 (Overview & Profile): Continuous vertical scroll with hero docking
 *    - Transition (Act 0 -> Act 1): Smooth fade & cascade into projects
 *    - Act 1 (Work & Stack): Direct vertical scroll through projects and tech stack
 *    - Transition (Act 1 -> Act 2): Hardware-accelerated optical zoom
 *    - Act 2 (Contact): Centered connection card with direct action links
 * 3. 3-STAGE NAVIGATION HUD: Live dot indicators and theme mode switcher
 * 4. PROJECT DEMO MODALS: Full-screen interactive demo views with escape triggers
 * 5. ARCHITECTURAL SPEC DRAWER: Technical deep dives, concurrency specs & metrics
 * 6. INTERACTIVE SIMULATION TOYS:
 *    - Come Together Compass (Census Geocoder & 988 Crisis Wipe)
 *    - Starlink Tracker (Ray-Casting Intersect Query & Surcharge Overlay)
 * 7. UTILITIES: One-click clipboard copy with animated toast notification
 * 8. TERMINAL ENTRANCE: Graceful in-place typing morph for hero title
 * =============================================================================
 */

(function () {
  'use strict';

  // Force browser to always restore scroll to top on reload/refresh
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.addEventListener('beforeunload', function () {
    window.scrollTo(0, 0);
  });
  window.scrollTo(0, 0);

  // ===========================================================================
  // 1. SAFE STORAGE HELPER
  // Prevents SecurityError on restricted origins (e.g., file:// or private sandbox)
  // ===========================================================================
  const safeStorage = {
    get: function (key, fallback) {
      try {
        return localStorage.getItem(key) || fallback;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, val) {
      try {
        localStorage.setItem(key, val);
      } catch (e) { }
    }
  };

  // ===========================================================================
  // 2. THEME CONTROLLER (System Auto-Detect + Manual Switcher)
  // ===========================================================================
  function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeModeText = document.getElementById('theme-mode-text');
    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    let savedTheme = safeStorage.get('portfolio-theme-mode', 'auto');

    function applyTheme(mode) {
      let resolvedTheme = mode;
      if (mode === 'auto') {
        resolvedTheme = (mediaQuery && mediaQuery.matches) ? 'dark' : 'light';
      }

      document.documentElement.setAttribute('data-theme', resolvedTheme);
      safeStorage.set('portfolio-theme-mode', mode);

      if (themeModeText) {
        themeModeText.textContent = resolvedTheme.toUpperCase();
      }

      if (themeToggleBtn) {
        themeToggleBtn.setAttribute('aria-checked', resolvedTheme === 'dark' ? 'true' : 'false');
        themeToggleBtn.setAttribute('title', `Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`);
      }
    }

    applyTheme(savedTheme);

    if (mediaQuery) {
      try {
        mediaQuery.addEventListener('change', function () {
          if (safeStorage.get('portfolio-theme-mode', 'auto') === 'auto') {
            applyTheme('auto');
          }
        });
      } catch (e) {
        if (mediaQuery.addListener) {
          mediaQuery.addListener(function () {
            if (safeStorage.get('portfolio-theme-mode', 'auto') === 'auto') {
              applyTheme('auto');
            }
          });
        }
      }
    }

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', function () {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }
  }

  // ===========================================================================
  // 3. NATIVE SCROLL ENGINE & HUD SCROLL-SPY
  // Standard default webpage scrolling: 100% native browser wheel & touch momentum
  // ===========================================================================
  let globalEngine = null;

  function initScrollAndZoomEngine() {
    const hudDots = Array.from(document.querySelectorAll('.hud-dot'));
    const bgOrange = document.getElementById('bg-orange');
    const bgBlue = document.getElementById('bg-blue');

    const act0 = document.getElementById('act-0');
    const act0Wrapper = document.getElementById('act0-viewport-wrapper');
    const act0StagedFlow = document.getElementById('act0-staged-flow');
    const sectionHero = document.getElementById('section-hero');
    const sectionProfile = document.getElementById('section-profile');
    const act1 = document.getElementById('act-1');
    const act2 = document.getElementById('act-2');
    const sectionProjects = document.getElementById('section-projects');
    const sectionStack = document.getElementById('section-stack');
    const stackCard = sectionStack ? sectionStack.querySelector('.content-block') : null;

    // Bento Cards Direct Controller
    const bentoCards = Array.from(document.querySelectorAll('#section-projects .project-bento-card'));
    let bentoCardsVisible = false;

    function setBentoCardsVisible(visible) {
      if (bentoCardsVisible === visible) return;
      bentoCardsVisible = visible;
      bentoCards.forEach(card => {
        if (visible) {
          card.classList.add('is-visible');
        } else {
          card.classList.remove('is-visible');
        }
      });
    }

    // Act 0 & Layout Metrics Precalculation (Computed strictly on load and resize to eliminate scroll reflows)
    let cachedMetrics = {
      vh: typeof window !== 'undefined' ? window.innerHeight : 800,
      docHeight: 1,
      act0Top: 0,
      act0Scrollable: 0,
      travelPhase1: 0,
      exitDistance: 60,
      act1Top: 0,
      act2Top: 0,
      stackTop: 0,
      heroCenterShift: 240,
      profileSlideDistance: 95,
      profileCenterShift: 380
    };

    function measureLayoutGeometry() {
      const vh = window.innerHeight;
      const scrollHeight = document.documentElement.scrollHeight;
      const docHeight = Math.max(1, scrollHeight - vh);

      const act0Top = act0 ? act0.offsetTop : 0;
      const act0Height = act0 ? act0.offsetHeight : vh * 1.55;
      const act0Scrollable = Math.max(vh * 0.35, act0Height - vh);
      const travelPhase1 = act0Scrollable * 0.48;
      const exitDistance = Math.max(50, act0Scrollable - travelPhase1);

      const act1Top = act1 ? act1.offsetTop : 0;
      const act2Top = act2 ? act2.offsetTop : 0;

      // Absolute position of Skills section
      let stackTop = 0;
      if (sectionStack) {
        stackTop = act1Top + sectionStack.offsetTop;
      }

      let heroCenterShift = 240;
      let profileSlideDistance = 95;
      let profileCenterShift = 380;

      if (sectionHero && sectionProfile) {
        const heroContent = sectionHero.querySelector('.content-block');
        const profileContent = sectionProfile.querySelector('.content-block');

        const heroHeight = heroContent ? heroContent.offsetHeight : (vh * 0.36);
        const profileHeight = profileContent ? profileContent.offsetHeight : (vh * 0.32);

        const heroInitialTop = Math.max(16, (vh - heroHeight) / 2);
        const slightGap = Math.min(32, Math.max(22, Math.round(vh * 0.03)));
        const targetProfileCenterTop = Math.max(16, Math.round((vh - profileHeight) / 2));
        const profileOffsetTop = sectionProfile.offsetTop || (vh * 0.85);
        profileCenterShift = Math.max(0, profileOffsetTop - targetProfileCenterTop);
        const heroTargetTopAtCenter = targetProfileCenterTop - slightGap - heroHeight;
        heroCenterShift = Math.max(0, heroInitialTop - heroTargetTopAtCenter);
        profileSlideDistance = Math.max(70, Math.min(120, Math.round(vh * 0.12)));
      }

      cachedMetrics = {
        vh,
        docHeight,
        act0Top,
        act0Scrollable,
        travelPhase1,
        exitDistance,
        act1Top,
        act2Top,
        stackTop,
        heroCenterShift: Math.round(heroCenterShift),
        profileSlideDistance,
        profileCenterShift: Math.round(profileCenterShift)
      };
    }
    measureLayoutGeometry();

    // HUD Indicator
    let currentActIndex = -1;
    function updateHUD(actIdx) {
      if (currentActIndex !== actIdx) {
        currentActIndex = actIdx;
        hudDots.forEach((dot, i) => {
          dot.classList.toggle('active', i === actIdx);
        });
      }
    }

    // Native Scroll Engine (Pure Calculation Frame, Zero Layout Queries)
    function onNativeScroll(scrollY) {
      const isMobile = window.innerWidth <= 768;

      // On mobile devices, skip complex scroll transforms altogether for silky-smooth 60/120fps native touch scrolling.
      if (isMobile) {
        setBentoCardsVisible(true);
        if (act0) act0.style.pointerEvents = 'auto';
        if (act1) {
          act1.style.opacity = '1';
          act1.style.transform = 'none';
          act1.style.pointerEvents = 'auto';
        }
        if (sectionHero) {
          sectionHero.style.transform = 'none';
          sectionHero.style.opacity = '1';
        }
        if (sectionProfile) {
          sectionProfile.style.transform = 'none';
          sectionProfile.style.opacity = '1';
          sectionProfile.style.pointerEvents = 'auto';
        }
        if (stackCard) {
          stackCard.style.maxWidth = '100%';
          stackCard.style.transform = 'none';
          stackCard.style.pointerEvents = 'auto';
        }

        // Keep HUD indicator accurate on mobile
        const { vh, act1Top, act2Top } = cachedMetrics;
        if (act2Top && scrollY + vh * 0.4 >= act2Top) {
          updateHUD(2);
        } else if (act1Top && scrollY + vh * 0.4 >= act1Top) {
          updateHUD(1);
        } else {
          updateHUD(0);
        }
        return;
      }

      const {
        vh,
        docHeight,
        act0Top,
        act0Scrollable,
        travelPhase1,
        exitDistance,
        act1Top,
        act2Top,
        stackTop,
        heroCenterShift,
        profileSlideDistance,
        profileCenterShift
      } = cachedMetrics;

      const progress = docHeight > 0 ? Math.max(0, Math.min(1, scrollY / docHeight)) : 0;

      // Ambient Background Atmosphere
      if (bgOrange) {
        const orangeOpacity = Math.max(0.18, 1.0 - progress * 0.82).toFixed(3);
        const orangeShiftY = (progress * 45).toFixed(1);
        bgOrange.style.opacity = orangeOpacity;
        bgOrange.style.transform = `translate3d(0, ${orangeShiftY}px, 0)`;
      }
      if (bgBlue) {
        const blueOpacity = Math.min(1.0, 0.12 + progress * 0.88).toFixed(3);
        const blueShiftY = ((1 - progress) * -35).toFixed(1);
        bgBlue.style.opacity = blueOpacity;
        bgBlue.style.transform = `translate3d(0, ${blueShiftY}px, 0)`;
      }

      // Act 0 Stage Choreography & Handover
      if (act0 && sectionHero && sectionProfile) {
        const relativeScroll = Math.max(0, scrollY - act0Top);

        if (relativeScroll <= travelPhase1) {
          const p = Math.max(0, Math.min(1, relativeScroll / travelPhase1));
          const ease = p * p * (3 - 2 * p);

          sectionHero.style.transform = `translate3d(0, ${(-ease * heroCenterShift).toFixed(1)}px, 0)`;
          sectionHero.style.opacity = '1';
          sectionHero.style.pointerEvents = 'auto';

          const slideFromBelow = (1 - ease) * profileSlideDistance;
          const dockOffset = ease * profileCenterShift;
          const currentProfileY = slideFromBelow - dockOffset;
          sectionProfile.style.transform = `translate3d(0, ${currentProfileY.toFixed(1)}px, 0)`;

          const profileOpacity = Math.min(1, p * 2.2);
          sectionProfile.style.opacity = profileOpacity.toFixed(3);
          sectionProfile.style.pointerEvents = profileOpacity > 0.4 ? 'auto' : 'none';

          if (act0) {
            act0.style.pointerEvents = 'auto';
          }

          if (act0Wrapper) {
            act0Wrapper.style.transform = 'translate3d(0, 0, 0)';
            act0Wrapper.style.opacity = '1';
            act0Wrapper.style.pointerEvents = 'auto';
          }

          if (act1) {
            act1.style.opacity = '0';
            act1.style.transform = 'translate3d(0, 36px, 0)';
            act1.style.pointerEvents = 'none';
          }
          setBentoCardsVisible(false);
        } else {
          // Phase 2: Act 0 exit, gap, and Act 1 entrance
          sectionHero.style.transform = `translate3d(0, -${heroCenterShift.toFixed(1)}px, 0)`;
          sectionHero.style.opacity = '1';
          sectionHero.style.pointerEvents = 'auto';

          sectionProfile.style.transform = `translate3d(0, -${profileCenterShift.toFixed(1)}px, 0)`;
          sectionProfile.style.opacity = '1';
          sectionProfile.style.pointerEvents = 'auto';

          const p2 = Math.min(1, (relativeScroll - travelPhase1) / exitDistance);
          const exitEnd = 0.30;
          const enterStart = 0.18;
          const cardsRevealProgress = 0.60;

          if (p2 <= exitEnd) {
            const exitP = p2 / exitEnd;
            const exitEase = exitP * exitP * (3 - 2 * exitP);

            if (act0) {
              act0.style.pointerEvents = 'auto';
            }

            if (act0Wrapper) {
              act0Wrapper.style.transform = `translate3d(0, ${(-exitEase * 0.45 * vh).toFixed(1)}px, 0)`;
              act0Wrapper.style.opacity = Math.max(0, 1 - exitEase).toFixed(3);
              act0Wrapper.style.pointerEvents = exitEase > 0.75 ? 'none' : 'auto';
            }

            if (act1) {
              act1.style.opacity = '0';
              act1.style.transform = 'translate3d(0, 36px, 0)';
              act1.style.pointerEvents = 'none';
            }
            setBentoCardsVisible(false);
          } else if (p2 < enterStart) {
            if (act0) {
              act0.style.pointerEvents = 'none';
            }
            if (act0Wrapper) {
              act0Wrapper.style.transform = `translate3d(0, ${(-0.45 * vh).toFixed(1)}px, 0)`;
              act0Wrapper.style.opacity = '0';
              act0Wrapper.style.pointerEvents = 'none';
            }

            if (act1) {
              act1.style.opacity = '0';
              act1.style.transform = 'translate3d(0, 36px, 0)';
              act1.style.pointerEvents = 'none';
            }
            setBentoCardsVisible(false);
          } else {
            if (act0) {
              act0.style.pointerEvents = 'none';
            }
            if (act0Wrapper) {
              act0Wrapper.style.transform = `translate3d(0, ${(-0.45 * vh).toFixed(1)}px, 0)`;
              act0Wrapper.style.opacity = '0';
              act0Wrapper.style.pointerEvents = 'none';
            }

            if (act1) {
              const enterP = Math.min(1, (p2 - enterStart) / (1 - enterStart));
              const enterEase = enterP * enterP * (3 - 2 * enterP);

              act1.style.opacity = enterEase.toFixed(3);
              act1.style.transform = `translate3d(0, ${((1 - enterEase) * 36).toFixed(1)}px, 0)`;
              act1.style.pointerEvents = enterEase > 0.3 ? 'auto' : 'none';
            }

            if (p2 >= cardsRevealProgress) {
              setBentoCardsVisible(true);
            } else {
              setBentoCardsVisible(false);
            }
          }
        }
      }

      // Act 1 in document flow: once user scrolls into Act 1, keep it visible and interactive
      if (act1 && scrollY >= act1Top) {
        setBentoCardsVisible(true);
        act1.style.opacity = '1';
        act1.style.transform = 'translate3d(0, 0, 0)';
        act1.style.pointerEvents = 'auto';
        if (act0) {
          act0.style.pointerEvents = 'none';
        }
      }

      // Skills (Stack) Dynamic Container Expansion & Accelerated Slide-Off
      if (stackCard && stackTop) {
        // Entrance: As user scrolls down past Bento Cards, container expands (840px -> 1040px)
        // and slides up without any text scaling or opacity fading.
        const stackInStart = stackTop - vh * 0.90;
        const stackInDist = vh * 0.55;

        // Calibrated Slide-Off: When Section 5 (Contact) makes its way onto the screen (top reaches 35% into viewport),
        // Skills begins gliding upward at a coordinated, moderate pace without vanishing prematurely.
        const stackOutStart = act2Top - vh * 0.65;

        if (scrollY < stackInStart) {
          stackCard.style.maxWidth = '840px';
          stackCard.style.transform = 'translate3d(0, 40px, 0)';
          stackCard.style.pointerEvents = 'none';
        } else if (scrollY < stackInStart + stackInDist) {
          const pIn = Math.min(1, Math.max(0, (scrollY - stackInStart) / stackInDist));
          const easeIn = pIn * pIn * (3 - 2 * pIn);
          const currentW = Math.round(840 + (1040 - 840) * easeIn);
          const currentY = ((1 - easeIn) * 40).toFixed(1);
          stackCard.style.maxWidth = `${currentW}px`;
          stackCard.style.transform = `translate3d(0, ${currentY}px, 0)`;
          stackCard.style.pointerEvents = easeIn > 0.5 ? 'auto' : 'none';
        } else if (scrollY > stackOutStart) {
          const scrollDelta = scrollY - stackOutStart;
          const extraUpwardY = scrollDelta * 0.85;
          stackCard.style.maxWidth = '1040px';
          stackCard.style.transform = `translate3d(0, -${extraUpwardY.toFixed(1)}px, 0)`;
          stackCard.style.pointerEvents = extraUpwardY > (vh * 0.65) ? 'none' : 'auto';
        } else {
          stackCard.style.maxWidth = '1040px';
          stackCard.style.transform = 'translate3d(0, 0, 0)';
          stackCard.style.pointerEvents = 'auto';
        }
      }

      // HUD Scroll-Spy Milestones
      if (act2Top && scrollY + vh * 0.4 >= act2Top) {
        updateHUD(2);
      } else if (act1Top && scrollY + vh * 0.4 >= act1Top) {
        updateHUD(1);
      } else {
        updateHUD(0);
      }
    }

    // rAF Scroll Throttle Guard (Batches Touch Deltas to Hardware Display VSYNC)
    let isScrollTicking = false;
    function requestScrollUpdate() {
      if (!isScrollTicking) {
        isScrollTicking = true;
        window.requestAnimationFrame(() => {
          const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
          onNativeScroll(scrollY);
          isScrollTicking = false;
        });
      }
    }

    window.addEventListener('scroll', requestScrollUpdate, { passive: true });
    window.addEventListener('resize', () => {
      measureLayoutGeometry();
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      onNativeScroll(scrollY);
    }, { passive: true });

    // Initial Engine Activation
    const initialScrollY = typeof window !== 'undefined' ? (window.pageYOffset || document.documentElement.scrollTop || 0) : 0;
    onNativeScroll(initialScrollY);

    // Intersection Observers: Act & Content Transitions
    if ('IntersectionObserver' in window) {
      // Act transitions observer
      const actObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // Act 0 remains grounded at the top
          if (entry.target.id === 'act-0') return;

          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          } else {
            // When scrolled back out of view, gently return to resting transition state
            entry.target.classList.remove('in-view');
          }
        });
      }, {
        threshold: 0.08,
        rootMargin: '20px 0px -40px 0px'
      });

      document.querySelectorAll('.stage-act').forEach(act => {
        actObserver.observe(act);
      });

      // Internal items reveal observer for document flow sections (Tech Stack & Contact)
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            // Only un-reveal when safely far outside viewport (120px buffer prevents reverse-scroll edge bouncing)
            const rect = entry.boundingClientRect;
            if (rect.top > window.innerHeight + 120 || rect.bottom < -120) {
              entry.target.classList.remove('is-visible');
            }
          }
        });
      }, {
        threshold: 0.10,
        rootMargin: '10px 0px -30px 0px'
      });

      document.querySelectorAll('.stack-category, .contact-box').forEach(el => {
        revealObserver.observe(el);
      });
    } else {
      // Fallback for browsers without IntersectionObserver
      document.querySelectorAll('.stage-act').forEach(el => el.classList.add('in-view'));
      document.querySelectorAll('.project-bento-card, .stack-category, .contact-box').forEach(el => el.classList.add('is-visible'));
    }

    // Smooth navigation anchor clicks
    function scrollToAct(actIdx) {
      let targetEl = null;
      if (actIdx === 0) targetEl = act0;
      else if (actIdx === 1) targetEl = sectionProjects || act1;
      else if (actIdx === 2) targetEl = act2;

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // HUD Dot click navigation
    hudDots.forEach(dot => {
      dot.addEventListener('click', function (e) {
        const act = parseInt(dot.getAttribute('data-act'), 10);
        if (!isNaN(act)) {
          e.preventDefault();
          scrollToAct(act);
        }
      });
    });

    // Jump Buttons
    document.querySelectorAll('.jump-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        const act = parseInt(btn.getAttribute('data-target-act'), 10);
        if (!isNaN(act)) {
          e.preventDefault();
          scrollToAct(act);
        }
      });
    });

    // Expose Global Engine Interface
    globalEngine = {
      scrollToAct: scrollToAct,
      getTargetScroll: () => window.pageYOffset || document.documentElement.scrollTop || 0,
      setTargetScroll: (v) => { window.scrollTo({ top: v, behavior: 'smooth' }); }
    };
  }

  // ===========================================================================
  // 5. ARCHITECTURAL SPECIFICATION DRAWER CONTROLLER
  // ===========================================================================
  function initProjectDrawer() {
    const readmeDatabase = {
      'compass': {
        title: 'Come Together Compass',
        subtitle: 'Community Aid Platform (ASU Capstone #38)',
        fileTag: 'README.md',
        image: 'assets/images/compass-placeholder.svg',
        repoUrl: 'https://github.com/TimothyH3/come-together-compass',
        contentHtml: `
          <div class="readme-header">
            <h1 class="readme-h1">Come Together Compass</h1>
            <p class="readme-subtitle">Community Pay It Forward – ASU Capstone #38</p>
            <div class="readme-badges">
              <span class="readme-badge">Vue 3</span>
              <span class="readme-badge">TypeScript</span>
              <span class="readme-badge">Pinia</span>
              <span class="readme-badge">Express.js</span>
              <span class="readme-badge">PostgreSQL</span>
              <span class="readme-badge">Leaflet</span>
            </div>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Overview</h2>
            <p>A Vue 3 + Vite web platform that connects families and individuals with verified community resources through an interactive map, conversational guidance, and administrative verification.</p>
            <p><strong>Mission:</strong> Turn everyday support into accessible community lifelines by helping people quickly discover local assistance programs without commercial API fees or tracking.</p>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Key Features</h2>
            <ul class="readme-list">
              <li><strong>Interactive Resource Map:</strong> Search and filter community resources by category and proximity with Leaflet and OpenStreetMap raster tiles.</li>
              <li><strong>Zero-Fee Federal Geocoding:</strong> Bypasses commercial mapping charges by querying public U.S. Census Bureau REST geocoding services directly.</li>
              <li><strong>Memory-Only Privacy (Pinia):</strong> Volatile session state holds user coordinates and intake responses strictly in RAM—ensuring zero persistent tracking or disk storage.</li>
              <li><strong>Instant Crisis Escalation:</strong> Rapid one-click bridge to the 988 Suicide & Crisis Lifeline with automatic in-memory session purge.</li>
              <li><strong>Admin Verification Portal:</strong> Role-based access control allowing verified partners to update, approve, and curate food pantry, shelter, and medical listings.</li>
            </ul>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Architecture &amp; Tech Stack</h2>
            <table class="readme-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Technology</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Front-end</td><td>Vue 3 (Composition API, SFCs), Vite</td></tr>
                <tr><td>State &amp; Store</td><td>Pinia (Volatile memory session)</td></tr>
                <tr><td>Maps &amp; Spatial</td><td>Leaflet, OpenStreetMap, U.S. Census Bureau API</td></tr>
                <tr><td>Backend API</td><td>Node.js, Express.js (RESTful routes)</td></tr>
                <tr><td>Database &amp; ORM</td><td>PostgreSQL, Prisma ORM</td></tr>
                <tr><td>Testing &amp; CI</td><td>Vitest, GitHub Actions CI/CD</td></tr>
              </tbody>
            </table>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Getting Started</h2>
            <p>Prerequisites: Node.js 20+ and PostgreSQL 14+.</p>
            <pre class="readme-code"><code># Clone repository
git clone https://github.com/TimothyH3/come-together-compass.git
cd come-together-compass

# Install dependencies
npm install

# Configure environment variables
cp .env.template .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev</code></pre>
          </div>
        `
      },
      'starlink-tracker': {
        title: 'Starlink Residential Cost Map',
        subtitle: 'Nationwide Geospatial Price & Surcharge Tracker',
        fileTag: 'README.md',
        image: 'assets/images/starlink-map-preview.jpg',
        repoUrl: 'https://github.com/TimothyH3/Starlink-Price-Map',
        contentHtml: `
          <div class="readme-header">
            <h1 class="readme-h1">Starlink Price Map</h1>
            <p class="readme-subtitle">Geospatial map tracking Starlink Residential monthly service costs, regional pricing tiers, and demand surcharges across the United States.</p>
            <div class="readme-badges">
              <span class="readme-badge">Cloudflare Workers</span>
              <span class="readme-badge">TypeScript</span>
              <span class="readme-badge">Supabase PostGIS</span>
              <span class="readme-badge">Uber H3</span>
              <span class="readme-badge">Leaflet</span>
            </div>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">About The Project</h2>
            <p>This application maps Starlink Residential service pricing across the continental United States. It identifies regional price adjustments, base rates, upfront hardware surcharges, and cell capacity statuses.</p>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Why I Built This</h2>
            <p>I travel full-time and frequently change my Starlink Residential service address to stay connected. Starlink monthly rates vary depending on location:</p>
            <ul class="readme-list">
              <li><strong>Discounted regions:</strong> Cost between $27.50 and $55.00/month.</li>
              <li><strong>Standard regions:</strong> Cost $120.00/month.</li>
              <li><strong>Congested / High-Demand regions:</strong> Incur a monthly surcharge reaching $130–$170+/month plus upfront hardware adjustment fees.</li>
            </ul>
            <p>Because Starlink does not provide a public pricing map, finding low-cost service areas previously required repeatedly entering dummy addresses into their signup form. I engineered this tool to visualize and forecast internet expenses along my route.</p>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Respectful Server Traffic Methods</h2>
            <p>To respect Starlink's servers and prevent unnecessary load, the system implements polite data collection and aggressive spatial caching:</p>
            <ul class="readme-list">
              <li><strong>Conservative Edge Cron:</strong> A scheduled Cloudflare Worker runs once every 10 minutes (6 queries per hour, occasionally up to 12).</li>
              <li><strong>PostGIS Spatial Proximity Caching:</strong> When an address or cell is queried, the database first searches within a 25km radius. Existing data is reused without querying upstream servers.</li>
              <li><strong>Water Body &amp; Boundary Exclusion:</strong> Ray-casting filters skip cell coordinates over oceans and large bodies of water (such as the Great Lakes).</li>
            </ul>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Built With</h2>
            <table class="readme-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Technology</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Hexagonal Indexing</td><td>Uber H3 (Resolution 5 cells, ~12.5 km circumradius)</td></tr>
                <tr><td>Spatial Database</td><td>Supabase PostgreSQL with PostGIS extension</td></tr>
                <tr><td>Edge Micro-Sampling</td><td>Cloudflare Workers (TypeScript)</td></tr>
                <tr><td>Interactive Map</td><td>Leaflet, OpenStreetMap raster tiles</td></tr>
                <tr><td>Search &amp; Geocoding</td><td>OpenStreetMap Nominatim with debounced autocomplete</td></tr>
              </tbody>
            </table>
          </div>

          <div class="readme-section">
            <h2 class="readme-h2">Explore Live</h2>
            <p>View the live full-screen interactive map: <a href="/starlink-surcharge-map" class="readme-link">tjhansen.net/starlink-surcharge-map ↗</a></p>
          </div>
        `
      }
    };

    const drawerBackdrop = document.getElementById('spec-drawer-backdrop');
    const drawerCloseBtn = document.getElementById('drawer-close-btn');
    const drawerContent = document.getElementById('drawer-content');
    const drawerFileTag = document.getElementById('drawer-file-tag');

    function openDrawer(key) {
      const data = readmeDatabase[key];
      if (!data || !drawerContent) return;

      if (drawerFileTag) drawerFileTag.textContent = data.fileTag || 'README.md';

      drawerContent.innerHTML = `
        <div class="readme-doc-container">
          <div class="readme-doc-banner">
            <img src="${data.image}" alt="${data.title}" class="readme-banner-img">
          </div>
          ${data.contentHtml}
          <div class="readme-footer-actions">
            <a href="${data.repoUrl || 'https://github.com/TimothyH3'}" target="_blank" rel="noopener noreferrer" class="minimal-btn primary-btn">
              <span>View Repository on GitHub ↗</span>
            </a>
            <button class="minimal-btn copy-btn" id="inner-drawer-close">Close README</button>
          </div>
        </div>
      `;

      if (drawerBackdrop) {
        drawerBackdrop.classList.add('open');
        drawerBackdrop.setAttribute('aria-hidden', 'false');
      }

      const innerClose = drawerContent.querySelector('#inner-drawer-close');
      if (innerClose) innerClose.addEventListener('click', closeDrawer);
    }

    function closeDrawer() {
      if (!drawerBackdrop) return;
      drawerBackdrop.classList.remove('open');
      drawerBackdrop.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.getAttribute('data-project');
        if (key) openDrawer(key);
      });
    });

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', function (e) {
        if (e.target === drawerBackdrop) closeDrawer();
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  // ===========================================================================
  // 6. COPY EMAIL & TOAST NOTIFICATION
  // ===========================================================================
  function initCopyEmail() {
    const copyBtn = document.getElementById('copy-email-btn');
    const copyBtnText = document.getElementById('copy-btn-text');
    const emailTextEl = document.getElementById('email-text');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    let toastTimeout = null;

    function showToast(message) {
      if (!toast) return;
      if (toastText) toastText.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
    }

    if (copyBtn && emailTextEl) {
      copyBtn.addEventListener('click', async function () {
        const email = emailTextEl.textContent.trim();
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(email);
          } else {
            const temp = document.createElement('textarea');
            temp.value = email;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            temp.remove();
          }

          if (copyBtnText) copyBtnText.textContent = 'Copied!';
          setTimeout(() => {
            if (copyBtnText) copyBtnText.textContent = 'Copy Email';
          }, 2000);

          showToast(`Copied ${email} to clipboard`);
        } catch (err) {
          showToast(email);
        }
      });
    }

    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  // ===========================================================================
  // 7. TERMINAL ENTRANCE INTRO ANIMATION (In-Place at Hero Name)
  // Fail-safe: reveals page even if elements are missing or reduced-motion is on
  // ===========================================================================
  function initIntroAnimation() {
    const terminalLine = document.getElementById('intro-terminal-line');
    const textEl = document.getElementById('intro-text');
    const realName = document.getElementById('hero-real-name');
    const cursorEl = document.getElementById('intro-cursor');

    // Fail-safe guard: If intro elements were removed or restructured, reveal page immediately
    if (!terminalLine || !textEl || !realName) {
      document.body.classList.remove('intro-active');
      document.body.classList.add('intro-revealed');
      return;
    }

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      document.body.classList.remove('intro-active');
      document.body.classList.add('intro-revealed');
      return;
    }

    const command = 'python tjhansen.py';
    let charIndex = 0;
    let isDone = false;

    document.body.classList.add('intro-active');

    function completeIntro() {
      if (isDone) return;
      isDone = true;

      if (terminalLine) {
        terminalLine.style.opacity = '0';
        terminalLine.style.transform = 'translateY(14px) scale(0.96)';
      }
      if (cursorEl) {
        cursorEl.style.opacity = '0';
      }

      document.body.classList.remove('intro-active');
      document.body.classList.add('intro-revealed');

      setTimeout(() => {
        if (terminalLine) terminalLine.style.display = 'none';
      }, 420);
    }

    // Skip on user interaction
    window.addEventListener('click', completeIntro, { once: true });
    window.addEventListener('keydown', completeIntro, { once: true });

    // Typing sequence
    setTimeout(() => {
      if (isDone) return;

      const typeInterval = setInterval(() => {
        if (isDone) {
          clearInterval(typeInterval);
          return;
        }

        if (charIndex < command.length) {
          const char = command[charIndex];
          const span = document.createElement('span');
          span.className = 'intro-char';
          span.textContent = char === ' ' ? '\u00A0' : char;
          if (textEl) textEl.appendChild(span);
          charIndex++;
        } else {
          clearInterval(typeInterval);

          setTimeout(() => {
            if (isDone) return;
            if (terminalLine) terminalLine.classList.add('enter-strike');

            setTimeout(() => {
              completeIntro();
            }, 140);
          }, 180);
        }
      }, 45);

    }, 140);
  }

  // ===========================================================================
  // 8. SUBSYSTEM BOOTSTRAP
  // ===========================================================================
  function boot() {
    initTheme();
    initIntroAnimation();
    initScrollAndZoomEngine();
        initProjectDrawer();
    initCopyEmail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();