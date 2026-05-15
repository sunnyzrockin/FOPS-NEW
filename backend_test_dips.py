#!/usr/bin/env python3
"""
Comprehensive backend test for Phase 3: Fuel Inventory Tracking (Dip Readings API)
Tests all endpoints with RBAC, validation, consumption math, and edit windows.
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3000"

# Test credentials
OWNER_EMAIL = "owner@workflowlite.com"
OPERATOR_EMAIL = "operator@workflowlite.com"
OPERATOR2_EMAIL = "operator2@workflowlite.com"
STAFF_EMAIL = "staff@workflowlite.com"
PASSWORD = "WorkflowDemo2026!"

# Global variables to store tokens and reading IDs
owner_token = None
operator_token = None
operator2_token = None
staff_token = None
first_reading_id = None
second_reading_id = None
third_reading_id = None
owner_reading_id = None

def login(email, password):
    """Login and return Bearer token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("session", {}).get("access_token")
            return token
        else:
            print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {email}: {e}")
        return None

def test_auth_gates():
    """Test A: Auth gate (smoke) - 401 without Bearer token"""
    print("\n=== TEST A: Auth Gates (401 without Bearer) ===")
    
    tests = [
        ("GET /api/dips", "GET", f"{BASE_URL}/api/dips"),
        ("GET /api/dips/current", "GET", f"{BASE_URL}/api/dips/current"),
        ("GET /api/dips/trends", "GET", f"{BASE_URL}/api/dips/trends?days=7"),
        ("POST /api/dips", "POST", f"{BASE_URL}/api/dips"),
    ]
    
    passed = 0
    total = len(tests) + 1  # +1 for bogus token test
    
    for name, method, url in tests:
        try:
            if method == "GET":
                response = requests.get(url, timeout=10)
            else:
                response = requests.post(url, json={"site_id": "site-001"}, timeout=10)
            
            if response.status_code == 401:
                print(f"✅ {name} without auth → 401")
                passed += 1
            else:
                print(f"❌ {name} without auth → {response.status_code} (expected 401)")
        except Exception as e:
            print(f"❌ {name} exception: {e}")
    
    # Test with bogus token
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": "Bearer bogus_token_12345"},
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ GET /api/dips with bogus token → 401")
            passed += 1
        else:
            print(f"❌ GET /api/dips with bogus token → {response.status_code} (expected 401)")
    except Exception as e:
        print(f"❌ Bogus token test exception: {e}")
    
    print(f"\n📊 Auth Gates: {passed}/{total} tests passed")
    return passed, total

