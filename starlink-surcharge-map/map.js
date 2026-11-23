/**
 * Starlink Regional Service Cost & Surcharge Map Engine
 * tjhansen.net / Starlink Service Cost Map
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

  // State Management
  let map = null;
  let markersLayer = null;
  let activeRadarPin = null;
  let activeSelectionHex = null;
  let surchargePoints = [];
  let currentlyInspected = null;

  const tierFilters = {
    tierDiscount: true,
    tierStandard: true,
    tierCongested: true,
    tierSurcharge: true,
    tierSoldOut: true
  };

  // Format currency with cents only if needed
  function formatMoney(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0';
    const num = Number(val);
    return num % 1 === 0 ? `$${num.toFixed(0)}` : `$${num.toFixed(2)}`;
  }

  // Clean address helper: extract city/state/region and strip specific street address numbers, suites, zip codes
  function cleanLocationName(raw) {
    if (!raw || typeof raw !== 'string') return 'US Coordinate';
    let s = raw.trim();
    // Remove country indicator
    s = s.replace(/,\s*(United States of America|United States|USA|US)$/i, '');
    // Remove zip code
    s = s.replace(/\s+\d{5}(-\d{4})?$/, '');

    // Keep coordinate or relative area strings as-is
    if (/coordinate|area near/i.test(s) || /^-?\d+\.\d+/.test(s)) {
      return s;
    }

    const parts = s.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const state = parts[parts.length - 1].replace(/\s+\d{5}(-\d{4})?$/, '').trim();
      const city = parts[parts.length - 2].trim();
      return `${city}, ${state}`;
    } else if (parts.length === 2) {
      let p0 = parts[0];
      let p1 = parts[1].replace(/\s+\d{5}(-\d{4})?$/, '').trim();
      if (/^\d+\s+/.test(p0)) {
        p0 = p0.replace(/^\d+[\w\s.-]+?\s+(Ave|St|Street|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Way|Ct|Court|Ln|Lane)\b/i, '').trim() || p0;
      }
      return `${p0}, ${p1}`;
    }
    return s;
  }

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

  // Official Starlink Map Spatial Index (Uber H3 Resolution 5)
  // Starlink schedules spot beams, capacity, and official map availability using H3 Res 5 (~252 km² cells)
  const STARLINK_H3_RES = 5;

  function getH3Cell(lat, lng) {
    if (typeof h3 !== 'undefined' && (h3.latLngToCell || h3.geoToH3)) {
      try {
        const cellId = h3.latLngToCell ? h3.latLngToCell(lat, lng, STARLINK_H3_RES) : h3.geoToH3(lat, lng, STARLINK_H3_RES);
        const center = h3.cellToLatLng ? h3.cellToLatLng(cellId) : h3.h3ToGeo(cellId);
        const boundary = h3.cellToBoundary ? h3.cellToBoundary(cellId) : h3.h3ToGeoBoundary(cellId);
        return {
          cellId,
          cellKey: cellId,
          centerLat: center[0],
          centerLng: center[1],
          boundary: boundary, // Exact 6 [lat, lng] vertices matching official Starlink map
          isH3: true
        };
      } catch (e) {
        console.warn('H3 indexing error:', e);
      }
    }

    // Geodesic regular hexagon fallback (~11.35 km circumradius matching H3 Res 5)
    const fallbackCoords = getHexagonLatLngs(lat, lng, 11.35);
    return {
      cellId: `${Math.round(lat * 100)}_${Math.round(lng * 100)}`,
      cellKey: `${Math.round(lat * 100)}_${Math.round(lng * 100)}`,
      centerLat: lat,
      centerLng: lng,
      boundary: fallbackCoords,
      isH3: false
    };
  }

  function snapToHexGrid(lat, lng) {
    return getH3Cell(lat, lng);
  }

  // Authentic pricing resolver: Base Plan + Service Price Adjustment = Total Monthly Fee
  function getPointPricing(pt) {
    const surcharge = pt.surcharge_amount || 0;
    const isUnsampled = !!pt.isUnsampled || pt.status === 'unsampled' ||
      (pt.monthly_service_fee === null && pt.total_monthly_fee === null && pt.base_service_fee === null);

    if (isUnsampled) {
      return {
        base: 120,
        adjustment: 0,
        total: 120,
        surcharge: 0,
        isUnsampled: true
      };
    }

    let base = pt.base_service_fee;
    let adj = pt.service_price_adjustment;
    let total = pt.total_monthly_fee ?? pt.monthly_service_fee;

    // Unprobed priority hotspot seeds default to standard $120/mo baseline rate so they do not falsely appear orange
    if (pt.sample_type === 'hotspot_priority' && !pt.isLiveVerified && adj === 0 && (total === 130 || total === null)) {
      total = 120;
      base = 120;
    }

    if (adj !== undefined && adj !== null) {
      adj = Number(adj);
      if (base === undefined || base === null) {
        if (total !== undefined && total !== null) {
          base = Math.round((Number(total) - adj) * 100) / 100;
        } else {
          base = 120;
        }
      }
      total = Math.round((Number(base) + adj) * 100) / 100;
    } else {
      // Derive if not provided explicitly
      if (total !== undefined && total !== null) {
        total = Number(total);
        if (base === undefined || base === null) {
          base = total >= 170 ? 170 : total >= 130 ? 130 : total < 85 ? 55 : 120;
        }
        adj = Math.round((total - Number(base)) * 100) / 100;
      } else {
        total = pt.status === 'discounted' ? 55 : pt.status === 'congested' ? 143 : 120;
        base = total >= 170 ? 170 : total >= 130 ? 130 : total < 85 ? 55 : 120;
        adj = Math.round((total - base) * 100) / 100;
      }
    }

    return {
      base: Number(base),
      adjustment: adj,
      total: Number(total),
      surcharge,
      isUnsampled: false
    };
  }

  // Monthly service tiers matching total cheapest monthly cost:
  // Green: $55-85, Blue: $85-130, Orange: $130-170, Red: $170+, Purple: Unavailable
  function getTierColor(pt) {
    if (pt.status === 'sold_out') return '#c084fc'; // Purple: unavailable
    const pricing = getPointPricing(pt);
    const cost = pricing.total !== null ? pricing.total : 120;
    if (cost < 85) return '#10b981';  // Green: $55 - $85
    if (cost < 130) return '#38bdf8'; // Blue: $85 - $130
    if (cost < 170) return '#f97316'; // Orange: $130 - $170
    return '#ef4444';                 // Red: $170+
  }

  function getTierKey(pt) {
    if (pt.status === 'sold_out') return 'sold_out'; // Purple: unavailable
    const pricing = getPointPricing(pt);
    const cost = pricing.total !== null ? pricing.total : 120;
    if (cost < 85) return 'discounted';  // Green: $55 - $85
    if (cost < 130) return 'standard';   // Blue: $85 - $130
    if (cost < 170) return 'congested';  // Orange: $130 - $170
    return 'high_demand';                // Red: $170+
  }

  // Generates geographically invariant regular hexagon coordinates (12.5 km circumradius matching Starlink cells)
  function getHexagonLatLngs(centerLat, centerLng, radiusKm = 12.5) {
    const latRad = centerLat * Math.PI / 180;
    const kmPerLat = 111.132;
    const kmPerLng = 111.320 * Math.cos(latRad);
    const coords = [];
    for (let i = 0; i < 6; i++) {
      const angleDeg = 30 + i * 60; // Pointy-topped hexagon (30, 90, 150, 210, 270, 330)
      const angleRad = angleDeg * Math.PI / 180;
      const dLat = (radiusKm * Math.sin(angleRad)) / kmPerLat;
      const dLng = (radiusKm * Math.cos(angleRad)) / kmPerLng;
      coords.push([centerLat + dLat, centerLng + dLng]);
    }
    return coords;
  }

  // Injects high-intensity SVG radial gradients into Leaflet overlay pane for fading surrounding auras
  function ensureSvgGradients() {
    const svg = document.querySelector('.leaflet-pane.leaflet-overlay-pane svg');
    if (!svg || svg.querySelector('#hex-aura-congested')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <radialGradient id="hex-aura-congested" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f97316" stop-opacity="0.90" />
        <stop offset="20%" stop-color="#f97316" stop-opacity="0.70" />
        <stop offset="45%" stop-color="#f97316" stop-opacity="0.45" />
        <stop offset="70%" stop-color="#f97316" stop-opacity="0.20" />
        <stop offset="90%" stop-color="#f97316" stop-opacity="0.06" />
        <stop offset="100%" stop-color="#f97316" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hex-aura-high_demand" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ef4444" stop-opacity="0.92" />
        <stop offset="20%" stop-color="#ef4444" stop-opacity="0.72" />
        <stop offset="45%" stop-color="#ef4444" stop-opacity="0.46" />
        <stop offset="70%" stop-color="#ef4444" stop-opacity="0.22" />
        <stop offset="90%" stop-color="#ef4444" stop-opacity="0.07" />
        <stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hex-aura-standard" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.88" />
        <stop offset="20%" stop-color="#38bdf8" stop-opacity="0.68" />
        <stop offset="45%" stop-color="#38bdf8" stop-opacity="0.42" />
        <stop offset="70%" stop-color="#38bdf8" stop-opacity="0.18" />
        <stop offset="90%" stop-color="#38bdf8" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hex-aura-discounted" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.90" />
        <stop offset="20%" stop-color="#10b981" stop-opacity="0.70" />
        <stop offset="45%" stop-color="#10b981" stop-opacity="0.44" />
        <stop offset="70%" stop-color="#10b981" stop-opacity="0.20" />
        <stop offset="90%" stop-color="#10b981" stop-opacity="0.06" />
        <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hex-aura-sold_out" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#c084fc" stop-opacity="0.88" />
        <stop offset="20%" stop-color="#c084fc" stop-opacity="0.66" />
        <stop offset="45%" stop-color="#c084fc" stop-opacity="0.40" />
        <stop offset="70%" stop-color="#c084fc" stop-opacity="0.18" />
        <stop offset="90%" stop-color="#c084fc" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#c084fc" stop-opacity="0" />
      </radialGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
  }

  function formatDate(dStr) {
    if (!dStr) return 'Awaiting check';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const datePart = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timePart = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${datePart}, ${timePart}`;
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

  // Load Data from Worker edge cache (or Supabase PostGIS)
  async function loadData() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    // 1. Primary: Load verified points via Cloudflare Worker edge cache
    const pointsUrl = CONFIG.WORKER_API_URL.replace(/\/api\/check-fee.*$/, '/api/points').replace(/\/check-fee.*$/, '/api/points');
    try {
      const resp = await fetch(pointsUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          surchargePoints = data;
          if (statusDot) statusDot.className = 'pulse-dot';
          if (statusText) statusText.textContent = `${data.length} NODES SYNCED`;
          updateStats();
          renderMarkers();
          return;
        }
      }
    } catch (err) {
      console.warn('Worker /api/points fetch attempt failed:', err);
    }

    // 2. Secondary: Direct Supabase fetch if anon key is available
    if (CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes('...')) {
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
            if (statusText) statusText.textContent = `${data.length} NODES SYNCED`;
            updateStats();
            renderMarkers();
            return;
          }
        }
      } catch (err) {
        console.warn('Direct Supabase fetch fallback failed:', err);
      }
    }

    // 3. Database is reachable but currently empty or awaiting initial seed/qualification
    surchargePoints = [];
    if (statusDot) statusDot.className = 'pulse-dot';
    if (statusText) statusText.textContent = 'READY (0 NODES)';
    updateStats();
    renderMarkers();
  }

  // Calculate Aggregates
  function updateStats() {
    let total = surchargePoints.length;
    let discountCount = 0;
    let standardCount = 0;
    let congestedCount = 0;
    let surchargeCount = 0;
    let soldCount = 0;
    let sumMonthly = 0;

    for (const pt of surchargePoints) {
      const s = pt.surcharge_amount || 0;
      const pricing = getPointPricing(pt);
      const isSold = pt.status === 'sold_out';
      const cost = pricing.total !== null ? pricing.total : 120;

      if (!pricing.isUnsampled && pricing.total !== null) {
        sumMonthly += pricing.total;
      }

      if (isSold) {
        soldCount++;
      } else {
        if (cost < 85) discountCount++;
        else if (cost < 130) standardCount++;
        else if (cost < 170) congestedCount++;
        else surchargeCount++; // Red: $170+
      }
    }

    const avgMonthly = total > 0 ? Math.round(sumMonthly / total) : 120;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('stat-total-nodes', total);
    setText('stat-discount-nodes', discountCount);
    setText('stat-avg-cost', total > 0 ? `$${avgMonthly}/mo` : '$0');
    setText('stat-surcharge-nodes', surchargeCount);

    setText('count-discount', `(${discountCount})`);
    setText('count-standard', `(${standardCount})`);
    setText('count-congested', `(${congestedCount})`);
    setText('count-surcharge', `(${surchargeCount})`);
    setText('count-sold', `(${soldCount})`);
  }

  // Render Starlink Hexagonal Cells & Radial Fading Auras (Zero overlap guaranteed)
  function renderMarkers() {
    markersLayer.clearLayers();
    let visible = 0;

    // Filter points based on active tier checkboxes
    const activePoints = surchargePoints.filter(pt => {
      const pricing = getPointPricing(pt);
      const fee = pricing.total !== null ? pricing.total : 120;
      const isSold = pt.status === 'sold_out';

      if (isSold && !tierFilters.tierSoldOut) return false;
      if (!isSold) {
        if (fee < 85 && !tierFilters.tierDiscount) return false;
        if (fee >= 85 && fee < 130 && !tierFilters.tierStandard) return false;
        if (fee >= 130 && fee < 170 && !tierFilters.tierCongested) return false;
        if (fee >= 170 && !tierFilters.tierSurcharge) return false;
      }
      return true;
    });

    // Deduplicate points by mathematical honeycomb grid so NO two hexes can ever overlap
    const cellMap = new Map();
    for (const pt of activePoints) {
      const snapped = snapToHexGrid(pt.lat, pt.lng);
      const key = snapped.cellKey;
      if (!cellMap.has(key)) {
        cellMap.set(key, { ...pt, centerLat: snapped.centerLat, centerLng: snapped.centerLng, cellKey: key, boundary: snapped.boundary, isH3: snapped.isH3 });
      } else {
        const existing = cellMap.get(key);
        const existingTime = new Date(existing.sampled_at || 0).getTime();
        const newTime = new Date(pt.sampled_at || 0).getTime();
        if (newTime > existingTime || pt.isLiveVerified) {
          cellMap.set(key, { ...pt, centerLat: snapped.centerLat, centerLng: snapped.centerLng, cellKey: key, boundary: snapped.boundary, isH3: snapped.isH3 });
        }
      }
    }
    const uniqueCells = Array.from(cellMap.values());

    // Pass 1: Render outer high-intensity fading gradient auras spanning a large surrounding area (125 km ground radius)
    for (const cell of uniqueCells) {
      const tierKey = getTierKey(cell);
      const aura = L.circle([cell.centerLat, cell.centerLng], {
        radius: 125000, // 125 km real-world geographic ground radius
        stroke: false,
        interactive: false,
        className: `starlink-hex-aura starlink-aura-${tierKey}`
      });
      markersLayer.addLayer(aura);
    }

    // Ensure SVG gradients exist in Leaflet SVG layer
    ensureSvgGradients();

    // Pass 2: Render crisp central Starlink cell hexagons (12.5 km circumradius matching Starlink cells)
    for (const cell of uniqueCells) {
      visible++;
      const pricing = getPointPricing(cell);
      const s = pricing.surcharge || 0;
      const fee = pricing.total !== null ? pricing.total : 120;
      const isSold = cell.status === 'sold_out';
      const color = getTierColor(cell);

      // Use authentic official Starlink H3 Resolution 5 boundary polygon
      const hexCoords = cell.boundary || getHexagonLatLngs(cell.centerLat, cell.centerLng, 11.35);
      const hex = L.polygon(hexCoords, {
        color: '#ffffff',
        weight: 2.2,
        opacity: 0.98,
        fillColor: color,
        fillOpacity: 0.88,
        className: 'starlink-cell-hex'
      });

      // Hover tooltip showing exact cheapest rate tier and surcharge if any
      let tipText = '';
      tipText = `${formatMoney(fee)}/mo` + (s > 0 ? ` [+$${s} Surcharge]` : '');

      hex.bindTooltip(tipText, {
        className: 'font-mono starlink-hex-tooltip',
        direction: 'top',
        offset: [0, -10]
      });

      hex.on('mouseover', function () {
        this.setStyle({
          weight: 3.2,
          color: '#ffffff',
          fillOpacity: 0.96
        });
      });

      hex.on('mouseout', function () {
        this.setStyle({
          weight: 2.2,
          color: '#ffffff',
          fillOpacity: 0.88
        });
      });

      hex.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        displayPointDetails(cell, 0);
      });

      markersLayer.addLayer(hex);
    }
  }

  // Hex Grid Selection (exact H3 cell lookup)
  function handleCoordinateSelection(lat, lng) {
    const snapped = snapToHexGrid(lat, lng);

    // Find if an already sampled/verified point exists in this exact H3 cell
    let existingInCell = null;
    for (const pt of surchargePoints) {
      const ptSnapped = snapToHexGrid(pt.lat, pt.lng);
      if (ptSnapped.cellKey === snapped.cellKey) {
        existingInCell = pt;
        break;
      }
    }

    if (existingInCell) {
      displayPointDetails(existingInCell, 0);
      dropRadarPin(snapped.centerLat, snapped.centerLng, snapped.boundary, false);
    } else {
      displayPointDetails({
        lat: snapped.centerLat,
        lng: snapped.centerLng,
        targetLat: lat,
        targetLng: lng,
        base_service_fee: null,
        service_price_adjustment: 0,
        total_monthly_fee: null,
        monthly_service_fee: null,
        surcharge_amount: null,
        status: 'unsampled',
        location_name: `Unsampled Cell (${snapped.centerLat.toFixed(3)}°, ${snapped.centerLng.toFixed(3)}°)`,
        sampled_at: new Date().toISOString(),
        isUnsampled: true,
        cellKey: snapped.cellKey,
        boundary: snapped.boundary
      }, null);
      dropRadarPin(snapped.centerLat, snapped.centerLng, snapped.boundary, true);
    }
  }

  // Render Selection Details in Sidebar
  function displayPointDetails(pt, distKm) {
    currentlyInspected = pt;
    const container = document.getElementById('inspector-content');
    if (!container) return;

    const pricing = getPointPricing(pt);
    const isSold = pt.status === 'sold_out';
    const isUnsampled = pricing.isUnsampled;
    const isLive = !!pt.isLiveVerified || pt.source === 'verified_live';

    const surcharge = pricing.surcharge || 0;
    const totalMonthly = pricing.total;
    const baseMonthly = pricing.base;
    const adjustment = pricing.adjustment;

    const cost = totalMonthly !== null ? totalMonthly : 120;
    let tierClass = isSold ? 'tier-waitlist' :
      cost >= 170 ? 'tier-high' :
        cost >= 130 ? 'tier-congested' :
          cost >= 85 ? 'tier-standard' :
            'tier-discount';

    let tierTitle = isSold ? 'UNAVAILABLE (SOLD OUT)' :
      cost >= 170 ? '$170+ HIGH CONGESTION COST' :
        cost >= 130 ? '$130–$170 CONGESTION ADJUSTED' :
          cost >= 85 ? '$85–$130 STANDARD BASE RATE' :
            isUnsampled ? 'UNSAMPLED CELL' :
              '$55–$85 CHEAPEST / DISCOUNTED';

    let feeDisplay = isUnsampled ? 'PENDING' : `${formatMoney(totalMonthly)}/mo`;

    const cacheLabel = isLive
      ? 'Verified Live from Starlink Checkout'
      : distKm !== null && distKm !== undefined
        ? (distKm === 0 ? 'Verified Ingested Node' : `Ingested Sample (${distKm.toFixed(1)} km away)`)
        : 'No verified sample in database';

    // Surcharge callout banner (only shown if there is an active surcharge)
    let surchargeBanner = '';
    if (surcharge > 0) {
      surchargeBanner = `
        <div class="surcharge-banner-callout font-mono">
          <span>⚠️</span>
          <span>+${formatMoney(surcharge)} ONE-TIME DEMAND SURCHARGE</span>
        </div>
      `;
    }

    // Adjustment label formatting
    let adjText = '$0.00/mo (No regional adjustment)';
    let adjColor = '#e2e8f0';
    if (!isUnsampled) {
      if (adjustment > 0) {
        adjText = `+${formatMoney(adjustment)}/mo (Congestion Adjustment)`;
        adjColor = '#fb923c';
      } else if (adjustment < 0) {
        adjText = `-${formatMoney(Math.abs(adjustment))}/mo (Regional Discount)`;
        adjColor = '#34d399';
      }
    }

    container.innerHTML = `
      <div class="pin-card">
        <div class="card-header-bar ${tierClass}">
          <span class="card-tier-label font-mono">${tierTitle}</span>
          <span class="card-tier-fee font-mono">${feeDisplay}</span>
        </div>
        ${surchargeBanner}
        <div class="card-body font-mono">
          <div class="prop-row">
            <span class="prop-name">BASE SERVICE PLAN:</span>
            <span class="prop-value">${isUnsampled ? 'Awaiting check' : `${formatMoney(baseMonthly)}/mo`}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">SERVICE PRICE ADJUSTMENT:</span>
            <span class="prop-value font-sans" style="color: ${adjColor}; font-weight: 500;">${isUnsampled ? 'Awaiting check' : adjText}</span>
          </div>
          <div class="prop-row" style="padding: 5px 0; border-top: 1px dashed rgba(255,255,255,0.12); border-bottom: 1px dashed rgba(255,255,255,0.12); font-weight: 600;">
            <span class="prop-name" style="color: #ffffff;">TOTAL MONTHLY SERVICE:</span>
            <span class="prop-value" style="color: #38bdf8; font-size: 0.85rem;">${isUnsampled ? 'PENDING' : `${formatMoney(totalMonthly)}/mo`}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">ONE-TIME SURCHARGE:</span>
            <span class="prop-value" style="color: ${surcharge > 0 ? '#ef4444' : '#34d399'}">${isUnsampled ? 'Pending' : (surcharge > 0 ? `+${formatMoney(surcharge)}` : '$0')}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">LOCATION:</span>
            <span class="prop-value font-sans">${cleanLocationName(pt.location_name)}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">LAST CHECKED:</span>
            <span class="prop-value">${isUnsampled ? 'Awaiting check' : formatDate(pt.last_checked || pt.sampled_at)}</span>
          </div>
        </div>
        <div class="card-footer">
          <button id="btn-live-worker" class="worker-action-btn font-mono">
            <span>CHECK SERVICE COST</span>
          </button>
          <p class="card-note font-sans">
            ${isLive
        ? 'Directly qualified from Starlink checkout session via Cloudflare Worker proxy.'
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

    dropRadarPin(pt.lat, pt.lng, pt.boundary, !!pt.isUnsampled);
  }

  // Pin with Radar Wave Animation & Cell Selection Outline
  function dropRadarPin(lat, lng, boundary, isUnsampled) {
    if (activeRadarPin) {
      map.removeLayer(activeRadarPin);
      activeRadarPin = null;
    }
    if (activeSelectionHex) {
      map.removeLayer(activeSelectionHex);
      activeSelectionHex = null;
    }

    if (boundary && isUnsampled) {
      activeSelectionHex = L.polygon(boundary, {
        color: '#06b6d4',
        weight: 2.5,
        dashArray: '5, 5',
        fillColor: '#06b6d4',
        fillOpacity: 0.18,
        interactive: false
      }).addTo(map);
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
      liveBtn.innerHTML = '<span class="btn-spinner"></span> <span>PROBING STARLINK CHECKOUT...</span>';
    }

    const targetUrl = `${CONFIG.WORKER_API_URL}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&force=true`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const result = await resp.json();
        if (result.source === 'verified_live' || result.source === 'postgis_cache') {
          const updated = {
            lat: result.lat,
            lng: result.lng,
            base_service_fee: result.base_service_fee,
            service_price_adjustment: result.service_price_adjustment,
            total_monthly_fee: result.total_monthly_fee,
            monthly_service_fee: result.total_monthly_fee,
            surcharge_amount: result.surcharge_amount,
            status: result.status,
            last_checked: result.last_checked || result.timestamp || new Date().toISOString(),
            sampled_at: result.timestamp || new Date().toISOString(),
            location_name: result.location_name || `Coordinate: ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W`,
            isLiveVerified: true,
            adjustment_description: result.adjustment_description,
            isUnsampled: false
          };

          // Check if already in points list by matching snapped hex cell
          const snapped = snapToHexGrid(lat, lng);
          const existingIdx = surchargePoints.findIndex(p => {
            const s = snapToHexGrid(p.lat, p.lng);
            return s.cellKey === snapped.cellKey;
          });

          if (existingIdx >= 0) {
            surchargePoints[existingIdx] = updated;
          } else {
            surchargePoints.unshift(updated);
          }

          updateStats();
          renderMarkers();
          displayPointDetails(updated, 0);
        } else {
          // Unsampled result returned
          const snapped = snapToHexGrid(lat, lng);
          displayPointDetails({
            lat: snapped.centerLat,
            lng: snapped.centerLng,
            base_service_fee: null,
            service_price_adjustment: 0,
            total_monthly_fee: null,
            monthly_service_fee: null,
            surcharge_amount: result.surcharge_amount,
            status: result.status || 'unsampled',
            last_checked: result.last_checked || result.timestamp || new Date().toISOString(),
            sampled_at: result.timestamp || new Date().toISOString(),
            location_name: result.location_name || `Coordinate (${snapped.centerLat.toFixed(3)}°N, ${snapped.centerLng.toFixed(3)}°W)`,
            isUnsampled: true,
            cellKey: snapped.cellKey,
            boundary: snapped.boundary
          }, null);
        }
      } else {
        let errBody = '';
        try { errBody = await resp.text(); } catch (e) { }
        displayLiveQueryError(lat, lng, `HTTP ${resp.status} (${resp.statusText}): ${errBody || 'Proxy returned an error'}`, targetUrl);
      }
    } catch (e) {
      console.error('Worker query error:', e);
      let errorReason = '';
      if (e.name === 'AbortError') {
        errorReason = 'Request timed out after 12 seconds. The Worker API endpoint did not respond.';
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
              • <strong>To test locally:</strong> Run <code>cd cloudflare-worker && npm run dev</code><br/>
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
    const filterMap = [
      { id: 'filter-tierDiscount', key: 'tierDiscount' },
      { id: 'filter-tierStandard', key: 'tierStandard' },
      { id: 'filter-tierCongested', key: 'tierCongested' },
      { id: 'filter-tierSurcharge', key: 'tierSurcharge' },
      { id: 'filter-tierSoldOut', key: 'tierSoldOut' }
    ];

    filterMap.forEach(({ id, key }) => {
      const chk = document.getElementById(id);
      if (chk) {
        chk.addEventListener('change', function () {
          tierFilters[key] = this.checked;
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
        this.querySelector('span').textContent = isCollapsed ? 'DETAILS' : 'HIDE';
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
