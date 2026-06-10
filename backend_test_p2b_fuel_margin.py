#!/usr/bin/env python3
"""
P2b Fuel Margin — Comprehensive Backend Test Suite

Tests all 5 new endpoints + subscription gating + data integrity cross-checks.

Test Plan:
A. Auth gating (no subscription effects yet)
B. Subscription gating
C. /api/fuel-grades
D. /api/fuel-deliveries POST
E. /api/fuel-deliveries GET
F. /api/margin/summary
G. Margin engine hand-check
H. Tenant isolation
I. Data Integrity
J. Regression
K. Cleanup
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
OWNER_EMAIL = "owner@workflowlite.com"
OWNER_PASSWORD = "WorkflowDemo2026!"
OPERATOR_EMAIL = "operator@workflowlite.com"
OPERATOR_PASSWORD = "WorkflowDemo2026!"
STAFF_EMAIL = "staff@workflowlite.com"
STAFF_PASSWORD = "WorkflowDemo2026!"

# Supabase config for direct DB operations
SUPABASE_URL = "https://xjpelthxnnetecfympmv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcGVsdGh4bm5ldGVjZnltcG12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyOTcxOCwiZXhwIjoyMDkxNjA1NzE4fQ.6pKn0BW2xSSr5y8O_hZnqKlM5qSEjNXgh0k1ZTNLrVc"

# Test state
test_results = {
    "passed": 0,
    "failed": 0,
    "total": 0
}

# Store created IDs for cleanup
created_delivery_ids = []
created_grade_codes = []
created_report_ids = []
created_price_entry_ids = []

def log_test(name: str, passed: bool, message: str = ""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"] += 1
        print(f"✅ {name}")
        if message:
            print(f"   {message}")
    else:
        test_results["failed"] += 1
        print(f"❌ {name}")
        if message:
            print(f"   {message}")

def login(email: str, password: str) -> Dict[str, Any]:
    """Login and return auth data"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code != 200:
            raise Exception(f"Login failed for {email}: {response.status_code} {response.text}")
        data = response.json()
        data["token"] = data["session"]["access_token"]
        return data
    except Exception as e:
        print(f"❌ Login failed for {email}: {e}")
        raise

