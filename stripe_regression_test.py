#!/usr/bin/env python3
"""
Stripe Integration Regression Test
Verifies that existing endpoints still work after Stripe integration.
"""

import requests
import json

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
OWNER_EMAIL = "owner@workflowlite.com"
PASSWORD = "WorkflowDemo2026!"

def login(email, password):
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("session", {}).get("access_token")
        return None
    except Exception as e:
        print(f"❌ Login exception: {e}")
        return None

def test_regression():
    """Test key existing endpoints to ensure no regressions"""
    print("\n" + "="*80)
    print("STRIPE INTEGRATION REGRESSION TEST")
    print("="*80)
    
    # Login
    print("\n🔐 Logging in as Owner...")
    token = login(OWNER_EMAIL, PASSWORD)
    if not token:
        print("❌ CRITICAL: Could not login. Aborting.")
        return
    print("✅ Login successful")
    
    headers = {"Authorization": f"Bearer {token}"}
    results = []
    
    # Get site IDs first
    sites_response = requests.get(f"{BASE_URL}/api/sites", headers=headers, timeout=10)
    site_ids = []
    if sites_response.status_code == 200:
        sites = sites_response.json()
        site_ids = [s.get("id") for s in sites if s.get("id")]
    
    # Test existing endpoints
    tests = [
        ("GET", "/api/sites", "Sites endpoint", None),
        ("GET", "/api/users", "Users endpoint", None),
        ("GET", "/api/reports", "Reports endpoint", None),
        ("GET", f"/api/dashboard/stats?siteIds={','.join(site_ids[:3])}" if site_ids else "/api/dashboard/stats", "Dashboard stats endpoint", None),
        ("GET", "/api/dips", "Dips endpoint", None),
        ("GET", "/api/fuel-prices-live/status", "Fuel prices status endpoint", None),
        ("GET", "/api/banking-formulas?siteId=" + (site_ids[0] if site_ids else ""), "Banking formulas endpoint", None),
        ("GET", "/api/field-configs?siteId=" + (site_ids[0] if site_ids else ""), "Field configs endpoint", None),
        ("GET", "/api/operator-assignments", "Operator assignments endpoint", None),
        ("GET", "/api/staff-assignments", "Staff assignments endpoint", None),
    ]
    
    print("\n" + "="*80)
    print("TESTING EXISTING ENDPOINTS")
    print("="*80)
    
    for method, endpoint, description, _ in tests:
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=10)
            else:
                response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json={}, timeout=10)
            
            if response.status_code == 200:
                print(f"✅ {description}: 200")
                results.append(True)
            else:
                print(f"❌ {description}: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ {description}: Exception - {e}")
            results.append(False)
    
    # Summary
    print("\n" + "="*80)
    print("REGRESSION TEST SUMMARY")
    print("="*80)
    passed = sum(results)
    total = len(results)
    print(f"\n📊 Total: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("\n✅ NO REGRESSIONS DETECTED! All existing endpoints still working.")
    else:
        print(f"\n⚠️  REGRESSIONS DETECTED! {total - passed} endpoint(s) failing.")
    
    print("\n" + "="*80)

if __name__ == "__main__":
    test_regression()
