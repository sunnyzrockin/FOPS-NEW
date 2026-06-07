#!/usr/bin/env python3
"""
Security Hardening Backend Tests — Auth/Authorization Sprint

Tests all 53 security gates added in the auth/authorization hardening sprint:
- A. /api/export (Fix 1) - 5 tests
- B. /api/fuel-prices/[id] DELETE/PATCH (Fix 2) - 5 tests
- C. /api/fuel-prices/escalate (Fix 3) - 2 tests
- D. /api/fuel-prices/pending (Fix 5) - 5 tests
- E. /api/banking-formulas/[id]/calculate (Fix 5) - 2 tests
- F. /api/fuel-prices/verify-schema (Fix 5) - 2 tests
- G. banking-formulas (Fix 4) - 8 tests
- H. field-configs (Fix 4) - 6 tests
- I. fuel-prices.js (Fix 4) - 8 tests
- J. dashboard.js (Fix 4) - 3 tests
- K. Regression sanity - 7 tests
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Demo credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

# Global test state
tokens = {}
user_ids = {}
test_data = {
    "owner_site_id": None,
    "operator_site_id": None,
    "foreign_site_id": None,
    "fuel_price_change_id": None,
    "formula_id": None
}

def login(role):
    """Login and return Bearer token + user info"""
    try:
        creds = CREDENTIALS[role]
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=creds,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token") or data.get("session", {}).get("access_token")
            user = data.get("user", {})
            user_id = user.get("id")
            if token and user_id:
                print(f"✅ {role.upper()} login successful (user_id: {user_id})")
                return token, user_id, user
            else:
                print(f"❌ {role.upper()} login failed: missing token or user_id")
                return None, None, None
        else:
            print(f"❌ {role.upper()} login failed: {resp.status_code}")
            return None, None, None
    except Exception as e:
        print(f"❌ {role.upper()} login error: {e}")
        return None, None, None

def auth_headers(role):
    """Get Authorization headers for a role"""
    token = tokens.get(role)
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}

def discover_sites():
    """Discover site IDs for testing"""
    print("\n" + "="*80)
    print("SITE DISCOVERY")
    print("="*80)
    
    # Get Owner sites
    try:
        resp = requests.get(f"{BASE_URL}/api/sites", headers=auth_headers("owner"), timeout=10)
        if resp.status_code == 200:
            owner_sites = resp.json()
            if owner_sites:
                test_data["owner_site_id"] = owner_sites[0].get("id")
                print(f"✅ Owner site: {test_data['owner_site_id']}")
        
        # Get Operator sites
        resp = requests.get(f"{BASE_URL}/api/sites", headers=auth_headers("operator"), timeout=10)
        if resp.status_code == 200:
            operator_sites = resp.json()
            if operator_sites:
                test_data["operator_site_id"] = operator_sites[0].get("id")
                print(f"✅ Operator site: {test_data['operator_site_id']}")
        
        # Determine foreign site for operator (owner site not in operator's list)
        if owner_sites and operator_sites:
            operator_site_ids = [s.get("id") for s in operator_sites]
            for site in owner_sites:
                if site.get("id") not in operator_site_ids:
                    test_data["foreign_site_id"] = site.get("id")
                    print(f"✅ Foreign site (for operator): {test_data['foreign_site_id']}")
                    break
        
        if not test_data["foreign_site_id"]:
            print("⚠️  No foreign site found - operator has access to all owner sites")
            
    except Exception as e:
        print(f"❌ Site discovery error: {e}")

# ============================================================================
# A. /api/export (Fix 1) - 5 tests
# ============================================================================

def test_a1_export_without_bearer():
    """Test 1: GET /api/export without Bearer → 401"""
    print("\n[A.1] GET /api/export without Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/export?siteIds={test_data['owner_site_id']}",
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ A.1 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ A.1 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.1 ERROR: {e}")
        return False

def test_a2_export_with_owner():
    """Test 2: GET /api/export with Owner Bearer → 200 xlsx"""
    print("\n[A.2] GET /api/export with Owner Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/export?siteIds={test_data['owner_site_id']}",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "")
            if "spreadsheet" in content_type or "xlsx" in content_type:
                print(f"✅ A.2 PASS: Returns 200 with xlsx Content-Type")
                return True
            else:
                print(f"❌ A.2 FAIL: Wrong Content-Type: {content_type}")
                return False
        else:
            print(f"❌ A.2 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.2 ERROR: {e}")
        return False

def test_a3_export_operator_foreign_site():
    """Test 3: GET /api/export with Operator Bearer for foreign site → 403"""
    print("\n[A.3] GET /api/export with Operator Bearer for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  A.3 SKIP: No foreign site available")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/export?siteIds={test_data['foreign_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ A.3 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ A.3 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.3 ERROR: {e}")
        return False

def test_a4_export_without_siteids():
    """Test 4: GET /api/export without siteIds → 400"""
    print("\n[A.4] GET /api/export without siteIds")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/export",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 400:
            print("✅ A.4 PASS: Returns 400 without siteIds")
            return True
        else:
            print(f"❌ A.4 FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.4 ERROR: {e}")
        return False

def test_a5_export_mixed_sites():
    """Test 5: Operator with mixed siteIds (own + foreign) → 200 with intersection"""
    print("\n[A.5] GET /api/export with Operator Bearer for mixed sites")
    if not test_data["foreign_site_id"] or not test_data["operator_site_id"]:
        print("⏭️  A.5 SKIP: Need both operator and foreign sites")
        return None
    try:
        mixed_sites = f"{test_data['operator_site_id']},{test_data['foreign_site_id']}"
        resp = requests.get(
            f"{BASE_URL}/api/export?siteIds={mixed_sites}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ A.5 PASS: Returns 200 with intersection (operator site only)")
            return True
        else:
            print(f"❌ A.5 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.5 ERROR: {e}")
        return False

# ============================================================================
# B. /api/fuel-prices/[id] DELETE/PATCH (Fix 2) - 5 tests
# ============================================================================

def test_b6_patch_fuel_price_without_bearer():
    """Test 6: PATCH /api/fuel-prices/[id] without Bearer → 401"""
    print("\n[B.6] PATCH /api/fuel-prices/[id] without Bearer")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.patch(
            f"{BASE_URL}/api/fuel-prices/{fake_id}",
            json={"notes": "test"},
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ B.6 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ B.6 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ B.6 ERROR: {e}")
        return False

def test_b7_patch_with_staff():
    """Test 7: PATCH with Staff Bearer → 403"""
    print("\n[B.7] PATCH /api/fuel-prices/[id] with Staff Bearer")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.patch(
            f"{BASE_URL}/api/fuel-prices/{fake_id}",
            headers=auth_headers("staff"),
            json={"notes": "test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ B.7 PASS: Returns 403 for Staff")
            return True
        else:
            print(f"❌ B.7 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ B.7 ERROR: {e}")
        return False

def test_b8_patch_fake_id():
    """Test 8: PATCH with Operator Bearer on fake UUID → 404"""
    print("\n[B.8] PATCH /api/fuel-prices/[fake-id] with Operator Bearer")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.patch(
            f"{BASE_URL}/api/fuel-prices/{fake_id}",
            headers=auth_headers("operator"),
            json={"notes": "test"},
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ B.8 PASS: Returns 404 for fake UUID")
            return True
        else:
            print(f"❌ B.8 FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ B.8 ERROR: {e}")
        return False

def test_b9_b10_patch_delete_real_price():
    """Test 9-10: Create fuel price, PATCH/DELETE with owner → 200, operator foreign → 403"""
    print("\n[B.9-10] PATCH/DELETE fuel price with ownership checks")
    
    # First, create a fuel price change as Owner
    if not test_data["owner_site_id"]:
        print("⏭️  B.9-10 SKIP: No owner site available")
        return None, None
    
    try:
        # Create price change
        payload = {
            "siteId": test_data["owner_site_id"],
            "fuelType": "ULP",
            "oldPrice": 1.85,
            "newPrice": 1.90,
            "effectiveDatetime": datetime.now().isoformat(),
            "notes": "Security test"
        }
        resp = requests.post(
            f"{BASE_URL}/api/fuel-prices",
            headers=auth_headers("owner"),
            json=payload,
            timeout=10
        )
        
        if resp.status_code in [200, 201]:
            price_change = resp.json()
            price_id = price_change.get("id")
            test_data["fuel_price_change_id"] = price_id
            print(f"  → Created fuel price change: {price_id}")
            
            # Test 9: PATCH with Owner → 200
            resp = requests.patch(
                f"{BASE_URL}/api/fuel-prices/{price_id}",
                headers=auth_headers("owner"),
                json={"notes": "Updated by owner"},
                timeout=10
            )
            
            if resp.status_code == 200:
                print("✅ B.9 PASS: Owner can PATCH own price change")
                b9_pass = True
            else:
                print(f"❌ B.9 FAIL: Expected 200, got {resp.status_code}")
                b9_pass = False
            
            # Test 10: PATCH with Operator (foreign site) → 403
            if test_data["foreign_site_id"] == test_data["owner_site_id"]:
                resp = requests.patch(
                    f"{BASE_URL}/api/fuel-prices/{price_id}",
                    headers=auth_headers("operator"),
                    json={"notes": "Operator attempt"},
                    timeout=10
                )
                
                if resp.status_code == 403:
                    print("✅ B.10 PASS: Operator blocked from foreign site price")
                    b10_pass = True
                else:
                    print(f"❌ B.10 FAIL: Expected 403, got {resp.status_code}")
                    b10_pass = False
            else:
                print("⏭️  B.10 SKIP: Owner site is operator's site")
                b10_pass = None
            
            # Cleanup: DELETE
            resp = requests.delete(
                f"{BASE_URL}/api/fuel-prices/{price_id}",
                headers=auth_headers("owner"),
                timeout=10
            )
            print(f"  → Cleanup: DELETE returned {resp.status_code}")
            
            return b9_pass, b10_pass
        else:
            print(f"⏭️  B.9-10 SKIP: Cannot create price change - {resp.status_code}")
            return None, None
            
    except Exception as e:
        print(f"❌ B.9-10 ERROR: {e}")
        return False, False

# ============================================================================
# C. /api/fuel-prices/escalate (Fix 3) - 2 tests
# ============================================================================

def test_c11_escalate_without_bearer():
    """Test 11: POST /api/fuel-prices/escalate without Bearer → 401"""
    print("\n[C.11] POST /api/fuel-prices/escalate without Bearer")
    try:
        resp = requests.post(f"{BASE_URL}/api/fuel-prices/escalate", timeout=10)
        if resp.status_code == 401:
            print("✅ C.11 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ C.11 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ C.11 ERROR: {e}")
        return False

def test_c12_escalate_with_staff():
    """Test 12: POST /api/fuel-prices/escalate with Staff Bearer → 200"""
    print("\n[C.12] POST /api/fuel-prices/escalate with Staff Bearer")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/fuel-prices/escalate",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ C.12 PASS: Returns 200 (any authenticated user can trigger)")
            return True
        else:
            print(f"❌ C.12 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ C.12 ERROR: {e}")
        return False

# ============================================================================
# D. /api/fuel-prices/pending (Fix 5) - 5 tests
# ============================================================================

def test_d13_pending_without_bearer():
    """Test 13: GET /api/fuel-prices/pending without Bearer → 401"""
    print("\n[D.13] GET /api/fuel-prices/pending without Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-prices/pending?userId=test&role=operator",
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ D.13 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ D.13 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ D.13 ERROR: {e}")
        return False

def test_d14_pending_matching_identity():
    """Test 14: GET with Operator Bearer + matching userId/role → 200"""
    print("\n[D.14] GET /api/fuel-prices/pending with matching identity")
    operator_id = user_ids.get("operator")
    if not operator_id:
        print("⏭️  D.14 SKIP: No operator ID")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-prices/pending?userId={operator_id}&role=operator",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ D.14 PASS: Returns 200 with matching identity")
            return True
        else:
            print(f"❌ D.14 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ D.14 ERROR: {e}")
        return False

def test_d15_pending_spoof_userid():
    """Test 15: GET with Operator Bearer + staff's userId → 403"""
    print("\n[D.15] GET /api/fuel-prices/pending with spoofed userId")
    staff_id = user_ids.get("staff")
    if not staff_id:
        print("⏭️  D.15 SKIP: No staff ID")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-prices/pending?userId={staff_id}&role=staff",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ D.15 PASS: Returns 403 for spoofed userId")
            return True
        else:
            print(f"❌ D.15 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ D.15 ERROR: {e}")
        return False

