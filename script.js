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
  // 3. 3-ACT HYBRID SCROLL & OPTICAL STAGE ENGINE
  // Direct 1:1, Zero-Damping, Fail-Safe Architecture
  // ===========================================================================
  let globalEngine = null;

  function initScrollAndZoomEngine() {
    // Stage DOM Containers
    const act0 = document.getElementById('act-0');
    const act1 = document.getElementById('act-1');
    const act2 = document.getElementById('act-2');
    if (!act0 || !act1 || !act2) return;

    const act0Container = act0.querySelector('.act-scroll-container');
    const act1Container = act1.querySelector('.act-scroll-container');
    const act2Container = act2.querySelector('.act-scroll-container');
    const sectionProfile = document.getElementById('section-profile');

    // Hero and Transition Elements (All null-guarded for resilience)
    const bgOrange = document.getElementById('bg-orange');
    const bgBlue = document.getElementById('bg-blue');
    const act1Heading = document.getElementById('act1-heading');
    const heroQuickLinks = document.getElementById('hero-quick-links');
    const heroStatement = document.querySelector('#section-hero .hero-statement');
    const heroSignalRow = document.querySelector('#section-hero .signal-row');
    const heroTitle = document.getElementById('hero-title');
    const act0StatementGrid = document.getElementById('act0-statement-grid');
    const act1Intro = document.getElementById('act1-section-intro');
    const projectCards = Array.from(document.querySelectorAll('#section-projects .project-bento-card'));
    const hudDots = Array.from(document.querySelectorAll('.hud-dot'));

    // Dynamic scroll milestone distances
    let topPauseDist0 = 0;   // Immediate responsive scroll at top of Hero
    let vDist0 = 540;        // Vertical travel distance: Section 2 slides up to sit under chips
    let pauseDist0 = 80;     // Resting point at end of Act 0 with gentle end-of-act dampening
    let tDist01 = 650;       // Staggered cards transition distance Act 0 -> Act 1
    let profileOffsetNeeded = 600; // Distance needed to position Section 2 offscreen below fold
    let excessHeight0 = 0;         // Container scroll adjustment for shorter screens

    let topPauseDist1 = 0;   // Projects immediately accessible at top of Act 1
    let vDist1 = 750;        // Vertical travel distance Projects -> Stack
    let pauseDist1 = 80;     // Resting point at end of Act 1 with gentle end-of-act dampening
    let zDist12 = 400;       // Optical zoom transition distance Act 1 -> Act 2

    let M0_START = 0;
    let M0_TOP_PAUSE_END = topPauseDist0;
    let M0_VERT_END = M0_TOP_PAUSE_END + vDist0;
    let M0_BOTTOM_PAUSE_END = M0_VERT_END + pauseDist0;

    let M1_TRANS_START = M0_BOTTOM_PAUSE_END;
    let M1_TRANS_END = M1_TRANS_START + tDist01;

    let M1_TOP_PAUSE_END = M1_TRANS_END + topPauseDist1;
    let M1_VERT_END = M1_TOP_PAUSE_END + vDist1;
    let M1_BOTTOM_PAUSE_END = M1_VERT_END + pauseDist1;

    let M2_ZOOM_START = M1_BOTTOM_PAUSE_END;
    let M2_ZOOM_END = M2_ZOOM_START + zDist12;
    let TOTAL_SCROLL = M2_ZOOM_END;

    function recalculateMilestones() {
      const vh = window.innerHeight;
      const sh0 = act0Container ? act0Container.scrollHeight : 1200;
      const sh1 = act1Container ? act1Container.scrollHeight : 1400;

      // Section 2 (Profile) slide-up metrics
      const profileOffset = sectionProfile ? sectionProfile.offsetTop : 480;
      profileOffsetNeeded = Math.max(0, vh - profileOffset + 40);

      // Scroll container adjustment for short viewports
      excessHeight0 = Math.max(0, sh0 - vh);

      topPauseDist0 = 0;
      vDist0 = 540;
      pauseDist0 = 80;
      tDist01 = 650;

      topPauseDist1 = 0;
      vDist1 = Math.max(500, sh1 - vh + 80);
      pauseDist1 = 80;
      zDist12 = 400;

      M0_START = 0;
      M0_TOP_PAUSE_END = topPauseDist0;
      M0_VERT_END = M0_TOP_PAUSE_END + vDist0;
      M0_BOTTOM_PAUSE_END = M0_VERT_END + pauseDist0;

      M1_TRANS_START = M0_BOTTOM_PAUSE_END;
      M1_TRANS_END = M1_TRANS_START + tDist01;

      M1_TOP_PAUSE_END = M1_TRANS_END + topPauseDist1;
      M1_VERT_END = M1_TOP_PAUSE_END + vDist1;
      M1_BOTTOM_PAUSE_END = M1_VERT_END + pauseDist1;

      M2_ZOOM_START = M1_BOTTOM_PAUSE_END;
      M2_ZOOM_END = M2_ZOOM_START + zDist12;
      TOTAL_SCROLL = M2_ZOOM_END;
    }

    recalculateMilestones();
    window.addEventListener('resize', recalculateMilestones);

    // Continuous scroll progress variables
    let targetScroll = 0;
    let currentScroll = 0;

    // HUD update helper
    let currentActIndex = 0;
    function updateHUD(actIdx) {
      if (currentActIndex !== actIdx) {
        currentActIndex = actIdx;
        hudDots.forEach((dot, i) => {
          dot.classList.toggle('active', i === actIdx);
        });
      }
    }

    // Smooth ease-in & ease-out S-curve for internal container travel
    function smoothTravel(p) {
      const clamped = Math.max(0, Math.min(1, p));
      return clamped * clamped * (3 - 2 * clamped);
    }

    // =========================================================================
    // Core Render Function: Maps scroll position (s) to stage transforms
    // Safe & fail-safe: every DOM property write checks element existence
    // =========================================================================
    function render(s) {
      // -----------------------------------------------------------------------
      // Dynamic Orange-to-Blue Background Gradient
      // Starts warm orange at bottom of screen, fades to luminous blue at top as user scrolls
      // -----------------------------------------------------------------------
      if (bgOrange || bgBlue) {
        const progress = Math.max(0, Math.min(1, s / (TOTAL_SCROLL || 1)));
        if (bgOrange) {
          // Orange is vibrant on bottom (1.0), gradually softens to 0.18 towards end
          const orangeOpacity = Math.max(0.18, 1.0 - progress * 0.82).toFixed(3);
          const orangeShiftY = (progress * 45).toFixed(1);
          bgOrange.style.opacity = orangeOpacity;
          bgOrange.style.transform = `translate3d(0, ${orangeShiftY}px, 0)`;
        }
        if (bgBlue) {
          // Blue starts subtle (0.12) at top, rises and expands to 1.0 towards Act 1 and Act 2
          const blueOpacity = Math.min(1.0, 0.12 + progress * 0.88).toFixed(3);
          const blueShiftY = ((1 - progress) * -35).toFixed(1);
          bgBlue.style.opacity = blueOpacity;
          bgBlue.style.transform = `translate3d(0, ${blueShiftY}px, 0)`;
        }
      }

      // -----------------------------------------------------------------------
      // 1. Act 0: Overview & Profile (Hero + Smooth slide-up Profile docking)
      // -----------------------------------------------------------------------
      if (s <= M0_BOTTOM_PAUSE_END) {
        let p = 0;
        let e = 0;

        if (s <= M0_TOP_PAUSE_END) {
          p = 0;
          e = 0;
        } else if (s <= M0_VERT_END) {
          p = (s - M0_TOP_PAUSE_END) / vDist0;
          e = smoothTravel(p);
        } else {
          p = 1;
          e = 1;
        }

        // Section 2 (Profile) slide-up & fade-in
        if (sectionProfile) {
          const currentProfileOffset = (1 - e) * profileOffsetNeeded;
          const profileOpacity = Math.min(1, e * 1.8);
          sectionProfile.style.transform = `translate3d(0, ${currentProfileOffset.toFixed(1)}px, 0)`;
          sectionProfile.style.opacity = profileOpacity.toFixed(3);
          sectionProfile.style.pointerEvents = e > 0.6 ? 'auto' : 'none';
        }

        // Container adjustment for shorter screens
        const containerY = -e * excessHeight0;
        if (act0Container) act0Container.style.transform = `translate3d(0, ${containerY.toFixed(1)}px, 0)`;

        act0.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act0.style.filter = 'none';
        act0.style.opacity = '1';
        act0.style.pointerEvents = 'auto';
        act0.style.zIndex = '10';

        // Restore Hero elements to default state
        if (heroQuickLinks) {
          heroQuickLinks.style.opacity = '1';
          heroQuickLinks.style.transform = 'translate3d(0, 0, 0)';
          heroQuickLinks.style.pointerEvents = 'auto';
        }
        if (act0StatementGrid) {
          act0StatementGrid.style.opacity = '1';
          act0StatementGrid.style.transform = 'none';
        }
        if (heroStatement) {
          heroStatement.style.opacity = '1';
          heroStatement.style.transform = 'none';
        }
        if (heroSignalRow) {
          heroSignalRow.style.opacity = '1';
          heroSignalRow.style.transform = 'none';
        }
        if (heroTitle) {
          heroTitle.style.opacity = '1';
          heroTitle.style.transform = 'none';
        }

        // Act 1 pre-staged in background
        act1.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act1.style.filter = 'none';
        act1.style.opacity = '0';
        act1.style.pointerEvents = 'none';
        act1.style.zIndex = '5';
        if (act1Container) act1Container.style.transform = 'translate3d(0, 0, 0)';

        if (act1Heading) {
          act1Heading.style.opacity = '0';
          act1Heading.style.transform = 'translate3d(0, 45px, 0)';
        }
        if (act1Intro) act1Intro.style.opacity = '0';
        projectCards.forEach(card => {
          card.style.opacity = '0';
          card.style.transform = 'translate3d(0, 55px, 0)';
          card.style.pointerEvents = 'none';
        });

        // Act 2 hidden
        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';

        updateHUD(0);
      }
      // -----------------------------------------------------------------------
      // 2. Transition: Act 0 -> Act 1 (Fade out Hero, Stagger in Projects)
      // -----------------------------------------------------------------------
      else if (s > M1_TRANS_START && s < M1_TRANS_END) {
        const t = Math.max(0, Math.min(1, (s - M1_TRANS_START) / tDist01));

        // Both acts remain crisp at scale(1)
        act0.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act0.style.filter = 'none';
        act0.style.opacity = '1';
        act0.style.zIndex = '10';
        act0.style.pointerEvents = t < 0.5 ? 'auto' : 'none';

        act1.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act1.style.filter = 'none';
        act1.style.opacity = '1';
        act1.style.zIndex = '15';
        act1.style.pointerEvents = t >= 0.5 ? 'auto' : 'none';

        if (act0Container) act0Container.style.transform = `translate3d(0, -${excessHeight0.toFixed(1)}px, 0)`;
        if (act1Container) act1Container.style.transform = 'translate3d(0, 0, 0)';

        if (sectionProfile) {
          sectionProfile.style.transform = 'translate3d(0, 0, 0)';
          sectionProfile.style.opacity = '1';
        }

        const eSlide = smoothTravel(Math.min(1, t / 0.65));

        // Quick link chips slide upward out of view
        if (heroQuickLinks) {
          const chipsY = -eSlide * 52;
          const chipsOpacity = Math.max(0, 1 - eSlide * 1.3);
          heroQuickLinks.style.transform = `translate3d(0, ${chipsY.toFixed(1)}px, 0)`;
          heroQuickLinks.style.opacity = chipsOpacity.toFixed(3);
          heroQuickLinks.style.pointerEvents = eSlide > 0.4 ? 'none' : 'auto';
        }

        // Act 0 body text disappears smoothly
        const bodyOpacity = Math.max(0, 1 - eSlide * 1.25).toFixed(3);
        const bodyY = (-eSlide * 28).toFixed(1);

        if (act0StatementGrid) {
          act0StatementGrid.style.opacity = bodyOpacity;
          act0StatementGrid.style.transform = `translate3d(0, ${bodyY}px, 0)`;
        }
        if (heroStatement) {
          heroStatement.style.opacity = bodyOpacity;
          heroStatement.style.transform = `translate3d(0, ${bodyY}px, 0)`;
        }
        if (heroSignalRow) {
          heroSignalRow.style.opacity = bodyOpacity;
          heroSignalRow.style.transform = `translate3d(0, ${bodyY}px, 0)`;
        }
        if (heroTitle) {
          heroTitle.style.opacity = bodyOpacity;
          heroTitle.style.transform = `translate3d(0, ${bodyY}px, 0)`;
        }

        // Act 1 Section Heading scrolls in cleanly with Act 1
        if (act1Heading) {
          const pHeading = Math.min(1, Math.max(0, (t - 0.20) / 0.35));
          const eHeading = smoothTravel(pHeading);
          act1Heading.style.opacity = eHeading.toFixed(3);
          act1Heading.style.transform = `translate3d(0, ${((1 - eHeading) * 35).toFixed(1)}px, 0)`;
        }

        // Act 1 Section intro appears
        if (act1Intro) {
          const pIntro = Math.min(1, Math.max(0, (t - 0.30) / 0.30));
          const eIntro = smoothTravel(pIntro);
          act1Intro.style.opacity = eIntro.toFixed(3);
          act1Intro.style.transform = `translate3d(0, ${((1 - eIntro) * 24).toFixed(1)}px, 0)`;
        }

        // Staggered sequential reveal of project demo boxes (t: 0.45 -> 1.00)
        projectCards.forEach((card, i) => {
          const cardStart = 0.45 + i * 0.09;
          const cardDur = 0.24;
          const pCard = Math.min(1, Math.max(0, (t - cardStart) / cardDur));
          const eCard = smoothTravel(pCard);
          card.style.opacity = eCard.toFixed(3);
          card.style.transform = `translate3d(0, ${((1 - eCard) * 50).toFixed(1)}px, 0)`;
          card.style.pointerEvents = eCard > 0.85 ? 'auto' : 'none';
        });

        // Act 2 hidden
        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';

        updateHUD(t >= 0.5 ? 1 : 0);
      }
      // -----------------------------------------------------------------------
      // 3. Act 1: Work & Stack (Projects down to Stack via internal scroll)
      // -----------------------------------------------------------------------
      else if (s >= M1_TRANS_END && s <= M1_BOTTOM_PAUSE_END) {
        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';

        if (act1Heading) {
          act1Heading.style.opacity = '1';
          act1Heading.style.transform = 'none';
        }
        if (act1Intro) {
          act1Intro.style.opacity = '1';
          act1Intro.style.transform = 'none';
        }
        projectCards.forEach(card => {
          card.style.opacity = '1';
          card.style.transform = '';
          card.style.pointerEvents = 'auto';
        });

        const maxOffset1 = act1Container ? Math.max(0, act1Container.scrollHeight - window.innerHeight) : 0;
        let translateY = 0;

        if (s <= M1_TOP_PAUSE_END) {
          translateY = 0;
        } else if (s <= M1_VERT_END) {
          const p = (s - M1_TOP_PAUSE_END) / vDist1;
          translateY = -smoothTravel(p) * maxOffset1;
        } else {
          translateY = -maxOffset1;
        }

        act1.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act1.style.filter = 'none';
        act1.style.opacity = '1';
        act1.style.pointerEvents = 'auto';
        act1.style.zIndex = '10';
        if (act1Container) act1Container.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0)`;

        // Act 2 pre-staged in background
        act2.style.transform = 'translate3d(0, 0, 0) scale(0.55)';
        act2.style.filter = 'none';
        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';
        act2.style.zIndex = '5';
        if (act2Container) act2Container.style.transform = 'translate3d(0, 0, 0)';

        updateHUD(1);
      }
      // -----------------------------------------------------------------------
      // 4. Optical Zoom Transition: Act 1 -> Act 2 (Pure hardware scale & opacity)
      // -----------------------------------------------------------------------
      else if (s > M2_ZOOM_START && s < M2_ZOOM_END) {
        const t = Math.max(0, Math.min(1, (s - M2_ZOOM_START) / zDist12));

        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';

        const maxOffset1 = act1Container ? Math.max(0, act1Container.scrollHeight - window.innerHeight) : 0;
        if (act1Container) act1Container.style.transform = `translate3d(0, -${maxOffset1}px, 0)`;

        const scale1 = 1.0 + t * 1.25;
        const opacity1 = Math.max(0, 1 - Math.pow(t, 1.25));

        act1.style.transform = `translate3d(0, 0, 0) scale(${scale1.toFixed(3)})`;
        act1.style.filter = 'none';
        act1.style.opacity = opacity1.toFixed(3);
        act1.style.zIndex = '20';
        act1.style.pointerEvents = t < 0.25 ? 'auto' : 'none';

        if (act2Container) act2Container.style.transform = 'translate3d(0, 0, 0)';
        const scale2 = 0.55 + t * 0.45;
        const opacity2 = Math.max(0, Math.pow(t, 1.25));

        act2.style.transform = `translate3d(0, 0, 0) scale(${scale2.toFixed(3)})`;
        act2.style.filter = 'none';
        act2.style.opacity = opacity2.toFixed(3);
        act2.style.zIndex = '10';
        act2.style.pointerEvents = t > 0.75 ? 'auto' : 'none';

        updateHUD(t >= 0.5 ? 2 : 1);
      }
      // -----------------------------------------------------------------------
      // 5. Act 2: Contact (Fully active connect stage)
      // -----------------------------------------------------------------------
      else if (s >= M2_ZOOM_END) {
        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';
        act1.style.opacity = '0';
        act1.style.pointerEvents = 'none';

        act2.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act2.style.filter = 'none';
        act2.style.opacity = '1';
        act2.style.pointerEvents = 'auto';
        act2.style.zIndex = '10';
        if (act2Container) act2Container.style.transform = 'translate3d(0, 0, 0)';

        updateHUD(2);
      }
    }

    // =========================================================================
    // Direct, Instantaneous 1:1 Scroll Application (Zero artificial damping)
    // =========================================================================
    let lastRenderedScroll = -999999;
    function applyScroll(val) {
      targetScroll = Math.max(0, Math.min(TOTAL_SCROLL, val));
      currentScroll = targetScroll;
      if (Math.abs(currentScroll - lastRenderedScroll) > 0.01) {
        render(currentScroll);
        lastRenderedScroll = currentScroll;
      }
    }

    // Smooth transition exclusively for button & HUD jumps
    let jumpAnimId = null;
    let momentumAnimId = null;

    function cancelMomentum() {
      if (momentumAnimId) {
        cancelAnimationFrame(momentumAnimId);
        momentumAnimId = null;
      }
    }

    function animateScrollTo(dest) {
      if (jumpAnimId) cancelAnimationFrame(jumpAnimId);
      cancelMomentum();
      const start = currentScroll;
      const distance = dest - start;
      if (Math.abs(distance) < 2) {
        applyScroll(dest);
        return;
      }
      const startTime = performance.now();
      const duration = Math.min(450, Math.max(220, Math.abs(distance) * 0.3));

      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        applyScroll(start + distance * ease);

        if (progress < 1) {
          jumpAnimId = requestAnimationFrame(step);
        } else {
          applyScroll(dest);
          jumpAnimId = null;
        }
      }
      jumpAnimId = requestAnimationFrame(step);
    }

    function scrollToAct(actIdx) {
      cancelMomentum();
      let dest = 0;
      if (actIdx === 0) dest = 0;
      else if (actIdx === 1) dest = M1_TRANS_END;
      else if (actIdx === 2) dest = M2_ZOOM_END;
      animateScrollTo(dest);
    }

    // =========================================================================
    // End-of-Act Dampening: Soft tactile cushion only at the boundary of each act
    // =========================================================================
    function getActEndDamping(s, dy) {
      // 1. Soft cushion at the end of Act 0 (Profile resting zone before transition into Act 1)
      if (dy > 0 && s >= (M0_VERT_END - 50) && s <= (M1_TRANS_START + 30)) {
        return 0.58;
      }
      // 2. Soft cushion at the end of Act 1 (Stack resting zone before optical zoom into Act 2)
      if (dy > 0 && s >= (M1_VERT_END - 60) && s <= (M2_ZOOM_START + 30)) {
        return 0.58;
      }
      // 3. Soft cushion when scrolling back up near the top of the page
      if (dy < 0 && s <= 50) {
        return 0.65;
      }
      // 4. Default: 100% direct 1:1 scroll everywhere else
      return 1.0;
    }

    // Initial render
    applyScroll(0);

    // =========================================================================
    // Input Listeners: Direct 1:1 Tracking with End-of-Act Cushion & Touch Momentum
    // =========================================================================

    // Mouse Wheel / Trackpad
    window.addEventListener('wheel', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      e.preventDefault();

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;
      else if (e.deltaMode === 2) dy *= 300;

      if (jumpAnimId) {
        cancelAnimationFrame(jumpAnimId);
        jumpAnimId = null;
      }
      cancelMomentum();
      cancelMomentum();

      const damp = getActEndDamping(currentScroll, dy);
      applyScroll(currentScroll + dy * damp);
    }, { passive: false });

    // Touch Handling with Smooth Inertial Momentum Physics (Mobile & Tablets)
    let touchStartY = 0;
    let touchHistory = []; // stores recent { y, time }

    window.addEventListener('touchstart', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      // Finger tap instantly catches/cancels any gliding momentum or jump
      cancelMomentum();
      if (jumpAnimId) {
        cancelAnimationFrame(jumpAnimId);
        jumpAnimId = null;
      }
      cancelMomentum();

      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchHistory = [{ y: touchStartY, time: performance.now() }];
      }
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      if (e.touches && e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const now = performance.now();
        const dy = touchStartY - currentY;
        touchStartY = currentY;

        // Keep last 120ms of movement for accurate release velocity
        touchHistory.push({ y: currentY, time: now });
        while (touchHistory.length > 1 && (now - touchHistory[0].time) > 120) {
          touchHistory.shift();
        }

        if (jumpAnimId) {
          cancelAnimationFrame(jumpAnimId);
          jumpAnimId = null;
        }

        const damp = getActEndDamping(currentScroll, dy);
        applyScroll(currentScroll + dy * damp);
      }
    }, { passive: true });

    function handleTouchEnd() {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      if (touchHistory.length < 2) {
        touchHistory = [];
        return;
      }

      const now = performance.now();
      const lastPoint = touchHistory[touchHistory.length - 1];
      // Only compute velocity if finger was actively moving right up to release (< 100ms)
      if (now - lastPoint.time > 100) {
        touchHistory = [];
        return;
      }

      const firstPoint = touchHistory[0];
      const dt = lastPoint.time - firstPoint.time;
      if (dt < 15) {
        touchHistory = [];
        return;
      }

      // totalDy > 0 means finger dragged up (page scrolls down)
      const totalDy = firstPoint.y - lastPoint.y;
      let velocity = totalDy / dt; // px/ms

      // Ignore micro-drags
      if (Math.abs(velocity) < 0.18) {
        touchHistory = [];
        return;
      }

      // Clamp max velocity
      const maxVelocity = 3.2; // px/ms
      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity));

      let lastFrameTime = performance.now();
      const friction = 0.948; // Natural exponential deceleration per 16ms frame

      function momentumStep(frameTime) {
        const elapsed = Math.min(48, frameTime - lastFrameTime);
        lastFrameTime = frameTime;

        velocity *= Math.pow(friction, elapsed / 16);

        if (Math.abs(velocity) < 0.02) {
          momentumAnimId = null;
          return;
        }

        const stepDy = velocity * elapsed;
        const damp = getActEndDamping(currentScroll, stepDy);
        applyScroll(currentScroll + stepDy * damp);

        if (currentScroll <= 0 || currentScroll >= TOTAL_SCROLL) {
          momentumAnimId = null;
          return;
        }

        momentumAnimId = requestAnimationFrame(momentumStep);
      }

      cancelMomentum();
      momentumAnimId = requestAnimationFrame(momentumStep);
      touchHistory = [];
    }

    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Keyboard Navigation (Arrows, PageUp/Down, Space, Home, End)
    window.addEventListener('keydown', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      if (jumpAnimId) {
        cancelAnimationFrame(jumpAnimId);
        jumpAnimId = null;
      }
      cancelMomentum();

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        applyScroll(currentScroll + 220);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        applyScroll(currentScroll - 220);
      } else if (e.key === 'Home') {
        e.preventDefault();
        applyScroll(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        applyScroll(TOTAL_SCROLL);
      }
    });

    // Jump Buttons (.jump-btn with data-target-act="0|1|2")
    document.querySelectorAll('.jump-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const act = parseInt(btn.getAttribute('data-target-act'), 10);
        scrollToAct(act);
      });
    });

    // HUD Dot Indicators Click
    hudDots.forEach(dot => {
      dot.addEventListener('click', function () {
        const act = parseInt(dot.getAttribute('data-act'), 10);
        scrollToAct(act);
      });
    });

    // Expose Global Engine Interface
    globalEngine = {
      scrollToAct: scrollToAct,
      getTargetScroll: () => targetScroll,
      setTargetScroll: (v) => { applyScroll(v); }
    };
  }

  // ===========================================================================
  // 4. PROJECT DEMO MODALS CONTROLLER (Zoom-In On Click, Zoom-Out On Scroll)
  // ===========================================================================
  function initProjectDemos() {
    const demoOverlay = document.getElementById('project-demo-overlay');
    const opticalStage = document.getElementById('optical-stage');
    const demoBackBtn = document.getElementById('demo-back-btn');
    const demoCloseBtn = document.getElementById('demo-close-btn');
    const demoBottomClose = document.getElementById('demo-bottom-close');
    const demoViews = Array.from(document.querySelectorAll('.demo-view'));

    let isDemoOpen = false;
    let demoScrollAccumulator = 0;

    function openDemo(demoKey) {
      if (!demoOverlay) return;

      // Select active matching view
      demoViews.forEach(view => {
        const id = view.id.replace('demo-', '');
        if (id === demoKey) {
          view.classList.add('active-demo');
        } else {
          view.classList.remove('active-demo');
        }
      });

      // Activate zoom-in transition
      demoOverlay.classList.add('open');
      demoOverlay.setAttribute('aria-hidden', 'false');
      if (opticalStage) opticalStage.classList.add('demo-active');
      document.body.classList.add('demo-is-open');

      isDemoOpen = true;
      demoScrollAccumulator = 0;
    }

    function closeDemo() {
      if (!isDemoOpen || !demoOverlay) return;

      // Zoom-out transition
      demoOverlay.classList.remove('open');
      demoOverlay.setAttribute('aria-hidden', 'true');
      if (opticalStage) opticalStage.classList.remove('demo-active');
      document.body.classList.remove('demo-is-open');

      isDemoOpen = false;
      demoScrollAccumulator = 0;
    }

    // Open demo on "Live Demo" button click
    document.querySelectorAll('.demo-trigger-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const demoKey = btn.getAttribute('data-demo');
        if (demoKey) openDemo(demoKey);
      });
    });

    // Open on clicking project bento card itself (excluding direct links and specs buttons)
    document.querySelectorAll('.project-bento-card').forEach(card => {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a') || e.target.closest('.inspect-btn')) return;
        const key = card.getAttribute('data-project-key');
        if (key) openDemo(key);
      });
    });

    // Close actions: Return button, Close button, Bottom close, Backdrop click
    if (demoBackBtn) demoBackBtn.addEventListener('click', closeDemo);
    if (demoCloseBtn) demoCloseBtn.addEventListener('click', closeDemo);
    if (demoBottomClose) demoBottomClose.addEventListener('click', closeDemo);

    if (demoOverlay) {
      demoOverlay.addEventListener('click', function (e) {
        if (e.target === demoOverlay) {
          closeDemo();
        }
      });
    }

    // Exit demo when user deliberately scrolls (> 50px)
    window.addEventListener('wheel', function (e) {
      if (!isDemoOpen) return;
      demoScrollAccumulator += Math.abs(e.deltaY);
      if (demoScrollAccumulator > 50) {
        closeDemo();
      }
    }, { passive: true });

    let demoTouchStartY = 0;
    window.addEventListener('touchstart', function (e) {
      if (!isDemoOpen) return;
      if (e.touches && e.touches.length > 0) {
        demoTouchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (!isDemoOpen) return;
      if (e.touches && e.touches.length > 0) {
        const dy = Math.abs(demoTouchStartY - e.touches[0].clientY);
        if (dy > 45) {
          closeDemo();
        }
      }
    }, { passive: true });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isDemoOpen) {
        closeDemo();
      }
    });

    // =========================================================================
    // 5. INTERACTIVE SIMULATION TOYS WITHIN DEMOS
    // =========================================================================

    // Simulation 1: Come Together Compass
    const compassGeocodeBtn = document.getElementById('compass-geocode-btn');
    const compassWipeBtn = document.getElementById('compass-wipe-btn');
    const compassLatency = document.getElementById('compass-latency-val');
    const compassRetention = document.getElementById('compass-retention-val');
    const compassEmergency = document.getElementById('compass-emergency-val');
    const compassLog = document.getElementById('compass-log');

    const sampleAddresses = [
      '100 W Washington St, Phoenix, AZ 85003',
      '400 E Van Buren St, Phoenix, AZ 85004',
      '1100 S Priest Dr, Tempe, AZ 85281',
      '300 E University Dr, Tempe, AZ 85281'
    ];
    let addressIdx = 0;

    if (compassGeocodeBtn) {
      compassGeocodeBtn.addEventListener('click', function () {
        const addr = sampleAddresses[addressIdx % sampleAddresses.length];
        addressIdx++;
        const lat = (33.4255 + (Math.random() * 0.04 - 0.02)).toFixed(4);
        const lon = (-111.9400 + (Math.random() * 0.04 - 0.02)).toFixed(4);
        const randLat = Math.floor(95 + Math.random() * 40);

        if (compassLatency) compassLatency.textContent = `${randLat} ms`;
        if (compassRetention) compassRetention.textContent = '0 Bytes (Volatile Pinia)';

        if (compassLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-green';
          line1.textContent = `[${now}] [CENSUS-API] Resolved: "${addr}" -> (${lat}° N, ${lon}° W) in ${randLat}ms. $0 API cost.`;
          const line2 = document.createElement('div');
          line2.className = 'term-line';
          line2.textContent = `[${now}] [LEAFLET] Filtered 6 nearest shelter & food aid hubs within 5.0 km radius.`;
          compassLog.appendChild(line1);
          compassLog.appendChild(line2);
          compassLog.scrollTop = compassLog.scrollHeight;
        }
      });
    }

    if (compassWipeBtn) {
      compassWipeBtn.addEventListener('click', function () {
        if (compassRetention) compassRetention.textContent = 'PURGED (0 Bytes)';
        if (compassEmergency) compassEmergency.textContent = '988 Escalated • Safe Mode';

        if (compassLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-accent';
          line1.textContent = `[${now}] [EMERGENCY-988] Rapid crisis escalation triggered. Routing client to 988 Lifeline bridge.`;
          const line2 = document.createElement('div');
          line2.className = 'term-line text-green';
          line2.textContent = `[${now}] [PINIA-PURGE] Complete volatile memory purge executed. Session storage: 0 bytes. Zero data footprint.`;
          compassLog.appendChild(line1);
          compassLog.appendChild(line2);
          compassLog.scrollTop = compassLog.scrollHeight;
        }

        setTimeout(() => {
          if (compassEmergency) compassEmergency.textContent = '988 Lifeline Armed';
          if (compassRetention) compassRetention.textContent = '0 Bytes (RAM-Only)';
        }, 3000);
      });
    }

    // Simulation 2: Starlink Tracker
    const starlinkQueryBtn = document.getElementById('starlink-query-btn');
    const starlinkToggleBtn = document.getElementById('starlink-toggle-btn');
    const starlinkLatency = document.getElementById('starlink-latency-val');
    const starlinkCells = document.getElementById('starlink-cells-val');
    const starlinkStatus = document.getElementById('starlink-status-val');
    const starlinkLog = document.getElementById('starlink-log');

    const sampleQueries = [
      { loc: 'Flagstaff, AZ (35.1983° N, 111.6513° W)', cost: '$120/MO', tier: 'STANDARD' },
      { loc: 'Sedona, AZ (34.8697° N, 111.7610° W)', cost: '$130/MO', tier: 'CONGESTION SURCHARGE (+ $100 Upfront)' },
      { loc: 'Tucson, AZ (32.2226° N, 110.9747° W)', cost: '$120/MO', tier: 'STANDARD' },
      { loc: 'Rural Navajo County, AZ (35.3995° N, 110.1542° W)', cost: '$55/MO', tier: 'REGIONAL DISCOUNT ($55/MO)' }
    ];
    let queryIdx = 0;
    let overlayActive = true;

    if (starlinkQueryBtn) {
      starlinkQueryBtn.addEventListener('click', function () {
        const q = sampleQueries[queryIdx % sampleQueries.length];
        queryIdx++;
        const randLat = (1.4 + Math.random() * 0.9).toFixed(1);

        if (starlinkLatency) starlinkLatency.textContent = `${randLat} ms`;
        if (starlinkStatus) {
          starlinkStatus.textContent = q.tier;
          starlinkStatus.className = q.tier.includes('SURCHARGE') ? 'demo-stat-val text-accent' : (q.tier.includes('DISCOUNT') ? 'demo-stat-val text-accent' : 'demo-stat-val text-green');
        }

        if (starlinkLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-green';
          line1.textContent = `[${now}] [RAY-CAST] Queried ${q.loc} against 2,418 polygons in ${randLat}ms.`;
          const line2 = document.createElement('div');
          line2.className = q.tier.includes('SURCHARGE') ? 'term-line text-accent' : 'term-line';
          line2.textContent = `[${now}] [CLASSIFICATION] Result: ${q.tier} • Base fee: ${q.cost}.`;
          starlinkLog.appendChild(line1);
          starlinkLog.appendChild(line2);
          starlinkLog.scrollTop = starlinkLog.scrollHeight;
        }
      });
    }

    if (starlinkToggleBtn) {
      starlinkToggleBtn.addEventListener('click', function () {
        overlayActive = !overlayActive;
        if (starlinkCells) starlinkCells.textContent = overlayActive ? '2,418 Polygons' : '0 (Hidden)';

        if (starlinkLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line = document.createElement('div');
          line.className = 'term-line text-dim';
          line.textContent = `[${now}] [LAYER-TOGGLE] High-demand surcharge overlay: ${overlayActive ? 'ACTIVE (Layer visible)' : 'DISABLED (Layer hidden)'}.`;
          starlinkLog.appendChild(line);
          starlinkLog.scrollTop = starlinkLog.scrollHeight;
        }
      });
    }
  }

  // ===========================================================================
  // 5. ARCHITECTURAL SPECIFICATION DRAWER CONTROLLER
  // ===========================================================================
  function initProjectDrawer() {
    const projectDatabase = {
      'compass': {
        title: 'Come Together Compass — Community Aid Platform',
        fileTag: 'COMPASS_ARCHITECTURE.spec',
        image: 'assets/images/project-1.svg',
        repoUrl: 'https://github.com/TimothyH3/come-together-compass',
        desc: 'Full-stack community aid locator and anonymous triage platform with zero-fee federal geocoding.',
        benchmark: 'Sub-120ms geocoding lookup • Zero persistent user session retention',
        architecture: [
          'U.S. Census Bureau REST Integration: Bypasses commercial mapping provider rate-limits and subscription fees through federal endpoint caching.',
          'Volatile RAM State: All user filter preferences and coordinate inputs reside exclusively in Pinia memory; no local storage or tracking telemetry.',
          'Emergency Escalation Protocol: Immediate one-click bridge to the 988 Suicide & Crisis Lifeline with instant memory wipe.'
        ],
        decisions: [
          'Replaced Google Maps API with Leaflet and OpenStreetMap raster tiles to reduce running costs to $0.',
          'Structured modular API contracts between Express endpoints and the Vue 3 Composition API frontend.'
        ],
        stack: ['Vue 3', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'Leaflet', 'Pinia', 'Vitest']
      },
      'starlink-tracker': {
        title: 'Starlink Congestion & Relocation Tracker',
        fileTag: 'STARLINK_GEOSPATIAL_OVERLAY.spec',
        image: 'assets/images/project-3.svg',
        repoUrl: 'https://github.com/TimothyH3/starlink-tracker',
        desc: 'Interactive geospatial tool identifying satellite cell demand, capacity bottlenecks, and relocation surcharge zones.',
        benchmark: '1.8ms client-side ray-casting coordinate intersection across 2,400+ GeoJSON cell polygons',
        architecture: [
          'Polygon Boundary Parser: Ingests Starlink service cell boundaries from GeoJSON datasets and projects them onto Leaflet layers.',
          'Point-in-Polygon Ray-Casting: Runs lightweight point-in-polygon checks client-side, eliminating server roundtrips for address validation.',
          'Surcharge Zone Detection: Automatically flags mobile users when migrating across high-demand cell borders to avert unexpected billing fees.'
        ],
        decisions: [
          'Pre-indexed cell bounding boxes in a spatial R-tree to achieve sub-millisecond point queries on mobile devices.',
          'Built automated Python pipeline to fetch and refresh cell state delta updates.'
        ],
        stack: ['Vue 3', 'TypeScript', 'Python', 'GeoJSON', 'Leaflet', 'Pinia']
      }
    };

    const drawerBackdrop = document.getElementById('spec-drawer-backdrop');
    const drawerCloseBtn = document.getElementById('drawer-close-btn');
    const drawerContent = document.getElementById('drawer-content');
    const drawerFileTag = document.getElementById('drawer-file-tag');

    function openDrawer(key) {
      const data = projectDatabase[key];
      if (!data || !drawerContent) return;

      if (drawerFileTag) drawerFileTag.textContent = data.fileTag;

      drawerContent.innerHTML = `
        <img src="${data.image}" alt="${data.title}" class="drawer-media-img">
        <h3 class="drawer-h3 font-mono" id="drawer-title">${data.title}</h3>
        <p class="drawer-desc">${data.desc}</p>
        <div class="drawer-benchmark font-mono">⚡ ${data.benchmark}</div>
        <div class="drawer-section-title font-mono">Architecture &amp; Concurrency</div>
        <ul class="drawer-list">
          ${data.architecture.map(item => `<li><span class="bullet font-mono">•</span><span>${item}</span></li>`).join('')}
        </ul>
        <div class="drawer-section-title font-mono">Key Engineering Decisions</div>
        <ul class="drawer-list">
          ${data.decisions.map(item => `<li><span class="bullet font-mono">•</span><span>${item}</span></li>`).join('')}
        </ul>
        <div class="drawer-section-title font-mono">Technologies &amp; Protocols</div>
        <div class="drawer-stack-row font-mono">
          ${data.stack.map(tag => `<span class="drawer-tag">${tag}</span>`).join('')}
        </div>
        <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
          <a href="${data.repoUrl || 'https://github.com/TimothyH3'}" target="_blank" rel="noopener noreferrer" class="minimal-btn primary-btn font-mono">View Repository ↗</a>
          <button class="minimal-btn copy-btn font-mono" id="inner-drawer-close">Close Spec</button>
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
    initProjectDemos();
    initProjectDrawer();
    initCopyEmail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();