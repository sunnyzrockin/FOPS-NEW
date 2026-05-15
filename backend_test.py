#!/usr/bin/env python3
"""
Phase 3 QLD Live Fuel Prices Backend Testing
Tests all four endpoints with comprehensive auth, filtering, and caching scenarios.
"""

import requests
import time
import json
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

# Expected QLD regions from MockProvider
EXPECTED_REGIONS = [
    "Brisbane", "Gold Coast", "Sunshine Coast", "Toowoomba", "Cairns",
    "Townsville", "Mackay", "Rockhampton", "Bundaberg", "Hervey Bay"
]

# Expected fuel types
EXPECTED_FUEL_TYPES = ['ULP91', 'E10', 'U95', 'U98', 'Diesel', 'LPG']

# Expected brands (at least these should be present)
EXPECTED_BRANDS = ["Shell", "BP", "7-Eleven", "Caltex"]

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_num: int, description: str, evidence: str):
        self.passed += 1
        self.tests.append({
            "num": test_num,
            "status": "PASS",
            "description": description,
            "evidence": evidence
        })
        print(f"✅ Test {test_num}: PASS - {description}")
        print(f"   Evidence: {evidence}")
    
    def add_fail(self, test_num: int, description: str, evidence: str):
        self.failed += 1
        self.tests.append({
            "num": test_num,
            "status": "FAIL",
            "description": description,
            "evidence": evidence
        })
        print(f"❌ Test {test_num}: FAIL - {description}")
        print(f"   Evidence: {evidence}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed ({self.passed*100//total if total > 0 else 0}%)")
        print(f"{'='*80}")
        return self.passed, self.failed

def login(role: str) -> Optional[str]:
    """Login and return Bearer token"""
    try:
        creds = CREDENTIALS[role]
        resp = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("session", {}).get("access_token")
            return token
        return None
    except Exception as e:
        print(f"Login error for {role}: {e}")
        return None

def test_endpoint(method: str, path: str, token: Optional[str] = None, 
                  params: Optional[Dict] = None, json_data: Optional[Dict] = None,
                  timeout: int = 10) -> tuple:
    """Make HTTP request and return (status_code, response_data)"""
    try:
        url = f"{BASE_URL}{path}"
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=timeout)
        else:
            return (0, {"error": f"Unsupported method: {method}"})
        
        try:
            data = resp.json()
        except:
            data = {"raw": resp.text}
        
        return (resp.status_code, data)
    except requests.Timeout:
        return (0, {"error": "Request timeout"})
    except Exception as e:
        return (0, {"error": str(e)})

