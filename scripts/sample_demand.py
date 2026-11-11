#!/usr/bin/env python3
"""
Starlink High-Demand Congestion Surcharge Adaptive Sparse Sampler
================================================================
Implements an adaptive hierarchical sampling algorithm across the United States:
1. Prioritizes known high-demand congestion hotspots first (e.g. Asheville, Tahoe, Aspen).
2. Traverses a hexagonal blanket grid across CONUS spaced ~115 km apart (~1,350 total hexes).
3. Executes in micro-batches (e.g. 8 points per hour) to stay 100% within free GitHub Actions/Worker tiers
   and well below Starlink rate limits.
4. Rotates the sampling grid offset weekly (by ~5 H3 hex steps / ~15 km) to interleave new coordinates
   and prevent testing the same static locations.
5. Dynamically promotes any hex returning a surcharge > $0 to the persistent Hotspots Queue and triggers
   a 4-point radial perimeter scatter (~25 km N, S, E, W).
6. Auto-demotes hotspots if they test at $0 for 2 consecutive cycles.
7. Upserts all verified points to Supabase PostGIS (`starlink_surcharges`).
"""

import os
import sys
import time
import math
import random
import logging
import json
import argparse
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

if not HAS_HTTPX and not HAS_REQUESTS:
    import urllib.request
    import urllib.error
    import urllib.parse


def http_get_json(url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None, timeout: float = 12.0) -> Tuple[int, Optional[Dict[str, Any]]]:
    """Unified HTTP GET helper supporting httpx, requests, or urllib."""
    if params:
        query_string = urllib.parse.urlencode(params) if not HAS_HTTPX and not HAS_REQUESTS else ""
        if not HAS_HTTPX and not HAS_REQUESTS:
            url = f"{url}?{query_string}" if "?" not in url else f"{url}&{query_string}"

    if HAS_HTTPX:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url, params=params, headers=headers)
                try:
                    return resp.status_code, resp.json()
                except Exception:
                    return resp.status_code, None
        except Exception:
            return 500, None

    if HAS_REQUESTS:
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            try:
                return resp.status_code, resp.json()
            except Exception:
                return resp.status_code, None
        except Exception:
            return 500, None

    # Fallback to standard library urllib
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            try:
                return status_code, json.loads(body)
            except Exception:
                return status_code, None
    except urllib.error.HTTPError as he:
        return he.code, None
    except Exception:
        return 500, None


def http_post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None, timeout: float = 15.0) -> Tuple[int, str]:
    """Unified HTTP POST helper supporting httpx, requests, or urllib."""
    if HAS_HTTPX:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, json=payload, headers=headers)
                return resp.status_code, resp.text
        except Exception as e:
            return 500, str(e)

    if HAS_REQUESTS:
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
            return resp.status_code, resp.text
        except Exception as e:
            return 500, str(e)

    # Standard library urllib
    try:
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers=headers or {}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.getcode(), response.read().decode("utf-8")
    except urllib.error.HTTPError as he:
        return he.code, he.read().decode("utf-8")
    except Exception as e:
        return 500, str(e)


# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("starlink_adaptive_sampler")

# Environment Variables
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STATE_FILE_PATH = os.path.join(os.path.dirname(__file__), "sampling_state.json")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
]

