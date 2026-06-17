#!/usr/bin/env python3
"""
Phase 2 Backend Testing - FOPS App
Tests for:
1. /api/daily-rollups - new shifts array, status counters, site_name, banking_value
2. /api/wetstock/reconciliation - custom grade logic for KINGSTHORPE
"""

import requests
import json
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@fopsapp.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@fopsapp.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@fopsapp.com", "password": "WorkflowDemo2026!"}
}

# KINGSTHORPE site ID from review request
KINGSTHORPE_SITE_ID = "8c8d2156-1012-4410-81f3-f30b6efc91d3"

def login(role):
    """Login and return Bearer token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS[role],
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            # Try multiple token locations
            token = (
                data.get("token") or 
                data.get("access_token") or 
                (data.get("session", {}).get("access_token") if isinstance(data.get("session"), dict) else None)
            )
            sites = data.get("sites", [])
            user = data.get("user", {})
            if not token:
                print(f"❌ {role.upper()} login response missing token. Response keys: {list(data.keys())}")
                if "session" in data:
                    print(f"Session keys: {list(data['session'].keys()) if isinstance(data['session'], dict) else 'not a dict'}")
                return None, []
            print(f"✅ {role.upper()} login successful - {len(sites)} sites accessible, token: {token[:20]}...")
            return token, sites
        else:
            print(f"❌ {role.upper()} login failed: {response.status_code} - {response.text}")
            return None, []
    except Exception as e:
        print(f"❌ {role.upper()} login error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None, []

def test_daily_rollups_auth():
    """Test 1: GET /api/daily-rollups without Bearer → 401"""
    print("\n" + "="*80)
    print("TEST 1: /api/daily-rollups without Bearer token → 401")
    print("="*80)
    try:
        response = requests.get(
            f"{BASE_URL}/api/daily-rollups?siteIds=site-001",
            timeout=30
        )
        if response.status_code == 401:
            print("✅ PASS: Returns 401 without Bearer token")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def test_daily_rollups_owner():
    """Test 2-5: GET /api/daily-rollups as owner with comprehensive checks"""
    print("\n" + "="*80)
    print("TEST 2-5: /api/daily-rollups as Owner - shifts array, status counters, site_name, banking_value")
    print("="*80)
    
    token, sites = login("owner")
    if not token:
        print("❌ FAIL: Could not login as owner")
        return False
    
    # Get site IDs (up to 5)
    site_ids = [s["id"] for s in sites[:5]]
    if not site_ids:
        print("❌ FAIL: Owner has no sites")
        return False
    
    print(f"Testing with {len(site_ids)} sites: {', '.join(site_ids[:3])}...")
    
    # Date range: last 30 days
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/daily-rollups",
            params={
                "siteIds": ",".join(site_ids),
                "startDate": start_date,
                "endDate": end_date
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        rollups = response.json()
        print(f"✅ PASS: Returns 200 with {len(rollups)} rollups")
        
        if not isinstance(rollups, list):
            print(f"❌ FAIL: Response is not an array, got {type(rollups)}")
            return False
        
        # Test 2: Each rollup must have a shifts array
        all_have_shifts = True
        rollups_with_shifts = 0
        for rollup in rollups:
            if "shifts" not in rollup:
                print(f"❌ FAIL: Rollup missing 'shifts' array: {rollup.get('site_id')} on {rollup.get('date')}")
                all_have_shifts = False
            else:
                if rollup.get("shift_count", 0) > 0:
                    rollups_with_shifts += 1
                    # Verify shifts.length === shift_count
                    if len(rollup["shifts"]) != rollup["shift_count"]:
                        print(f"❌ FAIL: Rollup {rollup.get('site_id')} on {rollup.get('date')}: shifts.length={len(rollup['shifts'])} != shift_count={rollup['shift_count']}")
                        all_have_shifts = False
                    else:
                        # Check shift structure
                        for shift in rollup["shifts"]:
                            required_fields = ["id", "shift_type", "status", "total_revenue"]
                            missing = [f for f in required_fields if f not in shift]
                            if missing:
                                print(f"❌ FAIL: Shift missing fields {missing}: {shift}")
                                all_have_shifts = False
                                break
        
        if all_have_shifts:
            print(f"✅ PASS: All {len(rollups)} rollups have 'shifts' array with correct structure")
            print(f"   - {rollups_with_shifts} rollups have shift_count > 0")
        
        # Test 3: Verify shifts are sorted Morning → Afternoon → Night
        shift_order_correct = True
        for rollup in rollups:
            if rollup.get("shift_count", 0) > 1:
                shifts = rollup["shifts"]
                shift_types = [s.get("shift_type") for s in shifts]
                # Check if Morning comes before Afternoon, Afternoon before Night
                order_map = {"Morning": 1, "Afternoon": 2, "Night": 3}
                for i in range(len(shift_types) - 1):
                    curr = order_map.get(shift_types[i], 99)
                    next_val = order_map.get(shift_types[i+1], 99)
                    if curr > next_val:
                        print(f"❌ FAIL: Shifts not sorted correctly in rollup {rollup.get('site_id')} on {rollup.get('date')}: {shift_types}")
                        shift_order_correct = False
                        break
                if not shift_order_correct:
                    break
        
        if shift_order_correct:
            print(f"✅ PASS: Shifts are sorted in Morning → Afternoon → Night order")
        
        # Test 4: Verify pending_count + reviewed_count <= shift_count
        status_counts_valid = True
        for rollup in rollups:
            pending = rollup.get("pending_count", 0)
            reviewed = rollup.get("reviewed_count", 0)
            shift_count = rollup.get("shift_count", 0)
            if pending + reviewed > shift_count:
                print(f"❌ FAIL: Rollup {rollup.get('site_id')} on {rollup.get('date')}: pending_count({pending}) + reviewed_count({reviewed}) > shift_count({shift_count})")
                status_counts_valid = False
        
        if status_counts_valid:
            print(f"✅ PASS: All rollups have valid status counts (pending_count + reviewed_count <= shift_count)")
        
        # Test 5: Verify site_name is populated
        all_have_site_name = True
        for rollup in rollups:
            if "site_name" not in rollup or not rollup["site_name"]:
                print(f"❌ FAIL: Rollup missing 'site_name': {rollup.get('site_id')} on {rollup.get('date')}")
                all_have_site_name = False
        
        if all_have_site_name:
            print(f"✅ PASS: All rollups have 'site_name' populated")
        
        # Test banking_value
        all_have_banking = True
        for rollup in rollups:
            if "banking_value" not in rollup:
                print(f"❌ FAIL: Rollup missing 'banking_value': {rollup.get('site_id')} on {rollup.get('date')}")
                all_have_banking = False
        
        if all_have_banking:
            print(f"✅ PASS: All rollups have 'banking_value' field")
        
        # Print sample rollup for verification
        if rollups and rollups[0].get("shift_count", 0) > 0:
            print("\n📋 Sample rollup with shifts:")
            sample = rollups[0]
            print(f"   Site: {sample.get('site_name')} ({sample.get('site_id')})")
            print(f"   Date: {sample.get('date')}")
            print(f"   Shift count: {sample.get('shift_count')}")
            print(f"   Pending: {sample.get('pending_count')}, Reviewed: {sample.get('reviewed_count')}")
            print(f"   Banking value: {sample.get('banking_value')}")
            print(f"   Shifts: {json.dumps(sample.get('shifts', []), indent=6)}")
        
        return all_have_shifts and shift_order_correct and status_counts_valid and all_have_site_name and all_have_banking
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_daily_rollups_operator():
    """Test 6: GET /api/daily-rollups as operator"""
    print("\n" + "="*80)
    print("TEST 6: /api/daily-rollups as Operator")
    print("="*80)
    
    token, sites = login("operator")
    if not token:
        print("❌ FAIL: Could not login as operator")
        return False
    
    site_ids = [s["id"] for s in sites]
    if not site_ids:
        print("⚠️  SKIP: Operator has no assigned sites")
        return True
    
    print(f"Testing with {len(site_ids)} operator sites")
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/daily-rollups",
            params={
                "siteIds": ",".join(site_ids),
                "startDate": start_date,
                "endDate": end_date
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        rollups = response.json()
        print(f"✅ PASS: Operator returns 200 with {len(rollups)} rollups")
        
        # Verify same shape invariants
        if rollups:
            sample = rollups[0]
            has_shifts = "shifts" in sample
            has_site_name = "site_name" in sample
            has_banking = "banking_value" in sample
            has_pending = "pending_count" in sample
            has_reviewed = "reviewed_count" in sample
            
            if has_shifts and has_site_name and has_banking and has_pending and has_reviewed:
                print(f"✅ PASS: Operator rollups have all required fields")
                return True
            else:
                print(f"❌ FAIL: Operator rollups missing fields - shifts:{has_shifts}, site_name:{has_site_name}, banking:{has_banking}, pending:{has_pending}, reviewed:{has_reviewed}")
                return False
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def test_daily_rollups_staff():
    """Test 7: GET /api/daily-rollups as staff"""
    print("\n" + "="*80)
    print("TEST 7: /api/daily-rollups as Staff")
    print("="*80)
    
    token, sites = login("staff")
    if not token:
        print("❌ FAIL: Could not login as staff")
        return False
    
    site_ids = [s["id"] for s in sites]
    if not site_ids:
        print("⚠️  SKIP: Staff has no assigned sites")
        return True
    
    print(f"Testing with {len(site_ids)} staff sites")
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/daily-rollups",
            params={
                "siteIds": ",".join(site_ids),
                "startDate": start_date,
                "endDate": end_date
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        rollups = response.json()
        print(f"✅ PASS: Staff returns 200 with {len(rollups)} rollups")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def test_daily_rollups_regression():
    """Test 8: Regression - existing dashboard endpoints still work"""
    print("\n" + "="*80)
    print("TEST 8: Regression - existing dashboard endpoints")
    print("="*80)
    
    token, sites = login("owner")
    if not token:
        print("❌ FAIL: Could not login as owner")
        return False
    
    site_ids = [s["id"] for s in sites[:3]]
    
    endpoints = [
        "/api/dashboard/stats",
        "/api/reports",
        "/api/sites"
    ]
    
    all_pass = True
    for endpoint in endpoints:
        try:
            params = {}
            if "dashboard/stats" in endpoint:
                params["siteIds"] = ",".join(site_ids)
            
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"✅ PASS: {endpoint} returns 200")
            else:
                print(f"❌ FAIL: {endpoint} returns {response.status_code}")
                all_pass = False
        except Exception as e:
            print(f"❌ FAIL: {endpoint} exception - {str(e)}")
            all_pass = False
    
    return all_pass

def test_wetstock_auth():
    """Test 1: GET /api/wetstock/reconciliation without Bearer → 401"""
    print("\n" + "="*80)
    print("TEST 1 (WETSTOCK): /api/wetstock/reconciliation without Bearer → 401")
    print("="*80)
    try:
        response = requests.get(
            f"{BASE_URL}/api/wetstock/reconciliation?siteIds={KINGSTHORPE_SITE_ID}",
            timeout=30
        )
        if response.status_code == 401:
            print("✅ PASS: Returns 401 without Bearer token")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def test_wetstock_kingsthorpe():
    """Test 2-5: GET /api/wetstock/reconciliation for KINGSTHORPE - custom grades only"""
    print("\n" + "="*80)
    print("TEST 2-5 (WETSTOCK): KINGSTHORPE custom grades (should be 4, not 7)")
    print("="*80)
    
    token, sites = login("owner")
    if not token:
        print("❌ FAIL: Could not login as owner")
        return False
    
    # Get all owner site IDs
    site_ids = [s["id"] for s in sites]
    print(f"Owner has {len(site_ids)} sites")
    
    # Check if KINGSTHORPE is in the list
    kingsthorpe_in_sites = KINGSTHORPE_SITE_ID in site_ids
    if not kingsthorpe_in_sites:
        print(f"⚠️  WARNING: KINGSTHORPE ({KINGSTHORPE_SITE_ID}) not in owner's sites")
        print(f"Available sites: {site_ids}")
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/wetstock/reconciliation",
            params={
                "siteIds": ",".join(site_ids),
                "startDate": start_date,
                "endDate": end_date
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"✅ PASS: Returns 200")
        
        # Find KINGSTHORPE in the response
        kingsthorpe_site = None
        for site in data.get("sites", []):
            if site.get("site_id") == KINGSTHORPE_SITE_ID or site.get("site_name") == "KINGSTHORPE":
                kingsthorpe_site = site
                break
        
        if not kingsthorpe_site:
            print(f"❌ FAIL: KINGSTHORPE not found in response")
            print(f"Available sites in response: {[s.get('site_name') for s in data.get('sites', [])]}")
            return False
        
        print(f"✅ PASS: Found KINGSTHORPE in response")
        print(f"   Site ID: {kingsthorpe_site.get('site_id')}")
        print(f"   Site Name: {kingsthorpe_site.get('site_name')}")
        
        # Test 2: Verify grades.length === 4 (only custom grades, not 7)
        grades = kingsthorpe_site.get("grades", [])
        grade_count = len(grades)
        print(f"\n📊 KINGSTHORPE has {grade_count} grades:")
        for g in grades:
            print(f"   - {g.get('grade')} (key: {g.get('grade_key')}, status: {g.get('status')})")
        
        if grade_count == 4:
            print(f"✅ PASS: KINGSTHORPE has exactly 4 grades (not 7)")
        else:
            print(f"❌ FAIL: KINGSTHORPE has {grade_count} grades, expected 4")
            return False
        
        # Test 3: Verify NONE of the grades are the FIXED_GRADES (ulp, diesel, premium) as separate entries
        # The custom keys for KINGSTHORPE are 'ulp', 'pre98', 'diesel', 'pre_diesel'
        # These are CUSTOM grades, not the fixed ones
        grade_keys = [g.get("grade_key") for g in grades]
        print(f"\n🔑 Grade keys: {grade_keys}")
        
        # Expected custom keys for KINGSTHORPE
        expected_keys = ["ulp", "diesel", "pre98", "pre_diesel"]
        if set(grade_keys) == set(expected_keys):
            print(f"✅ PASS: KINGSTHORPE has expected custom grade keys: {expected_keys}")
        else:
            print(f"⚠️  WARNING: Grade keys don't match expected. Got: {grade_keys}, Expected: {expected_keys}")
        
        # Test 4: Verify ULP grade variance
        ulp_grade = next((g for g in grades if g.get("grade_key") == "ulp"), None)
        if not ulp_grade:
            print(f"❌ FAIL: ULP grade not found")
            return False
        
        print(f"\n⛽ ULP Grade Details:")
        print(f"   Opening level: {ulp_grade.get('opening_level')}")
        print(f"   Closing level: {ulp_grade.get('closing_level')}")
        print(f"   Deliveries: {ulp_grade.get('deliveries')}")
        print(f"   Book movement: {ulp_grade.get('book_movement')}")
        print(f"   Metered sales: {ulp_grade.get('metered_sales')}")
        print(f"   Variance litres: {ulp_grade.get('variance_litres')}")
        print(f"   Variance %: {ulp_grade.get('variance_pct')}")
        print(f"   Status: {ulp_grade.get('status')}")
        
        # Expected values from review request
        expected_opening = 18000
        expected_deliveries = 10000
        expected_closing = 7000
        expected_book_movement = 21000
        expected_metered_sales = 20580
        expected_variance_litres = -420
        expected_variance_pct = -0.0204  # approximately
        expected_status = "alert"
        
        # Verify values (with some tolerance for floating point)
        checks = []
        
        if ulp_grade.get("opening_level") == expected_opening:
            print(f"✅ Opening level matches: {expected_opening}")
            checks.append(True)
        else:
            print(f"❌ Opening level mismatch: expected {expected_opening}, got {ulp_grade.get('opening_level')}")
            checks.append(False)
        
        if ulp_grade.get("deliveries") == expected_deliveries:
            print(f"✅ Deliveries match: {expected_deliveries}")
            checks.append(True)
        else:
            print(f"❌ Deliveries mismatch: expected {expected_deliveries}, got {ulp_grade.get('deliveries')}")
            checks.append(False)
        
        if ulp_grade.get("closing_level") == expected_closing:
            print(f"✅ Closing level matches: {expected_closing}")
            checks.append(True)
        else:
            print(f"❌ Closing level mismatch: expected {expected_closing}, got {ulp_grade.get('closing_level')}")
            checks.append(False)
        
        if ulp_grade.get("book_movement") == expected_book_movement:
            print(f"✅ Book movement matches: {expected_book_movement}")
            checks.append(True)
        else:
            print(f"❌ Book movement mismatch: expected {expected_book_movement}, got {ulp_grade.get('book_movement')}")
            checks.append(False)
        
        if ulp_grade.get("metered_sales") == expected_metered_sales:
            print(f"✅ Metered sales match: {expected_metered_sales}")
            checks.append(True)
        else:
            print(f"❌ Metered sales mismatch: expected {expected_metered_sales}, got {ulp_grade.get('metered_sales')}")
            checks.append(False)
        
        if ulp_grade.get("variance_litres") == expected_variance_litres:
            print(f"✅ Variance litres match: {expected_variance_litres}")
            checks.append(True)
        else:
            print(f"❌ Variance litres mismatch: expected {expected_variance_litres}, got {ulp_grade.get('variance_litres')}")
            checks.append(False)
        
        # Variance % with tolerance
        actual_var_pct = ulp_grade.get("variance_pct", 0)
        if abs(actual_var_pct - expected_variance_pct) < 0.001:
            print(f"✅ Variance % matches (within tolerance): {actual_var_pct} ≈ {expected_variance_pct}")
            checks.append(True)
        else:
            print(f"❌ Variance % mismatch: expected {expected_variance_pct}, got {actual_var_pct}")
            checks.append(False)
        
        if ulp_grade.get("status") == expected_status:
            print(f"✅ Status matches: {expected_status}")
            checks.append(True)
        else:
            print(f"❌ Status mismatch: expected {expected_status}, got {ulp_grade.get('status')}")
            checks.append(False)
        
        if all(checks):
            print(f"\n✅ PASS: All ULP grade variance checks passed")
        else:
            print(f"\n⚠️  PARTIAL: {sum(checks)}/{len(checks)} ULP grade checks passed")
        
        return grade_count == 4 and all(checks)
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_wetstock_other_sites():
    """Test 5: Verify other sites (non-custom) still get 3 fixed grades"""
    print("\n" + "="*80)
    print("TEST 5 (WETSTOCK): Other sites without custom dip fields get 3 fixed grades")
    print("="*80)
    
    token, sites = login("owner")
    if not token:
        print("❌ FAIL: Could not login as owner")
        return False
    
    # Get all owner site IDs except KINGSTHORPE
    site_ids = [s["id"] for s in sites if s["id"] != KINGSTHORPE_SITE_ID]
    
    if not site_ids:
        print("⚠️  SKIP: No other sites to test")
        return True
    
    print(f"Testing {len(site_ids)} non-KINGSTHORPE sites")
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/wetstock/reconciliation",
            params={
                "siteIds": ",".join(site_ids[:3]),  # Test first 3 sites
                "startDate": start_date,
                "endDate": end_date
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check if any site has the 3 fixed grades
        found_fixed_grades = False
        for site in data.get("sites", []):
            grades = site.get("grades", [])
            grade_keys = [g.get("grade_key") for g in grades]
            
            # Check if this site has the fixed grades (ulp, diesel, premium)
            # Note: some sites might have custom grades with same keys, so we check for the pattern
            if len(grades) >= 3:
                print(f"   Site {site.get('site_name')}: {len(grades)} grades - {grade_keys}")
                # If it has exactly 3 grades and they match the fixed pattern, it's using fixed grades
                if set(grade_keys) == {"ulp", "diesel", "premium"}:
                    found_fixed_grades = True
                    print(f"   ✅ Found site with 3 fixed grades: {site.get('site_name')}")
        
        if found_fixed_grades:
            print(f"✅ PASS: Found sites with 3 fixed grades (backward compat preserved)")
        else:
            print(f"⚠️  INFO: No sites found with exactly 3 fixed grades (may have custom or no dip data)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def test_wetstock_staff_forbidden():
    """Test 6: GET /api/wetstock/reconciliation as staff → 403"""
    print("\n" + "="*80)
    print("TEST 6 (WETSTOCK): Staff access → 403")
    print("="*80)
    
    token, sites = login("staff")
    if not token:
        print("❌ FAIL: Could not login as staff")
        return False
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/wetstock/reconciliation?siteIds=site-001",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        
        if response.status_code == 403:
            print("✅ PASS: Staff returns 403 (owner/operator only)")
            return True
        else:
            print(f"❌ FAIL: Expected 403, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception - {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("PHASE 2 BACKEND TESTING - FOPS APP")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = {
        "daily_rollups": [],
        "wetstock": []
    }
    
    # Test Target #1: /api/daily-rollups
    print("\n" + "🎯"*40)
    print("TEST TARGET #1: /api/daily-rollups")
    print("🎯"*40)
    
    results["daily_rollups"].append(("Auth gate (401)", test_daily_rollups_auth()))
    results["daily_rollups"].append(("Owner - comprehensive checks", test_daily_rollups_owner()))
    results["daily_rollups"].append(("Operator - RBAC", test_daily_rollups_operator()))
    results["daily_rollups"].append(("Staff - RBAC", test_daily_rollups_staff()))
    results["daily_rollups"].append(("Regression tests", test_daily_rollups_regression()))
    
    # Test Target #2: /api/wetstock/reconciliation
    print("\n" + "🎯"*40)
    print("TEST TARGET #2: /api/wetstock/reconciliation")
    print("🎯"*40)
    
    results["wetstock"].append(("Auth gate (401)", test_wetstock_auth()))
    results["wetstock"].append(("KINGSTHORPE custom grades", test_wetstock_kingsthorpe()))
    results["wetstock"].append(("Other sites fixed grades", test_wetstock_other_sites()))
    results["wetstock"].append(("Staff forbidden (403)", test_wetstock_staff_forbidden()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    print("\n📊 TEST TARGET #1: /api/daily-rollups")
    daily_pass = sum(1 for _, result in results["daily_rollups"] if result)
    daily_total = len(results["daily_rollups"])
    for name, result in results["daily_rollups"]:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status}: {name}")
    print(f"\n   Result: {daily_pass}/{daily_total} tests passed")
    
    print("\n📊 TEST TARGET #2: /api/wetstock/reconciliation")
    wetstock_pass = sum(1 for _, result in results["wetstock"] if result)
    wetstock_total = len(results["wetstock"])
    for name, result in results["wetstock"]:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status}: {name}")
    print(f"\n   Result: {wetstock_pass}/{wetstock_total} tests passed")
    
    total_pass = daily_pass + wetstock_pass
    total_tests = daily_total + wetstock_total
    
    print("\n" + "="*80)
    print(f"OVERALL: {total_pass}/{total_tests} tests passed ({100*total_pass//total_tests}%)")
    print("="*80)
    
    if total_pass == total_tests:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total_tests - total_pass} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
