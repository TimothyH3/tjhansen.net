/**
 * Starlink High-Demand Congestion Surcharge Map Engine
 * tjhansen.net / Starlink Surcharge Map
 */

(function () {
  'use strict';

  // Config: Override with window.STARLINK_CONFIG if present
  const CONFIG = Object.assign({
    SUPABASE_URL: 'https://xyz.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOi...',
    WORKER_API_URL: 'https://starlink-surcharge-worker.tjhansen.workers.dev/api/check-fee'
  }, window.STARLINK_CONFIG || {});

  // High-fidelity baseline seed points across US bottleneck corridors
  const BASELINE_DATA = [
    { lat: 47.6062, lng: -122.3321, surcharge_amount: 100, status: 'high_demand', location_name: 'Seattle Rural Outer, WA', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 47.6588, lng: -117.4260, surcharge_amount: 100, status: 'high_demand', location_name: 'Spokane County, WA', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 44.0582, lng: -121.3153, surcharge_amount: 250, status: 'high_demand', location_name: 'Bend Deschutes Basin, OR', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 44.0521, lng: -123.0868, surcharge_amount: 100, status: 'high_demand', location_name: 'Eugene Periphery, OR', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 43.6150, lng: -116.2023, surcharge_amount: 250, status: 'high_demand', location_name: 'Boise Valley, ID', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 47.6777, lng: -116.7804, surcharge_amount: 250, status: 'high_demand', location_name: 'Coeur d Alene Hinterland, ID', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 48.1920, lng: -114.3553, surcharge_amount: 500, status: 'high_demand', location_name: 'Kalispell Flathead, MT', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 46.8721, lng: -114.0076, surcharge_amount: 250, status: 'high_demand', location_name: 'Missoula Bitterroot, MT', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 45.6770, lng: -111.0429, surcharge_amount: 500, status: 'high_demand', location_name: 'Bozeman Gallatin, MT', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 40.7608, lng: -111.8910, surcharge_amount: 100, status: 'high_demand', location_name: 'Wasatch Corridor, UT', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 37.1041, lng: -113.5684, surcharge_amount: 500, status: 'high_demand', location_name: 'St. George Basin, UT', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 39.7392, lng: -104.9903, surcharge_amount: 100, status: 'high_demand', location_name: 'Denver Front Range Foothills, CO', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 37.2753, lng: -107.8801, surcharge_amount: 500, status: 'high_demand', location_name: 'Durango San Juan, CO', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 39.1911, lng: -106.8370, surcharge_amount: 1000, status: 'high_demand', location_name: 'Aspen Roaring Fork, CO', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 43.4799, lng: -110.7624, surcharge_amount: 1000, status: 'high_demand', location_name: 'Jackson Hole Valley, WY', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 41.3114, lng: -105.5005, surcharge_amount: 0, status: 'standard', location_name: 'Laramie Plains, WY', sampled_at: '2026-11-01T04:00:00Z' },
    { lat: 35.1983, lng: -111.6513, surcharge_amount: 500, status: 'high_demand', location_name: 'Flagstaff Coconino, AZ', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 34.8697, lng: -111.8315, surcharge_amount: 500, status: 'high_demand', location_name: 'Sedona Red Rock, AZ', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 34.2542, lng: -110.0831, surcharge_amount: 500, status: 'high_demand', location_name: 'Show Low White Mtns, AZ', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 35.6870, lng: -105.9378, surcharge_amount: 250, status: 'high_demand', location_name: 'Santa Fe Foothills, NM', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 36.4072, lng: -105.5734, surcharge_amount: 500, status: 'high_demand', location_name: 'Taos Enchanted Circle, NM', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 39.5296, lng: -119.8138, surcharge_amount: 250, status: 'high_demand', location_name: 'Reno / Tahoe Basin, NV', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 36.1699, lng: -115.1398, surcharge_amount: 0, status: 'standard', location_name: 'Clark County Fringe, NV', sampled_at: '2026-11-01T04:00:00Z' },
    { lat: 35.5951, lng: -82.5515, surcharge_amount: 500, status: 'high_demand', location_name: 'Asheville Blue Ridge, NC', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 36.2168, lng: -81.6758, surcharge_amount: 500, status: 'high_demand', location_name: 'Boone High Country, NC', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 35.7143, lng: -83.5102, surcharge_amount: 1000, status: 'high_demand', location_name: 'Gatlinburg Great Smoky Mtns, TN', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 35.0456, lng: -85.3097, surcharge_amount: 250, status: 'high_demand', location_name: 'Chattanooga Outer, TN', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 38.3498, lng: -81.6326, surcharge_amount: 250, status: 'high_demand', location_name: 'Charleston Kanawha, WV', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 39.6295, lng: -79.9559, surcharge_amount: 250, status: 'high_demand', location_name: 'Morgantown Corridor, WV', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 38.0406, lng: -84.5037, surcharge_amount: 100, status: 'high_demand', location_name: 'Lexington Outer Bluegrass, KY', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 37.2487, lng: -83.4488, surcharge_amount: 500, status: 'high_demand', location_name: 'Hazard Coalfields, KY', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 37.2710, lng: -79.9414, surcharge_amount: 250, status: 'high_demand', location_name: 'Roanoke Valley, VA', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 38.4496, lng: -78.8689, surcharge_amount: 250, status: 'high_demand', location_name: 'Shenandoah Valley, VA', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 36.6437, lng: -93.2185, surcharge_amount: 500, status: 'high_demand', location_name: 'Branson Ozarks, MO', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 36.0626, lng: -94.1574, surcharge_amount: 250, status: 'high_demand', location_name: 'Fayetteville Boston Mtns, AR', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 34.5262, lng: -84.0713, surcharge_amount: 500, status: 'high_demand', location_name: 'Dahlonega North GA, GA', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 33.9519, lng: -83.3779, surcharge_amount: 100, status: 'high_demand', location_name: 'Athens Outer Rural, GA', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 34.0143, lng: -85.9767, surcharge_amount: 250, status: 'high_demand', location_name: 'Gadsden Lookout Mtn, AL', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 30.4005, lng: -86.1477, surcharge_amount: 500, status: 'high_demand', location_name: 'Destin Emerald Coast, FL', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 29.6516, lng: -82.3248, surcharge_amount: 100, status: 'high_demand', location_name: 'Gainesville Basin, FL', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 28.5383, lng: -81.3792, surcharge_amount: 0, status: 'standard', location_name: 'Orlando Central Metro, FL', sampled_at: '2026-11-01T04:00:00Z' },
    { lat: 30.2752, lng: -98.8719, surcharge_amount: 500, status: 'high_demand', location_name: 'Fredericksburg Hill Country, TX', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 30.2672, lng: -97.7431, surcharge_amount: 100, status: 'high_demand', location_name: 'Austin Outer Hill Country, TX', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 29.7604, lng: -95.3698, surcharge_amount: 0, status: 'standard', location_name: 'Houston Metro, TX', sampled_at: '2026-11-01T04:00:00Z' },
    { lat: 31.5493, lng: -97.1467, surcharge_amount: 250, status: 'high_demand', location_name: 'Waco Brazos Basin, TX', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 32.4487, lng: -99.7331, surcharge_amount: 100, status: 'high_demand', location_name: 'Abilene Plains, TX', sampled_at: '2026-11-02T04:00:00Z' },
    { lat: 44.7631, lng: -85.6206, surcharge_amount: 500, status: 'high_demand', location_name: 'Traverse City Northern MI, MI', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 46.5436, lng: -87.3770, surcharge_amount: 250, status: 'high_demand', location_name: 'Marquette Upper Peninsula, MI', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 45.8944, lng: -89.6886, surcharge_amount: 500, status: 'high_demand', location_name: 'Minocqua Northwoods, WI', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 46.3527, lng: -94.1632, surcharge_amount: 250, status: 'high_demand', location_name: 'Brainerd Lakes, MN', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 39.3280, lng: -120.1278, surcharge_amount: 1000, status: 'high_demand', location_name: 'Truckee High Sierra, CA', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 37.6485, lng: -118.9721, surcharge_amount: 1000, status: 'high_demand', location_name: 'Mammoth Lakes Sierra, CA', sampled_at: '2026-11-05T04:00:00Z' },
    { lat: 41.3100, lng: -122.3861, surcharge_amount: 500, status: 'high_demand', location_name: 'Mount Shasta Siskiyou, CA', sampled_at: '2026-11-04T04:00:00Z' },
    { lat: 39.3077, lng: -123.7995, surcharge_amount: 500, status: 'high_demand', location_name: 'Mendocino Redwood Coast, CA', sampled_at: '2026-11-03T04:00:00Z' },
    { lat: 34.1347, lng: -116.3131, surcharge_amount: 500, status: 'high_demand', location_name: 'Joshua Tree High Desert, CA', sampled_at: '2026-11-04T04:00:00Z' }
  ];

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
          surchargePoints = BASELINE_DATA;
        }
      } else {
        surchargePoints = BASELINE_DATA;
      }
    } catch (err) {
      console.warn('Supabase not reached. Using local telemetry cache.', err);
      surchargePoints = BASELINE_DATA;
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'OFFLINE CACHE';
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

    let tierClass = isSold ? 'tier-waitlist' : isHigh ? 'tier-high' : '';
    let tierTitle = isSold ? 'SOLD OUT / WAITLIST' :
      pt.surcharge_amount >= 1000 ? 'SEVERE CONGESTION SURCHARGE' :
      pt.surcharge_amount >= 500 ? 'HIGH DEMAND SURCHARGE' :
      pt.surcharge_amount >= 100 ? 'MODERATE SURCHARGE ZONE' :
      'STANDARD CAPACITY ($0)';

    const cacheLabel = distKm !== null && distKm !== undefined
      ? (distKm === 0 ? 'Exact Verified Pin' : `Cached (${distKm.toFixed(1)} km away)`)
      : 'Uncached Proximity';

    container.innerHTML = `
      <div class="pin-card">
        <div class="card-header-bar ${tierClass}">
          <span class="card-tier-label font-mono">${tierTitle}</span>
          <span class="card-tier-fee font-mono">$${pt.surcharge_amount}</span>
        </div>
        <div class="card-body font-mono">
          <div class="prop-row">
            <span class="prop-name">COORDINATES:</span>
            <span class="prop-value">${pt.lat.toFixed(4)}°N, ${pt.lng.toFixed(4)}°W</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">LOCATION:</span>
            <span class="prop-value font-sans">${pt.location_name || 'US Point'}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">CACHE STATUS:</span>
            <span class="prop-value">${cacheLabel}</span>
          </div>
          <div class="prop-row">
            <span class="prop-name">CHECKED:</span>
            <span class="prop-value">${formatDate(pt.sampled_at)}</span>
          </div>
        </div>
        <div class="card-footer">
          <button id="btn-live-worker" class="worker-action-btn font-mono">
            <span>⚡ CHECK EXACT LIVE SURCHARGE</span>
          </button>
          <p class="card-note font-sans">
            Queries live Starlink checkout qualification proxy and saves to PostGIS.
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

  // Invoke Cloudflare Worker Live Lookup
  async function triggerLiveWorker(lat, lng) {
    const liveBtn = document.getElementById('btn-live-worker');
    if (liveBtn) {
      liveBtn.disabled = true;
      liveBtn.innerHTML = '<span class="btn-spinner"></span> <span>PROBING STARLINK...</span>';
    }

    try {
      const url = `${CONFIG.WORKER_API_URL}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const result = await resp.json();
        const updated = {
          lat: result.lat,
          lng: result.lng,
          surcharge_amount: result.surcharge_amount,
          status: result.status,
          sampled_at: result.timestamp,
          location_name: `Verified Live: ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W`
        };

        surchargePoints.unshift(updated);
        updateStats();
        renderMarkers();
        displayPointDetails(updated, 0);
      } else {
        alert('Live lookup proxy encountered a service error.');
      }
    } catch (e) {
      console.error('Worker request failed:', e);
      alert('Could not connect to live Cloudflare Worker proxy.');
    } finally {
      if (liveBtn) liveBtn.disabled = false;
    }
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