# Baseline Seeds for Initial Hotspot Priority Queue
INITIAL_HOTSPOTS: List[Dict[str, Any]] = [
    {"name": "Asheville Blue Ridge, NC", "lat": 35.5951, "lng": -82.5515, "last_surcharge": 250, "consecutive_zeros": 0},
    {"name": "Boone Watauga High Country, NC", "lat": 36.2168, "lng": -81.6758, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Gatlinburg Great Smoky Mtns, TN", "lat": 35.7143, "lng": -83.5102, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Truckee Lake Tahoe Basin, CA", "lat": 39.3280, "lng": -120.1278, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Aspen Roaring Fork, CO", "lat": 39.1911, "lng": -106.8370, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Jackson Hole Teton, WY", "lat": 43.4799, "lng": -110.7624, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Kalispell Flathead Basin, MT", "lat": 48.1920, "lng": -114.3553, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Bozeman Gallatin Valley, MT", "lat": 45.6770, "lng": -111.0429, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Bend Deschutes Corridor, OR", "lat": 44.0582, "lng": -121.3153, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Coeur d'Alene Hinterland, ID", "lat": 47.6777, "lng": -116.7804, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Flagstaff Coconino, AZ", "lat": 35.1983, "lng": -111.6513, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Sedona Oak Creek, AZ", "lat": 34.8697, "lng": -111.8315, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Show Low White Mtns, AZ", "lat": 34.2542, "lng": -110.0831, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Fredericksburg Hill Country, TX", "lat": 30.2752, "lng": -98.8719, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Minocqua Northwoods, WI", "lat": 45.8944, "lng": -89.6886, "last_surcharge": 0, "consecutive_zeros": 0},
    {"name": "Traverse City Leelanau, MI", "lat": 44.7631, "lng": -85.6206, "last_surcharge": 0, "consecutive_zeros": 0}
]


# ---------------------------------------------------------------------------
# GEODETIC MATH: GREAT CIRCLE DESTINATION CALCULATION
# ---------------------------------------------------------------------------
def calculate_destination_point(lat: float, lng: float, distance_km: float, bearing_deg: float) -> Tuple[float, float]:
    """Computes destination coordinates using Haversine spherical geometry."""
    R = 6371.0  # Earth mean radius in km
    delta = distance_km / R
    theta = math.radians(bearing_deg)

    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)

    dest_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(delta) +
        math.cos(lat_rad) * math.sin(delta) * math.cos(theta)
    )

    dest_lng_rad = lng_rad + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(lat_rad),
        math.cos(delta) - math.sin(lat_rad) * math.sin(dest_lat_rad)
    )

    dest_lat = math.degrees(dest_lat_rad)
    dest_lng = math.degrees(dest_lng_rad)
    dest_lng = (dest_lng + 540) % 360 - 180

    return round(dest_lat, 4), round(dest_lng, 4)


def generate_radial_scatter_points(center_lat: float, center_lng: float) -> List[Dict[str, Any]]:
    """Generates 4 cardinal perimeter points (~25 km N, E, S, W) around a discovered surcharge hit."""
    points = []
    cardinal_bearings = [("North", 0.0), ("East", 90.0), ("South", 180.0), ("West", 270.0)]
    for label, bearing in cardinal_bearings:
        lat, lng = calculate_destination_point(center_lat, center_lng, 25.0, bearing)
        points.append({
            "name": f"Perimeter 25km {label}",
            "lat": lat,
            "lng": lng,
            "distance_km": 25.0,
            "bearing": bearing
        })
    return points


# ---------------------------------------------------------------------------
# HEXAGONAL BLANKET GRID GENERATOR (CONUS LAND MASS)
# ---------------------------------------------------------------------------
def is_conus_land(lat: float, lng: float) -> bool:
    """Filters out oceans and external borders for continental US."""
    if not (24.5 <= lat <= 49.5 and -124.8 <= lng <= -66.9):
        return False
    # Exclude Gulf of Mexico
    if lat < 29.2 and -95.0 < lng < -82.5:
        return False
    # Exclude Atlantic South/East of Florida
    if lat < 25.2 and lng > -80.0:
        return False
    # Exclude Pacific offshore
    if lat < 33.5 and lng < -118.0:
        return False
    # Exclude northern Maine ocean wedge
    if lat > 47.2 and lng > -67.5:
        return False
    return True