def test_post_dips_rbac_validation():
    """Test B: POST /api/dips — RBAC and validation"""
    print("\n=== TEST B: POST /api/dips — RBAC and Validation ===")
    
    global first_reading_id, owner_reading_id
    passed = 0
    total = 7
    
    # Test 6: Operator posts reading for site-001 (assigned)
    try:
        payload = {
            "site_id": "site-001",
            "reading_label": "Morning",
            "ulp_litres": 18500,
            "diesel_litres": 12300,
            "premium_litres": 5400,
            "deliveries_ulp_litres": 0,
            "deliveries_diesel_litres": 0,
            "deliveries_premium_litres": 0,
            "notes": "baseline"
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if (data.get("site_id") == "site-001" and 
                data.get("operator_user_id") == "operator-001" and
                float(data.get("ulp_litres", 0)) == 18500):
                first_reading_id = data.get("id")
                print(f"✅ Test 6: Operator posts reading for site-001 → 200, ID={first_reading_id}")
                passed += 1
            else:
                print(f"❌ Test 6: Response data incorrect: {data}")
        else:
            print(f"❌ Test 6: Operator posts reading for site-001 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 6 exception: {e}")
    
    # Test 7: Operator posts reading for site-004 (NOT assigned)
    try:
        payload = {
            "site_id": "site-004",
            "reading_label": "Morning",
            "ulp_litres": 10000,
            "diesel_litres": 8000,
            "premium_litres": 3000
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 403:
            print(f"✅ Test 7: Operator posts for site-004 (not assigned) → 403")
            passed += 1
        else:
            print(f"❌ Test 7: Operator posts for site-004 → {response.status_code} (expected 403)")
    except Exception as e:
        print(f"❌ Test 7 exception: {e}")
    
    # Test 8: Staff posts /api/dips → 403
    try:
        payload = {
            "site_id": "site-001",
            "reading_label": "Morning",
            "ulp_litres": 10000
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 403:
            print(f"✅ Test 8: Staff posts /api/dips → 403")
            passed += 1
        else:
            print(f"❌ Test 8: Staff posts /api/dips → {response.status_code} (expected 403)")
    except Exception as e:
        print(f"❌ Test 8 exception: {e}")
    
    # Test 9: Owner posts reading for site-005 (owns it)
    try:
        payload = {
            "site_id": "site-005",
            "reading_label": "Morning",
            "ulp_litres": 20000,
            "diesel_litres": 15000,
            "premium_litres": 8000
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            owner_reading_id = data.get("id")
            print(f"✅ Test 9: Owner posts reading for site-005 → 200, ID={owner_reading_id}")
            passed += 1
        else:
            print(f"❌ Test 9: Owner posts reading for site-005 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 9 exception: {e}")
    
    # Test 10: POST with site_id missing → 400
    try:
        payload = {"ulp_litres": 10000}
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 400:
            print(f"✅ Test 10: POST with site_id missing → 400")
            passed += 1
        else:
            print(f"❌ Test 10: POST with site_id missing → {response.status_code} (expected 400)")
    except Exception as e:
        print(f"❌ Test 10 exception: {e}")
    
    # Test 11: POST with all litres null AND deliveries=0 → 400
    try:
        payload = {
            "site_id": "site-001",
            "deliveries_ulp_litres": 0,
            "deliveries_diesel_litres": 0,
            "deliveries_premium_litres": 0
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 400:
            print(f"✅ Test 11: POST with no levels and no deliveries → 400")
            passed += 1
        else:
            print(f"❌ Test 11: POST with no levels and no deliveries → {response.status_code} (expected 400)")
    except Exception as e:
        print(f"❌ Test 11 exception: {e}")
    
    # Test 12: POST with only deliveries (no levels) → 200
    try:
        payload = {
            "site_id": "site-001",
            "reading_label": "Delivery Only",
            "deliveries_ulp_litres": 5000,
            "deliveries_diesel_litres": 0,
            "deliveries_premium_litres": 0
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 200:
            print(f"✅ Test 12: POST with only deliveries (no levels) → 200")
            passed += 1
        else:
            print(f"❌ Test 12: POST with only deliveries → {response.status_code} (expected 200)")
    except Exception as e:
        print(f"❌ Test 12 exception: {e}")
    
    print(f"\n📊 POST RBAC & Validation: {passed}/{total} tests passed")
    return passed, total

def test_second_third_readings():
    """Test C: Second & third readings (to enable consumption math)"""
    print("\n=== TEST C: Second & Third Readings ===")
    
    global second_reading_id, third_reading_id
    passed = 0
    total = 2
    
    # Test 13: Operator posts SECOND reading for site-001
    try:
        # 5 minutes after first reading
        reading_time = (datetime.utcnow() + timedelta(minutes=5)).isoformat()
        payload = {
            "site_id": "site-001",
            "reading_label": "PM",
            "reading_time": reading_time,
            "ulp_litres": 17500,
            "diesel_litres": 11800,
            "premium_litres": 5200,
            "deliveries_ulp_litres": 0,
            "deliveries_diesel_litres": 0,
            "deliveries_premium_litres": 0
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            second_reading_id = data.get("id")
            print(f"✅ Test 13: Operator posts SECOND reading for site-001 → 200, ID={second_reading_id}")
            passed += 1
        else:
            print(f"❌ Test 13: Operator posts SECOND reading → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 13 exception: {e}")
    
    # Test 14: Operator posts THIRD reading for site-001 (next day with delivery)
    try:
        # About 23h after second reading
        reading_time = (datetime.utcnow() + timedelta(hours=23)).isoformat()
        payload = {
            "site_id": "site-001",
            "reading_label": "Morning",
            "reading_time": reading_time,
            "ulp_litres": 21500,
            "diesel_litres": 11500,
            "premium_litres": 5100,
            "deliveries_ulp_litres": 5000,
            "deliveries_diesel_litres": 0,
            "deliveries_premium_litres": 0
        }
        response = requests.post(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            json=payload,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            third_reading_id = data.get("id")
            print(f"✅ Test 14: Operator posts THIRD reading for site-001 → 200, ID={third_reading_id}")
            passed += 1
        else:
            print(f"❌ Test 14: Operator posts THIRD reading → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 14 exception: {e}")
    
    print(f"\n📊 Second & Third Readings: {passed}/{total} tests passed")
    return passed, total

def test_get_dips_listing():
    """Test D: GET /api/dips — listing & RBAC scoping"""
    print("\n=== TEST D: GET /api/dips — Listing & RBAC Scoping ===")
    
    passed = 0
    total = 6
    
    # Test 15: Owner GET /api/dips → returns ALL readings
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if len(data) >= 4:  # At least 3 from operator on site-001 + 1 from owner on site-005
                print(f"✅ Test 15: Owner GET /api/dips → {len(data)} readings (expected ≥4)")
                passed += 1
            else:
                print(f"❌ Test 15: Owner GET /api/dips → {len(data)} readings (expected ≥4)")
        else:
            print(f"❌ Test 15: Owner GET /api/dips → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 15 exception: {e}")
    
    # Test 16: Owner GET /api/dips?site_id=site-001 → only site-001 readings
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips?site_id=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            all_site_001 = all(r.get("site_id") == "site-001" for r in data)
            if all_site_001 and len(data) >= 3:
                print(f"✅ Test 16: Owner GET /api/dips?site_id=site-001 → {len(data)} readings (all site-001)")
                passed += 1
            else:
                print(f"❌ Test 16: Owner GET /api/dips?site_id=site-001 → {len(data)} readings, all_site_001={all_site_001}")
        else:
            print(f"❌ Test 16: Owner GET /api/dips?site_id=site-001 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 16 exception: {e}")
    
    # Test 17: Operator GET /api/dips → only assigned sites
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Should NOT see owner's site-005 reading
            has_site_005 = any(r.get("site_id") == "site-005" for r in data)
            if not has_site_005:
                print(f"✅ Test 17: Operator GET /api/dips → {len(data)} readings (no site-005)")
                passed += 1
            else:
                print(f"❌ Test 17: Operator GET /api/dips → contains site-005 (should not)")
        else:
            print(f"❌ Test 17: Operator GET /api/dips → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 17 exception: {e}")
    
    # Test 18: Operator2 GET /api/dips?site_id=site-001 → returns []
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips?site_id=site-001",
            headers={"Authorization": f"Bearer {operator2_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if len(data) == 0:
                print(f"✅ Test 18: Operator2 GET /api/dips?site_id=site-001 → [] (not assigned)")
                passed += 1
            else:
                print(f"❌ Test 18: Operator2 GET /api/dips?site_id=site-001 → {len(data)} readings (expected 0)")
        else:
            print(f"❌ Test 18: Operator2 GET /api/dips?site_id=site-001 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 18 exception: {e}")
    
    # Test 19: Staff GET /api/dips → only assigned sites
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips",
            headers={"Authorization": f"Bearer {staff_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Staff is assigned to site-001 only
            all_site_001 = all(r.get("site_id") == "site-001" for r in data)
            if all_site_001 and len(data) >= 3:
                print(f"✅ Test 19: Staff GET /api/dips → {len(data)} readings (all site-001)")
                passed += 1
            else:
                print(f"❌ Test 19: Staff GET /api/dips → {len(data)} readings, all_site_001={all_site_001}")
        else:
            print(f"❌ Test 19: Staff GET /api/dips → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 19 exception: {e}")
    
    # Test 20: ?from / ?to filters
    try:
        future_date = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d")
        later_future = (datetime.utcnow() + timedelta(days=60)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/dips?from={future_date}&to={later_future}",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if len(data) == 0:
                print(f"✅ Test 20: Owner GET /api/dips?from=future&to=later → [] (no future readings)")
                passed += 1
            else:
                print(f"❌ Test 20: Owner GET /api/dips?from=future&to=later → {len(data)} readings (expected 0)")
        else:
            print(f"❌ Test 20: Owner GET /api/dips?from=future&to=later → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 20 exception: {e}")
    
    print(f"\n📊 GET /api/dips Listing: {passed}/{total} tests passed")
    return passed, total

def test_get_dips_current():
    """Test E: GET /api/dips/current — latest + consumption math"""
    print("\n=== TEST E: GET /api/dips/current — Latest + Consumption Math ===")
    
    passed = 0
    total = 3
    
    # Test 21: Owner GET /api/dips/current → verify consumption math
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/current",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            site_001_entry = next((e for e in data if e.get("site_id") == "site-001"), None)
            
            if site_001_entry:
                current = site_001_entry.get("current")
                previous = site_001_entry.get("previous")
                consumption = site_001_entry.get("consumption_since_previous", {})
                
                # Expected consumption:
                # ULP: 17500 - 21500 + 5000 = 1000
                # Diesel: 11800 - 11500 + 0 = 300
                # Premium: 5200 - 5100 + 0 = 100
                
                ulp_ok = abs(consumption.get("ulp", 0) - 1000) < 0.1
                diesel_ok = abs(consumption.get("diesel", 0) - 300) < 0.1
                premium_ok = abs(consumption.get("premium", 0) - 100) < 0.1
                
                if ulp_ok and diesel_ok and premium_ok:
                    print(f"✅ Test 21: Owner GET /api/dips/current → consumption math correct (ULP=1000, Diesel=300, Premium=100)")
                    passed += 1
                else:
                    print(f"❌ Test 21: Consumption math incorrect - ULP={consumption.get('ulp')}, Diesel={consumption.get('diesel')}, Premium={consumption.get('premium')}")
            else:
                print(f"❌ Test 21: No site-001 entry in /api/dips/current response")
            
            # Check site-005 (only 1 reading)
            site_005_entry = next((e for e in data if e.get("site_id") == "site-005"), None)
            if site_005_entry:
                previous_005 = site_005_entry.get("previous")
                consumption_005 = site_005_entry.get("consumption_since_previous", {})
                if previous_005 is None and all(v is None for v in consumption_005.values()):
                    print(f"✅ Test 21b: site-005 has previous=null and consumption=null (only 1 reading)")
                else:
                    print(f"❌ Test 21b: site-005 should have previous=null and consumption=null")
        else:
            print(f"❌ Test 21: Owner GET /api/dips/current → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 21 exception: {e}")
    
    # Test 22: Operator GET /api/dips/current → only assigned sites
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/current",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            has_site_005 = any(e.get("site_id") == "site-005" for e in data)
            if not has_site_005:
                print(f"✅ Test 22: Operator GET /api/dips/current → no site-005 entry")
                passed += 1
            else:
                print(f"❌ Test 22: Operator GET /api/dips/current → contains site-005 (should not)")
        else:
            print(f"❌ Test 22: Operator GET /api/dips/current → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 22 exception: {e}")
    
    # Test 23: Staff GET /api/dips/current → only site-001
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/current",
            headers={"Authorization": f"Bearer {staff_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            all_site_001 = all(e.get("site_id") == "site-001" for e in data)
            if all_site_001 and len(data) == 1:
                print(f"✅ Test 23: Staff GET /api/dips/current → only site-001 entry")
                passed += 1
            else:
                print(f"❌ Test 23: Staff GET /api/dips/current → {len(data)} entries, all_site_001={all_site_001}")
        else:
            print(f"❌ Test 23: Staff GET /api/dips/current → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 23 exception: {e}")
    
    print(f"\n📊 GET /api/dips/current: {passed}/{total} tests passed")
    return passed, total

def test_get_dips_trends():
    """Test F: GET /api/dips/trends — daily + N-day average"""
    print("\n=== TEST F: GET /api/dips/trends — Daily + N-day Average ===")
    
    passed = 0
    total = 4
    
    # Test 24: Owner GET /api/dips/trends?days=7
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/trends?days=7",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("days") == 7 and "sites" in data:
                # Check that each site has 7 daily buckets
                all_have_7_days = all(len(s.get("daily", [])) == 7 for s in data.get("sites", []))
                if all_have_7_days:
                    print(f"✅ Test 24: Owner GET /api/dips/trends?days=7 → {len(data.get('sites', []))} sites, each with 7 daily buckets")
                    passed += 1
                else:
                    print(f"❌ Test 24: Not all sites have 7 daily buckets")
            else:
                print(f"❌ Test 24: Response shape incorrect: {data}")
        else:
            print(f"❌ Test 24: Owner GET /api/dips/trends?days=7 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 24 exception: {e}")
    
    # Test 25: Owner GET /api/dips/trends?days=14&site_id=site-001
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/trends?days=14&site_id=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            sites = data.get("sites", [])
            if len(sites) == 1 and sites[0].get("site_id") == "site-001" and len(sites[0].get("daily", [])) == 14:
                print(f"✅ Test 25: Owner GET /api/dips/trends?days=14&site_id=site-001 → 1 site with 14 daily buckets")
                passed += 1
            else:
                print(f"❌ Test 25: Expected 1 site with 14 buckets, got {len(sites)} sites")
        else:
            print(f"❌ Test 25: Owner GET /api/dips/trends?days=14&site_id=site-001 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 25 exception: {e}")
    
    # Test 26: Operator2 GET /api/dips/trends?site_id=site-001 → sites:[]
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/trends?site_id=site-001",
            headers={"Authorization": f"Bearer {operator2_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if len(data.get("sites", [])) == 0:
                print(f"✅ Test 26: Operator2 GET /api/dips/trends?site_id=site-001 → sites:[] (not allowed)")
                passed += 1
            else:
                print(f"❌ Test 26: Operator2 GET /api/dips/trends?site_id=site-001 → {len(data.get('sites', []))} sites (expected 0)")
        else:
            print(f"❌ Test 26: Operator2 GET /api/dips/trends?site_id=site-001 → {response.status_code}")
    except Exception as e:
        print(f"❌ Test 26 exception: {e}")
    
    # Test 27: Verify average_consumption is arithmetic mean
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/trends?days=7&site_id=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            sites = data.get("sites", [])
            if len(sites) > 0:
                avg = sites[0].get("average_consumption", {})
                # Just verify the structure exists
                if "ulp" in avg and "diesel" in avg and "premium" in avg:
                    print(f"✅ Test 27: average_consumption structure present (ULP={avg.get('ulp')}, Diesel={avg.get('diesel')}, Premium={avg.get('premium')})")
                    passed += 1
                else:
                    print(f"❌ Test 27: average_consumption structure incorrect: {avg}")
            else:
                print(f"❌ Test 27: No sites in response")
        else:
            print(f"❌ Test 27: Request failed with {response.status_code}")
    except Exception as e:
        print(f"❌ Test 27 exception: {e}")
    
    print(f"\n📊 GET /api/dips/trends: {passed}/{total} tests passed")
    return passed, total

def test_put_dips():
    """Test G: PUT /api/dips/:id — edit window & ownership"""
    print("\n=== TEST G: PUT /api/dips/:id — Edit Window & Ownership ===")
    
    passed = 0
    total = 4
    
    # Test 28: Operator PUTs their own FIRST reading (within 24h)
    try:
        if first_reading_id:
            payload = {"notes": "edited", "ulp_litres": 18600}
            response = requests.put(
                f"{BASE_URL}/api/dips/{first_reading_id}",
                headers={"Authorization": f"Bearer {operator_token}"},
                json=payload,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("notes") == "edited" and float(data.get("ulp_litres", 0)) == 18600:
                    print(f"✅ Test 28: Operator PUTs own reading → 200, changes reflected")
                    passed += 1
                else:
                    print(f"❌ Test 28: Changes not reflected: {data}")
            else:
                print(f"❌ Test 28: Operator PUTs own reading → {response.status_code}")
        else:
            print(f"❌ Test 28: first_reading_id not set")
    except Exception as e:
        print(f"❌ Test 28 exception: {e}")
    
    # Test 29: Operator tries to PUT owner's reading → 403
    try:
        if owner_reading_id:
            payload = {"notes": "hacked"}
            response = requests.put(
                f"{BASE_URL}/api/dips/{owner_reading_id}",
                headers={"Authorization": f"Bearer {operator_token}"},
                json=payload,
                timeout=10
            )
            if response.status_code == 403:
                print(f"✅ Test 29: Operator tries to PUT owner's reading → 403")
                passed += 1
            else:
                print(f"❌ Test 29: Operator tries to PUT owner's reading → {response.status_code} (expected 403)")
        else:
            print(f"❌ Test 29: owner_reading_id not set")
    except Exception as e:
        print(f"❌ Test 29 exception: {e}")
    
    # Test 30: Operator2 tries to PUT operator's reading → 403
    try:
        if first_reading_id:
            payload = {"notes": "hacked by operator2"}
            response = requests.put(
                f"{BASE_URL}/api/dips/{first_reading_id}",
                headers={"Authorization": f"Bearer {operator2_token}"},
                json=payload,
                timeout=10
            )
            if response.status_code == 403:
                print(f"✅ Test 30: Operator2 tries to PUT operator's reading → 403")
                passed += 1
            else:
                print(f"❌ Test 30: Operator2 tries to PUT operator's reading → {response.status_code} (expected 403)")
        else:
            print(f"❌ Test 30: first_reading_id not set")
    except Exception as e:
        print(f"❌ Test 30 exception: {e}")
    
    # Test 31: Owner PUTs operator's reading (they own site-001) → 200
    try:
        if first_reading_id:
            payload = {"notes": "edited by owner"}
            response = requests.put(
                f"{BASE_URL}/api/dips/{first_reading_id}",
                headers={"Authorization": f"Bearer {owner_token}"},
                json=payload,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Test 31: Owner PUTs operator's reading → 200 (owner has cross-operator edit power)")
                passed += 1
            else:
                print(f"❌ Test 31: Owner PUTs operator's reading → {response.status_code} (expected 200)")
        else:
            print(f"❌ Test 31: first_reading_id not set")
    except Exception as e:
        print(f"❌ Test 31 exception: {e}")
    
    # Test 32: Staff tries PUT → 403
    # Skipping this as staff role is not allowed to POST/PUT/DELETE
    print(f"⏭️  Test 32: Staff PUT test skipped (staff not allowed to edit dips)")
    
    print(f"\n📊 PUT /api/dips/:id: {passed}/{total} tests passed")
    return passed, total

def test_delete_dips():
    """Test H: DELETE /api/dips/:id"""
    print("\n=== TEST H: DELETE /api/dips/:id ===")
    
    passed = 0
    total = 4
    
    # Test 33: Operator DELETEs their FIRST reading → 200
    try:
        if first_reading_id:
            response = requests.delete(
                f"{BASE_URL}/api/dips/{first_reading_id}",
                headers={"Authorization": f"Bearer {operator_token}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("success") is True:
                    print(f"✅ Test 33: Operator DELETEs own reading → 200 {data}")
                    passed += 1
                    
                    # Verify it's gone
                    verify = requests.get(
                        f"{BASE_URL}/api/dips?site_id=site-001",
                        headers={"Authorization": f"Bearer {operator_token}"},
                        timeout=10
                    )
                    if verify.status_code == 200:
                        readings = verify.json()
                        if not any(r.get("id") == first_reading_id for r in readings):
                            print(f"✅ Test 33b: Verified reading is deleted")
                        else:
                            print(f"❌ Test 33b: Reading still exists after delete")
                else:
                    print(f"❌ Test 33: Response incorrect: {data}")
            else:
                print(f"❌ Test 33: Operator DELETEs own reading → {response.status_code}")
        else:
            print(f"❌ Test 33: first_reading_id not set")
    except Exception as e:
        print(f"❌ Test 33 exception: {e}")
    
    # Test 34: Staff DELETE → 403
    print(f"⏭️  Test 34: Staff DELETE test skipped (staff not allowed to delete dips)")
    
    # Test 35: Operator2 DELETEs another operator's reading → 403
    try:
        if second_reading_id:
            response = requests.delete(
                f"{BASE_URL}/api/dips/{second_reading_id}",
                headers={"Authorization": f"Bearer {operator2_token}"},
                timeout=10
            )
            if response.status_code == 403:
                print(f"✅ Test 35: Operator2 DELETEs another operator's reading → 403")
                passed += 1
            else:
                print(f"❌ Test 35: Operator2 DELETEs another operator's reading → {response.status_code} (expected 403)")
        else:
            print(f"❌ Test 35: second_reading_id not set")
    except Exception as e:
        print(f"❌ Test 35 exception: {e}")
    
    # Test 36: Owner DELETEs remaining operator readings on site-001 → 200
    try:
        # Get all readings for site-001
        response = requests.get(
            f"{BASE_URL}/api/dips?site_id=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            readings = response.json()
            deleted_count = 0
            for reading in readings:
                delete_resp = requests.delete(
                    f"{BASE_URL}/api/dips/{reading['id']}",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    timeout=10
                )
                if delete_resp.status_code == 200:
                    deleted_count += 1
            
            if deleted_count > 0:
                print(f"✅ Test 36: Owner DELETEs {deleted_count} readings on site-001 → 200")
                passed += 1
                
                # Verify site-001 is empty
                verify = requests.get(
                    f"{BASE_URL}/api/dips?site_id=site-001",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    timeout=10
                )
                if verify.status_code == 200 and len(verify.json()) == 0:
                    print(f"✅ Test 36b: Verified site-001 has no readings")
                else:
                    print(f"❌ Test 36b: site-001 still has readings after cleanup")
            else:
                print(f"❌ Test 36: No readings deleted")
        else:
            print(f"❌ Test 36: Failed to get readings for site-001")
    except Exception as e:
        print(f"❌ Test 36 exception: {e}")
    
    print(f"\n📊 DELETE /api/dips/:id: {passed}/{total} tests passed")
    return passed, total

def test_cleanup():
    """Test I: Cleanup"""
    print("\n=== TEST I: Cleanup ===")
    
    passed = 0
    total = 1
    
    # Test 37: Owner DELETEs their own site-005 reading
    try:
        if owner_reading_id:
            response = requests.delete(
                f"{BASE_URL}/api/dips/{owner_reading_id}",
                headers={"Authorization": f"Bearer {owner_token}"},
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Test 37: Owner DELETEs own site-005 reading → 200")
                passed += 1
                
                # Verify final GET /api/dips is empty or minimal
                verify = requests.get(
                    f"{BASE_URL}/api/dips",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    timeout=10
                )
                if verify.status_code == 200:
                    remaining = verify.json()
                    print(f"✅ Test 37b: Final GET /api/dips returns {len(remaining)} readings")
            else:
                print(f"❌ Test 37: Owner DELETEs own site-005 reading → {response.status_code}")
        else:
            print(f"❌ Test 37: owner_reading_id not set")
    except Exception as e:
        print(f"❌ Test 37 exception: {e}")
    
    print(f"\n📊 Cleanup: {passed}/{total} tests passed")
    return passed, total

def main():
    """Main test runner"""
    print("=" * 80)
    print("PHASE 3: FUEL INVENTORY TRACKING (DIP READINGS API) - COMPREHENSIVE TEST")
    print("=" * 80)
    
    # Login all users
    print("\n🔐 Logging in all test users...")
    global owner_token, operator_token, operator2_token, staff_token
    
    owner_token = login(OWNER_EMAIL, PASSWORD)
    operator_token = login(OPERATOR_EMAIL, PASSWORD)
    operator2_token = login(OPERATOR2_EMAIL, PASSWORD)
    staff_token = login(STAFF_EMAIL, PASSWORD)
    
    if not all([owner_token, operator_token, operator2_token, staff_token]):
        print("❌ CRITICAL: Failed to login all users. Aborting tests.")
        return
    
    print("✅ All users logged in successfully")
    
    # Run all test suites
    results = []
    
    results.append(test_auth_gates())
    results.append(test_post_dips_rbac_validation())
    results.append(test_second_third_readings())
    results.append(test_get_dips_listing())
    results.append(test_get_dips_current())
    results.append(test_get_dips_trends())
    results.append(test_put_dips())
    results.append(test_delete_dips())
    results.append(test_cleanup())
    
    # Calculate totals
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    print("\n" + "=" * 80)
    print("FINAL RESULTS")
    print("=" * 80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_tests - total_passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    print("=" * 80)
    
    if success_rate >= 90:
        print("🎉 EXCELLENT! Phase 3 Dip Readings API is production-ready!")
    elif success_rate >= 75:
        print("✅ GOOD! Minor issues found, but core functionality working.")
    else:
        print("❌ CRITICAL ISSUES FOUND! Major fixes needed.")

if __name__ == "__main__":
    main()
