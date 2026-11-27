-- ============================================================================
-- STARLINK REGIONAL SERVICE COST & CONGESTION SURCHARGE TRACKER
-- Supabase PostgreSQL + PostGIS Schema & Spatial Migrations
-- Target Database: Supabase PostgreSQL 15+ with PostGIS
-- ============================================================================

-- 1. Enable PostGIS Extension in extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Ensure public.spatial_ref_sys has RLS enabled if postgis was previously installed in public
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys'
    ) THEN
        EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow public read-only on spatial_ref_sys" ON public.spatial_ref_sys';
        EXECUTE 'CREATE POLICY "Allow public read-only on spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT TO public USING (true)';
    END IF;
END $$;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- 2. Create starlink_surcharges Table
CREATE TABLE IF NOT EXISTS starlink_surcharges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    base_service_fee NUMERIC(6, 2) NOT NULL DEFAULT 120.00 CHECK (base_service_fee >= 0),
    service_price_adjustment NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    total_monthly_fee NUMERIC(6, 2) NOT NULL DEFAULT 120.00 CHECK (total_monthly_fee >= 0),
    monthly_service_fee NUMERIC(6, 2) NOT NULL DEFAULT 120.00 CHECK (monthly_service_fee >= 0),
    surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('standard', 'discounted', 'congested', 'high_demand', 'sold_out')),
    adjustment_description TEXT DEFAULT 'Service Price Adjustment',
    last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sample_type TEXT NOT NULL,
    location_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration for existing tables (safe to re-run):
ALTER TABLE starlink_surcharges ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ DEFAULT NOW();
UPDATE starlink_surcharges SET last_checked = sampled_at WHERE last_checked IS NULL;
ALTER TABLE starlink_surcharges ADD COLUMN IF NOT EXISTS base_service_fee NUMERIC(6, 2) DEFAULT 120.00;
ALTER TABLE starlink_surcharges ADD COLUMN IF NOT EXISTS service_price_adjustment NUMERIC(6, 2) DEFAULT 0.00;
ALTER TABLE starlink_surcharges ADD COLUMN IF NOT EXISTS total_monthly_fee NUMERIC(6, 2) DEFAULT 120.00;
ALTER TABLE starlink_surcharges ADD COLUMN IF NOT EXISTS adjustment_description TEXT DEFAULT 'Service Price Adjustment';

-- 3. Spatial and Performance Indexes
-- GIST index for fast radius/spatial proximity queries (e.g. ST_DWithin)
CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_geom 
    ON starlink_surcharges USING GIST (coordinates);

-- B-Tree indexes for filtering by tier, status, and freshness
CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_last_checked 
    ON starlink_surcharges (last_checked DESC);

CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_sampled_at 
    ON starlink_surcharges (sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_amount 
    ON starlink_surcharges (surcharge_amount);

CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_status 
    ON starlink_surcharges (status);

-- Rounded spatial coordinate index to deduplicate/upsert points within ~500m
CREATE UNIQUE INDEX IF NOT EXISTS idx_starlink_surcharges_rounded_coords
    ON starlink_surcharges (ROUND(lat::NUMERIC, 3), ROUND(lng::NUMERIC, 3));

-- 4. Row Level Security (RLS) Configuration
ALTER TABLE starlink_surcharges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON starlink_surcharges;
DROP POLICY IF EXISTS "Allow service_role full access" ON starlink_surcharges;

-- Allow anon and authenticated clients read-only access (Used by frontend map client)
CREATE POLICY "Allow public read access" 
    ON starlink_surcharges 
    FOR SELECT 
    TO anon, authenticated 
    USING (true);

-- Restrict INSERT, UPDATE, DELETE to service_role (Used by GitHub Actions & Cloudflare Worker)
CREATE POLICY "Allow service_role full access" 
    ON starlink_surcharges 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- 5. Spatial Helper Functions & Stored Procedures (RPC)

-- Function: Upsert Surcharge Sample
-- Inserts a new sample or updates an existing coordinate within ~0.005 deg (~500m)
CREATE OR REPLACE FUNCTION upsert_starlink_surcharge(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_surcharge_amount INTEGER,
    p_status TEXT,
    p_sample_type TEXT,
    p_location_name TEXT DEFAULT NULL,
    p_base_service_fee NUMERIC DEFAULT 120.00,
    p_service_price_adjustment NUMERIC DEFAULT 0.00,
    p_total_monthly_fee NUMERIC DEFAULT 120.00,
    p_adjustment_description TEXT DEFAULT 'Service Price Adjustment'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_id BIGINT;
    v_geom GEOMETRY(Point, 4326);
BEGIN
    v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    INSERT INTO starlink_surcharges (
        coordinates, lat, lng, 
        base_service_fee, service_price_adjustment, total_monthly_fee, monthly_service_fee,
        surcharge_amount, status, adjustment_description, last_checked, sampled_at, sample_type, location_name
    )
    VALUES (
        v_geom, p_lat, p_lng, 
        p_base_service_fee, p_service_price_adjustment, p_total_monthly_fee, p_total_monthly_fee,
        p_surcharge_amount, p_status, p_adjustment_description, NOW(), NOW(), p_sample_type, p_location_name
    )
    ON CONFLICT (ROUND(lat::NUMERIC, 3), ROUND(lng::NUMERIC, 3))
    DO UPDATE SET
        base_service_fee = EXCLUDED.base_service_fee,
        service_price_adjustment = EXCLUDED.service_price_adjustment,
        total_monthly_fee = EXCLUDED.total_monthly_fee,
        monthly_service_fee = EXCLUDED.monthly_service_fee,
        surcharge_amount = EXCLUDED.surcharge_amount,
        status = EXCLUDED.status,
        adjustment_description = EXCLUDED.adjustment_description,
        last_checked = NOW(),
        sampled_at = NOW(),
        sample_type = EXCLUDED.sample_type,
        location_name = COALESCE(EXCLUDED.location_name, starlink_surcharges.location_name),
        coordinates = EXCLUDED.coordinates,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Restrict write/upsert execution strictly to service_role
REVOKE EXECUTE ON FUNCTION upsert_starlink_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION upsert_starlink_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT
) TO service_role;


-- Function: Check Proximity Cache
-- Finds the nearest sample within a given radius in kilometers and maximum age in days
CREATE OR REPLACE FUNCTION get_nearby_surcharge(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 25.0,
    p_max_age_days INTEGER DEFAULT 14
)
RETURNS TABLE (
    id BIGINT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    base_service_fee NUMERIC,
    service_price_adjustment NUMERIC,
    total_monthly_fee NUMERIC,
    monthly_service_fee NUMERIC,
    surcharge_amount INTEGER,
    status TEXT,
    adjustment_description TEXT,
    sample_type TEXT,
    location_name TEXT,
    sampled_at TIMESTAMPTZ,
    distance_km DOUBLE PRECISION,
    days_ago INTEGER,
    is_cached BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_target_geom GEOMETRY(Point, 4326);
BEGIN
    v_target_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    RETURN QUERY
    SELECT 
        s.id,
        s.lat,
        s.lng,
        s.base_service_fee,
        s.service_price_adjustment,
        s.total_monthly_fee,
        s.monthly_service_fee,
        s.surcharge_amount,
        s.status,
        s.adjustment_description,
        s.sample_type,
        s.location_name,
        s.sampled_at,
        ROUND((ST_Distance(s.coordinates::geography, v_target_geom::geography) / 1000.0)::NUMERIC, 2)::DOUBLE PRECISION AS distance_km,
        EXTRACT(DAY FROM (NOW() - s.sampled_at))::INTEGER AS days_ago,
        (s.sampled_at >= NOW() - (p_max_age_days || ' days')::INTERVAL) AS is_cached
    FROM starlink_surcharges s
    WHERE ST_DWithin(s.coordinates::geography, v_target_geom::geography, p_radius_km * 1000.0)
    ORDER BY ST_Distance(s.coordinates::geography, v_target_geom::geography) ASC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO anon, authenticated, service_role;


-- Function: Export Full GeoJSON FeatureCollection
-- Highly optimized GeoJSON generator for MapLibre / Leaflet data sources
CREATE OR REPLACE FUNCTION get_surcharges_geojson()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'id', s.id,
                    'geometry', ST_AsGeoJSON(s.coordinates)::jsonb,
                    'properties', jsonb_build_object(
                        'id', s.id,
                        'lat', s.lat,
                        'lng', s.lng,
                        'base_service_fee', s.base_service_fee,
                        'service_price_adjustment', s.service_price_adjustment,
                        'total_monthly_fee', s.total_monthly_fee,
                        'monthly_service_fee', s.monthly_service_fee,
                        'surcharge_amount', s.surcharge_amount,
                        'status', s.status,
                        'adjustment_description', s.adjustment_description,
                        'sample_type', s.sample_type,
                        'sampled_at', s.sampled_at,
                        'location_name', s.location_name
                    )
                )
            ),
            '[]'::jsonb
        )
    )
    FROM starlink_surcharges s;
$$;

GRANT EXECUTE ON FUNCTION get_surcharges_geojson() TO anon, authenticated, service_role;