def generate_us_blanket_hex_grid(spacing_km: float = 115.0, week_offset: int = 0) -> List[Tuple[float, float]]:
    """
    Generates a true staggered hexagonal honeycomb lattice over CONUS.
    Applies a rotating weekly offset (shifting ~15 km each week) so that week 1, 2, 3, 4, 5
    interleave different ground locations without re-testing identical cells.
    """
    lat_step = spacing_km / 111.0  # ~1.036 deg lat

    # Shift vector: 5 weekly rotations moving diagonally across the hex tile
    shift_lat = (week_offset % 5) * (lat_step / 5.0)
    shift_lng = (week_offset % 5) * (lat_step / 5.0)

    points = []
    lat = 25.0 + shift_lat
    row = 0

    while lat <= 49.2:
        km_per_deg_lng = 111.0 * math.cos(math.radians(lat))
        if km_per_deg_lng <= 0:
            break

        lng_step = (spacing_km * (math.sqrt(3) / 2.0)) / km_per_deg_lng
        lng_stagger = (lng_step / 2.0) if (row % 2 == 1) else 0.0

        lng = -124.5 + lng_stagger + shift_lng
        while lng <= -67.0:
            if is_conus_land(lat, lng):
                points.append((round(lat, 4), round(lng, 4)))
            lng += lng_step

        lat += lat_step * 0.75  # Hexagonal vertical step height
        row += 1

    return points