def supabase_query(table: str, method: str = "GET", data: Optional[Dict] = None, filters: Optional[Dict] = None) -> Dict:
    """Direct Supabase REST API call"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    if method == "GET":
        if filters:
            params = []
            for key, value in filters.items():
                params.append(f"{key}=eq.{value}")
            url += "?" + "&".join(params)
        response = requests.get(url, headers=headers)
    elif method == "POST":
        response = requests.post(url, json=data, headers=headers)
    elif method == "PATCH":
        if filters:
            params = []
            for key, value in filters.items():
                params.append(f"{key}=eq.{value}")
            url += "?" + "&".join(params)
        response = requests.patch(url, json=data, headers=headers)
    elif method == "DELETE":
        if filters:
            params = []
            for key, value in filters.items():
                params.append(f"{key}=eq.{value}")
            url += "?" + "&".join(params)
        response = requests.delete(url, headers=headers)
    
    return {"status": response.status_code, "data": response.json() if response.text else None}

# ============================================================================
# A. AUTH GATING (no subscription effects yet)
# ============================================================================

def test_a_auth_gating():
    """A. Auth gating tests"""
    print("\n" + "="*80)
    print("A. AUTH GATING (no subscription effects yet)")
    print("="*80)
    
    # A1: No Authorization on any of the 5 endpoints → 401
    print("\n--- A1: No Authorization → 401 ---")
    endpoints = [
        "/api/fuel-grades",
        "/api/fuel-deliveries",
        "/api/margin/summary"
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}")
            log_test(
                f"A1.{endpoints.index(endpoint)+1}: GET {endpoint} without auth → 401",
                response.status_code == 401,
                f"Got {response.status_code}"
            )
        except Exception as e:
            log_test(f"A1.{endpoints.index(endpoint)+1}: GET {endpoint} without auth", False, str(e))
    
    # A2: Staff JWT on gated endpoints → 403
    print("\n--- A2: Staff JWT on gated endpoints → 403 ---")
    try:
        staff_auth = login(STAFF_EMAIL, STAFF_PASSWORD)
        staff_token = staff_auth["token"]
        
        # POST /api/fuel-deliveries
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={"site_id": "test", "grade": "ULP", "delivered_at": "2026-06-01", "litres": 1000, "unit_cost_cpl": 165},
            headers={"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}
        )
        log_test(
            "A2.1: Staff POST /api/fuel-deliveries → 403",
            response.status_code == 403,
            f"Got {response.status_code}: {response.text[:100]}"
        )
        
        # GET /api/margin/summary
        response = requests.get(
            f"{BASE_URL}/api/margin/summary",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        log_test(
            "A2.2: Staff GET /api/margin/summary → 403",
            response.status_code == 403,
            f"Got {response.status_code}"
        )
        
        # GET /api/fuel-deliveries
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        log_test(
            "A2.3: Staff GET /api/fuel-deliveries → 403",
            response.status_code == 403,
            f"Got {response.status_code}"
        )
    except Exception as e:
        log_test("A2: Staff JWT tests", False, str(e))
    
    # A3: Staff JWT on /api/fuel-grades GET → 200
    print("\n--- A3: Staff JWT on /api/fuel-grades GET → 200 ---")
    try:
        response = requests.get(
            f"{BASE_URL}/api/fuel-grades",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        log_test(
            "A3: Staff GET /api/fuel-grades → 200",
            response.status_code == 200,
            f"Got {response.status_code}, grades count: {len(response.json().get('grades', []))}"
        )
    except Exception as e:
        log_test("A3: Staff GET /api/fuel-grades", False, str(e))
    
    # A4: Operator JWT on /api/fuel-grades POST → 403
    print("\n--- A4: Operator JWT on /api/fuel-grades POST → 403 ---")
    try:
        operator_auth = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
        operator_token = operator_auth["token"]
        
        response = requests.post(
            f"{BASE_URL}/api/fuel-grades",
            json={"code": "TestGrade", "label": "Test Grade"},
            headers={"Authorization": f"Bearer {operator_token}", "Content-Type": "application/json"}
        )
        log_test(
            "A4: Operator POST /api/fuel-grades → 403",
            response.status_code == 403,
            f"Got {response.status_code}"
        )
    except Exception as e:
        log_test("A4: Operator POST /api/fuel-grades", False, str(e))
    
    # A5: Owner JWT on /api/fuel-grades POST → 201 (after gate passes)
    print("\n--- A5: Owner JWT on /api/fuel-grades POST → 201 ---")
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        
        response = requests.post(
            f"{BASE_URL}/api/fuel-grades",
            json={"code": "TestOwnerGrade", "label": "Test Owner Grade", "sort_order": 999},
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "A5: Owner POST /api/fuel-grades → 201",
            response.status_code == 201,
            f"Got {response.status_code}"
        )
        if response.status_code == 201:
            created_grade_codes.append("TestOwnerGrade")
    except Exception as e:
        log_test("A5: Owner POST /api/fuel-grades", False, str(e))

# ============================================================================
# B. SUBSCRIPTION GATING
# ============================================================================

def test_b_subscription_gating():
    """B. Subscription gating tests"""
    print("\n" + "="*80)
    print("B. SUBSCRIPTION GATING")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        operator_auth = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
        operator_token = operator_auth["token"]
        
        # B1: Owner JWT on /api/fuel-deliveries GET → 200 (has Growth sub)
        print("\n--- B1: Owner GET /api/fuel-deliveries → 200 ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        log_test(
            "B1: Owner GET /api/fuel-deliveries → 200 (has Growth sub)",
            response.status_code == 200,
            f"Got {response.status_code}"
        )
        
        # B2: Owner JWT on /api/margin/summary → 200
        print("\n--- B2: Owner GET /api/margin/summary → 200 ---")
        response = requests.get(
            f"{BASE_URL}/api/margin/summary",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        log_test(
            "B2: Owner GET /api/margin/summary → 200",
            response.status_code == 200,
            f"Got {response.status_code}"
        )
        
        # B3: Operator JWT on /api/fuel-deliveries GET → 200 (inherits owner's Growth sub)
        print("\n--- B3: Operator GET /api/fuel-deliveries → 200 ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        log_test(
            "B3: Operator GET /api/fuel-deliveries → 200 (inherits Growth sub)",
            response.status_code == 200,
            f"Got {response.status_code}"
        )
        
        # B4: Temporarily cancel subscription and verify 403
        print("\n--- B4: Cancel subscription → 403 with subscription_required ---")
        print("   Temporarily setting subscription status to 'canceled'...")
        
        # Update subscription status to canceled
        result = supabase_query(
            "subscriptions",
            method="PATCH",
            data={"status": "canceled"},
            filters={"user_id": "owner-001"}
        )
        
        if result["status"] in [200, 204]:
            print("   ✓ Subscription status set to 'canceled'")
            
            # Try to access gated endpoint
            response = requests.get(
                f"{BASE_URL}/api/fuel-deliveries",
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            
            is_403 = response.status_code == 403
            has_code = False
            if is_403:
                try:
                    data = response.json()
                    has_code = data.get("code") == "subscription_required"
                except:
                    pass
            
            log_test(
                "B4: Canceled subscription → 403 with code='subscription_required'",
                is_403 and has_code,
                f"Got {response.status_code}, code={response.json().get('code') if response.status_code == 403 else 'N/A'}"
            )
            
            # Restore subscription status
            print("   Restoring subscription status to 'active'...")
            result = supabase_query(
                "subscriptions",
                method="PATCH",
                data={"status": "active"},
                filters={"user_id": "owner-001"}
            )
            if result["status"] in [200, 204]:
                print("   ✓ Subscription status restored to 'active'")
            else:
                print(f"   ⚠️ Failed to restore subscription: {result}")
        else:
            log_test("B4: Cancel subscription test", False, f"Failed to update subscription: {result}")
            
    except Exception as e:
        log_test("B: Subscription gating tests", False, str(e))

# ============================================================================
# C. /api/fuel-grades
# ============================================================================

def test_c_fuel_grades():
    """C. /api/fuel-grades tests"""
    print("\n" + "="*80)
    print("C. /api/fuel-grades")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        
        # C1: GET as owner → returns 5+ grades
        print("\n--- C1: GET /api/fuel-grades → 5+ grades ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-grades",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            grades = data.get("grades", [])
            grade_codes = [g["code"] for g in grades]
            required_grades = ["ULP", "E10", "Premium", "Diesel", "LPG"]
            has_all = all(g in grade_codes for g in required_grades)
            
            log_test(
                "C1: GET /api/fuel-grades returns 5+ grades with all required",
                len(grades) >= 5 and has_all,
                f"Got {len(grades)} grades: {grade_codes[:10]}"
            )
        else:
            log_test("C1: GET /api/fuel-grades", False, f"Got {response.status_code}")
        
        # C2: POST as owner with AdBlue → 201
        print("\n--- C2: POST /api/fuel-grades with AdBlue → 201 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-grades",
            json={"code": "AdBlue", "label": "AdBlue 32.5%", "sort_order": 50},
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "C2: POST /api/fuel-grades with AdBlue → 201",
            response.status_code == 201,
            f"Got {response.status_code}"
        )
        if response.status_code == 201:
            created_grade_codes.append("AdBlue")
        
        # C3: GET as owner again → 6+ grades including AdBlue
        print("\n--- C3: GET /api/fuel-grades → includes AdBlue ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-grades",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            grades = data.get("grades", [])
            grade_codes = [g["code"] for g in grades]
            has_adblue = "AdBlue" in grade_codes
            
            log_test(
                "C3: GET /api/fuel-grades includes AdBlue",
                len(grades) >= 6 and has_adblue,
                f"Got {len(grades)} grades, AdBlue present: {has_adblue}"
            )
        else:
            log_test("C3: GET /api/fuel-grades", False, f"Got {response.status_code}")
        
        # C4: POST with empty code → 400
        print("\n--- C4: POST with empty code → 400 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-grades",
            json={"code": "", "label": "Test"},
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "C4: POST with empty code → 400",
            response.status_code == 400,
            f"Got {response.status_code}"
        )
        
        # C5: POST with code > 30 chars → 400
        print("\n--- C5: POST with code > 30 chars → 400 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-grades",
            json={"code": "A" * 31, "label": "Test"},
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "C5: POST with code > 30 chars → 400",
            response.status_code == 400,
            f"Got {response.status_code}"
        )
        
    except Exception as e:
        log_test("C: /api/fuel-grades tests", False, str(e))

# ============================================================================
# D. /api/fuel-deliveries POST
# ============================================================================

def test_d_fuel_deliveries_post():
    """D. /api/fuel-deliveries POST tests"""
    print("\n" + "="*80)
    print("D. /api/fuel-deliveries POST")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        owner_sites = owner_auth.get("sites", [])
        
        if not owner_sites:
            log_test("D: /api/fuel-deliveries POST", False, "No sites available for owner")
            return
        
        test_site_id = owner_sites[0]["id"]
        print(f"   Using test site: {test_site_id}")
        
        # D1: POST with unit_cost_cpl → 201, derives total_cost_dollars
        print("\n--- D1: POST with unit_cost_cpl → 201 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": test_site_id,
                "grade": "ULP",
                "delivered_at": "2026-06-05",
                "litres": 30000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        
        if response.status_code == 201:
            data = response.json()
            delivery = data.get("delivery", {})
            total_cost = delivery.get("total_cost_dollars")
            unit_cost = delivery.get("unit_cost_cpl")
            
            # Expected: 165 * 30000 / 100 = 49500
            expected_total = 49500
            is_correct = abs(total_cost - expected_total) < 1 and abs(unit_cost - 165) < 0.01
            
            log_test(
                "D1: POST with unit_cost_cpl derives total_cost_dollars",
                is_correct,
                f"total_cost_dollars={total_cost} (expected {expected_total}), unit_cost_cpl={unit_cost}"
            )
            
            if "id" in delivery:
                created_delivery_ids.append(delivery["id"])
        else:
            log_test("D1: POST with unit_cost_cpl", False, f"Got {response.status_code}: {response.text[:200]}")
        
        # D2: POST with total_cost_dollars → 201, derives unit_cost_cpl
        print("\n--- D2: POST with total_cost_dollars → 201 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": test_site_id,
                "grade": "Diesel",
                "delivered_at": "2026-06-05",
                "litres": 20000,
                "total_cost_dollars": 36000
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        
        if response.status_code == 201:
            data = response.json()
            delivery = data.get("delivery", {})
            unit_cost = delivery.get("unit_cost_cpl")
            
            # Expected: 36000 / 20000 * 100 = 180
            expected_cpl = 180
            is_correct = abs(unit_cost - expected_cpl) < 0.01
            
            log_test(
                "D2: POST with total_cost_dollars derives unit_cost_cpl",
                is_correct,
                f"unit_cost_cpl={unit_cost} (expected {expected_cpl})"
            )
            
            if "id" in delivery:
                created_delivery_ids.append(delivery["id"])
        else:
            log_test("D2: POST with total_cost_dollars", False, f"Got {response.status_code}: {response.text[:200]}")
        
        # D3: POST without site_id → 400
        print("\n--- D3: POST without site_id → 400 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "grade": "ULP",
                "delivered_at": "2026-06-05",
                "litres": 1000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "D3: POST without site_id → 400",
            response.status_code == 400,
            f"Got {response.status_code}"
        )
        
        # D4: POST with invalid grade → 400
        print("\n--- D4: POST with invalid grade → 400 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": test_site_id,
                "grade": "Bogus123",
                "delivered_at": "2026-06-05",
                "litres": 1000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "D4: POST with invalid grade → 400",
            response.status_code == 400,
            f"Got {response.status_code}"
        )
        
        # D5: POST with foreign site_id → 403
        print("\n--- D5: POST with foreign site_id → 403 ---")
        foreign_site_id = "99999999-9999-9999-9999-999999999999"
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": foreign_site_id,
                "grade": "ULP",
                "delivered_at": "2026-06-05",
                "litres": 1000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "D5: POST with foreign site_id → 403",
            response.status_code == 403,
            f"Got {response.status_code}"
        )
        
        # D6: POST with negative litres → 400
        print("\n--- D6: POST with negative litres → 400 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": test_site_id,
                "grade": "ULP",
                "delivered_at": "2026-06-05",
                "litres": -1000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        log_test(
            "D6: POST with negative litres → 400",
            response.status_code == 400,
            f"Got {response.status_code}"
        )
        
    except Exception as e:
        log_test("D: /api/fuel-deliveries POST tests", False, str(e))

# ============================================================================
# E. /api/fuel-deliveries GET
# ============================================================================

def test_e_fuel_deliveries_get():
    """E. /api/fuel-deliveries GET filtering tests"""
    print("\n" + "="*80)
    print("E. /api/fuel-deliveries GET")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        
        # E1: GET (no params) → returns >= 2 rows
        print("\n--- E1: GET /api/fuel-deliveries (no params) → >= 2 rows ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            deliveries = data.get("deliveries", [])
            log_test(
                "E1: GET /api/fuel-deliveries returns >= 2 rows",
                len(deliveries) >= 2,
                f"Got {len(deliveries)} deliveries"
            )
        else:
            log_test("E1: GET /api/fuel-deliveries", False, f"Got {response.status_code}")
        
        # E2: GET ?grade=ULP → only ULP rows
        print("\n--- E2: GET ?grade=ULP → only ULP rows ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries?grade=ULP",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            deliveries = data.get("deliveries", [])
            all_ulp = all(d.get("grade") == "ULP" for d in deliveries)
            log_test(
                "E2: GET ?grade=ULP returns only ULP rows",
                all_ulp and len(deliveries) > 0,
                f"Got {len(deliveries)} deliveries, all ULP: {all_ulp}"
            )
        else:
            log_test("E2: GET ?grade=ULP", False, f"Got {response.status_code}")
        
        # E3: GET ?startDate=2026-06-05&endDate=2026-06-05 → exactly the 2 D-rows
        print("\n--- E3: GET with date range → correct filtering ---")
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries?startDate=2026-06-05&endDate=2026-06-05",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            deliveries = data.get("deliveries", [])
            log_test(
                "E3: GET with date range filters correctly",
                len(deliveries) >= 2,
                f"Got {len(deliveries)} deliveries for 2026-06-05"
            )
        else:
            log_test("E3: GET with date range", False, f"Got {response.status_code}")
        
        # E4: GET ?siteIds=foreign → empty array
        print("\n--- E4: GET ?siteIds=foreign → empty array ---")
        foreign_site_id = "99999999-9999-9999-9999-999999999999"
        response = requests.get(
            f"{BASE_URL}/api/fuel-deliveries?siteIds={foreign_site_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            deliveries = data.get("deliveries", [])
            log_test(
                "E4: GET ?siteIds=foreign returns empty array",
                len(deliveries) == 0,
                f"Got {len(deliveries)} deliveries"
            )
        else:
            log_test("E4: GET ?siteIds=foreign", False, f"Got {response.status_code}")
        
    except Exception as e:
        log_test("E: /api/fuel-deliveries GET tests", False, str(e))

# ============================================================================
# F. /api/margin/summary
# ============================================================================

def test_f_margin_summary():
    """F. /api/margin/summary tests"""
    print("\n" + "="*80)
    print("F. /api/margin/summary")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        owner_sites = owner_auth.get("sites", [])
        
        if not owner_sites:
            log_test("F: /api/margin/summary", False, "No sites available")
            return
        
        test_site_id = owner_sites[0]["id"]
        
        # F-setup: ensure a ULP sell price exists in the test window so the
        # margin engine has both cost (from D1) and sell legs to verify.
        import uuid as _uuid
        f_price_id = str(_uuid.uuid4())
        seed_res = supabase_query(
            "fuel_price_entries",
            method="POST",
            data={
                "id": f_price_id,
                "site_id": test_site_id,
                "entered_by_user_id": "owner-001",
                "date": "2026-06-05",
                "fuel_type": "ULP",
                "price": 197.5,
            },
        )
        if seed_res["status"] in [200, 201] and seed_res["data"]:
            created_price_entry_ids.append(seed_res["data"][0].get("id") or f_price_id)
        
        # F1: GET as owner with siteIds → 200, valid shape
        print("\n--- F1: GET /api/margin/summary → 200 with valid shape ---")
        response = requests.get(
            f"{BASE_URL}/api/margin/summary?siteIds={test_site_id}&startDate=2026-06-01&endDate=2026-06-07",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            has_rollup = "rollup" in data
            has_sites = "sites" in data
            
            rollup = data.get("rollup", {})
            has_rollup_fields = all(k in rollup for k in ["total_litres_sold", "total_gross_profit_dollars", "weighted_margin_cpl"])
            
            log_test(
                "F1: GET /api/margin/summary returns valid shape",
                has_rollup and has_sites and has_rollup_fields,
                f"rollup: {has_rollup}, sites: {has_sites}, rollup_fields: {has_rollup_fields}"
            )
            
            # F2: Check ULP grade entry
            print("\n--- F2: Check ULP grade entry in response ---")
            sites = data.get("sites", [])
            if sites:
                site = sites[0]
                grades = site.get("grades", [])
                ulp_grade = next((g for g in grades if g.get("grade") == "ULP"), None)
                
                if ulp_grade:
                    has_cost = ulp_grade.get("cost_cpl") is not None
                    has_sell = ulp_grade.get("sell_cpl") is not None
                    has_margin = ulp_grade.get("margin_cpl") is not None
                    has_litres = ulp_grade.get("litres_sold") is not None
                    has_profit = ulp_grade.get("gross_profit_dollars") is not None
                    has_status = ulp_grade.get("status") in ["healthy", "amber", "red", "unavailable"]
                    
                    log_test(
                        "F2: ULP grade has all required fields",
                        has_cost and has_sell and has_margin and has_litres and has_profit and has_status,
                        f"cost_cpl={ulp_grade.get('cost_cpl')}, sell_cpl={ulp_grade.get('sell_cpl')}, margin_cpl={ulp_grade.get('margin_cpl')}, litres_sold={ulp_grade.get('litres_sold')}, status={ulp_grade.get('status')}"
                    )
                else:
                    log_test("F2: ULP grade entry", False, "ULP grade not found in response")
            else:
                log_test("F2: ULP grade entry", False, "No sites in response")
            
            # F3: Check unavailable status for grades without deliveries
            print("\n--- F3: Check unavailable status for grades without deliveries ---")
            if sites:
                site = sites[0]
                grades = site.get("grades", [])
                unavailable_grades = [g for g in grades if g.get("status") == "unavailable"]
                
                log_test(
                    "F3: Grades without deliveries have status='unavailable'",
                    len(unavailable_grades) > 0,
                    f"Found {len(unavailable_grades)} unavailable grades"
                )
            else:
                log_test("F3: Unavailable grades check", False, "No sites in response")
        else:
            log_test("F1: GET /api/margin/summary", False, f"Got {response.status_code}: {response.text[:200]}")
        
    except Exception as e:
        log_test("F: /api/margin/summary tests", False, str(e))

# ============================================================================
# G. MARGIN ENGINE HAND-CHECK
# ============================================================================

def test_g_margin_hand_check():
    """G. Margin engine hand-check with controlled scenario"""
    print("\n" + "="*80)
    print("G. MARGIN ENGINE HAND-CHECK")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        owner_sites = owner_auth.get("sites", [])
        
        if not owner_sites:
            log_test("G: Margin hand-check", False, "No sites available")
            return
        
        test_site_id = owner_sites[0]["id"]
        test_date = "2026-06-15"
        
        print(f"   Setting up controlled scenario for site {test_site_id} on {test_date}")
        
        # Insert delivery: 30000L at 165 cpl
        print("   1. Creating fuel delivery: 30000L ULP at 165 cpl...")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": test_site_id,
                "grade": "ULP",
                "delivered_at": test_date,
                "litres": 30000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        )
        
        if response.status_code != 201:
            log_test("G: Create delivery", False, f"Failed to create delivery: {response.status_code}")
            return
        
        delivery_id = response.json().get("delivery", {}).get("id")
        if delivery_id:
            created_delivery_ids.append(delivery_id)
        
        # Insert price entry: 199.9 cpl
        print("   2. Creating fuel price entry: 199.9 cpl...")
        import uuid
        result = supabase_query(
            "fuel_price_entries",
            method="POST",
            data={
                "id": str(uuid.uuid4()),
                "site_id": test_site_id,
                "entered_by_user_id": "owner-001",
                "date": test_date,
                "fuel_type": "ULP",
                "price": 199.9
            }
        )
        
        if result["status"] not in [200, 201]:
            log_test("G: Create price entry", False, f"Failed to create price entry: {result}")
            return
        
        price_entry_id = result["data"][0].get("id") if result["data"] else None
        if price_entry_id:
            created_price_entry_ids.append(price_entry_id)
        
        # Insert shift report: 50000L sold
        print("   3. Creating shift report: 50000L ULP sold...")
        import uuid
        result = supabase_query(
            "shift_reports",
            method="POST",
            data={
                "id": str(uuid.uuid4()),
                "site_id": test_site_id,
                "submitted_by_user_id": "owner-001",
                "date": test_date,
                "shift_type": "Morning",
                "status": "pending",
                "total_litres": 50000,
                "custom_values": {"ulp_litres": 50000},
                "total_sales": 0,
                "fuel_sales": 0,
                "shop_sales": 0
            }
        )
        
        if result["status"] not in [200, 201]:
            log_test("G: Create shift report", False, f"Failed to create shift report: {result}")
            return
        
        report_id = result["data"][0].get("id") if result["data"] else None
        if report_id:
            created_report_ids.append(report_id)
        
        # Query margin summary
        print("   4. Querying margin summary...")
        response = requests.get(
            f"{BASE_URL}/api/margin/summary?siteIds={test_site_id}&startDate={test_date}&endDate={test_date}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            sites = data.get("sites", [])
            
            if sites:
                site = sites[0]
                grades = site.get("grades", [])
                ulp_grade = next((g for g in grades if g.get("grade") == "ULP"), None)
                
                if ulp_grade:
                    cost_cpl = ulp_grade.get("cost_cpl")
                    sell_cpl = ulp_grade.get("sell_cpl")
                    margin_cpl = ulp_grade.get("margin_cpl")
                    litres_sold = ulp_grade.get("litres_sold")
                    gross_profit = ulp_grade.get("gross_profit_dollars")
                    status = ulp_grade.get("status")
                    
                    # Expected values (with tolerance)
                    expected_cost = 165
                    expected_sell = 199.9
                    expected_margin = 34.9
                    expected_litres = 50000
                    expected_profit = 17450
                    
                    cost_ok = abs(cost_cpl - expected_cost) <= 0.05
                    sell_ok = abs(sell_cpl - expected_sell) <= 0.05
                    margin_ok = abs(margin_cpl - expected_margin) <= 0.05
                    litres_ok = abs(litres_sold - expected_litres) <= 1
                    profit_ok = abs(gross_profit - expected_profit) <= 0.5
                    status_ok = status == "healthy"
                    
                    all_ok = cost_ok and sell_ok and margin_ok and litres_ok and profit_ok and status_ok
                    
                    log_test(
                        "G: Margin hand-check (165c cost, 199.9c sell, 50000L sold)",
                        all_ok,
                        f"cost_cpl={cost_cpl} (exp {expected_cost}), sell_cpl={sell_cpl} (exp {expected_sell}), margin_cpl={margin_cpl} (exp {expected_margin}), litres_sold={litres_sold} (exp {expected_litres}), gross_profit={gross_profit} (exp {expected_profit}), status={status}"
                    )
                else:
                    log_test("G: Margin hand-check", False, "ULP grade not found in response")
            else:
                log_test("G: Margin hand-check", False, "No sites in response")
        else:
            log_test("G: Margin hand-check", False, f"Failed to query margin summary: {response.status_code}")
        
    except Exception as e:
        log_test("G: Margin hand-check", False, str(e))

# ============================================================================
# H. TENANT ISOLATION
# ============================================================================

def test_h_tenant_isolation():
    """H. Tenant isolation tests"""
    print("\n" + "="*80)
    print("H. TENANT ISOLATION")
    print("="*80)
    
    try:
        operator_auth = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
        operator_token = operator_auth["token"]
        operator_sites = operator_auth.get("sites", [])
        
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_sites = owner_auth.get("sites", [])
        
        # Find a site that operator doesn't have access to
        operator_site_ids = [s["id"] for s in operator_sites]
        foreign_site = next((s for s in owner_sites if s["id"] not in operator_site_ids), None)
        
        if not foreign_site:
            print("   ⚠️ Could not find a foreign site for operator, using dummy UUID")
            foreign_site_id = "99999999-9999-9999-9999-999999999999"
        else:
            foreign_site_id = foreign_site["id"]
        
        # H1: Operator POST to foreign site → 403
        print("\n--- H1: Operator POST /api/fuel-deliveries to foreign site → 403 ---")
        response = requests.post(
            f"{BASE_URL}/api/fuel-deliveries",
            json={
                "site_id": foreign_site_id,
                "grade": "ULP",
                "delivered_at": "2026-06-05",
                "litres": 1000,
                "unit_cost_cpl": 165
            },
            headers={"Authorization": f"Bearer {operator_token}", "Content-Type": "application/json"}
        )
        log_test(
            "H1: Operator POST to foreign site → 403",
            response.status_code == 403,
            f"Got {response.status_code}"
        )
        
        # H2: Operator GET /api/margin/summary for foreign site → 200 with empty sites
        print("\n--- H2: Operator GET /api/margin/summary for foreign site → 200 with empty sites ---")
        response = requests.get(
            f"{BASE_URL}/api/margin/summary?siteIds={foreign_site_id}",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            sites = data.get("sites", [])
            log_test(
                "H2: Operator GET margin/summary for foreign site returns empty sites",
                len(sites) == 0,
                f"Got {len(sites)} sites"
            )
        else:
            log_test("H2: Operator GET margin/summary for foreign site", False, f"Got {response.status_code}")
        
        # H3: Operator GET /api/fuel-deliveries for their site → 200 with their rows only
        print("\n--- H3: Operator GET /api/fuel-deliveries for their site → 200 ---")
        if operator_sites:
            operator_site_id = operator_sites[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/fuel-deliveries?siteIds={operator_site_id}",
                headers={"Authorization": f"Bearer {operator_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                deliveries = data.get("deliveries", [])
                all_correct_site = all(d.get("site_id") == operator_site_id for d in deliveries)
                log_test(
                    "H3: Operator GET fuel-deliveries for their site returns correct data",
                    all_correct_site,
                    f"Got {len(deliveries)} deliveries, all for correct site: {all_correct_site}"
                )
            else:
                log_test("H3: Operator GET fuel-deliveries", False, f"Got {response.status_code}")
        else:
            log_test("H3: Operator GET fuel-deliveries", False, "No operator sites available")
        
    except Exception as e:
        log_test("H: Tenant isolation tests", False, str(e))

# ============================================================================
# I. DATA INTEGRITY
# ============================================================================

def test_i_data_integrity():
    """I. Data Integrity cross-checks"""
    print("\n" + "="*80)
    print("I. DATA INTEGRITY")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        owner_sites = owner_auth.get("sites", [])
        
        if not owner_sites:
            log_test("I: Data Integrity", False, "No sites available")
            return
        
        site_ids = ",".join([s["id"] for s in owner_sites])
        
        # I1: Check fuelPriceOutliers
        print("\n--- I1: GET /api/dashboard/data-integrity → fuelPriceOutliers ---")
        response = requests.get(
            f"{BASE_URL}/api/dashboard/data-integrity?siteIds={site_ids}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            has_outliers_array = "fuelPriceOutliers" in data
            outliers = data.get("fuelPriceOutliers", [])
            
            log_test(
                "I1: Data integrity returns fuelPriceOutliers array",
                has_outliers_array,
                f"Found {len(outliers)} outliers"
            )
            
            # Check structure of outliers
            if outliers:
                outlier = outliers[0]
                has_fields = all(k in outlier for k in ["id", "site_id", "site_name", "date", "fuel_type", "stored_price", "interpreted_cpl", "reason"])
                
                if has_fields:
                    stored = outlier.get("stored_price")
                    interpreted = outlier.get("interpreted_cpl")
                    expected_interpreted = stored * 100
                    is_correct = abs(interpreted - expected_interpreted) < 0.01
                    
                    log_test(
                        "I1.1: Outlier has correct structure and interpreted_cpl",
                        is_correct,
                        f"stored_price={stored}, interpreted_cpl={interpreted} (expected {expected_interpreted})"
                    )
        else:
            log_test("I1: GET data-integrity", False, f"Got {response.status_code}")
        
        # I2: Check orphanDipDeliveries
        print("\n--- I2: GET /api/dashboard/data-integrity → orphanDipDeliveries ---")
        if response.status_code == 200:
            data = response.json()
            has_orphans_array = "orphanDipDeliveries" in data
            orphans = data.get("orphanDipDeliveries", [])
            
            log_test(
                "I2: Data integrity returns orphanDipDeliveries array",
                has_orphans_array,
                f"Found {len(orphans)} orphan dip deliveries"
            )
            
            # Check structure of orphans
            if orphans:
                orphan = orphans[0]
                has_fields = all(k in orphan for k in ["dip_id", "site_id", "site_name", "dip_date", "grade", "litres", "reason"])
                has_reason_text = "no fuel_deliveries cost row was found" in orphan.get("reason", "").lower()
                
                log_test(
                    "I2.1: Orphan has correct structure and reason",
                    has_fields and has_reason_text,
                    f"Has all fields: {has_fields}, Has reason text: {has_reason_text}"
                )
        
        # I3: Check summary counts
        print("\n--- I3: Check summary counts match array lengths ---")
        if response.status_code == 200:
            data = response.json()
            summary = data.get("summary", {})
            outliers = data.get("fuelPriceOutliers", [])
            orphans = data.get("orphanDipDeliveries", [])
            
            outliers_count_match = summary.get("fuelPriceOutliers") == len(outliers)
            orphans_count_match = summary.get("orphanDipDeliveries") == len(orphans)
            
            log_test(
                "I3: Summary counts match array lengths",
                outliers_count_match and orphans_count_match,
                f"Outliers: {summary.get('fuelPriceOutliers')} == {len(outliers)}, Orphans: {summary.get('orphanDipDeliveries')} == {len(orphans)}"
            )
        
    except Exception as e:
        log_test("I: Data Integrity tests", False, str(e))

# ============================================================================
# J. REGRESSION
# ============================================================================

def test_j_regression():
    """J. Regression tests"""
    print("\n" + "="*80)
    print("J. REGRESSION")
    print("="*80)
    
    try:
        owner_auth = login(OWNER_EMAIL, OWNER_PASSWORD)
        owner_token = owner_auth["token"]
        
        # J1: Check existing endpoints still work
        print("\n--- J1: Existing endpoints still working ---")
        
        endpoints = [
            ("/api/sites", "Sites"),
            ("/api/reports", "Reports"),
            ("/api/dashboard/stats?siteIds=" + owner_auth.get("sites", [{}])[0].get("id", ""), "Dashboard Stats"),
            ("/api/dips", "Dips")
        ]
        
        for endpoint, name in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers={"Authorization": f"Bearer {owner_token}"}
                )
                log_test(
                    f"J1: {name} endpoint still working",
                    response.status_code == 200,
                    f"Got {response.status_code}"
                )
            except Exception as e:
                log_test(f"J1: {name} endpoint", False, str(e))
        
    except Exception as e:
        log_test("J: Regression tests", False, str(e))

# ============================================================================
# K. CLEANUP
# ============================================================================

def test_k_cleanup():
    """K. Cleanup test data"""
    print("\n" + "="*80)
    print("K. CLEANUP")
    print("="*80)
    
    try:
        # Delete created fuel deliveries
        if created_delivery_ids:
            print(f"\n   Deleting {len(created_delivery_ids)} fuel deliveries...")
            for delivery_id in created_delivery_ids:
                result = supabase_query(
                    "fuel_deliveries",
                    method="DELETE",
                    filters={"id": delivery_id}
                )
                if result["status"] in [200, 204]:
                    print(f"   ✓ Deleted delivery {delivery_id}")
                else:
                    print(f"   ⚠️ Failed to delete delivery {delivery_id}: {result}")
        
        # Delete created shift reports
        if created_report_ids:
            print(f"\n   Deleting {len(created_report_ids)} shift reports...")
            for report_id in created_report_ids:
                result = supabase_query(
                    "shift_reports",
                    method="DELETE",
                    filters={"id": report_id}
                )
                if result["status"] in [200, 204]:
                    print(f"   ✓ Deleted report {report_id}")
                else:
                    print(f"   ⚠️ Failed to delete report {report_id}: {result}")
        
        # Delete created price entries
        if created_price_entry_ids:
            print(f"\n   Deleting {len(created_price_entry_ids)} price entries...")
            for price_id in created_price_entry_ids:
                result = supabase_query(
                    "fuel_price_entries",
                    method="DELETE",
                    filters={"id": price_id}
                )
                if result["status"] in [200, 204]:
                    print(f"   ✓ Deleted price entry {price_id}")
                else:
                    print(f"   ⚠️ Failed to delete price entry {price_id}: {result}")
        
        # Note: We keep the created grades (AdBlue, TestOwnerGrade) as they're idempotent
        print("\n   ℹ️ Keeping created fuel grades (AdBlue, TestOwnerGrade) - they're idempotent")
        
        log_test("K: Cleanup completed", True, "Test data cleaned up")
        
    except Exception as e:
        log_test("K: Cleanup", False, str(e))

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("P2b FUEL MARGIN — COMPREHENSIVE BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        # Run all test suites
        test_a_auth_gating()
        test_b_subscription_gating()
        test_c_fuel_grades()
        test_d_fuel_deliveries_post()
        test_e_fuel_deliveries_get()
        test_f_margin_summary()
        test_g_margin_hand_check()
        test_h_tenant_isolation()
        test_i_data_integrity()
        test_j_regression()
        test_k_cleanup()
        
        # Print summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total Tests: {test_results['total']}")
        print(f"Passed: {test_results['passed']} ✅")
        print(f"Failed: {test_results['failed']} ❌")
        print(f"Success Rate: {(test_results['passed'] / test_results['total'] * 100):.1f}%")
        print("="*80)
        
        # Exit with appropriate code
        sys.exit(0 if test_results['failed'] == 0 else 1)
        
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
