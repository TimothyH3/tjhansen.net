/**
 * Timothy Hansen — Portfolio Engine (tjhansen.net)
 * Features:
 * 1. Safe Theme Auto-Detection + One-Click Dark/Light Mode
 * 2. 3-Stage Optical Engine:
 *    - Act 0 (Overview & Profile): Connected via continuous vertical scroll
 *    - Optical Zoom Transition (Act 0 -> Act 1): Fully scrubbable & pausable
 *    - Act 1 (Work & Stack): Connected via continuous vertical scroll
 *    - Optical Zoom Transition (Act 1 -> Act 2): Fully scrubbable & pausable
 *    - Act 2 (Contact): Centered connect stage
 * 3. 3-Stage Navigation HUD with live dot indicators and progress counter
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

    const hudStepCounter = document.getElementById('hud-step-counter');
    const hudStepTitle = document.getElementById('hud-step-title');
    const hudDots = Array.from(document.querySelectorAll('.hud-dot'));

    // Dynamic scroll milestone measurements
    let topPauseDist0 = 160;  // Soft cushion buffer at very top of Hero
    let vDist0 = 650;         // Vertical travel distance Hero -> Profile
    let pauseDist0 = 340;     // Rest buffer at bottom of Act 0 before zoom begins (~3-4 clicks)
    let zDist01 = 450;        // Optical zoom transition distance

    let topPauseDist1 = 220;  // Rest buffer at top of Act 1 after zoom completes (~2-3 clicks)
    let vDist1 = 750;         // Vertical travel distance Projects -> Stack
    let pauseDist1 = 340;     // Rest buffer at bottom of Act 1 before zoom begins (~3-4 clicks)
    let zDist12 = 450;        // Optical zoom transition distance

    let M0_START = 0;
    let M0_TOP_PAUSE_END = topPauseDist0;
    let M0_VERT_END = M0_TOP_PAUSE_END + vDist0;
    let M0_BOTTOM_PAUSE_END = M0_VERT_END + pauseDist0;

    let M1_ZOOM_START = M0_BOTTOM_PAUSE_END;
    let M1_ZOOM_END = M1_ZOOM_START + zDist01;

    let M1_TOP_PAUSE_END = M1_ZOOM_END + topPauseDist1;
    let M1_VERT_END = M1_TOP_PAUSE_END + vDist1;
    let M1_BOTTOM_PAUSE_END = M1_VERT_END + pauseDist1;

    let M2_ZOOM_START = M1_BOTTOM_PAUSE_END;
    let M2_ZOOM_END = M2_ZOOM_START + zDist12;
    let TOTAL_SCROLL = M2_ZOOM_END;

    function recalculateMilestones() {
      const vh = window.innerHeight;
      const sh0 = act0Container ? act0Container.scrollHeight : 1200;
      const sh1 = act1Container ? act1Container.scrollHeight : 1400;

      topPauseDist0 = 160;
      vDist0 = Math.max(450, sh0 - vh + 80);
      pauseDist0 = 340;
      zDist01 = 450;

      topPauseDist1 = 220;
      vDist1 = Math.max(500, sh1 - vh + 80);
      pauseDist1 = 340;
      zDist12 = 450;

      M0_START = 0;
      M0_TOP_PAUSE_END = topPauseDist0;
      M0_VERT_END = M0_TOP_PAUSE_END + vDist0;
      M0_BOTTOM_PAUSE_END = M0_VERT_END + pauseDist0;

      M1_ZOOM_START = M0_BOTTOM_PAUSE_END;
      M1_ZOOM_END = M1_ZOOM_START + zDist01;

      M1_TOP_PAUSE_END = M1_ZOOM_END + topPauseDist1;
      M1_VERT_END = M1_TOP_PAUSE_END + vDist1;
      M1_BOTTOM_PAUSE_END = M1_VERT_END + pauseDist1;

      M2_ZOOM_START = M1_BOTTOM_PAUSE_END;
      M2_ZOOM_END = M2_ZOOM_START + zDist12;
      TOTAL_SCROLL = M2_ZOOM_END;
    }

    recalculateMilestones();
    window.addEventListener('resize', recalculateMilestones);

    // Continuous scroll progress
    let targetScroll = 0;
    let currentScroll = 0;

    // HUD update helper
    let currentActIndex = 0;
    const actTitles = ['Overview & Profile', 'Work & Stack', 'Contact'];

    function updateHUD(actIdx) {
      if (currentActIndex !== actIdx) {
        currentActIndex = actIdx;
        if (hudStepCounter) hudStepCounter.textContent = `0${actIdx + 1}`;
        if (hudStepTitle) hudStepTitle.textContent = actTitles[actIdx] || '';
        hudDots.forEach((dot, i) => {
          dot.classList.toggle('active', i === actIdx);
        });
      }
    }

    // Direct Jump
    function scrollToAct(actIdx) {
      if (actIdx === 0) targetScroll = 0;
      else if (actIdx === 1) targetScroll = M1_ZOOM_END;
      else if (actIdx === 2) targetScroll = M2_ZOOM_END;
    }

    // Smooth ease-in and ease-out S-curve for vertical content scrolling:
    // Starts with 0 velocity at p = 0, glides smoothly through the middle,
    // and coasts to 0 velocity at p = 1. Eliminates harsh starts AND harsh stops.
    function smoothTravel(p) {
      const clamped = Math.max(0, Math.min(1, p));
      return clamped * clamped * (3 - 2 * clamped);
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
      // 3. Soft cushion when starting or near the top of Act 1 (Projects, right after zoom)
      else if (dy > 0 && s >= M1_ZOOM_END && s <= (M1_TOP_PAUSE_END + vDist1 * 0.22)) {
        const ratio = Math.max(0, (s - M1_ZOOM_END) / (M1_TOP_PAUSE_END + vDist1 * 0.22 - M1_ZOOM_END));
        baseSens = 0.52 + ratio * 0.33;
      }
      // 4. Soft cushion near the bottom of Act 1 (Stack)
      else if (dy > 0 && s >= (M1_VERT_END - vDist1 * 0.25) && s <= M1_BOTTOM_PAUSE_END) {
        const cushionProgress = (s - (M1_VERT_END - vDist1 * 0.25)) / (M1_BOTTOM_PAUSE_END - (M1_VERT_END - vDist1 * 0.25));
        baseSens = 0.85 - cushionProgress * 0.35;
      }
      // 5. Cushion when scrolling back upwards towards the top of Act 1
      else if (dy < 0 && s >= M1_ZOOM_END && s <= (M1_TOP_PAUSE_END + vDist1 * 0.22)) {
        const ratio = Math.max(0, (s - M1_ZOOM_END) / (M1_TOP_PAUSE_END + vDist1 * 0.22 - M1_ZOOM_END));
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
        const maxOffset0 = act0Container ? Math.max(0, act0Container.scrollHeight - window.innerHeight) : 0;
        let translateY = 0;

        if (s <= M0_TOP_PAUSE_END) {
          // At the start: held smoothly at the top of Hero
          translateY = 0;
        } else if (s <= M0_VERT_END) {
          // Smooth travel from Hero down to Profile (soft start + soft stop)
          const p = (s - M0_TOP_PAUSE_END) / vDist0;
          translateY = -smoothTravel(p) * maxOffset0;
        } else {
          // At rest in the bottom pause buffer zone of Profile
          translateY = -maxOffset0;
        }

        act0.style.transform = 'translate3d(0, 0, 0) scale(1)';
        act0.style.filter = 'none';
        act0.style.opacity = '1';
        act0.style.pointerEvents = 'auto';
        act0.style.zIndex = '10';
        if (act0Container) act0Container.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0)`;

        // Act 1 pre-staged in background
        act1.style.transform = 'translate3d(0, 0, 0) scale(0.55)';
        act1.style.filter = 'blur(28px)';
        act1.style.opacity = '0';
        act1.style.pointerEvents = 'none';
        act1.style.zIndex = '5';
        if (act1Container) act1Container.style.transform = 'translate3d(0, 0, 0)';

        // Act 2 hidden
        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';

        updateHUD(0);
      }
      // 2. Optical Zoom Transition Act 0 -> Act 1 (Continuously scrubbable & pausable)
      else if (s > M1_ZOOM_START && s < M1_ZOOM_END) {
        const t = Math.max(0, Math.min(1, (s - M1_ZOOM_START) / zDist01));

        // Act 0 pinned at bottom of profile, zooming forward into optical bokeh
        const maxOffset0 = act0Container ? Math.max(0, act0Container.scrollHeight - window.innerHeight) : 0;
        if (act0Container) act0Container.style.transform = `translate3d(0, -${maxOffset0}px, 0)`;

        const scale0 = 1.0 + t * 1.25;
        const blur0 = Math.pow(t, 1.35) * 32;
        const opacity0 = Math.max(0, 1 - Math.pow(t, 1.25));

        act0.style.transform = `translate3d(0, 0, 0) scale(${scale0.toFixed(3)})`;
        act0.style.filter = `blur(${blur0.toFixed(1)}px)`;
        act0.style.opacity = opacity0.toFixed(3);
        act0.style.zIndex = '20';
        act0.style.pointerEvents = t < 0.25 ? 'auto' : 'none';

        // Act 1 pinned at top, zooming in from background
        if (act1Container) act1Container.style.transform = 'translate3d(0, 0, 0)';
        const scale1 = 0.55 + t * 0.45;
        const blur1 = Math.pow(1 - t, 1.35) * 28;
        const opacity1 = Math.max(0, Math.pow(t, 1.25));

        act1.style.transform = `translate3d(0, 0, 0) scale(${scale1.toFixed(3)})`;
        act1.style.filter = `blur(${blur1.toFixed(1)}px)`;
        act1.style.opacity = opacity1.toFixed(3);
        act1.style.zIndex = '10';
        act1.style.pointerEvents = t > 0.75 ? 'auto' : 'none';

        act2.style.opacity = '0';
        act2.style.pointerEvents = 'none';

        updateHUD(t >= 0.5 ? 1 : 0);
      }
      // 3. Act 1: Work & Stack (Top Cushion + Smooth S-Curve Travel + Reading Pause)
      else if (s >= M1_ZOOM_END && s <= M1_BOTTOM_PAUSE_END) {
        act0.style.opacity = '0';
        act0.style.pointerEvents = 'none';

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

    // 1. ApexQueue Simulation
    const apexBurstBtn = document.getElementById('apex-burst-btn');
    const apexRebalanceBtn = document.getElementById('apex-rebalance-btn');
    const apexThroughput = document.getElementById('apex-throughput');
    const apexLatency = document.getElementById('apex-latency');
    const apexTasks = document.getElementById('apex-tasks');
    const apexLog = document.getElementById('apex-log');

    let taskCount = 84120;
    if (apexBurstBtn) {
      apexBurstBtn.addEventListener('click', function () {
        taskCount += 2000;
        if (apexTasks) apexTasks.textContent = taskCount.toLocaleString();
        if (apexThroughput) apexThroughput.textContent = '24,800 msg/s';
        if (apexLatency) apexLatency.textContent = '16.4 ms';

        if (apexLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line = document.createElement('div');
          line.className = 'term-line text-green';
          line.textContent = `[${now}] [BURST] Dispatched 2,000 tasks across partitions 0, 1, 2. WAL batch commit OK.`;
          apexLog.appendChild(line);
          apexLog.scrollTop = apexLog.scrollHeight;
        }

        setTimeout(() => {
          if (apexThroughput) apexThroughput.textContent = '12,400 msg/s';
          if (apexLatency) apexLatency.textContent = '14.8 ms';
        }, 2200);
      });
    }

    if (apexRebalanceBtn) {
      apexRebalanceBtn.addEventListener('click', function () {
        if (apexLog) {
          const now = new Date().toISOString().substring(11, 23);
          const line1 = document.createElement('div');
          line1.className = 'term-line text-dim';
          line1.textContent = `[${now}] [REBALANCE] Node-03 heartbeat timeout. Triggering consumer group arbitration.`;
          const line2 = document.createElement('div');
          line2.className = 'term-line text-green';
          line2.textContent = `[${now}] [REBALANCE] Partitions re-assigned to Node-01, Node-02 in 178ms. 0 messages lost.`;
          apexLog.appendChild(line1);
          apexLog.appendChild(line2);
          apexLog.scrollTop = apexLog.scrollHeight;
        }
      });
    }

    // 2. CloudCanvas Simulation
    const canvasNodeBtn = document.getElementById('canvas-node-btn');
    const canvasSyncBtn = document.getElementById('canvas-sync-btn');
    const canvasBoard = document.getElementById('canvas-board');
    const canvasClock = document.getElementById('canvas-clock');
    const peerCursor1 = document.getElementById('peer-cursor-1');
    const peerCursor2 = document.getElementById('peer-cursor-2');

    let clockVersion = 52.4;
    let customNodeCount = 0;

    if (canvasNodeBtn && canvasBoard) {
      canvasNodeBtn.addEventListener('click', function () {
        customNodeCount++;
        clockVersion += 1.0;
        if (canvasClock) canvasClock.textContent = `v${clockVersion.toFixed(1)}`;

        const node = document.createElement('div');
        node.className = 'canvas-node';
        node.textContent = `Worker Service #${customNodeCount}`;
        node.style.top = `${60 + (customNodeCount * 30) % 110}px`;
        node.style.left = `${200 + (customNodeCount * 45) % 220}px`;
        node.style.borderColor = 'var(--accent)';
        canvasBoard.appendChild(node);
      });
    }

    if (canvasSyncBtn) {
      canvasSyncBtn.addEventListener('click', function () {
        clockVersion += 0.8;
        if (canvasClock) canvasClock.textContent = `v${clockVersion.toFixed(1)}`;

        // Animate simulated peer cursors
        if (peerCursor1) {
          peerCursor1.style.transform = `translate(${Math.random() * 80 - 40}px, ${Math.random() * 60 - 30}px)`;
        }
        if (peerCursor2) {
          peerCursor2.style.transform = `translate(${Math.random() * 80 - 40}px, ${Math.random() * 60 - 30}px)`;
        }
      });
    }

    // 3. PulseSync Simulation
    const syncPartitionBtn = document.getElementById('sync-partition-btn');
    const syncHealBtn = document.getElementById('sync-heal-btn');
    const syncNetworkStatus = document.getElementById('sync-network-status');
    const syncDrift = document.getElementById('sync-drift');
    const cnodeC = document.getElementById('cnode-c');
    const cnodeD = document.getElementById('cnode-d');

    if (syncPartitionBtn) {
      syncPartitionBtn.addEventListener('click', function () {
        if (syncNetworkStatus) {
          syncNetworkStatus.textContent = 'PARTITIONED (Split-Brain)';
          syncNetworkStatus.className = 'demo-stat-val text-accent';
        }
        if (syncDrift) syncDrift.textContent = '14.2% (Diverged)';
        if (cnodeC) cnodeC.classList.add('partitioned');
        if (cnodeD) cnodeD.classList.add('partitioned');
      });
    }

    if (syncHealBtn) {
      syncHealBtn.addEventListener('click', function () {
        if (syncNetworkStatus) {
          syncNetworkStatus.textContent = 'CONNECTED (Full Mesh)';
          syncNetworkStatus.className = 'demo-stat-val text-green';
        }
        if (syncDrift) syncDrift.textContent = '0.00% (Reconciled)';
        if (cnodeC) cnodeC.classList.remove('partitioned');
        if (cnodeD) cnodeD.classList.remove('partitioned');
      });
    }

    // 4. SunDevil EdgeML (ASU Capstone) INT8 vs FP32 Comparison
    const edgemlToggleBtn = document.getElementById('edgeml-toggle-btn');
    const edgemlFps = document.getElementById('edgeml-fps');
    const edgemlLat = document.getElementById('edgeml-lat');
    const edgemlRam = document.getElementById('edgeml-ram');
    const edgemlMode = document.getElementById('edgeml-mode');

    let isInt8 = true;
    if (edgemlToggleBtn) {
      edgemlToggleBtn.addEventListener('click', function () {
        isInt8 = !isInt8;
        if (isInt8) {
          edgemlFps.textContent = '120.4 FPS';
          edgemlLat.textContent = '4.2 ms';
          edgemlRam.textContent = '18.4 MB';
          edgemlMode.textContent = 'INT8 TensorRT (74% Saved)';
          edgemlToggleBtn.textContent = '⚙️ Switch to Unquantized FP32 Mode';
        } else {
          edgemlFps.textContent = '36.8 FPS';
          edgemlLat.textContent = '13.9 ms';
          edgemlRam.textContent = '72.1 MB';
          edgemlMode.textContent = 'FP32 Full Precision';
          edgemlToggleBtn.textContent = '⚙️ Switch to Quantized INT8 Mode (ASU Capstone)';
        }
      });
    }
  }

  // =========================================================================
  // 4. Project Specification Database & Drawer
  // =========================================================================
  function initProjectDrawer() {
    const projectDatabase = {
      'apex-queue': {
        title: 'ApexQueue — Distributed Task Broker',
        fileTag: 'APEX_QUEUE_ARCH.spec',
        image: 'assets/images/project-1.svg',
        desc: 'High-throughput asynchronous task engine written in Go with partitioned message logs, dead-letter recovery queues, and heartbeat arbitration.',
        benchmark: '12,400 messages/sec throughput • p99 latency < 14.8ms on a 3-node benchmark cluster',
        architecture: [
          'Partitioned Log Structure: Lock-free ring buffer design eliminating thread contention.',
          'Zero-Allocation Buffer Pools: Uses Go sync.Pool to minimize GC pause overhead by 68%.',
          'Node Failure Arbitration: Automated consumer group rebalancing within 180ms.'
        ],
        decisions: [
          'Used gRPC + Protobuf over REST for broker clustering, reducing serialization overhead by 42%.',
          'Built memory-mapped append-only WAL to survive ungraceful process crashes.'
        ],
        stack: ['Go (Golang)', 'gRPC', 'Redis', 'Docker', 'Prometheus']
      },
      'cloud-canvas': {
        title: 'CloudCanvas — Collaborative System Modeling',
        fileTag: 'CLOUD_CANVAS_SYSTEM.spec',
        image: 'assets/images/project-2.svg',
        desc: 'Real-time collaborative diagramming platform enabling distributed teams to visualize cloud topologies with CRDT state synchronization.',
        benchmark: 'Sub-30ms multi-cursor canvas latency across 50+ concurrent peers',
        architecture: [
          'CRDT State Vector: Automates concurrent modification merging without centralized locks.',
          'Binary WebSocket Multiplexer: Reduces transport payload size by 60% compared to JSON.',
          'Decoupled Canvas Renderer: OffscreenCanvas workers render complex graphs at 60 FPS.'
        ],
        decisions: [
          'Implemented Yjs CRDT binding over custom OT to remove the single-point-of-failure server arbiter.',
          'Optimistic local updates provide zero perceived input latency during flaky network drops.'
        ],
        stack: ['TypeScript', 'React', 'Node.js', 'WebSockets', 'PostgreSQL']
      },
      'collab-sync': {
        title: 'PulseSync Protocol — Resilient Replicator',
        fileTag: 'PULSESYNC_PROTOCOL.spec',
        image: 'assets/images/project-3.svg',
        desc: 'Fault-tolerant distributed replication engine for ephemeral microservice clusters under volatile network partitions.',
        benchmark: 'Zero state drift and automated healing within 2 roundtrips after 30-sec split-brain event',
        architecture: [
          'Vector Clock Matrix: Detects causal ordering violations across dynamic container nodes.',
          'Gossip Membership Protocol: Heartbeat broadcasts propagate node lists with O(log N) overhead.',
          'Anti-Entropy Sync: Merkle tree diffing pinpoints divergent keys without full database dumps.'
        ],
        decisions: [
          'Applied differential binary snapshots to stop network bandwidth spikes during container rollouts.',
          'Configurable tunable consistency per topic based on latency vs safety requirements.'
        ],
        stack: ['Rust / C++', 'Distributed Systems', 'TCP Sockets', 'Linux Syscalls']
      },
      'asu-capstone': {
        title: 'SunDevil EdgeML — ASU Senior Capstone',
        fileTag: 'ASU_CAPSTONE_TELEMETRY.spec',
        image: 'assets/images/project-4.svg',
        desc: 'Arizona State University Senior Capstone: Edge-optimized sensor telemetry and computer vision inference pipeline for constrained hardware.',
        benchmark: '120 FPS continuous inference at 4.2ms avg latency with 18.4MB RAM footprint',
        architecture: [
          'Quantized Model Inference: INT8 post-training quantization reduced weight memory by 74%.',
          'MQTT Cloud Uplink: Batches compressed sensor telemetry to AWS IoT over intermittent wireless.',
          'Local SQLite Fallback: Write-Ahead-Log buffers data during network blackouts.'
        ],
        decisions: [
          'Engineered edge pre-filtering in C++ before handing frames to the neural net, saving 35% battery.',
          'Won faculty recognition for high-coverage automated unit test suites.'
        ],
        stack: ['Python', 'PyTorch', 'C++ 20', 'MQTT', 'AWS IoT', 'Embedded Linux']
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
          <a href="https://github.com/tjhansen" target="_blank" rel="noopener noreferrer" class="minimal-btn primary-btn font-mono">View Repository ↗</a>
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