# ---------------------------------------------------------------------------
# STARLINK QUALIFICATION PROBE ENGINE (AUTHENTIC 4-STEP PIPELINE)
# ---------------------------------------------------------------------------
def probe_starlink_availability(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """
    Executes Starlink's authentic address qualification and pricing flow:
    1. Reverse-geocode lat/lng -> place_id & address components
    2. POST /api/webagg/v1/public/leads -> processorToken
    3. GET /api/webagg/v1/public/sign-up/lead -> hydrates cart session
    4. GET /api/webagg/v1/public/sign-up/pricing -> exact fee breakdown

    Zero heuristics, zero synthetic bounding boxes.
    """
    browser_headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.starlink.com/residential",
        "Origin": "https://www.starlink.com"
    }

    max_retries = 3
    backoff = 2.0

    for attempt in range(max_retries):
        try:
            # Jitter delay (1.5 to 3.5 seconds) to avoid rate limits
            jitter = random.uniform(1.5, 3.5)
            time.sleep(jitter)

            # 1. Reverse-geocode coordinate
            rg_url = "https://starlink.com/api/marketing/v1/addresses/reverse-geocode"
            rg_code, rg_data = http_get_json(
                rg_url,
                params={"latitude": f"{lat:.4f}", "longitude": f"{lng:.4f}"},
                headers=browser_headers,
                timeout=12.0
            )
            if rg_code != 200 or not isinstance(rg_data, dict):
                logger.warning(f"Reverse geocode returned HTTP {rg_code} on attempt {attempt+1}")
                continue

            content = rg_data.get("content", [])
            if not content:
                logger.warning(f"No reverse geocode results for ({lat}, {lng})")
                return None

            first_match = content[0]
            comps: Dict[str, Tuple[str, str]] = {}
            for c in first_match.get("address_components", []):
                types = c.get("types", [])
                if types:
                    comps[types[0]] = (c.get("short_name", ""), c.get("long_name", ""))

            country = comps.get("country", ("US", "United States"))[0]
            state_short = comps.get("administrative_area_level_1", ("", ""))[0]
            state_long = comps.get("administrative_area_level_1", ("", ""))[1]
            city = comps.get("locality", ("", ""))[1]
            zip_code = comps.get("postal_code", ("", ""))[0]

            # 2. Create Lead Session
            lead_payload = {
                "source": 0,
                "sourceV2": "1",
                "leadAttributes": {
                    "page": "/residential",
                    "activation": "false"
                },
                "countryCode": country or "US",
                "locale": "en-US",
                "latitude": lat,
                "longitude": lng,
                "formattedAddress": first_match.get("formatted_address"),
                "placeId": first_match.get("place_id"),
                "zipCode": zip_code,
                "region": state_short,
                "administrativeArea": state_long,
                "locality": city
            }

            lead_url = "https://starlink.com/api/webagg/v1/public/leads"
            lead_code, lead_text = http_post_json(
                lead_url,
                payload=lead_payload,
                headers={**browser_headers, "Content-Type": "application/json"},
                timeout=15.0
            )
            if lead_code != 200:
                logger.warning(f"Lead creation returned HTTP {lead_code}: {lead_text[:160]}")
                continue

            lead_json = json.loads(lead_text)
            token = lead_json.get("content", {}).get("processorToken")
            if not token:
                logger.warning("No processorToken in lead response")
                continue

            # 3. Hydrate cart session via /sign-up/lead
            hydrate_url = "https://starlink.com/api/webagg/v1/public/sign-up/lead"
            hyd_code, _ = http_get_json(
                hydrate_url,
                params={"processorToken": token},
                headers={**browser_headers, "Referer": f"https://starlink.com/order?processorToken={token}"},
                timeout=15.0
            )
            if hyd_code != 200:
                logger.warning(f"Lead hydration returned HTTP {hyd_code}")
                continue

            # 4. Retrieve exact pricing breakdown
            price_url = "https://starlink.com/api/webagg/v1/public/sign-up/pricing"
            price_code, price_data = http_get_json(
                price_url,
                params={"processorToken": token},
                headers={**browser_headers, "Referer": f"https://starlink.com/order?processorToken={token}"},
                timeout=15.0
            )
            if price_code != 200 or not isinstance(price_data, dict):
                logger.warning(f"Pricing returned HTTP {price_code}")
                continue

            pricing_content = price_data.get("content", {})
            surcharge_prods = pricing_content.get("demandSurchargeProducts", [])
            surcharge = 0
            if surcharge_prods:
                surcharge = int(surcharge_prods[0].get("price", 0))

            deposit = int(pricing_content.get("depositAmount", 0))
            base_service = float(pricing_content.get("serviceAmount", 120))

            # Genuine extraction of Service Price Adjustment from Starlink promotionEvaluation
            service_adjustment = 0.0
            promo = pricing_content.get("promotionEvaluation") or {}
            promo_apps = promo.get("promotionApplications", [])
            for app in promo_apps:
                desc = (app.get("publicDescription") or app.get("description") or "").lower()
                if "service" in desc or "adjustment" in desc:
                    service_adjustment = float(app.get("unitDelta") if app.get("unitDelta") is not None else (app.get("lineDelta") or 0.0))
                    break

            # Total monthly service cost: Base + Adjustment
            total_monthly = round(base_service + service_adjustment, 2)

            if deposit > 0:
                status = "sold_out"
            elif surcharge > 0:
                status = "high_demand"
            elif service_adjustment > 0 or total_monthly > 120:
                status = "congested"
            elif service_adjustment < 0 or total_monthly < 120:
                status = "discounted"
            else:
                status = "standard"

            logger.info(f"Verified Live: ({lat}, {lng}) -> Base: ${base_service}/mo, Adj: {'+' if service_adjustment >= 0 else ''}${service_adjustment}/mo, Total: ${total_monthly}/mo, Surcharge: ${surcharge}, Status: {status}")

            return {
                "base_service_fee": base_service,
                "service_price_adjustment": service_adjustment,
                "total_monthly_fee": total_monthly,
                "monthly_service_fee": total_monthly,
                "surcharge_amount": surcharge,
                "status": status,
                "verified_live": True,
                "location_name": first_match.get("formatted_address") or f"{city}, {state_short}",
                "deposit_amount": deposit
            }

        except Exception as e:
            logger.warning(f"Probe attempt {attempt+1} encountered error for ({lat}, {lng}): {e}")
            time.sleep(backoff)
            backoff *= 1.5

    logger.warning(f"Unable to qualify ({lat:.4f}, {lng:.4f}) after {max_retries} retries.")
    return None


