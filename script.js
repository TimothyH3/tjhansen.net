/**
 * Timothy Hansen — Portfolio Engine (tjhansen.net)
 * Features:
 * 1. Safe Theme Auto-Detection + One-Click Dark/Light Mode
 * 2. 3-Stage Optical Engine:
 *    - Act 0 (Overview & Profile): Connected via continuous vertical scroll
 *    - Title Slide & Card Cascade Transition (Act 0 -> Act 1): Fully scrubbable & pausable
 *    - Act 1 (Work & Stack): Connected via continuous vertical scroll
 *    - Optical Zoom Transition (Act 1 -> Act 2): Fully scrubbable & pausable
 *    - Act 2 (Contact): Centered connect stage
 * 3. 3-Stage Navigation HUD with live dot indicators and theme mode switcher
 * 4. Interactive Project Demo Pages: Zoom-in on click, zoom-out on click or scroll
 * 5. Interactive Simulation Toys for each demo (ApexQueue, CloudCanvas, PulseSync, SunDevil EdgeML)
 * 6. Copy Email Toast & Fallback
 */

(function () {
  'use strict';

  // Safe localStorage helper to prevent SecurityError on restricted origins (e.g. file://)
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

  // =========================================================================
  // 1. Theme Management (System Auto-Detect + Live Switcher)
  // =========================================================================
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

  // =========================================================================
  // 2. 3-Act Hybrid Vertical Scroll & Optical Zoom Engine
  // =========================================================================
  let globalEngine = null;

  function initScrollAndZoomEngine() {
    const act0 = document.getElementById('act-0');
    const act1 = document.getElementById('act-1');
    const act2 = document.getElementById('act-2');
    if (!act0 || !act1 || !act2) return;

    const act0Container = act0.querySelector('.act-scroll-container');
    const act1Container = act1.querySelector('.act-scroll-container');
    const act2Container = act2.querySelector('.act-scroll-container');
    const sectionProfile = document.getElementById('section-profile');

    // Morphing transition elements between Act 0 and Act 1
    const act0Header = document.getElementById('act0-chapter-header');
    const act0Label = document.getElementById('act0-chapter-label');
    const act1Header = document.getElementById('act1-chapter-header');
    const heroQuickLinks = document.getElementById('hero-quick-links');
    const heroStatement = document.querySelector('#section-hero .hero-statement');
    const heroSignalRow = document.querySelector('#section-hero .signal-row');
    const heroTitle = document.getElementById('hero-title');
    const act0StatementGrid = document.getElementById('act0-statement-grid');
    const act1Intro = document.getElementById('act1-section-intro');
    const projectCards = Array.from(document.querySelectorAll('#section-projects .project-bento-card'));

    const hudDots = Array.from(document.querySelectorAll('.hud-dot'));

    // Dynamic scroll milestone measurements
    let topPauseDist0 = 160;  // Soft cushion buffer at very top of Hero
    let vDist0 = 560;         // Vertical travel distance: Section 2 slides up to sit under chips
    let pauseDist0 = 340;     // Rest buffer at bottom of Act 0 before transition begins (~3-4 clicks)
    let tDist01 = 920;        // Title slide & staggered cards transition distance Act 0 -> Act 1
    let profileOffsetNeeded = 600; // Distance needed to position Section 2 offscreen below fold
    let excessHeight0 = 0;         // Container scroll adjustment for shorter screens

    let topPauseDist1 = 220;  // Rest buffer at top of Act 1 after transition completes (~2-3 clicks)
    let vDist1 = 750;         // Vertical travel distance Projects -> Stack
    let pauseDist1 = 340;     // Rest buffer at bottom of Act 1 before zoom begins (~3-4 clicks)
    let zDist12 = 450;        // Optical zoom transition distance Act 1 -> Act 2

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

    // Dynamic coordinate delta from act0Header to act1Header
    let headerDeltaX = 0;
    let headerDeltaY = 0;

    function updateHeaderDeltas() {
      if (!act0Header || !act1Header || !act0 || !act1) return;
      const prevAct0T = act0.style.transform;
      const prevAct1T = act1.style.transform;
      const prevAct0O = act0.style.opacity;
      const prevAct1O = act1.style.opacity;
      const prevT0 = act0Header.style.transform;
      const prevT1 = act1Header.style.transform;
      const prevProfT = sectionProfile ? sectionProfile.style.transform : '';
      const prevC0 = act0Container ? act0Container.style.transform : '';
      const prevC1 = act1Container ? act1Container.style.transform : '';

      // Force true 1:1 scale and clear transforms for exact coordinate measurement
      act0.style.transform = 'translate3d(0, 0, 0) scale(1)';
      act1.style.transform = 'translate3d(0, 0, 0) scale(1)';
      act0.style.filter = 'none';
      act1.style.filter = 'none';

      act0Header.style.transform = 'none';
      act1Header.style.transform = 'none';

      if (sectionProfile) sectionProfile.style.transform = 'translate3d(0, 0, 0)';
      if (act0Container) act0Container.style.transform = `translate3d(0, -${excessHeight0.toFixed(1)}px, 0)`;
      if (act1Container) act1Container.style.transform = 'translate3d(0, 0, 0)';

      const r0 = act0Header.getBoundingClientRect();
      const r1 = act1Header.getBoundingClientRect();
      headerDeltaX = r1.left - r0.left;
      headerDeltaY = r1.top - r0.top;

      act0.style.transform = prevAct0T;
      act1.style.transform = prevAct1T;
      act0.style.opacity = prevAct0O;
      act1.style.opacity = prevAct1O;
      act0Header.style.transform = prevT0;
      act1Header.style.transform = prevT1;
      if (sectionProfile) sectionProfile.style.transform = prevProfT;
      if (act0Container) act0Container.style.transform = prevC0;
      if (act1Container) act1Container.style.transform = prevC1;
    }

    function recalculateMilestones() {
      const vh = window.innerHeight;
      const sh0 = act0Container ? act0Container.scrollHeight : 1200;
      const sh1 = act1Container ? act1Container.scrollHeight : 1400;

      // Section 2 (Profile) slide-up metrics:
      // Offset needed so Section 2 starts fully below the viewport fold before scrolling
      const profileOffset = sectionProfile ? sectionProfile.offsetTop : 480;
      profileOffsetNeeded = Math.max(0, vh - profileOffset + 40);

      // Scroll container adjustment: only if total docked content exceeds viewport
      excessHeight0 = Math.max(0, sh0 - vh);

      topPauseDist0 = 160;
      vDist0 = 560;
      pauseDist0 = 340;
      tDist01 = 920;

      topPauseDist1 = 220;
      vDist1 = Math.max(500, sh1 - vh + 80);
      pauseDist1 = 340;
      zDist12 = 450;

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

      updateHeaderDeltas();
    }

    recalculateMilestones();
    window.addEventListener('resize', recalculateMilestones);

    // Continuous scroll progress
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

    // Smooth ease-in and ease-out S-curve for vertical content scrolling:
    // Starts with 0 velocity at p = 0, glides smoothly through the middle,
    // and coasts to 0 velocity at p = 1. Eliminates harsh starts AND harsh stops.
    function smoothTravel(p) {
      const clamped = Math.max(0, Math.min(1, p));
      return clamped * clamped * (3 - 2 * clamped);
    }

    // Direct Jump
    function scrollToAct(actIdx) {
      if (actIdx === 0) targetScroll = 0;
      else if (actIdx === 1) targetScroll = M1_TRANS_END;
      else if (actIdx === 2) targetScroll = M2_ZOOM_END;
    }

    // Dynamic scroll sensitivity cushion: gently softens wheel/touch input
    // when starting a new act AND when approaching the bottom of an act.
    function getScrollSensitivity(s, dy) {
      let baseSens = 0.85;

      // 1. Soft cushion when starting or near the top of Act 0 (Hero)
      if (dy > 0 && s <= (M0_TOP_PAUSE_END + vDist0 * 0.22)) {
        const ratio = Math.max(0, s / (M0_TOP_PAUSE_END + vDist0 * 0.22));
        baseSens = 0.52 + ratio * 0.33;
      }
      // 2. Soft cushion near the bottom of Act 0 (Profile)
      else if (dy > 0 && s >= (M0_VERT_END - vDist0 * 0.25) && s <= M0_BOTTOM_PAUSE_END) {
        const cushionProgress = (s - (M0_VERT_END - vDist0 * 0.25)) / (M0_BOTTOM_PAUSE_END - (M0_VERT_END - vDist0 * 0.25));
        baseSens = 0.85 - cushionProgress * 0.35;
      }
      // 3. Soft cushion when starting or near the top of Act 1 (Projects, right after transition)
      else if (dy > 0 && s >= M1_TRANS_END && s <= (M1_TOP_PAUSE_END + vDist1 * 0.22)) {
        const ratio = Math.max(0, (s - M1_TRANS_END) / (M1_TOP_PAUSE_END + vDist1 * 0.22 - M1_TRANS_END));
        baseSens = 0.52 + ratio * 0.33;
      }
      // 4. Soft cushion near the bottom of Act 1 (Stack)
      else if (dy > 0 && s >= (M1_VERT_END - vDist1 * 0.25) && s <= M1_BOTTOM_PAUSE_END) {
        const cushionProgress = (s - (M1_VERT_END - vDist1 * 0.25)) / (M1_BOTTOM_PAUSE_END - (M1_VERT_END - vDist1 * 0.25));
        baseSens = 0.85 - cushionProgress * 0.35;
      }
      // 5. Cushion when scrolling back upwards towards the top of Act 1
      else if (dy < 0 && s >= M1_TRANS_END && s <= (M1_TOP_PAUSE_END + vDist1 * 0.22)) {
        const ratio = Math.max(0, (s - M1_TRANS_END) / (M1_TOP_PAUSE_END + vDist1 * 0.22 - M1_TRANS_END));
        baseSens = 0.52 + ratio * 0.33;
      }
      // 6. Cushion when scrolling back upwards towards the top of Act 0
      else if (dy < 0 && s <= (M0_TOP_PAUSE_END + vDist0 * 0.22)) {
        const ratio = Math.max(0, s / (M0_TOP_PAUSE_END + vDist0 * 0.22));
        baseSens = 0.52 + ratio * 0.33;
      }

      return baseSens;
    }

    // Main 60/120fps render function
    function render(s) {
      // 1. Act 0: Overview & Profile (Top Cushion + Smooth S-Curve Travel + Reading Pause)
      if (s <= M0_BOTTOM_PAUSE_END) {
        let p = 0;
        let e = 0;

        if (s <= M0_TOP_PAUSE_END) {
          // At the start: held smoothly at the top of Hero (Section 2 hidden below fold)
          p = 0;
          e = 0;
        } else if (s <= M0_VERT_END) {
          // Smooth travel: Section 2 slides up from below viewport to dock directly under chips
          p = (s - M0_TOP_PAUSE_END) / vDist0;
          e = smoothTravel(p);
        } else {
          // At rest in the bottom pause buffer zone of Profile (Section 2 fully docked)
          p = 1;
          e = 1;
        }

        // Section 2 slide-up & fade-in: starts below viewport fold, slides up to 0 (docked directly under chips)
        if (sectionProfile) {
          const currentProfileOffset = (1 - e) * profileOffsetNeeded;
          const profileOpacity = Math.min(1, e * 1.8);
          sectionProfile.style.transform = `translate3d(0, ${currentProfileOffset.toFixed(1)}px, 0)`;
          sectionProfile.style.opacity = profileOpacity.toFixed(3);
          sectionProfile.style.pointerEvents = e > 0.6 ? 'auto' : 'none';
        }

        // Container adjustment: if viewport is shorter than combined Hero + Profile, smoothly adjust
        const containerY = -e * excessHeight0;
        if (act0Container) act0Container.style.transform = `translate3d(0, ${containerY.toFixed(1)}px, 0)`;

        act0.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act0.style.filter = 'none';
        act0.style.opacity = '1';
        act0.style.pointerEvents = 'auto';
        act0.style.zIndex = '10';

        // Ensure Act 0 elements are in natural state before transition begins
        act0Label.textContent = 'Perspective & Engineering Mindset';
        act0Header.style.transform = 'none';
        act0Header.style.opacity = '1';

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

        if (act1Header) act1Header.style.opacity = '0';
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
      // 2. Micro-Animation & Dynamic Slide Transition: Act 0 -> Act 1 (Fully Scrollable & Scrubbable)
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

        // Lazy initialize deltas if 0
        if (headerDeltaY === 0) {
          updateHeaderDeltas();
        }

        // Title Slide to Act 1 location (t: 0 -> 0.65)
        act0Label.textContent = 'Selected Engineering Projects';

        const pSlide = Math.min(1, t / 0.65);
        const eSlide = smoothTravel(pSlide);
        const curX = eSlide * headerDeltaX;
        const curY = eSlide * headerDeltaY;
        act0Header.style.transform = `translate3d(${curX.toFixed(1)}px, ${curY.toFixed(1)}px, 0)`;

        // Quick link chips slide upward out of view
        if (heroQuickLinks) {
          const chipsY = -eSlide * 52;
          const chipsOpacity = Math.max(0, 1 - eSlide * 1.3);
          heroQuickLinks.style.transform = `translate3d(0, ${chipsY.toFixed(1)}px, 0)`;
          heroQuickLinks.style.opacity = chipsOpacity.toFixed(3);
          heroQuickLinks.style.pointerEvents = eSlide > 0.4 ? 'none' : 'auto';
        }

        // Act 0 body text disappears
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

        // Act 1 Section intro appears
        if (act1Intro) {
          const pIntro = Math.min(1, Math.max(0, (t - 0.30) / 0.30));
          const eIntro = smoothTravel(pIntro);
          act1Intro.style.opacity = eIntro.toFixed(3);
          act1Intro.style.transform = `translate3d(0, ${((1 - eIntro) * 24).toFixed(1)}px, 0)`;
        }

        // Hand off header visibility to act1Header at the very end of slide
        if (act1Header) {
          act1Header.style.opacity = t >= 0.95 ? '1' : '0';
          act1Header.style.transform = 'none';
        }
        act0Header.style.opacity = t >= 0.95 ? '0' : '1';

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
      // 3. Act 1: Work & Stack (Top Cushion + Smooth S-Curve Travel + Reading Pause)
      else if (s >= M1_TRANS_END && s <= M1_BOTTOM_PAUSE_END) {
        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';

        if (act1Header) {
          act1Header.style.opacity = '1';
          act1Header.style.transform = 'none';
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
          // At the start of Act 1: hold smoothly at the top of Selected Work so user can read!
          translateY = 0;
        } else if (s <= M1_VERT_END) {
          // Smooth travel from Projects down to Stack (soft start + soft stop)
          const p = (s - M1_TOP_PAUSE_END) / vDist1;
          translateY = -smoothTravel(p) * maxOffset1;
        } else {
          // At rest in the bottom pause buffer zone of Stack
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
        act2.style.filter = 'blur(28px)';
        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';
        act2.style.zIndex = '5';
        if (act2Container) act2Container.style.transform = 'translate3d(0, 0, 0)';

        updateHUD(1);
      }
      // 4. Optical Zoom Transition Act 1 -> Act 2 (Continuously scrubbable & pausable)
      else if (s > M2_ZOOM_START && s < M2_ZOOM_END) {
        const t = Math.max(0, Math.min(1, (s - M2_ZOOM_START) / zDist12));

        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';

        // Act 1 pinned at bottom of stack, zooming forward
        const maxOffset1 = act1Container ? Math.max(0, act1Container.scrollHeight - window.innerHeight) : 0;
        if (act1Container) act1Container.style.transform = `translate3d(0, -${maxOffset1}px, 0)`;

        const scale1 = 1.0 + t * 1.25;
        const blur1 = Math.pow(t, 1.35) * 32;
        const opacity1 = Math.max(0, 1 - Math.pow(t, 1.25));

        act1.style.transform = `translate3d(0, 0, 0) scale(${scale1.toFixed(3)})`;
        act1.style.filter = `blur(${blur1.toFixed(1)}px)`;
        act1.style.opacity = opacity1.toFixed(3);
        act1.style.zIndex = '20';
        act1.style.pointerEvents = t < 0.25 ? 'auto' : 'none';

        // Act 2 zooming in from background
        if (act2Container) act2Container.style.transform = 'translate3d(0, 0, 0)';
        const scale2 = 0.55 + t * 0.45;
        const blur2 = Math.pow(1 - t, 1.35) * 28;
        const opacity2 = Math.max(0, Math.pow(t, 1.25));

        act2.style.transform = `translate3d(0, 0, 0) scale(${scale2.toFixed(3)})`;
        act2.style.filter = `blur(${blur2.toFixed(1)}px)`;
        act2.style.opacity = opacity2.toFixed(3);
        act2.style.zIndex = '10';
        act2.style.pointerEvents = t > 0.75 ? 'auto' : 'none';

        updateHUD(t >= 0.5 ? 2 : 1);
      }
      // 5. Act 2: Contact
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

    // 60/120fps Inertia Physics Loop
    function animationLoop() {
      const diff = targetScroll - currentScroll;
      if (Math.abs(diff) > 0.05) {
        currentScroll += diff * 0.11;
      } else {
        currentScroll = targetScroll;
      }

      render(currentScroll);
      requestAnimationFrame(animationLoop);
    }

    requestAnimationFrame(animationLoop);

    // Wheel input with comfortable sensitivity & progressive cushion damping
    window.addEventListener('wheel', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      e.preventDefault();

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;
      else if (e.deltaMode === 2) dy *= 300;

      // Dynamic sensitivity: cushions wheel speed as user reaches the bottom of an act
      const sens = getScrollSensitivity(targetScroll, dy);
      targetScroll = Math.max(0, Math.min(TOTAL_SCROLL, targetScroll + dy * sens));
    }, { passive: false });

    // Touch input (Mobile & Tablets)
    let touchStartY = 0;
    window.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      if (e.touches && e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const dy = touchStartY - currentY;
        touchStartY = currentY;

        // Apply smooth cushion damping to touch swipes as well
        const sensRatio = getScrollSensitivity(targetScroll, dy) / 0.85;
        targetScroll = Math.max(0, Math.min(TOTAL_SCROLL, targetScroll + dy * 1.35 * sensRatio));
      }
    }, { passive: true });

    // Keyboard navigation
    window.addEventListener('keydown', function (e) {
      if (document.body.classList.contains('demo-is-open')) return;
      const specDrawer = document.getElementById('spec-drawer-backdrop');
      if (specDrawer && specDrawer.classList.contains('open')) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        targetScroll = Math.min(TOTAL_SCROLL, targetScroll + 260);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        targetScroll = Math.max(0, targetScroll - 260);
      } else if (e.key === 'Home') {
        e.preventDefault();
        targetScroll = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        targetScroll = TOTAL_SCROLL;
      }
    });

    // Jump buttons (Hero actions, Footer back to top)
    document.querySelectorAll('.jump-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const act = parseInt(btn.getAttribute('data-target-act'), 10);
        scrollToAct(act);
      });
    });

    // HUD dots click
    hudDots.forEach(dot => {
      dot.addEventListener('click', function () {
        const act = parseInt(dot.getAttribute('data-act'), 10);
        scrollToAct(act);
      });
    });

    globalEngine = {
      scrollToAct: scrollToAct,
      getTargetScroll: () => targetScroll,
      setTargetScroll: (v) => { targetScroll = v; }
    };
  }

  // =========================================================================
  // 3. Project Stub Demo Pages (Zoom In On Click, Zoom Out On Click Or Scroll)
  // =========================================================================
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

      // Select matching view
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

    // Also open on clicking project card itself (except when clicking direct source link or specs)
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

    demoOverlay.addEventListener('click', function (e) {
      if (e.target === demoOverlay) {
        closeDemo();
      }
    });

    // User requirement: "zoom transitions back again on click or scroll"
    window.addEventListener('wheel', function (e) {
      if (!isDemoOpen) return;

      demoScrollAccumulator += Math.abs(e.deltaY);
      // After a deliberate scroll movement (> 50px), zoom back out to projects!
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
    // Interactive Simulation Toys within Demos
    // =========================================================================

    // 1. Come Together Compass Simulation
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

    // 2. Erised AI (Manifest V3) Simulation
    const erisedExtractBtn = document.getElementById('erised-extract-btn');
    const erisedInjectBtn = document.getElementById('erised-inject-btn');
    const erisedLatency = document.getElementById('erised-latency-val');
    const erisedFlow = document.getElementById('erised-flow-val');
    const erisedLog = document.getElementById('erised-log');

    const sampleScenes = [
      'Chapter IV: The lantern cast long shadows across the cobblestones, catching mist in amber light.',
      'Chapter VII: Rain beat against the stained-glass window, reflecting azure geometry along the stone hearth.',
      'Chapter XII: Beyond the fortress ramparts, a silent fleet glided across the star-strewn harbor.'
    ];
    let sceneIdx = 0;

    if (erisedExtractBtn) {
      erisedExtractBtn.addEventListener('click', function () {
        const scene = sampleScenes[sceneIdx % sampleScenes.length];
        sceneIdx++;

        if (erisedLatency) erisedLatency.textContent = '3.8 ms';
        if (erisedFlow) erisedFlow.textContent = 'Prompt Dispatched';

        if (erisedLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-dim';
          line1.textContent = `[${now}] [DOM-SCAN] Extracted paragraph text: "${scene.substring(0, 58)}..."`;
          const line2 = document.createElement('div');
          line2.className = 'term-line text-green';
          line2.textContent = `[${now}] [MV3-DISPATCH] Headless background worker formulated zero-cost contextual prompt payload.`;
          erisedLog.appendChild(line1);
          erisedLog.appendChild(line2);
          erisedLog.scrollTop = erisedLog.scrollHeight;
        }
      });
    }

    if (erisedInjectBtn) {
      erisedInjectBtn.addEventListener('click', function () {
        if (erisedLatency) erisedLatency.textContent = '2.4 ms';
        if (erisedFlow) erisedFlow.textContent = 'Zero Reflow (Injected)';

        if (erisedLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line = document.createElement('div');
          line.className = 'term-line text-green';
          line.textContent = `[${now}] [DOM-STREAM] Injected 1024x640 canvas illustration directly into active reader viewport without altering reader scroll offset.`;
          erisedLog.appendChild(line);
          erisedLog.scrollTop = erisedLog.scrollHeight;
        }
      });
    }

    // 3. Starlink Congestion Tracker Simulation
    const starlinkQueryBtn = document.getElementById('starlink-query-btn');
    const starlinkToggleBtn = document.getElementById('starlink-toggle-btn');
    const starlinkLatency = document.getElementById('starlink-latency-val');
    const starlinkStatus = document.getElementById('starlink-status-val');
    const starlinkLog = document.getElementById('starlink-log');

    let surchargeActive = false;

    if (starlinkQueryBtn) {
      starlinkQueryBtn.addEventListener('click', function () {
        const lat = (33.5 + Math.random() * 0.4).toFixed(4);
        const lon = (-112.0 + Math.random() * 0.4).toFixed(4);
        const lookupTime = (1.4 + Math.random() * 0.8).toFixed(1);

        if (starlinkLatency) starlinkLatency.textContent = `${lookupTime} ms`;

        if (starlinkLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line';
          line1.textContent = `[${now}] [POINT-QUERY] Client ray-casting point (${lat}° N, ${lon}° W) across 2,418 GeoJSON polygons...`;
          const line2 = document.createElement('div');
          line2.className = 'term-line text-green';
          line2.textContent = `[${now}] [CELL-MATCH] Cell #AZ-PHX-084 matched in ${lookupTime}ms. Capacity: 84% (Standard Tier, No Surcharge).`;
          starlinkLog.appendChild(line1);
          starlinkLog.appendChild(line2);
          starlinkLog.scrollTop = starlinkLog.scrollHeight;
        }
      });
    }

    if (starlinkToggleBtn) {
      starlinkToggleBtn.addEventListener('click', function () {
        surchargeActive = !surchargeActive;
        if (surchargeActive) {
          if (starlinkStatus) {
            starlinkStatus.textContent = 'HIGH-DEMAND SURCHARGE ZONE ($100)';
            starlinkStatus.className = 'demo-stat-val text-accent';
          }
          if (starlinkLog) {
            const now = new Date().toISOString().substring(11, 23);
            const line = document.createElement('div');
            line.className = 'term-line text-accent';
            line.textContent = `[${now}] [SURCHARGE-ALERT] Mobile node entered high-demand cell boundary. Warning user of relocation fee surcharge.`;
            starlinkLog.appendChild(line);
            starlinkLog.scrollTop = starlinkLog.scrollHeight;
          }
        } else {
          if (starlinkStatus) {
            starlinkStatus.textContent = 'STANDARD TIER ($0)';
            starlinkStatus.className = 'demo-stat-val text-green';
          }
          if (starlinkLog) {
            const now = new Date().toISOString().substring(11, 23);
            const line = document.createElement('div');
            line.className = 'term-line text-green';
            line.textContent = `[${now}] [SURCHARGE-CLEARED] Cell boundary reset to standard residential service tier.`;
            starlinkLog.appendChild(line);
            starlinkLog.scrollTop = starlinkLog.scrollHeight;
          }
        }
      });
    }

    // 4. Healthcare Operations Simulation
    const healthSurgeBtn = document.getElementById('health-surge-btn');
    const healthTestBtn = document.getElementById('health-test-btn');
    const healthTps = document.getElementById('health-tps-val');
    const healthCoverage = document.getElementById('health-coverage-val');
    const healthQueue = document.getElementById('health-queue-val');
    const healthLog = document.getElementById('health-log');

    let surgeActive = false;

    if (healthSurgeBtn) {
      healthSurgeBtn.addEventListener('click', function () {
        surgeActive = !surgeActive;
        if (surgeActive) {
          if (healthTps) healthTps.textContent = '14,800 events/sec';
          if (healthQueue) healthQueue.textContent = '39 / 40 ICU Beds (SURGE)';

          if (healthLog) {
            const now = new Date().toISOString().substring(11, 23);
            const line1 = document.createElement('div');
            line1.className = 'term-line text-accent';
            line1.textContent = `[${now}] [SURGE-EVENT] Dispatched 50 triage patient arrivals to ConcurrentPriorityQueue.`;
            const line2 = document.createElement('div');
            line2.className = 'term-line text-green';
            line2.textContent = `[${now}] [SCHEDULER] Acquired re-prioritized worker locks without deadlock. Avg triage wait: 3.2min.`;
            healthLog.appendChild(line1);
            healthLog.appendChild(line2);
            healthLog.scrollTop = healthLog.scrollHeight;
          }
        } else {
          if (healthTps) healthTps.textContent = '5,200 events/sec';
          if (healthQueue) healthQueue.textContent = '34 / 40 ICU Beds';

          if (healthLog) {
            const now = new Date().toISOString().substring(11, 23);
            const line = document.createElement('div');
            line.className = 'term-line text-green';
            line.textContent = `[${now}] [STEADY-STATE] ICU surge absorbed. Patient queue restored to nominal baseline.`;
            healthLog.appendChild(line);
            healthLog.scrollTop = healthLog.scrollHeight;
          }
        }
      });
    }

    if (healthTestBtn) {
      healthTestBtn.addEventListener('click', function () {
        if (healthCoverage) healthCoverage.textContent = '96.8% Branch';

        if (healthLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-green';
          line1.textContent = `[${now}] [JUNIT-5] Executed 142 parameterized unit tests in 184ms: 142 PASSED, 0 FAILED.`;
          const line2 = document.createElement('div');
          line2.className = 'term-line text-green';
          line2.textContent = `[${now}] [SPOTBUGS & JACOCO] 0 high/medium bugs reported. CI verification quality gate PASSED.`;
          healthLog.appendChild(line1);
          healthLog.appendChild(line2);
          healthLog.scrollTop = healthLog.scrollHeight;
        }
      });
    }
  }

  // =========================================================================
  // 4. Project Specification Database & Drawer
  // =========================================================================
  function initProjectDrawer() {
    const projectDatabase = {
      'compass': {
        title: 'Come Together Compass — Community Aid & Triage',
        fileTag: 'COMPASS_GEOSPATIAL_SPEC.md',
        image: 'assets/images/project-1.svg',
        repoUrl: 'https://github.com/TimothyH3/come-together-compass',
        desc: 'Full-stack community aid locator and anonymous triage platform integrating federal geocoding, client-side OpenStreetMap tiles, and zero-retention session privacy.',
        benchmark: 'Sub-120ms U.S. Census Geocoding resolution • 0-byte persistent data retention for at-risk user privacy',
        architecture: [
          'U.S. Census Bureau Geocoding Pipeline: Intercepts addresses and resolves latitude/longitude without commercial API rate-limits or subscription fees.',
          'Leaflet / OpenStreetMap Integration: Renders localized mutual aid hubs with custom SVG markers and dynamic bounding-box filtering.',
          'Zero-Retention Session Architecture: Stores sensitive triage inputs exclusively in volatile Pinia state, wiping state vectors upon session close.'
        ],
        decisions: [
          'Implemented direct client-side sanitization and rapid 988 Crisis Lifeline escalation triggers.',
          'Used Vitest and TypeScript strict typing to ensure 100% type safety across geospatial coordinates and aid provider payloads.'
        ],
        stack: ['Vue 3', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'Leaflet', 'Pinia', 'Vitest']
      },
      'erised-ai': {
        title: 'Erised AI — Dynamic Literary eBook Illustrator',
        fileTag: 'ERISED_MV3_EXTENSION.spec',
        image: 'assets/images/project-2.svg',
        repoUrl: 'https://github.com/TimothyH3/erised-ai',
        desc: 'Chrome extension generating real-time, context-aware literary scene artwork using background service workers and in-memory DOM injection pipelines.',
        benchmark: '< 5ms DOM rendering latency • Zero external commercial API key dependency',
        architecture: [
          'Manifest V3 Service Worker: Manages headless browser automation channels without maintaining persistent background page overhead.',
          'Contextual Passage Chunking: Analyzes narrative paragraphs in the DOM and extracts semantic visual anchors for prompt formulation.',
          'In-Memory Canvas Pipeline: Streams generated illustration payloads directly to in-memory blob URLs, eliminating disk writes and reading stutter.'
        ],
        decisions: [
          'Decoupled prompt synthesis from the reading DOM to ensure standard EPUB/web page layouts never reflow or lose reader scroll position.',
          'Configured fallback procedural placeholders during transient network disconnections.'
        ],
        stack: ['JavaScript', 'TypeScript', 'Chrome Extensions (MV3)', 'Headless Automation', 'DOM APIs', 'Canvas']
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
      },
      'healthcare-sim': {
        title: 'Healthcare Operations Simulation — Enterprise Logistics',
        fileTag: 'HEALTHCARE_LOGISTICS_JAVA.spec',
        image: 'assets/images/project-4.svg',
        repoUrl: 'https://github.com/TimothyH3',
        desc: 'Enterprise discrete-event hospital logistics engine and resource optimization simulator engineered in Java with comprehensive test coverage.',
        benchmark: 'Simulates 50,000 patient-nurse interactions in < 350ms • 96.4% branch coverage via JUnit 5',
        architecture: [
          'Thread-Safe Event Queue: ConcurrentPriorityQueue schedules asynchronous triage assessments, bed transfers, and doctor consultations.',
          'Resource Contention Arbiter: Optimizes ICU bed utilization, preventing deadlock during simultaneous emergency room arrivals.',
          'CI/CD Quality Gate: Enforces zero SpotBugs warnings, Checkstyle formatting, and 95%+ JaCoCo branch coverage on every commit.'
        ],
        decisions: [
          'Adopted immutable patient event records to guarantee deterministic simulation reproducibility.',
          'Built JavaFX telemetry dashboards to visualize real-time bed utilization bottlenecks.'
        ],
        stack: ['Java 17', 'JavaFX', 'JUnit 5', 'JaCoCo', 'SpotBugs', 'Checkstyle', 'Concurrency']
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

      drawerBackdrop.classList.add('open');
      drawerBackdrop.setAttribute('aria-hidden', 'false');

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

  // =========================================================================
  // 5. One-Click Copy Email & Toast
  // =========================================================================
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

  // =========================================================================
  // 6. Terminal Entrance Intro Animation (In-Place at Hero Name)
  // =========================================================================
  function initIntroAnimation() {
    const terminalLine = document.getElementById('intro-terminal-line');
    const textEl = document.getElementById('intro-text');
    const realName = document.getElementById('hero-real-name');
    const cursorEl = document.getElementById('intro-cursor');

    if (!terminalLine || !textEl || !realName) return;

    // Accessibility check: skip immediately if prefers-reduced-motion is requested
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      document.body.classList.remove('intro-active');
      document.body.classList.add('intro-revealed');
      return;
    }

    const command = 'python tjhansen.py';
    let charIndex = 0;
    let isDone = false;

    // Immediately mark body as intro-active (keeps screen blank except prompt line)
    document.body.classList.add('intro-active');

    function completeIntro() {
      if (isDone) return;
      isDone = true;

      // 1. Hide terminal line
      if (terminalLine) {
        terminalLine.style.opacity = '0';
        terminalLine.style.transform = 'translateY(14px) scale(0.96)';
      }
      if (cursorEl) {
        cursorEl.style.opacity = '0';
      }

      // 2. Reveal Timothy Hansen letters in place and smoothly reveal rest of page
      document.body.classList.remove('intro-active');
      document.body.classList.add('intro-revealed');

      // 3. Remove terminal line from flow once morph completes
      setTimeout(() => {
        if (terminalLine) terminalLine.style.display = 'none';
      }, 420);
    }

    // Allow user to click anywhere or press any key to skip immediately
    window.addEventListener('click', completeIntro, { once: true });
    window.addEventListener('keydown', completeIntro, { once: true });

    // Step 1: Blank screen with floating cursor behind > symbol right where name is
    // Start typing after 140ms
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

          // Step 2: Brief pause after typing completes, then Enter key downward bounce
          setTimeout(() => {
            if (isDone) return;

            // All letters do downward bounce signifying Enter key press
            if (terminalLine) terminalLine.classList.add('enter-strike');

            // Step 3: Right as they hit the bottom of the bounce (~140ms into the strike):
            // Morph into Timothy Hansen letters in the exact formatting and location on the home screen!
            setTimeout(() => {
              completeIntro();
            }, 140); // 140ms into the bounce

          }, 180); // 180ms delay after typing completes
        }
      }, 45); // 45ms interval between typed characters

    }, 140); // 140ms before typing starts
  }

  // Boot all subsystems
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initTheme();
      initIntroAnimation();
      initScrollAndZoomEngine();
      initProjectDemos();
      initProjectDrawer();
      initCopyEmail();
    });
  } else {
    initTheme();
    initIntroAnimation();
    initScrollAndZoomEngine();
    initProjectDemos();
    initProjectDrawer();
    initCopyEmail();
  }

})();