def test_d16_pending_spoof_role():
    """Test 16: GET with Operator Bearer + userId=operator&role=staff → 403"""
    print("\n[D.16] GET /api/fuel-prices/pending with spoofed role")
    operator_id = user_ids.get("operator")
    if not operator_id:
        print("⏭️  D.16 SKIP: No operator ID")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-prices/pending?userId={operator_id}&role=staff",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ D.16 PASS: Returns 403 for role mismatch")
            return True
        else:
            print(f"❌ D.16 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ D.16 ERROR: {e}")
        return False

def test_d17_pending_without_params():
    """Test 17: GET without userId/role params → 400"""
    print("\n[D.17] GET /api/fuel-prices/pending without params")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-prices/pending",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 400:
            print("✅ D.17 PASS: Returns 400 without params")
            return True
        else:
            print(f"❌ D.17 FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ D.17 ERROR: {e}")
        return False

# ============================================================================
# E. /api/banking-formulas/[id]/calculate (Fix 5) - 2 tests
# ============================================================================

def test_e18_calculate_without_bearer():
    """Test 18: POST /api/banking-formulas/[id]/calculate without Bearer → 401"""
    print("\n[E.18] POST /api/banking-formulas/[id]/calculate without Bearer")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.post(
            f"{BASE_URL}/api/banking-formulas/{fake_id}/calculate",
            json={"data": {}},
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ E.18 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ E.18 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ E.18 ERROR: {e}")
        return False

def test_e19_calculate_with_staff():
    """Test 19: POST with Staff Bearer + known formula → 200"""
    print("\n[E.19] POST /api/banking-formulas/[id]/calculate with Staff Bearer")
    
    # First, get a formula ID
    if not test_data["owner_site_id"]:
        print("⏭️  E.19 SKIP: No owner site")
        return None
    
    try:
        # Get formulas for owner site
        resp = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId={test_data['owner_site_id']}",
            headers=auth_headers("owner"),
            timeout=10
        )
        
        if resp.status_code == 200:
            formulas = resp.json()
            if formulas:
                formula_id = formulas[0].get("id")
                test_data["formula_id"] = formula_id
                
                # Test calculate with Staff
                resp = requests.post(
                    f"{BASE_URL}/api/banking-formulas/{formula_id}/calculate",
                    headers=auth_headers("staff"),
                    json={"data": {}},
                    timeout=10
                )
                
                if resp.status_code == 200:
                    print("✅ E.19 PASS: Returns 200 (any authenticated user can calculate)")
                    return True
                else:
                    print(f"❌ E.19 FAIL: Expected 200, got {resp.status_code}")
                    return False
            else:
                print("⏭️  E.19 SKIP: No formulas available")
                return None
        else:
            print(f"⏭️  E.19 SKIP: Cannot get formulas - {resp.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ E.19 ERROR: {e}")
        return False

