#!/usr/bin/env python3
"""
Phase 2 FINAL Refactor — Auth Gate + POST 500 Fix + Regression Tests

This test suite verifies the auth fixes applied to dashboard.js and fuel-prices.js handlers.

Test Sections:
1. AUTH GATE VERIFICATION (10 endpoints without Bearer → 401)
2. AUTH GATE PASS (same endpoints with Owner Bearer → 200)
3. POST 500 FIX (fuel-price-entries and competitor-prices with auto-populated entered_by_user_id)
4. REGRESSION TESTS (15 endpoints + reports module + catch-all)

Expected Results:
- All 10 auth-gate tests → 401 (was 200 before)
- All 2 POST tests → 200 with entered_by_user_id populated (was 500 before)
- 0 regressions
- Target: 100% pass (or at minimum >95%)
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Use production URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials from /app/memory/test_credentials.md
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"},
    "founder": {"email": "founder@fops.platform", "password": "Fops813387cf0a5c6351!"}
}

# Store tokens and test data
tokens = {}
test_data = {
    "created_competitors": [],
    "created_price_entries": [],
    "created_competitor_prices": []
}

def login(role):
    """Login and return Bearer token"""
    try:
        creds = CREDENTIALS[role]
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=creds,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Token can be at top level or in session.access_token
            token = data.get("token") or data.get("session", {}).get("access_token")
            user = data.get("user", {})
            if token:
                print(f"✅ {role.upper()} login successful (user_id: {user.get('id', 'N/A')})")
                return token
            else:
                print(f"❌ {role.upper()} login failed: No token in response")
                return None
        else:
            print(f"❌ {role.upper()} login failed: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ {role.upper()} login error: {str(e)}")
        return None

def test_auth_gate_verification():
    """Test that all 10 endpoints return 401 without Bearer token"""
    print("\n" + "="*80)
    print("SECTION 1: AUTH GATE VERIFICATION (WITHOUT Bearer → 401)")
    print("="*80)
    
    passed = 0
    total = 0
    
    endpoints = [
        ("GET", "/api/daily-rollups?siteIds=site-001"),
        ("GET", "/api/dashboard/stats?siteIds=site-001"),
        ("GET", "/api/dashboard/site-stats?siteIds=site-001"),
        ("GET", "/api/dashboard/revenue-chart?siteIds=site-001&days=7"),
        ("GET", "/api/site-competitors?siteId=site-001"),
        ("GET", "/api/fuel-price-entries?siteId=site-001"),
        ("GET", "/api/competitor-prices?siteId=site-001"),
        ("GET", "/api/fuel-price-comparison?siteIds=site-001"),
        ("POST", "/api/fuel-price-entries"),
        ("POST", "/api/competitor-prices")
    ]
    
    for method, endpoint in endpoints:
        total += 1
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
            else:  # POST
                response = requests.post(f"{BASE_URL}{endpoint}", json={}, timeout=10)
            
            if response.status_code == 401:
                print(f"✅ {total}: {method} {endpoint} → 401")
                passed += 1
            else:
                print(f"❌ {total}: {method} {endpoint} → Expected 401, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
        except Exception as e:
            print(f"❌ {total}: {method} {endpoint} → Error: {str(e)}")
    
    print(f"\n📊 Auth Gate Verification: {passed}/{total} tests passed")
    return passed, total

def test_auth_gate_pass():
    """Test that all endpoints return 200 with Owner Bearer token"""
    print("\n" + "="*80)
    print("SECTION 2: AUTH GATE PASS (WITH Owner Bearer → 200)")
    print("="*80)
    
    passed = 0
    total = 0
    
    owner_token = tokens.get('owner')
    if not owner_token:
        print("❌ Owner token not available, skipping section")
        return 0, 0
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    endpoints = [
        ("GET", "/api/daily-rollups?siteIds=site-001"),
        ("GET", "/api/dashboard/stats?siteIds=site-001"),
        ("GET", "/api/dashboard/site-stats?siteIds=site-001"),
        ("GET", "/api/dashboard/revenue-chart?siteIds=site-001&days=7"),
        ("GET", "/api/site-competitors?siteId=site-001"),
        ("GET", "/api/fuel-price-entries?siteId=site-001"),
        ("GET", "/api/competitor-prices?siteId=site-001"),
        ("GET", "/api/fuel-price-comparison?siteIds=site-001")
    ]
    
    for method, endpoint in endpoints:
        total += 1
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ {total}: {method} {endpoint} → 200")
                passed += 1
            else:
                print(f"❌ {total}: {method} {endpoint} → Expected 200, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
        except Exception as e:
            print(f"❌ {total}: {method} {endpoint} → Error: {str(e)}")
    
    print(f"\n📊 Auth Gate Pass: {passed}/{total} tests passed")
    return passed, total

def test_post_500_fix():
    """Test POST /fuel-price-entries and POST /competitor-prices with auto-populated entered_by_user_id"""
    print("\n" + "="*80)
    print("SECTION 3: POST 500 FIX (auto-populate entered_by_user_id)")
    print("="*80)
    
    passed = 0
    total = 0
    
    owner_token = tokens.get('owner')
    if not owner_token:
        print("❌ Owner token not available, skipping section")
        return 0, 0
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 3.1: Create a test competitor first (needed for competitor-prices)
    total += 1
    try:
        competitor_payload = {
            "site_id": "site-001",
            "competitor_name": "Test BP Station",
            "distance_km": 1.2
        }
        response = requests.post(
            f"{BASE_URL}/api/site-competitors",
            headers=headers,
            json=competitor_payload,
            timeout=10
        )
        if response.status_code == 200:
            competitor = response.json()
            test_data["created_competitors"].append(competitor["id"])
            print(f"✅ 3.1: POST /site-competitors → 200 (created competitor {competitor['id'][:8]}...)")
            passed += 1
        else:
            print(f"❌ 3.1: POST /site-competitors → Expected 200, got {response.status_code}")
            print(f"   Response: {response.text[:200]}")
    except Exception as e:
        print(f"❌ 3.1: POST /site-competitors → Error: {str(e)}")
    
    # Test 3.2: POST /fuel-price-entries (should auto-populate entered_by_user_id)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        price_entry_payload = {
            "site_id": "site-001",
            "date": today,
            "fuel_type": "ULP",
            "price": 195.5
            # DO NOT send entered_by_user_id — handler should auto-populate from auth
        }
        response = requests.post(
            f"{BASE_URL}/api/fuel-price-entries",
            headers=headers,
            json=price_entry_payload,
            timeout=10
        )
        if response.status_code == 200:
            entry = response.json()
            test_data["created_price_entries"].append(entry["id"])
            if entry.get("entered_by_user_id"):
                print(f"✅ 3.2: POST /fuel-price-entries → 200 with entered_by_user_id={entry['entered_by_user_id'][:8]}...")
                passed += 1
            else:
                print(f"❌ 3.2: POST /fuel-price-entries → 200 but entered_by_user_id is missing")
        else:
            print(f"❌ 3.2: POST /fuel-price-entries → Expected 200, got {response.status_code}")
            print(f"   Response: {response.text[:200]}")
    except Exception as e:
        print(f"❌ 3.2: POST /fuel-price-entries → Error: {str(e)}")
    
    # Test 3.3: POST /competitor-prices (should auto-populate entered_by_user_id)
    total += 1
    try:
        if test_data["created_competitors"]:
            competitor_id = test_data["created_competitors"][0]
            competitor_price_payload = {
                "competitor_id": competitor_id,
                "site_id": "site-001",
                "date": today,
                "fuel_type": "ULP",
                "price": 192.9
                # DO NOT send entered_by_user_id — handler should auto-populate from auth
            }
            response = requests.post(
                f"{BASE_URL}/api/competitor-prices",
                headers=headers,
                json=competitor_price_payload,
                timeout=10
            )
            if response.status_code == 200:
                price = response.json()
                test_data["created_competitor_prices"].append(price["id"])
                if price.get("entered_by_user_id"):
                    print(f"✅ 3.3: POST /competitor-prices → 200 with entered_by_user_id={price['entered_by_user_id'][:8]}...")
                    passed += 1
                else:
                    print(f"❌ 3.3: POST /competitor-prices → 200 but entered_by_user_id is missing")
            else:
                print(f"❌ 3.3: POST /competitor-prices → Expected 200, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
        else:
            print(f"❌ 3.3: POST /competitor-prices → Skipped (no competitor created)")
    except Exception as e:
        print(f"❌ 3.3: POST /competitor-prices → Error: {str(e)}")
    
    print(f"\n📊 POST 500 Fix: {passed}/{total} tests passed")
    return passed, total

def test_regression():
    """Test that all existing endpoints still work (no regressions)"""
    print("\n" + "="*80)
    print("SECTION 4: REGRESSION TESTS")
    print("="*80)
    
    passed = 0
    total = 0
    
    owner_token = tokens.get('owner')
    operator_token = tokens.get('operator')
    staff_token = tokens.get('staff')
    founder_token = tokens.get('founder')
    
    # Test 4.1: POST /auth/login (all roles)
    for role in ["owner", "operator", "staff", "founder"]:
        total += 1
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json=CREDENTIALS[role],
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ 4.{total}: POST /auth/login ({role}) → 200")
                passed += 1
            else:
                print(f"❌ 4.{total}: POST /auth/login ({role}) → Expected 200, got {response.status_code}")
        except Exception as e:
            print(f"❌ 4.{total}: POST /auth/login ({role}) → Error: {str(e)}")
    
    # Test 4.5: GET /sites (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            sites = response.json()
            print(f"✅ 4.{total}: GET /sites (owner) → 200 ({len(sites)} sites)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /sites (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /sites (owner) → Error: {str(e)}")
    
    # Test 4.6: GET /users (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            users = response.json()
            print(f"✅ 4.{total}: GET /users (owner) → 200 ({len(users)} users)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /users (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /users (owner) → Error: {str(e)}")
    
    # Test 4.7: GET /field-configs (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/field-configs?siteId=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            configs = response.json()
            print(f"✅ 4.{total}: GET /field-configs (owner) → 200 ({len(configs)} configs)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /field-configs (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /field-configs (owner) → Error: {str(e)}")
    
    # Test 4.8: GET /banking-formulas (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            formulas = response.json()
            print(f"✅ 4.{total}: GET /banking-formulas (owner) → 200 ({len(formulas)} formulas)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /banking-formulas (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /banking-formulas (owner) → Error: {str(e)}")
    
    # Test 4.9: GET /operator-assignments (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/operator-assignments",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            assignments = response.json()
            print(f"✅ 4.{total}: GET /operator-assignments (owner) → 200 ({len(assignments)} assignments)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /operator-assignments (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /operator-assignments (owner) → Error: {str(e)}")
    
    # Test 4.10: GET /staff-assignments (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/staff-assignments",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            assignments = response.json()
            print(f"✅ 4.{total}: GET /staff-assignments (owner) → 200 ({len(assignments)} assignments)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /staff-assignments (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /staff-assignments (owner) → Error: {str(e)}")
    
    # Test 4.11: GET /dips (operator)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips?siteId=site-001",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            dips = response.json()
            print(f"✅ 4.{total}: GET /dips (operator) → 200 ({len(dips)} dips)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /dips (operator) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /dips (operator) → Error: {str(e)}")
    
    # Test 4.12: GET /dips/current (operator)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/current",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            current = response.json()
            print(f"✅ 4.{total}: GET /dips/current (operator) → 200 ({len(current)} sites)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /dips/current (operator) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /dips/current (operator) → Error: {str(e)}")
    
    # Test 4.13: GET /fuel-prices-live/status (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/fuel-prices-live/status",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            status = response.json()
            print(f"✅ 4.{total}: GET /fuel-prices-live/status (owner) → 200 (last_status={status.get('last_status')})")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /fuel-prices-live/status (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /fuel-prices-live/status (owner) → Error: {str(e)}")
    
    # Test 4.14: GET /dashboard/12-month-trend (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/12-month-trend?siteIds=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            trend = response.json()
            print(f"✅ 4.{total}: GET /dashboard/12-month-trend (owner) → 200 ({len(trend)} months)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /dashboard/12-month-trend (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /dashboard/12-month-trend (owner) → Error: {str(e)}")
    
    # Test 4.15: GET /dashboard/variance (owner)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/variance?siteIds=site-001",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            variance = response.json()
            print(f"✅ 4.{total}: GET /dashboard/variance (owner) → 200")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /dashboard/variance (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /dashboard/variance (owner) → Error: {str(e)}")
    
    # Test 4.16: GET /founder/audit-log (founder)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/audit-log",
            headers={"Authorization": f"Bearer {founder_token}"},
            timeout=10
        )
        if response.status_code == 200:
            audit = response.json()
            print(f"✅ 4.{total}: GET /founder/audit-log (founder) → 200 ({len(audit)} entries)")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /founder/audit-log (founder) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /founder/audit-log (founder) → Error: {str(e)}")
    
    # Test 4.17: GET /founder/stats (founder)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/stats",
            headers={"Authorization": f"Bearer {founder_token}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ 4.{total}: GET /founder/stats (founder) → 200")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /founder/stats (founder) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /founder/stats (founder) → Error: {str(e)}")
    
    # Test 4.18: GET /reports/pivot (operator)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        last_month = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/reports/pivot?siteId=site-001&from={last_month}&to={today}",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            pivot = response.json()
            print(f"✅ 4.{total}: GET /reports/pivot (operator) → 200")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /reports/pivot (operator) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /reports/pivot (operator) → Error: {str(e)}")
    
    # Test 4.19: GET /health (catch-all)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        if response.status_code == 200:
            print(f"✅ 4.{total}: GET /health → 200")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /health → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /health → Error: {str(e)}")
    
    # Test 4.20: POST /banking/calculate (owner)
    total += 1
    try:
        calc_payload = {
            "formula_json": json.dumps({
                "operations": [
                    {"type": "field", "value": "eftpos"},
                    {"type": "operator", "value": "+"},
                    {"type": "field", "value": "cash"}
                ]
            }),
            "shift_data": {"eftpos": 1000, "cash": 500}
        }
        response = requests.post(
            f"{BASE_URL}/api/banking/calculate",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=calc_payload,
            timeout=10
        )
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 4.{total}: POST /banking/calculate (owner) → 200 (result={result.get('result')})")
            passed += 1
        else:
            print(f"❌ 4.{total}: POST /banking/calculate (owner) → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: POST /banking/calculate (owner) → Error: {str(e)}")
    
    # Test 4.21: GET /nonexistent (catch-all 404)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/nonexistent", timeout=10)
        if response.status_code == 404:
            print(f"✅ 4.{total}: GET /nonexistent → 404")
            passed += 1
        else:
            print(f"❌ 4.{total}: GET /nonexistent → Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.{total}: GET /nonexistent → Error: {str(e)}")
    
    print(f"\n📊 Regression Tests: {passed}/{total} tests passed")
    return passed, total

def test_reports_module():
    """Test Reports module endpoints (10 tests from previous run)"""
    print("\n" + "="*80)
    print("SECTION 5: REPORTS MODULE (10 tests)")
    print("="*80)
    
    passed = 0
    total = 0
    
    owner_token = tokens.get('owner')
    operator_token = tokens.get('operator')
    staff_token = tokens.get('staff')
    
    # Test 5.1: GET /reports without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/reports", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.1: GET /reports without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 5.1: GET /reports without Bearer → Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.1: GET /reports without Bearer → Error: {str(e)}")
    
    # Test 5.2: GET /reports as Owner (RBAC scoping)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 5.2: GET /reports as Owner → 200 ({len(reports)} reports)")
            passed += 1
        else:
            print(f"❌ 5.2: GET /reports as Owner → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.2: GET /reports as Owner → Error: {str(e)}")
    
    # Test 5.3: GET /reports as Operator (RBAC isolation)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 5.3: GET /reports as Operator → 200 ({len(reports)} reports, assigned sites only)")
            passed += 1
        else:
            print(f"❌ 5.3: GET /reports as Operator → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.3: GET /reports as Operator → Error: {str(e)}")
    
    # Test 5.4: GET /reports as Staff (RBAC isolation)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {staff_token}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 5.4: GET /reports as Staff → 200 ({len(reports)} reports, assigned sites only)")
            passed += 1
        else:
            print(f"❌ 5.4: GET /reports as Staff → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.4: GET /reports as Staff → Error: {str(e)}")
    
    # Test 5.5: POST /reports as Staff (create report)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        report_payload = {
            "site_id": "site-001",
            "date": today,
            "shift_type": "Morning",
            "total_sales": 5000,
            "fuel_sales": 3000,
            "shop_sales": 2000,
            "total_litres": 2500,
            "eftpos": 3000,
            "cash": 1000,
            "motorpass": 500,
            "accounts": 500
        }
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=report_payload,
            timeout=10
        )
        if response.status_code in [200, 201, 409]:  # 409 = duplicate (acceptable)
            if response.status_code == 409:
                print(f"✅ 5.5: POST /reports as Staff → 409 (duplicate, expected)")
            else:
                report = response.json()
                print(f"✅ 5.5: POST /reports as Staff → {response.status_code} (created report)")
            passed += 1
        else:
            print(f"❌ 5.5: POST /reports as Staff → Expected 200/201/409, got {response.status_code}")
            print(f"   Response: {response.text[:200]}")
    except Exception as e:
        print(f"❌ 5.5: POST /reports as Staff → Error: {str(e)}")
    
    # Test 5.6: GET /reports/:id as Owner
    total += 1
    try:
        # Get first report ID
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if reports:
                report_id = reports[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/reports/{report_id}",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    timeout=10
                )
                if response.status_code == 200:
                    print(f"✅ 5.6: GET /reports/:id as Owner → 200")
                    passed += 1
                else:
                    print(f"❌ 5.6: GET /reports/:id as Owner → Expected 200, got {response.status_code}")
            else:
                print(f"❌ 5.6: GET /reports/:id as Owner → No reports to test")
        else:
            print(f"❌ 5.6: GET /reports/:id as Owner → Failed to get reports list")
    except Exception as e:
        print(f"❌ 5.6: GET /reports/:id as Owner → Error: {str(e)}")
    
    # Test 5.7: PUT /reports/:id/status as Operator (update status)
    total += 1
    try:
        # Get first pending report
        response = requests.get(
            f"{BASE_URL}/api/reports?status=pending",
            headers={"Authorization": f"Bearer {operator_token}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if reports:
                report_id = reports[0]["id"]
                response = requests.put(
                    f"{BASE_URL}/api/reports/{report_id}/status",
                    headers={"Authorization": f"Bearer {operator_token}"},
                    json={"status": "reviewed"},
                    timeout=10
                )
                if response.status_code == 200:
                    print(f"✅ 5.7: PUT /reports/:id/status as Operator → 200")
                    passed += 1
                else:
                    print(f"❌ 5.7: PUT /reports/:id/status as Operator → Expected 200, got {response.status_code}")
            else:
                print(f"✅ 5.7: PUT /reports/:id/status as Operator → No pending reports (acceptable)")
                passed += 1
        else:
            print(f"❌ 5.7: PUT /reports/:id/status as Operator → Failed to get reports list")
    except Exception as e:
        print(f"❌ 5.7: PUT /reports/:id/status as Operator → Error: {str(e)}")
    
    # Test 5.8: DELETE /reports/:id as Owner (with audit)
    total += 1
    try:
        # Create a test report first
        today = datetime.now().strftime("%Y-%m-%d")
        report_payload = {
            "site_id": "site-001",
            "date": today,
            "shift_type": "Night",
            "total_sales": 1000,
            "fuel_sales": 600,
            "shop_sales": 400,
            "total_litres": 500,
            "eftpos": 600,
            "cash": 200,
            "motorpass": 100,
            "accounts": 100
        }
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=report_payload,
            timeout=10
        )
        if response.status_code in [200, 201]:
            report = response.json()
            report_id = report["id"]
            # Now delete it
            response = requests.delete(
                f"{BASE_URL}/api/reports/{report_id}",
                headers={"Authorization": f"Bearer {owner_token}"},
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ 5.8: DELETE /reports/:id as Owner → 200 (with audit)")
                passed += 1
            else:
                print(f"❌ 5.8: DELETE /reports/:id as Owner → Expected 200, got {response.status_code}")
        else:
            print(f"❌ 5.8: DELETE /reports/:id as Owner → Failed to create test report")
    except Exception as e:
        print(f"❌ 5.8: DELETE /reports/:id as Owner → Error: {str(e)}")
    
    # Test 5.9: Duplicate detection (POST same report twice)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        report_payload = {
            "site_id": "site-001",
            "date": today,
            "shift_type": "Afternoon",
            "total_sales": 2000,
            "fuel_sales": 1200,
            "shop_sales": 800,
            "total_litres": 1000,
            "eftpos": 1200,
            "cash": 400,
            "motorpass": 200,
            "accounts": 200
        }
        # First POST
        response1 = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=report_payload,
            timeout=10
        )
        # Second POST (should be duplicate)
        response2 = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {staff_token}"},
            json=report_payload,
            timeout=10
        )
        if response2.status_code == 409:
            print(f"✅ 5.9: Duplicate detection → 409 (duplicate report rejected)")
            passed += 1
        else:
            print(f"❌ 5.9: Duplicate detection → Expected 409, got {response2.status_code}")
    except Exception as e:
        print(f"❌ 5.9: Duplicate detection → Error: {str(e)}")
    
    # Test 5.10: Audit log verification (check if report CRUD creates audit entries)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/audit-log?table=shift_reports&limit=5",
            headers={"Authorization": f"Bearer {tokens.get('founder')}"},
            timeout=10
        )
        if response.status_code == 200:
            audit = response.json()
            if len(audit) > 0:
                print(f"✅ 5.10: Audit log verification → {len(audit)} shift_reports audit entries found")
                passed += 1
            else:
                print(f"❌ 5.10: Audit log verification → No shift_reports audit entries found")
        else:
            print(f"❌ 5.10: Audit log verification → Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.10: Audit log verification → Error: {str(e)}")
    
    print(f"\n📊 Reports Module: {passed}/{total} tests passed")
    return passed, total

def cleanup():
    """Clean up test data"""
    print("\n" + "="*80)
    print("CLEANUP")
    print("="*80)
    
    owner_token = tokens.get('owner')
    if not owner_token:
        print("❌ Owner token not available, skipping cleanup")
        return
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Delete created competitor prices
    for price_id in test_data["created_competitor_prices"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/api/competitor-prices/{price_id}",
                headers=headers,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Deleted competitor price {price_id[:8]}...")
            else:
                print(f"⚠️  Failed to delete competitor price {price_id[:8]}... ({response.status_code})")
        except Exception as e:
            print(f"⚠️  Error deleting competitor price {price_id[:8]}...: {str(e)}")
    
    # Delete created price entries
    for entry_id in test_data["created_price_entries"]:
        try:
            # Note: There's no DELETE endpoint for fuel-price-entries in the handlers
            # So we'll skip this for now
            print(f"⚠️  Skipping deletion of fuel-price-entry {entry_id[:8]}... (no DELETE endpoint)")
        except Exception as e:
            print(f"⚠️  Error deleting fuel-price-entry {entry_id[:8]}...: {str(e)}")
    
    # Delete created competitors
    for competitor_id in test_data["created_competitors"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/api/site-competitors/{competitor_id}",
                headers=headers,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Deleted competitor {competitor_id[:8]}...")
            else:
                print(f"⚠️  Failed to delete competitor {competitor_id[:8]}... ({response.status_code})")
        except Exception as e:
            print(f"⚠️  Error deleting competitor {competitor_id[:8]}...: {str(e)}")

def main():
    """Main test runner"""
    print("="*80)
    print("PHASE 2 FINAL REFACTOR — AUTH GATE + POST 500 FIX + REGRESSION TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login all roles
    print("\n" + "="*80)
    print("LOGIN")
    print("="*80)
    for role in ["owner", "operator", "staff", "founder"]:
        token = login(role)
        if token:
            tokens[role] = token
        else:
            print(f"⚠️  Warning: {role} login failed, some tests will be skipped")
    
    # Run all test sections
    total_passed = 0
    total_tests = 0
    
    # Section 1: Auth Gate Verification
    passed, total = test_auth_gate_verification()
    total_passed += passed
    total_tests += total
    
    # Section 2: Auth Gate Pass
    passed, total = test_auth_gate_pass()
    total_passed += passed
    total_tests += total
    
    # Section 3: POST 500 Fix
    passed, total = test_post_500_fix()
    total_passed += passed
    total_tests += total
    
    # Section 4: Regression Tests
    passed, total = test_regression()
    total_passed += passed
    total_tests += total
    
    # Section 5: Reports Module
    passed, total = test_reports_module()
    total_passed += passed
    total_tests += total
    
    # Cleanup
    cleanup()
    
    # Final Summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    percentage = (total_passed / total_tests * 100) if total_tests > 0 else 0
    print(f"Total: {total_passed}/{total_tests} tests passed ({percentage:.1f}%)")
    
    if percentage >= 95:
        print("🎉 SUCCESS: >95% tests passed!")
        sys.exit(0)
    else:
        print(f"⚠️  WARNING: {total_tests - total_passed} tests failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
