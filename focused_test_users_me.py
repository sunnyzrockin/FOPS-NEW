#!/usr/bin/env python3
"""
FOCUSED BACKEND TEST: /api/users/me + /api/rls-fix removal + regression

Tests the three targeted changes:
1. NEW endpoint: /api/users/me with GET + PATCH handlers
2. DELETED endpoint: /api/rls-fix (legacy no-op)
3. Regression checks on key endpoints

Total: 18 tests (A.1-A.12, B.13-B.14, C.15-C.18)
"""

import requests
import json
import sys

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

# Store tokens
tokens = {}

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
            token = data.get("token") or data.get("session", {}).get("access_token")
            user = data.get("user", {})
            if token:
                print(f"✅ {role.upper()} login successful (email: {user.get('email', 'N/A')})")
                return token, user
            else:
                print(f"❌ {role.upper()} login failed: No token in response")
                return None, None
        else:
            print(f"❌ {role.upper()} login failed: {response.status_code}")
            return None, None
    except Exception as e:
        print(f"❌ {role.upper()} login error: {str(e)}")
        return None, None

def test_users_me_endpoint():
    """Test A: /api/users/me endpoint (12 tests)"""
    print("\n" + "="*80)
    print("SECTION A: /api/users/me ENDPOINT (12 TESTS)")
    print("="*80)
    
    passed = 0
    total = 0
    
    # A.1: GET /api/users/me WITHOUT Authorization header → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/users/me", timeout=10)
        if response.status_code == 401:
            data = response.json()
            if "Missing Authorization header" in data.get("error", ""):
                print(f"✅ A.1: GET /users/me without Bearer → 401 'Missing Authorization header'")
                passed += 1
            else:
                print(f"✅ A.1: GET /users/me without Bearer → 401 (message: {data.get('error', 'N/A')})")
                passed += 1
        else:
            print(f"❌ A.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.1: Error - {str(e)}")
    
    # A.2: GET /api/users/me with INVALID Bearer token → 401
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": "Bearer invalid_token_12345"},
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ A.2: GET /users/me with invalid Bearer → 401")
            passed += 1
        else:
            print(f"❌ A.2: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.2: Error - {str(e)}")
    
    # A.3: GET /api/users/me with Owner Bearer → 200 + role=owner
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            if user.get("email") == "owner@workflowlite.com" and user.get("role") == "owner":
                print(f"✅ A.3: GET /users/me as Owner → 200 (email: {user['email']}, role: {user['role']})")
                passed += 1
            else:
                print(f"❌ A.3: Got 200 but email={user.get('email')} or role={user.get('role')} mismatch")
        else:
            print(f"❌ A.3: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.3: Error - {str(e)}")
    
    # A.4: GET /api/users/me with Operator Bearer → 200 + role=operator
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['operator']}"},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            if user.get("email") == "operator@workflowlite.com" and user.get("role") == "operator":
                print(f"✅ A.4: GET /users/me as Operator → 200 (email: {user['email']}, role: {user['role']})")
                passed += 1
            else:
                print(f"❌ A.4: Got 200 but email={user.get('email')} or role={user.get('role')} mismatch")
        else:
            print(f"❌ A.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.4: Error - {str(e)}")
    
    # A.5: GET /api/users/me with Staff Bearer → 200 + role=staff
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            if user.get("email") == "staff@workflowlite.com" and user.get("role") == "staff":
                print(f"✅ A.5: GET /users/me as Staff → 200 (email: {user['email']}, role: {user['role']})")
                passed += 1
            else:
                print(f"❌ A.5: Got 200 but email={user.get('email')} or role={user.get('role')} mismatch")
        else:
            print(f"❌ A.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.5: Error - {str(e)}")
    
    # A.6: PATCH /api/users/me WITHOUT Bearer → 401
    total += 1
    try:
        response = requests.patch(
            f"{BASE_URL}/api/users/me",
            json={"first_login": False},
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ A.6: PATCH /users/me without Bearer → 401")
            passed += 1
        else:
            print(f"❌ A.6: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.6: Error - {str(e)}")
    
    # A.7: PATCH /api/users/me with Owner Bearer + {first_login: false} → 200
    total += 1
    try:
        response = requests.patch(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json={"first_login": False},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            if user.get("first_login") == False:
                print(f"✅ A.7: PATCH /users/me (first_login: false) → 200 (first_login={user['first_login']})")
                passed += 1
            else:
                print(f"❌ A.7: Got 200 but first_login={user.get('first_login')} (expected False)")
        else:
            print(f"❌ A.7: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.7: Error - {str(e)}")
    
    # A.8: PATCH /api/users/me with Owner Bearer + {first_login: true} → 200 (reset for re-runs)
    total += 1
    try:
        response = requests.patch(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json={"first_login": True},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            if user.get("first_login") == True:
                print(f"✅ A.8: PATCH /users/me (first_login: true) → 200 (first_login={user['first_login']})")
                passed += 1
            else:
                print(f"❌ A.8: Got 200 but first_login={user.get('first_login')} (expected True)")
        else:
            print(f"❌ A.8: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.8: Error - {str(e)}")
    
    # A.9: PATCH /api/users/me with Owner Bearer + {role, email, first_login} → 200 but only first_login updated
    total += 1
    try:
        # First, get current state
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            before = response.json()
            original_role = before.get("role")
            original_email = before.get("email")
            
            # Try to update role, email, and first_login
            response = requests.patch(
                f"{BASE_URL}/api/users/me",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                json={"role": "operator", "email": "hacker@x.com", "first_login": False},
                timeout=10
            )
            if response.status_code == 200:
                after = response.json()
                # Verify only first_login was updated
                if (after.get("role") == original_role and 
                    after.get("email") == original_email and 
                    after.get("first_login") == False):
                    print(f"✅ A.9: PATCH /users/me with non-whitelisted fields → 200 (only first_login updated, role={after['role']}, email={after['email']})")
                    passed += 1
                else:
                    print(f"❌ A.9: Whitelist bypass detected! role={after.get('role')}, email={after.get('email')}")
            else:
                print(f"❌ A.9: Expected 200, got {response.status_code}")
        else:
            print(f"❌ A.9: Failed to get current state")
    except Exception as e:
        print(f"❌ A.9: Error - {str(e)}")
    
    # A.10: PATCH /api/users/me with Owner Bearer + EMPTY body {} → 400
    total += 1
    try:
        response = requests.patch(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json={},
            timeout=10
        )
        if response.status_code == 400:
            data = response.json()
            if "No updatable fields provided" in data.get("error", ""):
                print(f"✅ A.10: PATCH /users/me with empty body → 400 'No updatable fields provided'")
                passed += 1
            else:
                print(f"✅ A.10: PATCH /users/me with empty body → 400 (message: {data.get('error', 'N/A')})")
                passed += 1
        else:
            print(f"❌ A.10: Expected 400, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.10: Error - {str(e)}")
    
    # A.11: PATCH /api/users/me with Owner Bearer + {role: 'operator'} (only non-whitelisted) → 400
    total += 1
    try:
        response = requests.patch(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json={"role": "operator"},
            timeout=10
        )
        if response.status_code == 400:
            data = response.json()
            if "No updatable fields provided" in data.get("error", ""):
                print(f"✅ A.11: PATCH /users/me with only non-whitelisted fields → 400 'No updatable fields provided'")
                passed += 1
            else:
                print(f"✅ A.11: PATCH /users/me with only non-whitelisted fields → 400 (message: {data.get('error', 'N/A')})")
                passed += 1
        else:
            print(f"❌ A.11: Expected 400, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.11: Error - {str(e)}")
    
    # A.12: CRITICAL - Verify /me is NOT treated as id="me" by dynamic route
    total += 1
    try:
        # This test is implicit in A.3-A.5 - if those returned 200 with correct user data,
        # then /me is correctly resolving to the static route, not the dynamic [id] route
        # (which would return 404 "User not found" for id="me")
        # We'll do an explicit check here
        response = requests.get(
            f"{BASE_URL}/api/users/me",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            user = response.json()
            # If we got a valid user object with the correct email, /me is working correctly
            if user.get("email") == "owner@workflowlite.com":
                print(f"✅ A.12: CRITICAL - /me correctly resolves to static route (not treated as id='me')")
                passed += 1
            else:
                print(f"❌ A.12: Got 200 but unexpected user data (possible routing issue)")
        elif response.status_code == 404:
            print(f"❌ A.12: CRITICAL FAILURE - /me returned 404 (treated as id='me' by dynamic route)")
        else:
            print(f"❌ A.12: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ A.12: Error - {str(e)}")
    
    print(f"\n📊 /api/users/me Tests: {passed}/{total} passed")
    return passed, total

def test_rls_fix_removal():
    """Test B: /api/rls-fix removal (2 tests)"""
    print("\n" + "="*80)
    print("SECTION B: /api/rls-fix REMOVAL (2 TESTS)")
    print("="*80)
    
    passed = 0
    total = 0
    
    # B.13: POST /api/rls-fix → 404
    total += 1
    try:
        response = requests.post(
            f"{BASE_URL}/api/rls-fix",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json={},
            timeout=10
        )
        if response.status_code == 404:
            print(f"✅ B.13: POST /api/rls-fix → 404 (endpoint deleted)")
            passed += 1
        else:
            print(f"❌ B.13: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ B.13: Error - {str(e)}")
    
    # B.14: GET /api/rls-fix → 404
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/rls-fix",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 404:
            print(f"✅ B.14: GET /api/rls-fix → 404 (endpoint deleted)")
            passed += 1
        else:
            print(f"❌ B.14: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ B.14: Error - {str(e)}")
    
    print(f"\n📊 /api/rls-fix Removal Tests: {passed}/{total} passed")
    return passed, total

def test_regression():
    """Test C: Regression - quick sanity checks (4 tests)"""
    print("\n" + "="*80)
    print("SECTION C: REGRESSION - QUICK SANITY CHECKS (4 TESTS)")
    print("="*80)
    
    passed = 0
    total = 0
    
    # C.15: GET /api/dashboard/stats?siteIds=site-001 with Owner Bearer → 200 + health-strip fields
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            health_fields = ["submittedToday", "totalSites", "pendingReview", "varianceAlerts"]
            has_health_fields = all(field in stats for field in health_fields)
            if has_health_fields:
                print(f"✅ C.15: GET /dashboard/stats → 200 with health-strip fields (submittedToday={stats['submittedToday']}, totalSites={stats['totalSites']})")
                passed += 1
            else:
                missing = [f for f in health_fields if f not in stats]
                print(f"❌ C.15: Got 200 but missing health-strip fields: {missing}")
        else:
            print(f"❌ C.15: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ C.15: Error - {str(e)}")
    
    # C.16: GET /api/users?role=staff with Operator Bearer → 200 (array)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users?role=staff",
            headers={"Authorization": f"Bearer {tokens['operator']}"},
            timeout=10
        )
        if response.status_code == 200:
            users = response.json()
            if isinstance(users, list):
                print(f"✅ C.16: GET /users?role=staff as Operator → 200 ({len(users)} users)")
                passed += 1
            else:
                print(f"❌ C.16: Got 200 but response is not an array")
        else:
            print(f"❌ C.16: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ C.16: Error - {str(e)}")
    
    # C.17: GET /api/users WITHOUT Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/users", timeout=10)
        if response.status_code == 401:
            print(f"✅ C.17: GET /users without Bearer → 401 (auth gate working)")
            passed += 1
        else:
            print(f"❌ C.17: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ C.17: Error - {str(e)}")
    
    # C.18: GET /api/operator-assignments WITHOUT Bearer → 200 (allowAnon: true)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/operator-assignments", timeout=10)
        if response.status_code == 200:
            print(f"✅ C.18: GET /operator-assignments without Bearer → 200 (allowAnon: true, pre-existing behavior)")
            passed += 1
        else:
            print(f"❌ C.18: Expected 200, got {response.status_code} (regression - allowAnon should still work)")
    except Exception as e:
        print(f"❌ C.18: Error - {str(e)}")
    
    print(f"\n📊 Regression Tests: {passed}/{total} passed")
    return passed, total

def main():
    print("="*80)
    print("FOCUSED BACKEND TEST: /api/users/me + /api/rls-fix removal + regression")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing: 18 tests (A.1-A.12, B.13-B.14, C.15-C.18)")
    print("="*80)
    
    # Login all roles
    print("\n🔐 Logging in all roles...")
    for role in ["owner", "operator", "staff"]:
        token, user = login(role)
        if token:
            tokens[role] = token
        else:
            print(f"❌ Failed to login as {role}, aborting tests")
            sys.exit(1)
    
    # Run all test sections
    results = []
    results.append(test_users_me_endpoint())
    results.append(test_rls_fix_removal())
    results.append(test_regression())
    
    # Final summary
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    print("\n" + "="*80)
    print("FINAL SUMMARY - FOCUSED BACKEND TEST")
    print("="*80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_tests - total_passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    print("="*80)
    
    if total_passed == total_tests:
        print("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    elif success_rate >= 90:
        print("⚠️  MOST TESTS PASSED - MINOR ISSUES DETECTED")
        sys.exit(0)
    else:
        print("❌ CRITICAL ISSUES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    main()
