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

    // Act 0 Geometry Precalculation
    let cachedAct0Geometry = { heroCenterShift: 240, profileSlideDistance: 95, profileCenterShift: 380 };

    function measureAct0Geometry() {
      if (!sectionHero || !sectionProfile) return;
      const vh = window.innerHeight;
      const heroContent = sectionHero.querySelector('.content-block');
      const profileContent = sectionProfile.querySelector('.content-block');

      const heroHeight = heroContent ? heroContent.offsetHeight : (vh * 0.36);
      const profileHeight = profileContent ? profileContent.offsetHeight : (vh * 0.32);

      const heroInitialTop = Math.max(16, (vh - heroHeight) / 2);
      const slightGap = Math.min(32, Math.max(22, Math.round(vh * 0.03)));
      const targetProfileCenterTop = Math.max(16, Math.round((vh - profileHeight) / 2));
      const profileOffsetTop = sectionProfile.offsetTop || (vh * 0.85);
      const profileCenterShift = Math.max(0, profileOffsetTop - targetProfileCenterTop);
      const heroTargetTopAtCenter = targetProfileCenterTop - slightGap - heroHeight;
      const heroCenterShift = Math.max(0, heroInitialTop - heroTargetTopAtCenter);
      const profileSlideDistance = Math.max(70, Math.min(120, Math.round(vh * 0.12)));

      cachedAct0Geometry = {
        heroCenterShift: Math.round(heroCenterShift),
        profileSlideDistance: profileSlideDistance,
        profileCenterShift: Math.round(profileCenterShift)
      };
    }
    measureAct0Geometry();

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

    // Native Scroll Engine
    function onNativeScroll() {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.max(0, Math.min(1, scrollY / docHeight)) : 0;
      const vh = window.innerHeight;

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
        const act0Top = act0.offsetTop;
        const relativeScroll = Math.max(0, scrollY - act0Top);
        const act0Scrollable = Math.max(vh * 0.35, act0.offsetHeight - vh);

        // Phase 1: Section 2 slides up to dock under Section 1
        const travelPhase1 = act0Scrollable * 0.55;
        const { heroCenterShift, profileSlideDistance, profileCenterShift } = cachedAct0Geometry;

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

          const exitDistance = Math.max(60, act0Scrollable - travelPhase1);
          const p2 = Math.min(1, (relativeScroll - travelPhase1) / exitDistance);

          const exitEnd = 0.35;
          const enterStart = 0.62;
          const cardsRevealProgress = 0.82;

          if (p2 <= exitEnd) {
            const exitP = p2 / exitEnd;
            const exitEase = exitP * exitP * (3 - 2 * exitP);

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
              act1.style.pointerEvents = enterEase > 0.5 ? 'auto' : 'none';
            }

            if (p2 >= cardsRevealProgress) {
              setBentoCardsVisible(true);
            } else {
              setBentoCardsVisible(false);
            }
          }
        }
      }

      // Act 1 -> Act 2 Handover
      if (act1 && act2 && scrollY >= act1.offsetTop) {
        setBentoCardsVisible(true);
        const act2Top = act2.offsetTop;
        const triggerPoint = act2Top - vh * 0.9;
        if (scrollY > triggerPoint) {
          const fadeDist = vh * 0.55;
          const act1Progress = Math.min(1, Math.max(0, (scrollY - triggerPoint) / fadeDist));
          const act1Ease = act1Progress * act1Progress * (3 - 2 * act1Progress);
          act1.style.opacity = Math.max(0, 1 - act1Ease * 1.05).toFixed(3);
          act1.style.transform = `translate3d(0, ${(-act1Ease * 48).toFixed(1)}px, 0)`;
          act1.style.pointerEvents = act1Progress > 0.65 ? 'none' : 'auto';
        } else {
          act1.style.opacity = '1';
          act1.style.transform = 'translate3d(0, 0, 0)';
          act1.style.pointerEvents = 'auto';
        }
      }

      // HUD Scroll-Spy Milestones

      if (scrollY + vh * 0.4 >= act2Top) {
        updateHUD(2);
      } else if (scrollY + vh * 0.4 >= act1Top) {
        updateHUD(1);
      } else {
        updateHUD(0);
      }
    }

    window.addEventListener('scroll', onNativeScroll, { passive: true });
    window.addEventListener('resize', () => {
      measureAct0Geometry();
      onNativeScroll();
    }, { passive: true });
    onNativeScroll();

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