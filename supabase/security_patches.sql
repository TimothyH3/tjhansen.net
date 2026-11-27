-- ============================================================================
-- SUPABASE SECURITY ADVISOR REMEDIATION SCRIPT
-- Starlink Surcharge Map - PostGIS & Function Security Hardening
-- ============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It resolves the 5 security issues flagged by Supabase Security Advisor:
--
-- 1. Table public.spatial_ref_sys is public, but RLS has not been enabled
-- 2. Extension postgis is installed in the public schema
-- 3. Function public.upsert_starlink_surcharge has a role mutable search_path
-- 4. Function public.get_nearby_surcharge can be executed by anon role as SECURITY DEFINER
-- 5. Function public.get_nearby_surcharge can be executed by authenticated role as SECURITY DEFINER
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX 1 & 2: EXTENSION IN PUBLIC & RLS ON spatial_ref_sys
-- ----------------------------------------------------------------------------
-- In Supabase, extensions should reside in the 'extensions' schema to prevent
-- polluting the public PostgREST API schema.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Attempt to relocate the postgis extension to the 'extensions' schema
DO $$
BEGIN
    ALTER EXTENSION postgis SET SCHEMA extensions;
    RAISE NOTICE 'Successfully moved postgis extension to extensions schema.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not relocate postgis extension automatically (%): ensuring fallback RLS on public.spatial_ref_sys.', SQLERRM;
END $$;

-- Enable RLS and add a read-only policy on spatial_ref_sys (if it resides in public)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys'
    ) THEN
        EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow public read-only on spatial_ref_sys" ON public.spatial_ref_sys';
        EXECUTE 'CREATE POLICY "Allow public read-only on spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT TO public USING (true)';
        RAISE NOTICE 'Enabled RLS and public read-only policy on public.spatial_ref_sys.';
    END IF;
END $$;

-- Grant schema usage to standard Supabase roles
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- FIX 3: FUNCTION SEARCH PATH MUTABLE (upsert_starlink_surcharge)
-- ----------------------------------------------------------------------------
-- 1. Sets a fixed search_path (public, extensions, pg_temp) to prevent search-path injection.
-- 2. Revokes EXECUTE from PUBLIC/anon/authenticated so random callers cannot overwrite data.
-- 3. Grants EXECUTE strictly to service_role (Cloudflare Worker & automated ingest).

CREATE OR REPLACE FUNCTION public.upsert_starlink_surcharge(
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
REVOKE EXECUTE ON FUNCTION public.upsert_starlink_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_starlink_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT
) TO service_role;


-- ----------------------------------------------------------------------------
-- FIX 4 & 5: SECURITY DEFINER EXPOSURE (get_nearby_surcharge)
-- ----------------------------------------------------------------------------
-- 1. Changes SECURITY DEFINER to SECURITY INVOKER because this is a read-only
--    query on starlink_surcharges (which already has public read access via RLS).
-- 2. Sets fixed search_path = public, extensions, pg_temp.
-- 3. Grants EXECUTE to anon, authenticated, and service_role.

CREATE OR REPLACE FUNCTION public.get_nearby_surcharge(
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

GRANT EXECUTE ON FUNCTION public.get_nearby_surcharge(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- PROACTIVE HARDENING: get_surcharges_geojson search_path
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_surcharges_geojson()
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

GRANT EXECUTE ON FUNCTION public.get_surcharges_geojson() TO anon, authenticated, service_role;