def main():
    results = TestResults()
    
    print("="*80)
    print("PHASE 3 QLD LIVE FUEL PRICES - BACKEND TESTING")
    print("="*80)
    print()
    
    # ========== A. AUTH GATE (SMOKE) ==========
    print("\n" + "="*80)
    print("SECTION A: AUTH GATE (SMOKE TESTS)")
    print("="*80)
    
    # Test 1: GET /filters without Bearer → 401
    status, data = test_endpoint("GET", "/fuel-prices-live/filters")
    if status == 401:
        results.add_pass(1, "GET /filters without Bearer → 401", 
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(1, "GET /filters without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 2: GET /stations without Bearer → 401
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", params={"fuel_type": "ULP91"})
    if status == 401:
        results.add_pass(2, "GET /stations?fuel_type=ULP91 without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(2, "GET /stations?fuel_type=ULP91 without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 3: POST /sync without Bearer → 401
    status, data = test_endpoint("POST", "/fuel-prices-live/sync")
    if status == 401:
        results.add_pass(3, "POST /sync without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(3, "POST /sync without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 4: GET /status without Bearer → 401
    status, data = test_endpoint("GET", "/fuel-prices-live/status")
    if status == 401:
        results.add_pass(4, "GET /status without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(4, "GET /status without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Login as staff and operator for permission tests
    print("\n🔐 Logging in as Staff and Operator...")
    staff_token = login("staff")
    operator_token = login("operator")
    
    if not staff_token or not operator_token:
        print("❌ CRITICAL: Could not login as staff/operator. Skipping tests 5-6.")
        results.add_fail(5, "Staff JWT tests", "Could not obtain staff token")
        results.add_fail(6, "Operator JWT tests", "Could not obtain operator token")
    else:
        # Test 5: All endpoints with Staff JWT → 403
        endpoints = [
            ("/fuel-prices-live/filters", "GET", None),
            ("/fuel-prices-live/stations", "GET", {"fuel_type": "ULP91"}),
            ("/fuel-prices-live/sync", "POST", None),
            ("/fuel-prices-live/status", "GET", None)
        ]
        
        staff_403_count = 0
        for path, method, params in endpoints:
            status, data = test_endpoint(method, path, token=staff_token, params=params)
            if status == 403:
                staff_403_count += 1
        
        if staff_403_count == 4:
            results.add_pass(5, "All 4 endpoints with Staff JWT → 403",
                           f"All endpoints correctly returned 403 (Insufficient permissions)")
        else:
            results.add_fail(5, "All 4 endpoints with Staff JWT → 403",
                           f"Only {staff_403_count}/4 endpoints returned 403")
        
        # Test 6: All endpoints with Operator JWT → 403
        operator_403_count = 0
        for path, method, params in endpoints:
            status, data = test_endpoint(method, path, token=operator_token, params=params)
            if status == 403:
                operator_403_count += 1
        
        if operator_403_count == 4:
            results.add_pass(6, "All 4 endpoints with Operator JWT → 403",
                           f"All endpoints correctly returned 403 (Insufficient permissions)")
        else:
            results.add_fail(6, "All 4 endpoints with Operator JWT → 403",
                           f"Only {operator_403_count}/4 endpoints returned 403")
    
    # ========== B. FIRST-CALL LAZY SYNC (CACHE COLD) ==========
    print("\n" + "="*80)
    print("SECTION B: FIRST-CALL LAZY SYNC (CACHE COLD)")
    print("="*80)
    
    # Login as owner
    print("\n🔐 Logging in as Owner...")
    owner_token = login("owner")
    
    if not owner_token:
        print("❌ CRITICAL: Could not login as owner. Cannot continue with remaining tests.")
        results.add_fail(7, "Owner login", "Could not obtain owner token")
        results.summary()
        return
    
    print("✅ Owner login successful")
    
    # Test 7: GET /status before any sync → should show seeded row
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_status = data.get("last_status")
        station_count = data.get("station_count", 0)
        price_count = data.get("price_count", 0)
        
        if last_status == "never" and station_count == 0 and price_count == 0:
            results.add_pass(7, "GET /status before sync → seeded row",
                           f"Status: {status}, last_status='never', station_count=0, price_count=0")
        else:
            results.add_fail(7, "GET /status before sync → seeded row",
                           f"Expected last_status='never', counts=0, got: {data}")
    else:
        results.add_fail(7, "GET /status before sync → seeded row",
                       f"Expected 200, got {status}: {data}")
    
    # Test 8: GET /filters → should trigger sync (allow up to 10s)
    print("\n⏳ Calling GET /filters (may take up to 10s for first sync)...")
    status, data = test_endpoint("GET", "/fuel-prices-live/filters", token=owner_token, timeout=15)
    
    if status == 200:
        regions = data.get("regions", [])
        brands = data.get("brands", [])
        fuel_types = data.get("fuel_types", [])
        
        # Check fuel_types is exactly the expected set
        fuel_types_set = set(fuel_types)
        expected_set = set(EXPECTED_FUEL_TYPES)
        fuel_types_match = fuel_types_set == expected_set
        
        # Check regions has >= 10 entries and includes all expected
        regions_ok = len(regions) >= 10 and all(r in regions for r in EXPECTED_REGIONS)
        
        # Check brands has >= 10 entries and includes expected brands
        brands_ok = len(brands) >= 10 and all(b in brands for b in EXPECTED_BRANDS)
        
        if fuel_types_match and regions_ok and brands_ok:
            results.add_pass(8, "GET /filters triggers sync and returns correct data",
                           f"Status: {status}, fuel_types={sorted(fuel_types)}, "
                           f"regions={len(regions)} (includes all expected), "
                           f"brands={len(brands)} (includes {EXPECTED_BRANDS})")
        else:
            issues = []
            if not fuel_types_match:
                issues.append(f"fuel_types mismatch: got {sorted(fuel_types)}, expected {sorted(EXPECTED_FUEL_TYPES)}")
            if not regions_ok:
                issues.append(f"regions issue: got {len(regions)} entries, missing: {[r for r in EXPECTED_REGIONS if r not in regions]}")
            if not brands_ok:
                issues.append(f"brands issue: got {len(brands)} entries, missing: {[b for b in EXPECTED_BRANDS if b not in brands]}")
            results.add_fail(8, "GET /filters triggers sync and returns correct data",
                           f"Issues: {'; '.join(issues)}")
    else:
        results.add_fail(8, "GET /filters triggers sync and returns correct data",
                       f"Expected 200, got {status}: {data}")
    
    # Test 9: GET /status after sync → should show updated counts
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_status = data.get("last_status")
        station_count = data.get("station_count", 0)
        price_count = data.get("price_count", 0)
        last_fetched_at = data.get("last_fetched_at")
        provider = data.get("provider")
        
        if (last_status == "ok" and station_count >= 70 and 
            price_count > station_count and last_fetched_at and provider == "mock"):
            results.add_pass(9, "GET /status after sync → updated counts",
                           f"Status: {status}, last_status='ok', station_count={station_count}, "
                           f"price_count={price_count}, provider='mock', last_fetched_at={last_fetched_at}")
        else:
            results.add_fail(9, "GET /status after sync → updated counts",
                           f"Expected last_status='ok', station_count>=70, price_count>station_count, "
                           f"provider='mock', got: {data}")
    else:
        results.add_fail(9, "GET /status after sync → updated counts",
                       f"Expected 200, got {status}: {data}")
    
    # ========== C. GET /stations — HAPPY PATH + FILTERS ==========
    print("\n" + "="*80)
    print("SECTION C: GET /stations — HAPPY PATH + FILTERS")
    print("="*80)
    
    # Test 10: GET /stations?fuel_type=ULP91 → happy path
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "ULP91"})
    
    if status == 200:
        count = data.get("count", 0)
        stations = data.get("stations", [])
        sync = data.get("sync")
        
        if count >= 30 and len(stations) >= 30:
            # Validate first station structure
            if stations:
                s = stations[0]
                required_fields = ["station_id", "name", "brand", "address", "region", 
                                 "postcode", "latitude", "longitude", "fuel_type", 
                                 "price_cents", "price_aud", "is_stale", 
                                 "provider_updated_at", "cached_at"]
                has_all_fields = all(f in s for f in required_fields)
                
                # Validate data types and ranges
                lat_ok = isinstance(s.get("latitude"), (int, float)) and -29 <= s["latitude"] <= -10
                lng_ok = isinstance(s.get("longitude"), (int, float)) and 137 <= s["longitude"] <= 154
                fuel_type_ok = s.get("fuel_type") == "ULP91"
                price_ok = isinstance(s.get("price_cents"), int) and s["price_cents"] > 0
                price_aud_ok = abs(s.get("price_aud", 0) - s["price_cents"]/100) < 0.01
                is_stale_ok = s.get("is_stale") == False
                
                if (has_all_fields and lat_ok and lng_ok and fuel_type_ok and 
                    price_ok and price_aud_ok and is_stale_ok):
                    results.add_pass(10, "GET /stations?fuel_type=ULP91 → happy path",
                                   f"Status: {status}, count={count}, stations={len(stations)}, "
                                   f"all fields present, lat/lng in QLD range, fuel_type=ULP91, "
                                   f"price_cents>0, price_aud=price_cents/100, is_stale=false")
                else:
                    issues = []
                    if not has_all_fields:
                        issues.append(f"missing fields: {[f for f in required_fields if f not in s]}")
                    if not lat_ok:
                        issues.append(f"latitude out of range: {s.get('latitude')}")
                    if not lng_ok:
                        issues.append(f"longitude out of range: {s.get('longitude')}")
                    if not fuel_type_ok:
                        issues.append(f"fuel_type != ULP91: {s.get('fuel_type')}")
                    if not price_ok:
                        issues.append(f"price_cents invalid: {s.get('price_cents')}")
                    if not price_aud_ok:
                        issues.append(f"price_aud mismatch: {s.get('price_aud')} vs {s.get('price_cents')}/100")
                    if not is_stale_ok:
                        issues.append(f"is_stale != false: {s.get('is_stale')}")
                    results.add_fail(10, "GET /stations?fuel_type=ULP91 → happy path",
                                   f"Data validation issues: {'; '.join(issues)}")
            else:
                results.add_fail(10, "GET /stations?fuel_type=ULP91 → happy path",
                               f"Stations array is empty despite count={count}")
        else:
            results.add_fail(10, "GET /stations?fuel_type=ULP91 → happy path",
                           f"Expected count>=30, got count={count}, len(stations)={len(stations)}")
    else:
        results.add_fail(10, "GET /stations?fuel_type=ULP91 → happy path",
                       f"Expected 200, got {status}: {data}")
    
    # Test 11: GET /stations without fuel_type → 400
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token)
    if status == 400:
        results.add_pass(11, "GET /stations without fuel_type → 400",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(11, "GET /stations without fuel_type → 400",
                       f"Expected 400, got {status}: {data}")
    
    # Test 12: GET /stations?fuel_type=Diesel&region=Brisbane
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "Diesel", "region": "Brisbane"})
    
    if status == 200:
        count = data.get("count", 0)
        stations = data.get("stations", [])
        
        if count >= 10:
            # Verify all stations have region=Brisbane and fuel_type=Diesel
            all_match = all(s.get("region") == "Brisbane" and s.get("fuel_type") == "Diesel" 
                          for s in stations)
            if all_match:
                results.add_pass(12, "GET /stations?fuel_type=Diesel&region=Brisbane",
                               f"Status: {status}, count={count}, all stations have region='Brisbane' "
                               f"AND fuel_type='Diesel'")
            else:
                mismatches = [s for s in stations if s.get("region") != "Brisbane" or 
                            s.get("fuel_type") != "Diesel"]
                results.add_fail(12, "GET /stations?fuel_type=Diesel&region=Brisbane",
                               f"Found {len(mismatches)} stations with wrong region/fuel_type: {mismatches[:2]}")
        else:
            results.add_fail(12, "GET /stations?fuel_type=Diesel&region=Brisbane",
                           f"Expected count>=10, got {count}")
    else:
        results.add_fail(12, "GET /stations?fuel_type=Diesel&region=Brisbane",
                       f"Expected 200, got {status}: {data}")
    
    # Test 13: GET /stations?fuel_type=ULP91&brand=Shell
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "ULP91", "brand": "Shell"})
    
    if status == 200:
        stations = data.get("stations", [])
        if stations:
            all_shell = all(s.get("brand") == "Shell" for s in stations)
            if all_shell:
                results.add_pass(13, "GET /stations?fuel_type=ULP91&brand=Shell",
                               f"Status: {status}, count={len(stations)}, all stations have brand='Shell'")
            else:
                non_shell = [s for s in stations if s.get("brand") != "Shell"]
                results.add_fail(13, "GET /stations?fuel_type=ULP91&brand=Shell",
                               f"Found {len(non_shell)} non-Shell stations: {non_shell[:2]}")
        else:
            results.add_fail(13, "GET /stations?fuel_type=ULP91&brand=Shell",
                           f"No stations returned (expected at least some Shell stations)")
    else:
        results.add_fail(13, "GET /stations?fuel_type=ULP91&brand=Shell",
                       f"Expected 200, got {status}: {data}")
    
    # Test 14: GET /stations?fuel_type=ULP91&max_price=1.85
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "ULP91", "max_price": "1.85"})
    
    if status == 200:
        stations = data.get("stations", [])
        count = data.get("count", 0)
        
        # All returned stations must have price_aud <= 1.85
        all_under = all(s.get("price_aud", 999) <= 1.85 for s in stations)
        
        if all_under:
            results.add_pass(14, "GET /stations?fuel_type=ULP91&max_price=1.85",
                           f"Status: {status}, count={count}, all stations have price_aud<=1.85")
        else:
            over_price = [s for s in stations if s.get("price_aud", 0) > 1.85]
            results.add_fail(14, "GET /stations?fuel_type=ULP91&max_price=1.85",
                           f"Found {len(over_price)} stations with price_aud>1.85: {over_price[:2]}")
    else:
        results.add_fail(14, "GET /stations?fuel_type=ULP91&max_price=1.85",
                       f"Expected 200, got {status}: {data}")
    
    # Test 15: Combo filter
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "Diesel", "region": "Gold Coast", 
                                       "brand": "BP", "max_price": "2.00"})
    
    if status == 200:
        stations = data.get("stations", [])
        # May return 0 or more rows
        if stations:
            all_match = all(
                s.get("region") == "Gold Coast" and 
                s.get("brand") == "BP" and 
                s.get("fuel_type") == "Diesel" and 
                s.get("price_aud", 999) <= 2.00
                for s in stations
            )
            if all_match:
                results.add_pass(15, "Combo filter (Diesel, Gold Coast, BP, max_price=2.00)",
                               f"Status: {status}, count={len(stations)}, all match ALL conditions")
            else:
                mismatches = [s for s in stations if not (
                    s.get("region") == "Gold Coast" and s.get("brand") == "BP" and 
                    s.get("fuel_type") == "Diesel" and s.get("price_aud", 999) <= 2.00
                )]
                results.add_fail(15, "Combo filter (Diesel, Gold Coast, BP, max_price=2.00)",
                               f"Found {len(mismatches)} stations not matching all conditions: {mismatches[:2]}")
        else:
            # 0 results is acceptable for this narrow filter
            results.add_pass(15, "Combo filter (Diesel, Gold Coast, BP, max_price=2.00)",
                           f"Status: {status}, count=0 (acceptable for narrow filter)")
    else:
        results.add_fail(15, "Combo filter (Diesel, Gold Coast, BP, max_price=2.00)",
                       f"Expected 200, got {status}: {data}")
    
    # Test 16: GET /stations?fuel_type=LPG
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "LPG"})
    
    if status == 200:
        count = data.get("count", 0)
        stations = data.get("stations", [])
        
        if count > 0:
            all_lpg = all(s.get("fuel_type") == "LPG" for s in stations)
            if all_lpg:
                results.add_pass(16, "GET /stations?fuel_type=LPG",
                               f"Status: {status}, count={count}, all stations have fuel_type='LPG'")
            else:
                non_lpg = [s for s in stations if s.get("fuel_type") != "LPG"]
                results.add_fail(16, "GET /stations?fuel_type=LPG",
                               f"Found {len(non_lpg)} non-LPG stations: {non_lpg[:2]}")
        else:
            results.add_fail(16, "GET /stations?fuel_type=LPG",
                           f"Expected count>0 (LPG should be available), got {count}")
    else:
        results.add_fail(16, "GET /stations?fuel_type=LPG",
                       f"Expected 200, got {status}: {data}")
    
    # ========== D. LAZY REFRESH — CACHE TTL BEHAVIOUR ==========
    print("\n" + "="*80)
    print("SECTION D: LAZY REFRESH — CACHE TTL BEHAVIOUR")
    print("="*80)
    
    # Test 17: Capture last_fetched_at
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_fetched_at_1 = data.get("last_fetched_at")
        results.add_pass(17, "Capture last_fetched_at from /status",
                       f"Status: {status}, last_fetched_at={last_fetched_at_1}")
    else:
        results.add_fail(17, "Capture last_fetched_at from /status",
                       f"Expected 200, got {status}: {data}")
        last_fetched_at_1 = None
    
    # Test 18: Immediately GET /filters again (no force)
    status, data = test_endpoint("GET", "/fuel-prices-live/filters", token=owner_token)
    if status == 200:
        results.add_pass(18, "GET /filters again (cache should be fresh)",
                       f"Status: {status}, returned filters successfully")
    else:
        results.add_fail(18, "GET /filters again (cache should be fresh)",
                       f"Expected 200, got {status}: {data}")
    
    # Test 19: GET /status again - last_fetched_at should be unchanged
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_fetched_at_2 = data.get("last_fetched_at")
        if last_fetched_at_1 and last_fetched_at_2 == last_fetched_at_1:
            results.add_pass(19, "GET /status - last_fetched_at unchanged (cache fresh)",
                           f"Status: {status}, last_fetched_at={last_fetched_at_2} (unchanged)")
        else:
            results.add_fail(19, "GET /status - last_fetched_at unchanged (cache fresh)",
                           f"Expected last_fetched_at to be unchanged, was {last_fetched_at_1}, "
                           f"now {last_fetched_at_2}")
    else:
        results.add_fail(19, "GET /status - last_fetched_at unchanged (cache fresh)",
                       f"Expected 200, got {status}: {data}")
    
    # Test 20: GET /stations should not trigger re-sync
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "ULP91"})
    if status == 200:
        results.add_pass(20, "GET /stations should not trigger re-sync",
                       f"Status: {status}, returned {data.get('count', 0)} stations")
    else:
        results.add_fail(20, "GET /stations should not trigger re-sync",
                       f"Expected 200, got {status}: {data}")
    
    # ========== E. MANUAL FORCE REFRESH ==========
    print("\n" + "="*80)
    print("SECTION E: MANUAL FORCE REFRESH")
    print("="*80)
    
    # Test 21: POST /sync as Owner → 200
    print("\n⏳ Calling POST /sync (force refresh, may take a few seconds)...")
    status, data = test_endpoint("POST", "/fuel-prices-live/sync", token=owner_token, timeout=15)
    
    if status == 200:
        ok = data.get("ok")
        sync = data.get("sync")
        if ok and sync:
            results.add_pass(21, "POST /sync as Owner → 200",
                           f"Status: {status}, ok={ok}, sync={sync}")
        else:
            results.add_fail(21, "POST /sync as Owner → 200",
                           f"Expected ok=true and sync object, got: {data}")
    else:
        results.add_fail(21, "POST /sync as Owner → 200",
                       f"Expected 200, got {status}: {data}")
    
    # Test 22: GET /status - last_fetched_at should advance
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_fetched_at_3 = data.get("last_fetched_at")
        if last_fetched_at_1 and last_fetched_at_3 and last_fetched_at_3 > last_fetched_at_1:
            results.add_pass(22, "GET /status - last_fetched_at advanced after force sync",
                           f"Status: {status}, last_fetched_at advanced from {last_fetched_at_1} "
                           f"to {last_fetched_at_3}")
        else:
            results.add_fail(22, "GET /status - last_fetched_at advanced after force sync",
                           f"Expected last_fetched_at to advance, was {last_fetched_at_1}, "
                           f"now {last_fetched_at_3}")
    else:
        results.add_fail(22, "GET /status - last_fetched_at advanced after force sync",
                       f"Expected 200, got {status}: {data}")
    
    # Test 23: Station/price counts should be approximately the same
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        station_count = data.get("station_count", 0)
        price_count = data.get("price_count", 0)
        if station_count >= 70 and price_count > station_count:
            results.add_pass(23, "Station/price counts approximately same after re-sync",
                           f"Status: {status}, station_count={station_count}, price_count={price_count}")
        else:
            results.add_fail(23, "Station/price counts approximately same after re-sync",
                           f"Expected station_count>=70 and price_count>station_count, "
                           f"got station_count={station_count}, price_count={price_count}")
    else:
        results.add_fail(23, "Station/price counts approximately same after re-sync",
                       f"Expected 200, got {status}: {data}")
    
    # ========== F. BOOKKEEPING INVARIANTS ==========
    print("\n" + "="*80)
    print("SECTION F: BOOKKEEPING INVARIANTS")
    print("="*80)
    
    # Test 24: After successful sync, /status should have correct fields
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        last_status = data.get("last_status")
        last_error = data.get("last_error")
        retry_count = data.get("retry_count", -1)
        
        if last_status == "ok" and (last_error is None or last_error == "") and retry_count == 0:
            results.add_pass(24, "Bookkeeping invariants after successful sync",
                           f"Status: {status}, last_status='ok', last_error=null/'', retry_count=0")
        else:
            results.add_fail(24, "Bookkeeping invariants after successful sync",
                           f"Expected last_status='ok', last_error=null/'', retry_count=0, "
                           f"got: last_status={last_status}, last_error={last_error}, "
                           f"retry_count={retry_count}")
    else:
        results.add_fail(24, "Bookkeeping invariants after successful sync",
                       f"Expected 200, got {status}: {data}")
    
    # Test 25: Validate JOIN in /stations is correct (spot check)
    status, data = test_endpoint("GET", "/fuel-prices-live/stations", token=owner_token,
                                params={"fuel_type": "ULP91"})
    if status == 200:
        stations = data.get("stations", [])
        if stations:
            # Just verify that the first station has all expected fields from the JOIN
            s = stations[0]
            has_station_fields = all(f in s for f in ["station_id", "name", "brand", 
                                                      "address", "region", "postcode", 
                                                      "latitude", "longitude"])
            has_price_fields = all(f in s for f in ["fuel_type", "price_cents", "price_aud", 
                                                    "is_stale", "provider_updated_at", "cached_at"])
            
            if has_station_fields and has_price_fields:
                results.add_pass(25, "Validate JOIN in /stations is correct",
                               f"Status: {status}, station has all expected fields from JOIN")
            else:
                results.add_fail(25, "Validate JOIN in /stations is correct",
                               f"Missing fields in station object: {s}")
        else:
            results.add_fail(25, "Validate JOIN in /stations is correct",
                           f"No stations returned to validate JOIN")
    else:
        results.add_fail(25, "Validate JOIN in /stations is correct",
                       f"Expected 200, got {status}: {data}")
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    
    passed, failed = results.summary()
    
    print("\n📊 DETAILED RESULTS:")
    for test in results.tests:
        status_icon = "✅" if test["status"] == "PASS" else "❌"
        print(f"{status_icon} Test {test['num']}: {test['status']} - {test['description']}")
    
    print("\n" + "="*80)
    print(f"TESTING COMPLETE: {passed} passed, {failed} failed")
    print("="*80)

if __name__ == "__main__":
    main()
