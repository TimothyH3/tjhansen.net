/**
 * Starlink High-Demand Congestion Surcharge Map Engine
 * tjhansen.net / Starlink Surcharge Map
 */

(function () {
  'use strict';

  // Config: Override with window.STARLINK_CONFIG or localStorage if present
  let savedWorkerUrl = localStorage.getItem('starlink_worker_url');
  if (savedWorkerUrl && savedWorkerUrl.includes('tjhansen.workers.dev')) {
    savedWorkerUrl = 'https://starlink-surcharge-worker.starlink-surcharge-map.workers.dev/api/check-fee';
    localStorage.setItem('starlink_worker_url', savedWorkerUrl);
  }

  const CONFIG = Object.assign({
    SUPABASE_URL: 'https://lbwwynyvpvecgclvyqrv.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOi...',
    WORKER_API_URL: savedWorkerUrl || (window.STARLINK_CONFIG && window.STARLINK_CONFIG.WORKER_API_URL) || 'https://starlink-surcharge-worker.starlink-surcharge-map.workers.dev/api/check-fee'
  }, window.STARLINK_CONFIG || {});

  // Zero pre-loaded mock nodes. Map populates only via genuine database ingestion.
  const BASELINE_DATA = [];

  // State Management
  let map = null;
  let markersLayer = null;
  let activeRadarPin = null;
  let surchargePoints = [];
  let currentlyInspected = null;

  const tierFilters = {
    tier0: true,
    tier1: true,
    tier2: true,
    tier3: true,
    soldOut: true
  };

  // Haversine Distance (km)
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getTierColor(surcharge, status) {
    if (status === 'sold_out') return '#c084fc';
    if (surcharge >= 1000) return '#ef4444';
    if (surcharge >= 500) return '#fb923c';
    if (surcharge >= 100) return '#facc15';
    return '#22d3ee';
  }

  function formatDate(dStr) {
    try {
      const d = new Date(dStr);
      const days = Math.floor((new Date() - d) / (86400000));
      if (days <= 0) return 'Today (Live)';
      if (days === 1) return 'Yesterday';
      return `${days} days ago`;
    } catch (e) {
      return dStr;
    }
  }

  // Init Map Canvas
  function initMap() {
    map = L.map('map-view', {
      center: [39.8283, -98.5795],
      zoom: 5,
      minZoom: 3,
      maxZoom: 14,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Esri World Dark Gray Canvas (100% Free, Zero API Key, Zero Watermark)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 16
    }).addTo(map);

    // Dark Gray Reference Overlay (Labels & US State Borders)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      attribution: '',
      maxZoom: 16
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    map.on('click', function (e) {
      handleCoordinateSelection(e.latlng.lat, e.latlng.lng);
    });

    loadData();
    bindDomEvents();
  }

  // Load Data from Supabase PostGIS
  async function loadData() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    try {
      const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/starlink_surcharges?select=*&order=sampled_at.desc`, {
        headers: {
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          surchargePoints = data;
          if (statusDot) statusDot.className = 'pulse-dot';
          if (statusText) statusText.textContent = 'SUPABASE SYNCED';
        } else {
          surchargePoints = [];
          if (statusDot) statusDot.className = 'pulse-dot offline';
          if (statusText) statusText.textContent = '0 NODES INGESTED';
        }
      } else {
        surchargePoints = [];
        if (statusDot) statusDot.className = 'pulse-dot offline';
        if (statusText) statusText.textContent = 'AWAITING INGESTION';
      }
    } catch (err) {
      console.warn('Supabase not reached. Zero pre-loaded nodes.', err);
      surchargePoints = [];
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'AWAITING INGESTION';
    }

    updateStats();
    renderMarkers();
  }

  // Calculate Aggregates
  function updateStats() {
    let total = surchargePoints.length;
    let highCount = 0;
    let sumSurcharge = 0;
    let maxS = 0;

    let c0 = 0, c1 = 0, c2 = 0, c3 = 0, cSold = 0;

    for (const pt of surchargePoints) {
      const s = pt.surcharge_amount || 0;
      if (s > maxS) maxS = s;
      if (s > 0) {
        highCount++;
        sumSurcharge += s;
      }

      if (pt.status === 'sold_out') cSold++;
      else if (s >= 1000) c3++;
      else if (s >= 500) c2++;
      else if (s >= 100) c1++;
      else c0++;
    }

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('stat-total-nodes', total);
    setText('stat-high-nodes', highCount);
    setText('stat-avg-fee', highCount > 0 ? `$${Math.round(sumSurcharge / highCount)}` : '$0');
    setText('stat-max-fee', `$${maxS}`);

    setText('count-tier0', `(${c0})`);
    setText('count-tier1', `(${c1})`);
    setText('count-tier2', `(${c2})`);
    setText('count-tier3', `(${c3})`);
    setText('count-sold', `(${cSold})`);
  }

  // Draw Circle Markers
  function renderMarkers() {
    markersLayer.clearLayers();
    let visible = 0;

    for (const pt of surchargePoints) {
      const s = pt.surcharge_amount || 0;
      const isSold = pt.status === 'sold_out';

      if (isSold && !tierFilters.soldOut) continue;
      if (!isSold && s === 0 && !tierFilters.tier0) continue;
      if (!isSold && s >= 100 && s < 500 && !tierFilters.tier1) continue;
      if (!isSold && s >= 500 && s < 1000 && !tierFilters.tier2) continue;
      if (!isSold && s >= 1000 && !tierFilters.tier3) continue;

      visible++;
      const color = getTierColor(s, pt.status);
      const radius = s >= 1000 ? 9 : s >= 500 ? 8 : s >= 100 ? 7 : 5;

      const circle = L.circleMarker([pt.lat, pt.lng], {
        radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.2,
        opacity: 0.9,
        fillOpacity: 0.75
      });

      circle.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        displayPointDetails(pt, 0);
      });

      markersLayer.addLayer(circle);
    }

    const counter = document.getElementById('visible-nodes-count');
    if (counter) counter.textContent = `${visible} NODES`;
  }

  // Proximity Cache Check (25 km threshold)
  function handleCoordinateSelection(lat, lng) {
    let nearest = null;
    let minKm = Infinity;

    for (const pt of surchargePoints) {
      const dist = haversineKm(lat, lng, pt.lat, pt.lng);
      if (dist < minKm) {
        minKm = dist;
        nearest = pt;
      }
    }

    const isWithin25Km = minKm <= 25.0;

    if (isWithin25Km && nearest) {
      displayPointDetails(nearest, minKm);
    } else {
      displayPointDetails({
        lat,
        lng,
        surcharge_amount: 0,
        status: 'standard',
        location_name: `Uncached Coordinate (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
        sampled_at: new Date().toISOString(),
        isUncached: true
      }, minKm < 1000 ? minKm : null);
    }

    dropRadarPin(lat, lng);
  }

  // Render Selection Details in Sidebar
  function displayPointDetails(pt, distKm) {
    currentlyInspected = pt;
    const container = document.getElementById('inspector-content');
    if (!container) return;

    const isHigh = pt.surcharge_amount > 0;
    const isSold = pt.status === 'sold_out';
    const isUnsampled = !!pt.isUnsampled || pt.status === 'unsampled' || pt.surcharge_amount === null;
    const isLive = !!pt.isLiveVerified || pt.source === 'verified_live';

    let tierClass = isSold ? 'tier-waitlist' : isHigh ? 'tier-high' : '';
    let tierTitle = isSold ? 'SOLD OUT / WAITLIST' :
      pt.surcharge_amount >= 1000 ? 'SEVERE CONGESTION SURCHARGE' :
      pt.surcharge_amount >= 500 ? 'HIGH DEMAND SURCHARGE' :
      pt.surcharge_amount >= 100 ? 'MODERATE SURCHARGE ZONE' :
      isUnsampled ? 'UNSAMPLED CELL' :
      'STANDARD CAPACITY ($0)';

    let feeDisplay = isUnsampled ? 'PENDING' : `$${pt.surcharge_amount}`;

    const cacheLabel = isLive 
      ? 'Verified Live from Starlink Checkout'
      : distKm !== null && distKm !== undefined
        ? (distKm === 0 ? 'Verified Ingested Node' : `Ingested Sample (${distKm.toFixed(1)} km away)`)
        : 'No verified sample in database';

    const monthlyRow = pt.monthly_service_fee ? `
      <div class="prop-row">
        <span class="prop-name">MONTHLY SERVICE:</span>
        <span class="prop-value">$${pt.monthly_service_fee}/mo</span>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="pin-card">
        <div class="card-header-bar ${tierClass}">
          <span class="card-tier-label font-mono">${tierTitle}</span>
          <span class="card-tier-fee font-mono">${feeDisplay}</span>
        </div>
        <div class="card-body font-mono">
          <div class="prop-row">
            <span class="prop-name">COORDINATES:</span>
            <span class="prop-value">${pt.lat.toFixed(4)}°N, ${pt.lng.toFixed(4)}°W</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">LOCATION:</span>
            <span class="prop-value font-sans">${pt.location_name || 'US Coordinate'}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">DATA STATUS:</span>
            <span class="prop-value">${cacheLabel}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">LAST SAMPLED:</span>
            <span class="prop-value">${isUnsampled ? 'Awaiting check' : formatDate(pt.sampled_at)}</span>
          </div>
          ${monthlyRow}
        </div>
        <div class="card-footer">
          <button id="btn-live-worker" class="worker-action-btn font-mono">
            <span>⚡ CHECK LIVE STARLINK SURCHARGE</span>
          </button>
          <p class="card-note font-sans">
            ${isLive 
              ? 'Directly verified from Starlink checkout session via Cloudflare Worker proxy.' 
              : isUnsampled 
                ? 'Click above to query live Starlink address qualification and checkout pricing.' 
                : 'Verified sample from Supabase PostGIS.'}
          </p>
        </div>
      </div>
    `;

    const liveBtn = document.getElementById('btn-live-worker');
    if (liveBtn) {
      liveBtn.addEventListener('click', function () {
        triggerLiveWorker(pt.lat, pt.lng);
      });
    }

    dropRadarPin(pt.lat, pt.lng);
  }

  // Pin with Radar Wave Animation
  function dropRadarPin(lat, lng) {
    if (activeRadarPin) {
      map.removeLayer(activeRadarPin);
    }

    const icon = L.divIcon({
      className: 'radar-pin-container',
      html: '<div class="radar-pulse"></div><div class="radar-dot"></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    activeRadarPin = L.marker([lat, lng], { icon: icon }).addTo(map);
  }

  // Invoke Cloudflare Worker Spatial Lookup
  async function triggerLiveWorker(lat, lng) {
    const liveBtn = document.getElementById('btn-live-worker');
    if (liveBtn) {
      liveBtn.disabled = true;
      liveBtn.innerHTML = '<span class="btn-spinner"></span> <span>PROBING STARLINK LIVE...</span>';
    }

    const targetUrl = `${CONFIG.WORKER_API_URL}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const result = await resp.json();
        if (result.source === 'verified_live' || result.source === 'postgis_cache') {
          const updated = {
            lat: result.lat,
            lng: result.lng,
            surcharge_amount: result.surcharge_amount,
            status: result.status,
            sampled_at: result.timestamp || new Date().toISOString(),
            location_name: result.location_name || `Coordinate: ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W`,
            isLiveVerified: result.source === 'verified_live',
            monthly_service_fee: result.monthly_service_fee,
            isUnsampled: false
          };

          // Check if already in points list
          const existingIdx = surchargePoints.findIndex(p => Math.abs(p.lat - updated.lat) < 0.001 && Math.abs(p.lng - updated.lng) < 0.001);
          if (existingIdx >= 0) {
            surchargePoints[existingIdx] = updated;
          } else {
            surchargePoints.unshift(updated);
          }

          updateStats();
          renderMarkers();
          displayPointDetails(updated, result.distance_km || 0);
        } else {
          // Unsampled result returned
          displayPointDetails({
            lat: result.lat,
            lng: result.lng,
            surcharge_amount: result.surcharge_amount,
            status: result.status || 'unsampled',
            sampled_at: result.timestamp || new Date().toISOString(),
            location_name: result.location_name || `Coordinate (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W)`,
            isUnsampled: true
          }, null);
        }
      } else {
        let errBody = '';
        try { errBody = await resp.text(); } catch (e) {}
        displayLiveQueryError(lat, lng, `HTTP ${resp.status} (${resp.statusText}): ${errBody || 'Proxy returned an error'}`, targetUrl);
      }
    } catch (e) {
      console.error('Worker query error:', e);
      let errorReason = '';
      if (e.name === 'AbortError') {
        errorReason = 'Request timed out after 6 seconds. The Worker API endpoint did not respond.';
      } else {
        errorReason = `Network connection failed (${e.message || 'DNS Resolution Failed'}).`;
      }
      displayLiveQueryError(lat, lng, errorReason, targetUrl);
    } finally {
      if (liveBtn) liveBtn.disabled = false;
    }
  }

  // Display explicit diagnostic error panel when live lookup fails
  function displayLiveQueryError(lat, lng, errorReason, targetUrl) {
    const container = document.getElementById('inspector-content');
    if (!container) return;

    container.innerHTML = `
      <div class="pin-card card-error">
        <div class="card-header-bar tier-error">
          <span class="card-tier-label font-mono">⚠️ LIVE QUERY FAILED</span>
          <span class="card-tier-fee font-mono">OFFLINE</span>
        </div>
        <div class="card-body font-mono">
          <div class="prop-row">
            <span class="prop-name">TARGET COORDINATES:</span>
            <span class="prop-value">${lat.toFixed(4)}°N, ${lng.toFixed(4)}°W</span>
          </div>

          <div class="error-detail-box">
            <div class="error-detail-title">FAILURE DIAGNOSTIC:</div>
            <div class="error-detail-msg">${errorReason}</div>
            <div class="error-endpoint-row">
              <span>ENDPOINT PROBED:</span>
              <code class="endpoint-code">${targetUrl}</code>
            </div>
          </div>

          <div class="worker-config-panel">
            <label class="config-label font-sans">Worker API Endpoint URL:</label>
            <div class="config-input-group">
              <input type="text" id="input-worker-url" class="font-mono config-url-input" value="${CONFIG.WORKER_API_URL}" placeholder="http://localhost:8787/api/check-fee" />
              <button id="btn-save-worker-url" class="font-mono config-save-btn">SAVE</button>
            </div>
            <div class="config-help font-sans">
              • <strong>To test locally:</strong> Run <code>cd cloudflare-worker && npm run dev</code>, then set endpoint to <code>http://localhost:8787/api/check-fee</code><br/>
              • <strong>To deploy live:</strong> Run <code>cd cloudflare-worker && npm run deploy</code>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <button id="btn-retry-live-worker" class="worker-action-btn font-mono">
            <span>🔄 RETRY LIVE CHECK</span>
          </button>
        </div>
      </div>
    `;

    // Save Worker URL
    const saveBtn = document.getElementById('btn-save-worker-url');
    const urlInput = document.getElementById('input-worker-url');
    if (saveBtn && urlInput) {
      saveBtn.addEventListener('click', function () {
        const newUrl = urlInput.value.trim();
        if (newUrl) {
          CONFIG.WORKER_API_URL = newUrl;
          localStorage.setItem('starlink_worker_url', newUrl);
          this.textContent = 'SAVED ✓';
          setTimeout(() => { this.textContent = 'SAVE'; }, 1800);
        }
      });
    }

    // Retry Button
    const retryBtn = document.getElementById('btn-retry-live-worker');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        triggerLiveWorker(lat, lng);
      });
    }

    dropRadarPin(lat, lng);
  }

  // Geocoding Search (OSM Nominatim)
  let searchTimer = null;
  function handleSearchInput(e) {
    const query = e.target.value.trim();
    const dropdown = document.getElementById('search-dropdown');
    const clearBtn = document.getElementById('btn-clear-search');

    if (clearBtn) {
      clearBtn.className = query ? 'search-clear-btn active' : 'search-clear-btn';
    }

    clearTimeout(searchTimer);
    if (!query || query.length < 3) {
      if (dropdown) dropdown.className = 'search-dropdown';
      return;
    }

    searchTimer = setTimeout(async () => {
      try {
        const q = encodeURIComponent(`${query}, USA`);
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=5&q=${q}`);
        if (resp.ok) {
          const list = await resp.json();
          renderSearchResults(list);
        }
      } catch (err) {
        console.warn('Geocoding error:', err);
      }
    }, 300);
  }

  function renderSearchResults(items) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;

    if (!items || items.length === 0) {
      dropdown.className = 'search-dropdown';
      return;
    }

    dropdown.innerHTML = items.map((it, i) => `
      <li class="search-dropdown-item" data-idx="${i}" data-lat="${it.lat}" data-lon="${it.lon}">
        <div class="item-title font-sans">${it.display_name}</div>
        <div class="item-sub font-mono">${parseFloat(it.lat).toFixed(4)}, ${parseFloat(it.lon).toFixed(4)}</div>
      </li>
    `).join('');

    dropdown.className = 'search-dropdown active';

    dropdown.querySelectorAll('.search-dropdown-item').forEach(el => {
      el.addEventListener('click', function () {
        const lat = parseFloat(this.getAttribute('data-lat'));
        const lon = parseFloat(this.getAttribute('data-lon'));
        const title = this.querySelector('.item-title').textContent.split(',')[0];

        const searchBox = document.getElementById('search-input');
        if (searchBox) searchBox.value = title;
        dropdown.className = 'search-dropdown';

        map.flyTo([lat, lon], 9, { duration: 1.4 });
        handleCoordinateSelection(lat, lon);
      });
    });
  }

  // DOM Event Bindings
  function bindDomEvents() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearchInput);
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const first = document.querySelector('.search-dropdown-item');
          if (first) first.click();
        }
      });
    }

    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        const searchBox = document.getElementById('search-input');
        if (searchBox) searchBox.value = '';
        const dropdown = document.getElementById('search-dropdown');
        if (dropdown) dropdown.className = 'search-dropdown';
        this.className = 'search-clear-btn';
      });
    }

    // Tier Checkboxes
    const tiers = ['tier0', 'tier1', 'tier2', 'tier3', 'soldOut'];
    tiers.forEach(t => {
      const chk = document.getElementById(`filter-${t}`);
      if (chk) {
        chk.addEventListener('change', function () {
          tierFilters[t] = this.checked;
          const parent = this.closest('.legend-row');
          if (parent) {
            parent.className = this.checked ? 'legend-row' : 'legend-row disabled';
          }
          renderMarkers();
        });
      }
    });

    // Quick Jumps
    const jumps = {
      'jump-pnw': { coords: [45.5, -120.5], zoom: 6 },
      'jump-west': { coords: [38.5, -109.5], zoom: 6 },
      'jump-appalachia': { coords: [36.5, -83.0], zoom: 6 },
      'jump-southeast': { coords: [32.5, -85.5], zoom: 6 },
      'jump-texas': { coords: [31.0, -99.0], zoom: 6 },
      'jump-reset': { coords: [39.8283, -98.5795], zoom: 5 }
    };

    Object.keys(jumps).forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function () {
          const j = jumps[id];
          map.flyTo(j.coords, j.zoom, { duration: 1.2 });
        });
      }
    });

    // Sidebar Toggle
    const sidebarToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('telemetry-sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        this.querySelector('span').textContent = isCollapsed ? 'PANEL' : 'HIDE';
        setTimeout(() => map.invalidateSize(), 250);
      });
    }
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();