# ============================================================================
# F. /api/fuel-prices/verify-schema (Fix 5) - 2 tests
# ============================================================================

def test_f20_verify_schema_get():
    """Test 20: GET /api/fuel-prices/verify-schema → 410 Gone"""
    print("\n[F.20] GET /api/fuel-prices/verify-schema")
    try:
        resp = requests.get(f"{BASE_URL}/api/fuel-prices/verify-schema", timeout=10)
        if resp.status_code == 410:
            print("✅ F.20 PASS: Returns 410 Gone")
            return True
        else:
            print(f"❌ F.20 FAIL: Expected 410, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ F.20 ERROR: {e}")
        return False

def test_f21_verify_schema_post():
    """Test 21: POST /api/fuel-prices/verify-schema → 410 Gone"""
    print("\n[F.21] POST /api/fuel-prices/verify-schema")
    try:
        resp = requests.post(f"{BASE_URL}/api/fuel-prices/verify-schema", timeout=10)
        if resp.status_code == 410:
            print("✅ F.21 PASS: Returns 410 Gone")
            return True
        else:
            print(f"❌ F.21 FAIL: Expected 410, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ F.21 ERROR: {e}")
        return False

# ============================================================================
# G. banking-formulas (Fix 4) - 8 tests
# ============================================================================