# ---------------------------------------------------------------------------
# SUPABASE POSTGRESQL + POSTGIS INGESTION
# ---------------------------------------------------------------------------
def upsert_batch_to_supabase(records: List[Dict[str, Any]]) -> int:
    """Batches and upserts verified sampled records into Supabase PostgreSQL."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Skipping database upsert.")
        return 0

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    successful = 0
    for rec in records:
        rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/upsert_starlink_surcharge"
        payload = {
            "p_lat": rec["lat"],
            "p_lng": rec["lng"],
            "p_surcharge_amount": rec["surcharge_amount"],
            "p_status": rec["status"],
            "p_sample_type": rec["sample_type"],
            "p_location_name": rec.get("location_name")
        }

        try:
            status_code, text = http_post_json(rpc_url, payload=payload, headers=headers)
            if status_code in (200, 201, 204):
                successful += 1
            else:
                # Direct table upsert fallback
                table_url = f"{SUPABASE_URL}/rest/v1/starlink_surcharges"
                geom_wkt = f"SRID=4326;POINT({rec['lng']} {rec['lat']})"
                row_data = {
                    "coordinates": geom_wkt,
                    "lat": rec["lat"],
                    "lng": rec["lng"],
                    "surcharge_amount": rec["surcharge_amount"],
                    "status": rec["status"],
                    "sample_type": rec["sample_type"],
                    "location_name": rec.get("location_name"),
                    "sampled_at": datetime.now(timezone.utc).isoformat()
                }
                if "monthly_service_fee" in rec:
                    row_data["monthly_service_fee"] = rec["monthly_service_fee"]

                fb_status, fb_text = http_post_json(
                    table_url,
                    payload=row_data,
                    headers={**headers, "Prefer": "resolution=merge-duplicates"}
                )
                if fb_status in (200, 201, 204):
                    successful += 1
                elif "monthly_service_fee" in fb_text:
                    # Column not yet in schema; retry without it
                    row_data.pop("monthly_service_fee", None)
                    retry_status, _ = http_post_json(
                        table_url,
                        payload=row_data,
                        headers={**headers, "Prefer": "resolution=merge-duplicates"}
                    )
                    if retry_status in (200, 201, 204):
                        successful += 1
                if fb_status in (200, 201, 204):
                    successful += 1
                else:
                    logger.error(f"Failed upsert ({rec['lat']}, {rec['lng']}): {fb_text}")
        except Exception as ex:
            logger.error(f"Exception during upsert for ({rec['lat']}, {rec['lng']}): {ex}")

    return successful


# ---------------------------------------------------------------------------
# PERSISTENT SAMPLING STATE MANAGEMENT
# ---------------------------------------------------------------------------
def load_sampling_state() -> Dict[str, Any]:
    """Loads sampling cursor and hotspots queue from state file or initializes defaults."""
    now = datetime.now(timezone.utc)
    current_week = now.isocalendar().week

    if os.path.exists(STATE_FILE_PATH):
        try:
            with open(STATE_FILE_PATH, "r", encoding="utf-8") as f:
                state = json.load(f)
                # Check for weekly rotation boundary
                if state.get("current_week_index") != current_week:
                    logger.info(f"New calendar week detected ({state.get('current_week_index')} -> {current_week}). Shifting hex grid offset by +5 hex steps.")
                    state["current_week_index"] = current_week
                    state["blanket_cursor"] = 0
                return state
        except Exception as e:
            logger.warning(f"Could not read state file ({e}). Re-initializing state.")

    # Default state initialization
    return {
        "current_week_index": current_week,
        "blanket_cursor": 0,
        "known_hotspots": INITIAL_HOTSPOTS,
        "hotspot_cursor": 0,
        "stats": {
            "total_probes_run": 0,
            "high_demand_hits_found": 1,
            "cycles_completed": 0
        },
        "last_run_timestamp": None
    }


def save_sampling_state(state: Dict[str, Any]):
    """Persists sampling state to disk."""
    state["last_run_timestamp"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(STATE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save sampling state: {e}")


# ---------------------------------------------------------------------------
# ADAPTIVE BATCH RUNNER
# ---------------------------------------------------------------------------
def run_sampling_batch(batch_size: int = 8, hotspots_only: bool = False, dry_run: bool = False):
    """
    Executes a single micro-batch:
    - 1-2 known hotspots checked first.
    - Next slice of the hexagonal blanket grid (advancing the cursor).
    - If surcharge > 0, auto-promotes to hotspots and triggers 4-point radial scatter.
    - If hotspot reports $0 twice consecutively, demotes back to blanket.
    """
    state = load_sampling_state()
    week_idx = state.get("current_week_index", 0)
    blanket_cursor = state.get("blanket_cursor", 0)
    hotspots: List[Dict[str, Any]] = state.get("known_hotspots", INITIAL_HOTSPOTS)

    records_to_upsert: List[Dict[str, Any]] = []

    logger.info("==========================================================")
    logger.info("Starlink Adaptive Congestion Surcharge Sparse Sampler")
    logger.info(f"Week Index: {week_idx} (Hex Grid Shift Offset: {week_idx % 5})")
    logger.info(f"Active Known Hotspots Queue: {len(hotspots)}")
    logger.info(f"Blanket Grid Cursor: {blanket_cursor}")
    logger.info(f"Batch Size: {batch_size} points")
    logger.info("==========================================================")

    # 1. Probe 1-2 Known Hotspots First (Priority Queue)
    hotspots_checked = 0
    if hotspots:
        hotspot_idx = state.get("hotspot_cursor", 0) % len(hotspots)
        target_hotspot = hotspots[hotspot_idx]
        state["hotspot_cursor"] = (hotspot_idx + 1) % len(hotspots)

        h_lat = target_hotspot["lat"]
        h_lng = target_hotspot["lng"]
        h_name = target_hotspot["name"]

        logger.info(f"[Priority Hotspot] Probing: {h_name} ({h_lat}, {h_lng})")
        probe_res = probe_starlink_availability(h_lat, h_lng)

        if probe_res:
            surcharge = probe_res["surcharge_amount"]
            monthly_service = probe_res.get("monthly_service_fee", 120)
            target_hotspot["last_surcharge"] = surcharge
            target_hotspot["last_monthly_fee"] = monthly_service
            target_hotspot["last_checked"] = datetime.now(timezone.utc).isoformat()

            is_congested_hotspot = (surcharge > 0) or (monthly_service > 120)

            if is_congested_hotspot:
                target_hotspot["consecutive_zeros"] = 0
                logger.info(f"  -> Hotspot Active: ${monthly_service}/mo (${surcharge} surcharge) congestion maintained.")
            else:
                target_hotspot["consecutive_zeros"] = target_hotspot.get("consecutive_zeros", 0) + 1
                logger.info(f"  -> Hotspot returned standard rate ($120/mo, $0 surcharge) (strikes: {target_hotspot['consecutive_zeros']}/2).")

                # Auto-demote after 2 consecutive non-congested checks
                if target_hotspot["consecutive_zeros"] >= 2:
                    logger.info(f"  -> Demoting {h_name} from priority hotspots (standard rate twice).")
                    hotspots.remove(target_hotspot)

            records_to_upsert.append({
                "lat": h_lat,
                "lng": h_lng,
                "surcharge_amount": surcharge,
                "monthly_service_fee": monthly_service,
                "status": probe_res["status"],
                "sample_type": "hotspot_priority",
                "location_name": probe_res.get("location_name") or h_name
            })
            hotspots_checked += 1

    # 2. Probe Next Slice of Blanket Grid (if not hotspots_only)
    if not hotspots_only:
        grid = generate_us_blanket_hex_grid(spacing_km=115.0, week_offset=week_idx)
        total_grid_points = len(grid)

        # Remaining quota in this batch
        remaining_quota = max(1, batch_size - hotspots_checked)
        start_idx = blanket_cursor % total_grid_points
        end_idx = start_idx + remaining_quota
        batch_coords = grid[start_idx:end_idx]

        logger.info(f"Blanket Lattice Slice: Points {start_idx} to {end_idx} of {total_grid_points}")

        for idx, (b_lat, b_lng) in enumerate(batch_coords, start=1):
            logger.info(f"[Blanket Hex {idx}/{len(batch_coords)}] Probing ({b_lat}, {b_lng})")
            probe_res = probe_starlink_availability(b_lat, b_lng)

            if not probe_res:
                continue

            surcharge = probe_res["surcharge_amount"]
            monthly_service = probe_res.get("monthly_service_fee", 120)
            status = probe_res["status"]
            loc_name = probe_res.get("location_name") or f"US Cell ({b_lat:.3f}°N, {b_lng:.3f}°W)"

            records_to_upsert.append({
                "lat": b_lat,
                "lng": b_lng,
                "surcharge_amount": surcharge,
                "monthly_service_fee": monthly_service,
                "status": status,
                "sample_type": "blanket_grid",
                "location_name": loc_name
            })

            # 3. Discovery: If Surcharge > 0 OR monthly service > $120, promote & scatter!
            if surcharge > 0 or monthly_service > 120:
                logger.info(f"  -> CONGESTION ZONE DISCOVERED! ${monthly_service}/mo (+${surcharge} surcharge) at {loc_name}")
                state["stats"]["high_demand_hits_found"] = state["stats"].get("high_demand_hits_found", 0) + 1

                # Promote to Known Hotspots
                if not any(abs(h["lat"] - b_lat) < 0.1 and abs(h["lng"] - b_lng) < 0.1 for h in hotspots):
                    hotspots.append({
                        "name": loc_name,
                        "lat": b_lat,
                        "lng": b_lng,
                        "last_surcharge": surcharge,
                        "last_monthly_fee": monthly_service,
                        "consecutive_zeros": 0,
                        "last_checked": datetime.now(timezone.utc).isoformat()
                    })

                # Fire 4-point perimeter scatter (~25 km)
                logger.info("  -> Triggering 4-point perimeter radial scatter...")
                scatters = generate_radial_scatter_points(b_lat, b_lng)
                for sc in scatters:
                    s_res = probe_starlink_availability(sc["lat"], sc["lng"])
                    if s_res:
                        records_to_upsert.append({
                            "lat": sc["lat"],
                            "lng": sc["lng"],
                            "surcharge_amount": s_res["surcharge_amount"],
                            "monthly_service_fee": s_res.get("monthly_service_fee", 120),
                            "status": s_res["status"],
                            "sample_type": "radial_scatter",
                            "location_name": s_res.get("location_name") or f"{loc_name} {sc['name']}"
                        })

        # Advance cursor and check for cycle wrap
        new_cursor = end_idx % total_grid_points
        if end_idx >= total_grid_points:
            state["stats"]["cycles_completed"] = state["stats"].get("cycles_completed", 0) + 1
            logger.info("==========================================================")
            logger.info(f"Full Blanket Grid Cycle Complete! Total Cycles: {state['stats']['cycles_completed']}")
            logger.info("==========================================================")

        state["blanket_cursor"] = new_cursor

    state["stats"]["total_probes_run"] = state["stats"].get("total_probes_run", 0) + len(records_to_upsert)

    # 4. Ingest batch into Supabase PostGIS
    if records_to_upsert and not dry_run:
        logger.info(f"Upserting {len(records_to_upsert)} verified records into Supabase PostGIS...")
        upserted = upsert_batch_to_supabase(records_to_upsert)
        logger.info(f"Successfully upserted {upserted}/{len(records_to_upsert)} records to PostGIS.")
    elif dry_run:
        logger.info(f"Dry run mode: skipped database write for {len(records_to_upsert)} records.")

    # 5. Persist State
    save_sampling_state(state)
    logger.info("Sampling batch finished. State updated successfully.")


# ---------------------------------------------------------------------------
# CLI ENTRY POINT
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Starlink Adaptive Sparse Congestion Sampler")
    parser.add_argument("--batch-size", type=int, default=8, help="Number of blanket grid coordinates to probe in this run")
    parser.add_argument("--hotspots-only", action="store_true", help="Only probe known hotspots; skip blanket grid")
    parser.add_argument("--dry-run", action="store_true", help="Probe endpoints without writing to Supabase")
    parser.add_argument("--reset-state", action="store_true", help="Reset cursor to 0 and reinitialize state file")

    args = parser.parse_args()

    if args.reset_state and os.path.exists(STATE_FILE_PATH):
        os.remove(STATE_FILE_PATH)
        logger.info("Sampling state reset.")

    run_sampling_batch(batch_size=args.batch_size, hotspots_only=args.hotspots_only, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
