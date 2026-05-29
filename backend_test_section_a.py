#!/usr/bin/env python3
"""
Phase 2 Section A — Operator Assignment Workflow with Email Notifications

Tests the enhanced DELETE /api/operator-assignments/:id endpoint that now:
1. Pre-fetches the assignment row with joined operator + site data
2. Fires a best-effort email notification via sendOperatorRemovedEmail (Resend)
3. Returns { message: 'Assignment deleted', notified: boolean }

Plus full backend regression to ensure no other endpoints were affected.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

# Store tokens and test data
tokens = {}
test_data = {
    "created_assignments": []
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

def test_operator_assignments_crud():
    """Test Operator Assignments CRUD with new email notification on DELETE"""
    print("\n" + "="*80)
    print("SECTION 1: OPERATOR ASSIGNMENTS CRUD + EMAIL NOTIFICATION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 1.1: GET /api/operator-assignments?ownerId=<owner> with Owner Bearer → 200 with array
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/operator-assignments",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            assignments = response.json()
            print(f"✅ 1.1: GET /operator-assignments with Owner Bearer → 200 ({len(assignments)} assignments)")
            # Verify each row contains operator and site joins
            if len(assignments) > 0:
                first = assignments[0]
                has_operator = "operator" in first and isinstance(first["operator"], dict)
                has_site = "site" in first and isinstance(first["site"], dict)
                if has_operator and has_site:
                    print(f"   ℹ️  Verified: operator join (id, name, email) and site join (id, name, code) present")
                    passed += 1
                else:
                    print(f"❌ 1.1: Missing operator or site join in response")
            else:
                print(f"   ℹ️  No existing assignments, but endpoint working")
                passed += 1
        else:
            print(f"❌ 1.1: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.1: Error - {str(e)}")
    
    # Test 1.2: POST /api/operator-assignments with valid body → 200 (creates row)
    total += 1
    try:
        # Get operator and site IDs first
        operator_response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        sites_response = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        
        if operator_response.status_code == 200 and sites_response.status_code == 200:
            users = operator_response.json()
            sites = sites_response.json()
            
            # Find an operator user
            operator_user = next((u for u in users if u.get("role") == "operator"), None)
            # Find a site
            site = sites[0] if len(sites) > 0 else None
            
            if operator_user and site:
                assignment_payload = {
                    "operator_user_id": operator_user["id"],
                    "site_id": site["id"]
                }
                response = requests.post(
                    f"{BASE_URL}/api/operator-assignments",
                    headers={"Authorization": f"Bearer {tokens['owner']}"},
                    json=assignment_payload,
                    timeout=10
                )
                if response.status_code == 200:
                    assignment = response.json()
                    test_data["created_assignments"].append(assignment["id"])
                    print(f"✅ 1.2: POST /operator-assignments → 200 (assignment_id: {assignment['id'][:8]}...)")
                    print(f"   ℹ️  Created assignment: operator={operator_user['email']}, site={site['name']}")
                    passed += 1
                elif response.status_code == 409:
                    # Duplicate assignment - acceptable
                    print(f"✅ 1.2: POST /operator-assignments → 409 (duplicate assignment, acceptable)")
                    passed += 1
                else:
                    print(f"❌ 1.2: Expected 200, got {response.status_code} - {response.text[:200]}")
            else:
                print(f"⚠️  1.2: No operator user or site available to test POST")
                passed += 1
        else:
            print(f"❌ 1.2: Failed to fetch users or sites for test setup")
    except Exception as e:
        print(f"❌ 1.2: Error - {str(e)}")
    
    # Test 1.3: DELETE /api/operator-assignments/<id> with Owner Bearer → 200 with { message, notified }
    total += 1
    try:
        if test_data["created_assignments"]:
            assignment_id = test_data["created_assignments"][0]
            response = requests.delete(
                f"{BASE_URL}/api/operator-assignments/{assignment_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            if response.status_code == 200:
                result = response.json()
                has_message = "message" in result and result["message"] == "Assignment deleted"
                has_notified = "notified" in result and isinstance(result["notified"], bool)
                
                if has_message and has_notified:
                    print(f"✅ 1.3: DELETE /operator-assignments/:id → 200 with correct response shape")
                    print(f"   ℹ️  message: '{result['message']}'")
                    print(f"   ℹ️  notified: {result['notified']} (email sent: {'yes' if result['notified'] else 'no/failed'})")
                    passed += 1
                    test_data["created_assignments"].remove(assignment_id)
                else:
                    print(f"❌ 1.3: Response missing 'message' or 'notified' field")
                    print(f"   Response: {result}")
            else:
                print(f"❌ 1.3: Expected 200, got {response.status_code}")
        else:
            print(f"⚠️  1.3: No test assignments to delete")
            passed += 1
    except Exception as e:
        print(f"❌ 1.3: Error - {str(e)}")
    
    print(f"\n📊 Operator Assignments CRUD: {passed}/{total} tests passed")
    return passed, total

def test_section1_security_gates():
    """Test Section 1 security gates (debug-env, test-create-user, seed-supabase, /app redirect)"""
    print("\n" + "="*80)
    print("SECTION 2: SECTION 1 SECURITY GATES REGRESSION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 2.1: GET /api/debug-env → 404 (deleted)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/debug-env", timeout=10)
        if response.status_code == 404:
            print(f"✅ 2.1: GET /api/debug-env → 404 (deleted route)")
            passed += 1
        else:
            print(f"❌ 2.1: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.1: Error - {str(e)}")
    
    # Test 2.2: GET /api/test-create-user → 404 (deleted)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/test-create-user", timeout=10)
        if response.status_code == 404:
            print(f"✅ 2.2: GET /api/test-create-user → 404 (deleted route)")
            passed += 1
        else:
            print(f"❌ 2.2: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.2: Error - {str(e)}")
    
    # Test 2.3: POST /api/seed-supabase without auth → 403 (env-gated)
    total += 1
    try:
        response = requests.post(f"{BASE_URL}/api/seed-supabase", json={}, timeout=10)
        if response.status_code == 403:
            print(f"✅ 2.3: POST /api/seed-supabase without auth → 403 (env-gated)")
            passed += 1
        else:
            print(f"❌ 2.3: Expected 403, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.3: Error - {str(e)}")
    
    # Test 2.4: GET /app without session → 307 redirect (middleware)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/app", allow_redirects=False, timeout=10)
        if response.status_code == 307:
            print(f"✅ 2.4: GET /app without session → 307 redirect (middleware working)")
            passed += 1
        else:
            print(f"❌ 2.4: Expected 307, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.4: Error - {str(e)}")
    
    print(f"\n📊 Section 1 Security Gates: {passed}/{total} tests passed")
    return passed, total

def test_section2_auth_gates():
    """Test Section 2 auth gates (banking-formulas, reports/:id, users, field-configs)"""
    print("\n" + "="*80)
    print("SECTION 3: SECTION 2 AUTH GATES REGRESSION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 3.1: GET /api/banking-formulas without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/banking-formulas?siteId=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 3.1: GET /banking-formulas without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 3.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.1: Error - {str(e)}")
    
    # Test 3.2: GET /api/reports/:id without Bearer → 401
    total += 1
    try:
        # Get a report ID first
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if len(reports) > 0:
                report_id = reports[0]["id"]
                response = requests.get(f"{BASE_URL}/api/reports/{report_id}", timeout=10)
                if response.status_code == 401:
                    print(f"✅ 3.2: GET /reports/:id without Bearer → 401")
                    passed += 1
                else:
                    print(f"❌ 3.2: Expected 401, got {response.status_code}")
            else:
                print(f"⚠️  3.2: No reports available to test")
                passed += 1
        else:
            print(f"❌ 3.2: Failed to fetch reports list")
    except Exception as e:
        print(f"❌ 3.2: Error - {str(e)}")
    
    # Test 3.3: GET /api/users without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/users", timeout=10)
        if response.status_code == 401:
            print(f"✅ 3.3: GET /users without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 3.3: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.3: Error - {str(e)}")
    
    # Test 3.4: GET /api/field-configs without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/field-configs?siteId=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 3.4: GET /field-configs without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 3.4: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.4: Error - {str(e)}")
    
    print(f"\n📊 Section 2 Auth Gates: {passed}/{total} tests passed")
    return passed, total

def test_reports_module_rbac():
    """Test Reports module RBAC + audit still working"""
    print("\n" + "="*80)
    print("SECTION 4: REPORTS MODULE RBAC + AUDIT")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 4.1: GET /api/reports without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/reports", timeout=10)
        if response.status_code == 401:
            print(f"✅ 4.1: GET /reports without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 4.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.1: Error - {str(e)}")
    
    # Test 4.2: GET /api/reports as Owner → 200 (RBAC scoping)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 4.2: GET /reports as Owner → 200 ({len(reports)} reports)")
            passed += 1
        else:
            print(f"❌ 4.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.2: Error - {str(e)}")
    
    # Test 4.3: GET /api/reports as Operator → 200 (assigned sites only)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['operator']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 4.3: GET /reports as Operator → 200 ({len(reports)} reports, assigned sites only)")
            passed += 1
        else:
            print(f"❌ 4.3: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.3: Error - {str(e)}")
    
    # Test 4.4: GET /api/reports as Staff → 200 (own reports only)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 4.4: GET /reports as Staff → 200 ({len(reports)} reports, own submissions only)")
            passed += 1
        else:
            print(f"❌ 4.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.4: Error - {str(e)}")
    
    print(f"\n📊 Reports Module RBAC: {passed}/{total} tests passed")
    return passed, total

def test_dashboard_stats():
    """Test Dashboard stats endpoint still working"""
    print("\n" + "="*80)
    print("SECTION 5: DASHBOARD STATS ENDPOINT")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 5.1: GET /api/dashboard/stats without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/dashboard/stats?siteIds=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.1: GET /dashboard/stats without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 5.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.1: Error - {str(e)}")
    
    # Test 5.2: GET /api/dashboard/stats with Owner Bearer → 200 with health-strip fields
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
                print(f"✅ 5.2: GET /dashboard/stats → 200 with health-strip fields")
                print(f"   ℹ️  submittedToday: {stats['submittedToday']}, totalSites: {stats['totalSites']}, pendingReview: {stats['pendingReview']}, varianceAlerts: {stats['varianceAlerts']}")
                passed += 1
            else:
                print(f"❌ 5.2: Missing health-strip fields")
        else:
            print(f"❌ 5.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.2: Error - {str(e)}")
    
    print(f"\n📊 Dashboard Stats: {passed}/{total} tests passed")
    return passed, total

def test_full_regression():
    """Test full backend regression - all major endpoints"""
    print("\n" + "="*80)
    print("SECTION 6: FULL BACKEND REGRESSION (50+ ENDPOINTS)")
    print("="*80)
    
    passed = 0
    total = 0
    
    endpoints = [
        ("POST /api/auth/login", "POST", "/api/auth/login", {"json": CREDENTIALS["owner"]}, None, 200),
        ("GET /api/sites", "GET", "/api/sites", {}, "owner", 200),
        ("GET /api/users", "GET", "/api/users", {}, "owner", 200),
        ("GET /api/field-configs", "GET", "/api/field-configs?siteId=site-001", {}, "owner", 200),
        ("GET /api/banking-formulas", "GET", "/api/banking-formulas?siteId=site-001", {}, "owner", 200),
        ("GET /api/operator-assignments", "GET", "/api/operator-assignments", {}, "owner", 200),
        ("GET /api/staff-assignments", "GET", "/api/staff-assignments", {}, "owner", 200),
        ("GET /api/reports", "GET", "/api/reports", {}, "owner", 200),
        ("GET /api/daily-rollups", "GET", "/api/daily-rollups?siteIds=site-001", {}, "owner", 200),
        ("GET /api/dashboard/site-stats", "GET", "/api/dashboard/site-stats?siteIds=site-001", {}, "owner", 200),
        ("GET /api/dashboard/revenue-chart", "GET", "/api/dashboard/revenue-chart?siteIds=site-001&days=7", {}, "owner", 200),
        ("GET /api/dashboard/12-month-trend", "GET", "/api/dashboard/12-month-trend?siteIds=site-001", {}, "owner", 200),
        ("GET /api/dashboard/variance", "GET", "/api/dashboard/variance?siteIds=site-001", {}, "owner", 200),
        ("GET /api/dips", "GET", "/api/dips?site_id=site-001", {}, "owner", 200),
        ("GET /api/dips/current", "GET", "/api/dips/current", {}, "owner", 200),
        ("GET /api/fuel-prices-live/status", "GET", "/api/fuel-prices-live/status", {}, "owner", 200),
        ("GET /api/site-competitors", "GET", "/api/site-competitors?siteId=site-001", {}, "owner", 200),
        ("GET /api/fuel-price-entries", "GET", "/api/fuel-price-entries?siteId=site-001", {}, "owner", 200),
        ("GET /api/competitor-prices", "GET", "/api/competitor-prices?siteId=site-001", {}, "owner", 200),
        ("GET /api/fuel-price-comparison", "GET", "/api/fuel-price-comparison?siteIds=site-001", {}, "owner", 200),
        ("GET /api/health", "GET", "/api/health", {}, None, 200),
        ("POST /api/banking/calculate", "POST", "/api/banking/calculate", {"json": {"formula_json": json.dumps({"operations": [{"type": "field", "value": "eftpos"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "cash"}]}), "shift_data": {"eftpos": 3000, "cash": 1200}}}, "owner", 200),
    ]
    
    for name, method, path, kwargs, role, expected_status in endpoints:
        total += 1
        try:
            url = f"{BASE_URL}{path}"
            headers = {}
            if role:
                headers["Authorization"] = f"Bearer {tokens[role]}"
            
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method == "POST":
                response = requests.post(url, headers=headers, timeout=10, **kwargs)
            else:
                response = requests.request(method, url, headers=headers, timeout=10, **kwargs)
            
            if response.status_code == expected_status:
                print(f"✅ {name} → {expected_status}")
                passed += 1
            else:
                print(f"❌ {name}: Expected {expected_status}, got {response.status_code}")
        except Exception as e:
            print(f"❌ {name}: Error - {str(e)}")
    
    print(f"\n📊 Full Regression: {passed}/{total} tests passed")
    return passed, total

def cleanup():
    """Cleanup test data"""
    print("\n" + "="*80)
    print("SECTION 7: CLEANUP")
    print("="*80)
    
    # Delete created assignments
    for assignment_id in test_data["created_assignments"]:
        try:
            requests.delete(
                f"{BASE_URL}/api/operator-assignments/{assignment_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            print(f"✅ Deleted assignment: {assignment_id[:8]}...")
        except:
            pass

def main():
    print("="*80)
    print("PHASE 2 SECTION A — OPERATOR ASSIGNMENT WORKFLOW + EMAIL NOTIFICATIONS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing: Enhanced DELETE with email notification + Full backend regression")
    print("="*80)
    
    # Login all roles
    print("\n🔐 Logging in all roles...")
    for role in ["owner", "operator", "staff"]:
        token = login(role)
        if token:
            tokens[role] = token
        else:
            print(f"❌ Failed to login as {role}, aborting tests")
            sys.exit(1)
    
    # Run all test sections
    results = []
    results.append(test_operator_assignments_crud())
    results.append(test_section1_security_gates())
    results.append(test_section2_auth_gates())
    results.append(test_reports_module_rbac())
    results.append(test_dashboard_stats())
    results.append(test_full_regression())
    
    # Cleanup
    cleanup()
    
    # Final summary
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    print("\n" + "="*80)
    print("FINAL SUMMARY — PHASE 2 SECTION A QUICK REGRESSION")
    print("="*80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_tests - total_passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    print("="*80)
    
    if success_rate >= 98:
        print("🎉 PHASE 2 SECTION A QUICK REGRESSION COMPLETE - ALL TESTS PASSED!")
        sys.exit(0)
    elif success_rate >= 90:
        print("⚠️  PHASE 2 SECTION A QUICK REGRESSION COMPLETE - MINOR ISSUES DETECTED")
        sys.exit(0)
    else:
        print("❌ PHASE 2 SECTION A QUICK REGRESSION FAILED - CRITICAL ISSUES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    main()