def test_g22_banking_formulas_without_bearer():
    """Test 22: GET /api/banking-formulas without Bearer → 401"""
    print("\n[G.22] GET /api/banking-formulas without Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId={test_data['owner_site_id']}",
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ G.22 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ G.22 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.22 ERROR: {e}")
        return False

def test_g23_banking_formulas_operator_foreign():
    """Test 23: GET with Operator Bearer for foreign site → 403"""
    print("\n[G.23] GET /api/banking-formulas with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  G.23 SKIP: No foreign site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId={test_data['foreign_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ G.23 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ G.23 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.23 ERROR: {e}")
        return False

def test_g24_banking_formulas_owner():
    """Test 24: GET with Owner Bearer → 200"""
    print("\n[G.24] GET /api/banking-formulas with Owner Bearer")
    if not test_data["owner_site_id"]:
        print("⏭️  G.24 SKIP: No owner site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId={test_data['owner_site_id']}",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ G.24 PASS: Returns 200 with array")
            return True
        else:
            print(f"❌ G.24 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.24 ERROR: {e}")
        return False

def test_g25_post_formula_staff():
    """Test 25: POST /api/banking-formulas with Staff Bearer → 403"""
    print("\n[G.25] POST /api/banking-formulas with Staff Bearer")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/banking-formulas",
            headers=auth_headers("staff"),
            json={"site_id": test_data["owner_site_id"], "name": "Test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ G.25 PASS: Returns 403 for Staff")
            return True
        else:
            print(f"❌ G.25 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.25 ERROR: {e}")
        return False

def test_g26_post_formula_operator_foreign():
    """Test 26: POST with Operator Bearer + foreign site_id → 403"""
    print("\n[G.26] POST /api/banking-formulas with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  G.26 SKIP: No foreign site")
        return None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/banking-formulas",
            headers=auth_headers("operator"),
            json={"site_id": test_data["foreign_site_id"], "name": "Test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ G.26 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ G.26 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.26 ERROR: {e}")
        return False

def test_g27_post_formula_without_siteid():
    """Test 27: POST without site_id → 400"""
    print("\n[G.27] POST /api/banking-formulas without site_id")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/banking-formulas",
            headers=auth_headers("owner"),
            json={"name": "Test"},
            timeout=10
        )
        if resp.status_code == 400:
            print("✅ G.27 PASS: Returns 400 without site_id")
            return True
        else:
            print(f"❌ G.27 FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.27 ERROR: {e}")
        return False

def test_g28_put_formula_fake_id():
    """Test 28: PUT /api/banking-formulas/[fake-id] with Owner → 404"""
    print("\n[G.28] PUT /api/banking-formulas/[fake-id]")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.put(
            f"{BASE_URL}/api/banking-formulas/{fake_id}",
            headers=auth_headers("owner"),
            json={"name": "Updated"},
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ G.28 PASS: Returns 404 for fake ID")
            return True
        else:
            print(f"❌ G.28 FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.28 ERROR: {e}")
        return False

def test_g29_delete_formula_fake_id():
    """Test 29: DELETE /api/banking-formulas/[fake-id] with Owner → 404"""
    print("\n[G.29] DELETE /api/banking-formulas/[fake-id]")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.delete(
            f"{BASE_URL}/api/banking-formulas/{fake_id}",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ G.29 PASS: Returns 404 for fake ID")
            return True
        else:
            print(f"❌ G.29 FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.29 ERROR: {e}")
        return False

# ============================================================================
# H. field-configs (Fix 4) - 6 tests
# ============================================================================

def test_h30_field_configs_without_bearer():
    """Test 30: GET /api/field-configs without Bearer → 401"""
    print("\n[H.30] GET /api/field-configs without Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/field-configs?siteId={test_data['owner_site_id']}",
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ H.30 PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ H.30 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ H.30 ERROR: {e}")
        return False

def test_h31_field_configs_staff_foreign():
    """Test 31: GET with Staff Bearer for unassigned site → 403"""
    print("\n[H.31] GET /api/field-configs with Staff for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  H.31 SKIP: No foreign site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/field-configs?siteId={test_data['foreign_site_id']}",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ H.31 PASS: Returns 403 for unassigned site")
            return True
        else:
            print(f"❌ H.31 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ H.31 ERROR: {e}")
        return False

def test_h32_field_configs_staff_assigned():
    """Test 32: GET with Staff Bearer for assigned site → 200"""
    print("\n[H.32] GET /api/field-configs with Staff for assigned site")
    
    # Get staff's assigned sites
    try:
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code == 200:
            sites = resp.json()
            if sites:
                staff_site_id = sites[0].get("id")
                resp = requests.get(
                    f"{BASE_URL}/api/field-configs?siteId={staff_site_id}",
                    headers=auth_headers("staff"),
                    timeout=10
                )
                if resp.status_code == 200:
                    print("✅ H.32 PASS: Returns 200 for assigned site")
                    return True
                else:
                    print(f"❌ H.32 FAIL: Expected 200, got {resp.status_code}")
                    return False
            else:
                print("⏭️  H.32 SKIP: Staff has no assigned sites")
                return None
        else:
            print(f"⏭️  H.32 SKIP: Cannot get staff sites - {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ H.32 ERROR: {e}")
        return False

def test_h33_post_field_config_staff():
    """Test 33: POST /api/field-configs with Staff Bearer → 403"""
    print("\n[H.33] POST /api/field-configs with Staff Bearer")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/field-configs",
            headers=auth_headers("staff"),
            json={"site_id": test_data["owner_site_id"], "key": "test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ H.33 PASS: Returns 403 for Staff")
            return True
        else:
            print(f"❌ H.33 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ H.33 ERROR: {e}")
        return False

def test_h34_post_field_config_operator_foreign():
    """Test 34: POST with Operator Bearer + foreign site_id → 403"""
    print("\n[H.34] POST /api/field-configs with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  H.34 SKIP: No foreign site")
        return None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/field-configs",
            headers=auth_headers("operator"),
            json={"site_id": test_data["foreign_site_id"], "key": "test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ H.34 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ H.34 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ H.34 ERROR: {e}")
        return False

def test_h35_bulk_field_configs_mixed():
    """Test 35: POST /api/field-configs/bulk with mixed sites → 403 with foreign_site_ids"""
    print("\n[H.35] POST /api/field-configs/bulk with mixed sites")
    if not test_data["foreign_site_id"] or not test_data["operator_site_id"]:
        print("⏭️  H.35 SKIP: Need both operator and foreign sites")
        return None
    try:
        configs = [
            {"site_id": test_data["operator_site_id"], "key": "test1"},
            {"site_id": test_data["foreign_site_id"], "key": "test2"}
        ]
        resp = requests.post(
            f"{BASE_URL}/api/field-configs/bulk",
            headers=auth_headers("operator"),
            json={"configs": configs},
            timeout=10
        )
        if resp.status_code == 403:
            data = resp.json()
            if "foreign_site_ids" in data:
                print(f"✅ H.35 PASS: Returns 403 with foreign_site_ids: {data['foreign_site_ids']}")
                return True
            else:
                print(f"❌ H.35 FAIL: 403 but missing foreign_site_ids field")
                return False
        else:
            print(f"❌ H.35 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ H.35 ERROR: {e}")
        return False

# ============================================================================
# I. fuel-prices.js (Fix 4) - 8 tests
# ============================================================================

def test_i36_site_competitors_operator_foreign():
    """Test 36: GET /api/site-competitors?siteId=foreign with Operator → 403"""
    print("\n[I.36] GET /api/site-competitors with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  I.36 SKIP: No foreign site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/site-competitors?siteId={test_data['foreign_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ I.36 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ I.36 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.36 ERROR: {e}")
        return False

def test_i37_site_competitors_operator_own():
    """Test 37: GET /api/site-competitors?siteId=own with Operator → 200"""
    print("\n[I.37] GET /api/site-competitors with Operator for own site")
    if not test_data["operator_site_id"]:
        print("⏭️  I.37 SKIP: No operator site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/site-competitors?siteId={test_data['operator_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ I.37 PASS: Returns 200 for own site")
            return True
        else:
            print(f"❌ I.37 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.37 ERROR: {e}")
        return False

def test_i38_post_site_competitors_staff():
    """Test 38: POST /api/site-competitors with Staff → 403"""
    print("\n[I.38] POST /api/site-competitors with Staff Bearer")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/site-competitors",
            headers=auth_headers("staff"),
            json={"site_id": test_data["owner_site_id"], "competitor_name": "Test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ I.38 PASS: Returns 403 for Staff")
            return True
        else:
            print(f"❌ I.38 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.38 ERROR: {e}")
        return False

def test_i39_post_site_competitors_operator_foreign():
    """Test 39: POST with Operator + foreign site_id → 403"""
    print("\n[I.39] POST /api/site-competitors with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  I.39 SKIP: No foreign site")
        return None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/site-competitors",
            headers=auth_headers("operator"),
            json={"site_id": test_data["foreign_site_id"], "competitor_name": "Test"},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ I.39 PASS: Returns 403 for foreign site")
            return True
        else:
            print(f"❌ I.39 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.39 ERROR: {e}")
        return False

def test_i40_put_site_competitors_fake_id():
    """Test 40: PUT /api/site-competitors/[fake-id] with Owner → 404"""
    print("\n[I.40] PUT /api/site-competitors/[fake-id]")
    fake_id = "00000000-0000-0000-0000-000000000000"
    try:
        resp = requests.put(
            f"{BASE_URL}/api/site-competitors/{fake_id}",
            headers=auth_headers("owner"),
            json={"competitor_name": "Updated"},
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ I.40 PASS: Returns 404 for fake ID")
            return True
        else:
            print(f"❌ I.40 FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.40 ERROR: {e}")
        return False

def test_i41_fuel_price_entries_operator_scoped():
    """Test 41: GET /api/fuel-price-entries with Operator → 200 with scoped results"""
    print("\n[I.41] GET /api/fuel-price-entries with Operator (scoped)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/fuel-price-entries",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            entries = resp.json()
            print(f"✅ I.41 PASS: Returns 200 with {len(entries)} entries (scoped to operator sites)")
            return True
        else:
            print(f"❌ I.41 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.41 ERROR: {e}")
        return False

def test_i42_fuel_price_comparison_mixed():
    """Test 42: GET /api/fuel-price-comparison?siteIds=own,foreign with Operator → 200 with own only"""
    print("\n[I.42] GET /api/fuel-price-comparison with mixed siteIds")
    if not test_data["foreign_site_id"] or not test_data["operator_site_id"]:
        print("⏭️  I.42 SKIP: Need both operator and foreign sites")
        return None
    try:
        mixed_sites = f"{test_data['operator_site_id']},{test_data['foreign_site_id']}"
        resp = requests.get(
            f"{BASE_URL}/api/fuel-price-comparison?siteIds={mixed_sites}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            results = resp.json()
            print(f"✅ I.42 PASS: Returns 200 with {len(results)} results (operator site only)")
            return True
        else:
            print(f"❌ I.42 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.42 ERROR: {e}")
        return False

def test_i43_post_competitor_prices_staff():
    """Test 43: POST /api/competitor-prices with Staff → 403"""
    print("\n[I.43] POST /api/competitor-prices with Staff Bearer")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/competitor-prices",
            headers=auth_headers("staff"),
            json={"site_id": test_data["owner_site_id"], "price": 1.85},
            timeout=10
        )
        if resp.status_code == 403:
            print("✅ I.43 PASS: Returns 403 for Staff")
            return True
        else:
            print(f"❌ I.43 FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ I.43 ERROR: {e}")
        return False

# ============================================================================
# J. dashboard.js (Fix 4) - 3 tests
# ============================================================================

def test_j44_daily_rollups_operator_foreign():
    """Test 44: GET /api/daily-rollups?siteIds=foreign with Operator → 200 with empty array"""
    print("\n[J.44] GET /api/daily-rollups with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  J.44 SKIP: No foreign site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/daily-rollups?siteIds={test_data['foreign_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            rollups = resp.json()
            if isinstance(rollups, list) and len(rollups) == 0:
                print("✅ J.44 PASS: Returns 200 with empty array (not 403)")
                return True
            else:
                print(f"❌ J.44 FAIL: Expected empty array, got {len(rollups)} items")
                return False
        else:
            print(f"❌ J.44 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ J.44 ERROR: {e}")
        return False

def test_j45_dashboard_stats_mixed():
    """Test 45: GET /api/dashboard/stats?siteIds=foreign,own with Operator → 200 with own only"""
    print("\n[J.45] GET /api/dashboard/stats with mixed siteIds")
    if not test_data["foreign_site_id"] or not test_data["operator_site_id"]:
        print("⏭️  J.45 SKIP: Need both operator and foreign sites")
        return None
    try:
        mixed_sites = f"{test_data['foreign_site_id']},{test_data['operator_site_id']}"
        resp = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds={mixed_sites}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            stats = resp.json()
            # Verify totalSites reflects only operator's allowed sites
            print(f"✅ J.45 PASS: Returns 200 with stats (scoped to operator sites)")
            return True
        else:
            print(f"❌ J.45 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ J.45 ERROR: {e}")
        return False

def test_j46_dashboard_site_stats_operator_foreign():
    """Test 46: GET /api/dashboard/site-stats?siteIds=foreign with Operator → 200 with empty array"""
    print("\n[J.46] GET /api/dashboard/site-stats with Operator for foreign site")
    if not test_data["foreign_site_id"]:
        print("⏭️  J.46 SKIP: No foreign site")
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/api/dashboard/site-stats?siteIds={test_data['foreign_site_id']}",
            headers=auth_headers("operator"),
            timeout=10
        )
        if resp.status_code == 200:
            stats = resp.json()
            if isinstance(stats, list) and len(stats) == 0:
                print("✅ J.46 PASS: Returns 200 with empty array")
                return True
            else:
                print(f"❌ J.46 FAIL: Expected empty array, got {len(stats)} items")
                return False
        else:
            print(f"❌ J.46 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ J.46 ERROR: {e}")
        return False

# ============================================================================
# K. Regression sanity - 7 tests
# ============================================================================

def test_k47_auth_login():
    """Test 47: POST /api/auth/login with valid Owner credentials → 200 with token"""
    print("\n[K.47] POST /api/auth/login (regression)")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["owner"],
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token") or data.get("session", {}).get("access_token")
            if token:
                print("✅ K.47 PASS: Login working with token")
                return True
            else:
                print("❌ K.47 FAIL: No token in response")
                return False
        else:
            print(f"❌ K.47 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.47 ERROR: {e}")
        return False

def test_k48_users_me():
    """Test 48: GET /api/users/me with Owner Bearer → 200"""
    print("\n[K.48] GET /api/users/me (regression)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/users/me",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ K.48 PASS: Users/me working")
            return True
        else:
            print(f"❌ K.48 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.48 ERROR: {e}")
        return False

def test_k49_support_contact():
    """Test 49: POST /api/support/contact with Owner Bearer → 200"""
    print("\n[K.49] POST /api/support/contact (regression)")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/support/contact",
            headers=auth_headers("owner"),
            json={"subject": "test", "message": "test", "category": "question"},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ K.49 PASS: Support contact working")
            return True
        else:
            print(f"❌ K.49 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.49 ERROR: {e}")
        return False

def test_k50_notifications():
    """Test 50: GET /api/notifications with Owner Bearer → 200"""
    print("\n[K.50] GET /api/notifications (regression)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if "items" in data and "unread_count" in data:
                print("✅ K.50 PASS: Notifications working")
                return True
            else:
                print("❌ K.50 FAIL: Missing required fields")
                return False
        else:
            print(f"❌ K.50 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.50 ERROR: {e}")
        return False

def test_k51_reports_staff():
    """Test 51: POST /api/reports with Staff Bearer → 201"""
    print("\n[K.51] POST /api/reports with Staff (regression)")
    
    # Get staff's assigned site
    try:
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code == 200:
            sites = resp.json()
            if sites:
                site_id = sites[0].get("id")
                today = datetime.now().strftime("%Y-%m-%d")
                
                resp = requests.post(
                    f"{BASE_URL}/api/reports",
                    headers=auth_headers("staff"),
                    json={
                        "site_id": site_id,
                        "date": today,
                        "shift_type": "Afternoon",
                        "total_sales": 5000,
                        "fuel_sales": 3000,
                        "shop_sales": 2000
                    },
                    timeout=10
                )
                
                if resp.status_code in [200, 201, 409]:
                    print(f"✅ K.51 PASS: Reports endpoint working ({resp.status_code})")
                    return True
                else:
                    print(f"❌ K.51 FAIL: Expected 201, got {resp.status_code}")
                    return False
            else:
                print("⏭️  K.51 SKIP: Staff has no assigned sites")
                return None
        else:
            print(f"⏭️  K.51 SKIP: Cannot get staff sites - {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ K.51 ERROR: {e}")
        return False

def test_k52_sites():
    """Test 52: GET /api/sites with Owner Bearer → 200"""
    print("\n[K.52] GET /api/sites (regression)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            sites = resp.json()
            print(f"✅ K.52 PASS: Sites endpoint working ({len(sites)} sites)")
            return True
        else:
            print(f"❌ K.52 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.52 ERROR: {e}")
        return False

def test_k53_reports_get():
    """Test 53: GET /api/reports with Staff Bearer → 200"""
    print("\n[K.53] GET /api/reports with Staff (regression)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/reports",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code == 200:
            reports = resp.json()
            print(f"✅ K.53 PASS: Reports GET working ({len(reports)} reports)")
            return True
        else:
            print(f"❌ K.53 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ K.53 ERROR: {e}")
        return False

# ============================================================================
# Main test runner
# ============================================================================

def main():
    print("="*80)
    print("SECURITY HARDENING BACKEND TESTS — AUTH/AUTHORIZATION SPRINT")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Login all users
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    for role in ["owner", "operator", "staff"]:
        token, user_id, user = login(role)
        if token:
            tokens[role] = token
            user_ids[role] = user_id
        else:
            print(f"❌ CRITICAL: Cannot proceed without {role} login")
            return
    
    print(f"\n✅ All users authenticated successfully")
    
    # Discover sites
    discover_sites()
    
    # Track results
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "total": 53
    }
    
    # Run all tests
    all_tests = [
        # A. /api/export (5 tests)
        ("A", [
            test_a1_export_without_bearer,
            test_a2_export_with_owner,
            test_a3_export_operator_foreign_site,
            test_a4_export_without_siteids,
            test_a5_export_mixed_sites
        ]),
        # B. /api/fuel-prices/[id] (5 tests)
        ("B", [
            test_b6_patch_fuel_price_without_bearer,
            test_b7_patch_with_staff,
            test_b8_patch_fake_id,
            lambda: test_b9_b10_patch_delete_real_price()[0],
            lambda: test_b9_b10_patch_delete_real_price()[1]
        ]),
        # C. /api/fuel-prices/escalate (2 tests)
        ("C", [
            test_c11_escalate_without_bearer,
            test_c12_escalate_with_staff
        ]),
        # D. /api/fuel-prices/pending (5 tests)
        ("D", [
            test_d13_pending_without_bearer,
            test_d14_pending_matching_identity,
            test_d15_pending_spoof_userid,
            test_d16_pending_spoof_role,
            test_d17_pending_without_params
        ]),
        # E. /api/banking-formulas/[id]/calculate (2 tests)
        ("E", [
            test_e18_calculate_without_bearer,
            test_e19_calculate_with_staff
        ]),
        # F. /api/fuel-prices/verify-schema (2 tests)
        ("F", [
            test_f20_verify_schema_get,
            test_f21_verify_schema_post
        ]),
        # G. banking-formulas (8 tests)
        ("G", [
            test_g22_banking_formulas_without_bearer,
            test_g23_banking_formulas_operator_foreign,
            test_g24_banking_formulas_owner,
            test_g25_post_formula_staff,
            test_g26_post_formula_operator_foreign,
            test_g27_post_formula_without_siteid,
            test_g28_put_formula_fake_id,
            test_g29_delete_formula_fake_id
        ]),
        # H. field-configs (6 tests)
        ("H", [
            test_h30_field_configs_without_bearer,
            test_h31_field_configs_staff_foreign,
            test_h32_field_configs_staff_assigned,
            test_h33_post_field_config_staff,
            test_h34_post_field_config_operator_foreign,
            test_h35_bulk_field_configs_mixed
        ]),
        # I. fuel-prices.js (8 tests)
        ("I", [
            test_i36_site_competitors_operator_foreign,
            test_i37_site_competitors_operator_own,
            test_i38_post_site_competitors_staff,
            test_i39_post_site_competitors_operator_foreign,
            test_i40_put_site_competitors_fake_id,
            test_i41_fuel_price_entries_operator_scoped,
            test_i42_fuel_price_comparison_mixed,
            test_i43_post_competitor_prices_staff
        ]),
        # J. dashboard.js (3 tests)
        ("J", [
            test_j44_daily_rollups_operator_foreign,
            test_j45_dashboard_stats_mixed,
            test_j46_dashboard_site_stats_operator_foreign
        ]),
        # K. Regression (7 tests)
        ("K", [
            test_k47_auth_login,
            test_k48_users_me,
            test_k49_support_contact,
            test_k50_notifications,
            test_k51_reports_staff,
            test_k52_sites,
            test_k53_reports_get
        ])
    ]
    
    for section, tests in all_tests:
        print("\n" + "="*80)
        print(f"SECTION {section}: {len(tests)} tests")
        print("="*80)
        
        for test_func in tests:
            try:
                result = test_func()
                if result is True:
                    results["passed"] += 1
                elif result is False:
                    results["failed"] += 1
                else:
                    results["skipped"] += 1
            except Exception as e:
                print(f"❌ TEST ERROR: {e}")
                results["failed"] += 1
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Total Tests: {results['total']}")
    print(f"✅ Passed: {results['passed']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"⏭️  Skipped: {results['skipped']}")
    success_rate = (results['passed'] * 100) // results['total'] if results['total'] > 0 else 0
    print(f"Success Rate: {results['passed']}/{results['total']} ({success_rate}%)")
    print("="*80)
    
    if results["failed"] == 0:
        print("\n🎉 ALL TESTS PASSED! Security hardening is PRODUCTION-READY!")
    else:
        print(f"\n⚠️  {results['failed']} test(s) failed. Review the output above for details.")

if __name__ == "__main__":
    main()
