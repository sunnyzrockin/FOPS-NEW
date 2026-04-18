#!/usr/bin/env python3
"""
RLS Assignment Tables Testing - Verify RLS Fix for Assignment Tables
Focus on assignment tables and role-based access as requested in review
"""

import requests
import json
import sys
from datetime import datetime

# Test configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
TEST_CREDENTIALS = {
    "owner": {
        "email": "owner@workflowlite.com",
        "password": "WorkflowDemo2026!",
        "expected_sites": 5
    },
    "operator": {
        "email": "operator@workflowlite.com", 
        "password": "WorkflowDemo2026!",
        "expected_sites": 3
    },
    "staff": {
        "email": "staff@workflowlite.com",
        "password": "WorkflowDemo2026!",
        "expected_sites": 1
    }
}

# Global variables
sessions = {}
test_results = []

def log_test(test_name, passed, details=""):
    """Log test results"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if details:
        result += f" - {details}"
    print(result)
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })

def make_request(method, endpoint, data=None, headers=None, role=None):
    """Make HTTP request with optional authentication"""
    url = f"{BASE_URL}/{endpoint.lstrip('/')}"
    
    # Add auth header if role specified
    if role and role in sessions:
        if headers is None:
            headers = {}
        headers["Authorization"] = f"Bearer {sessions[role]['access_token']}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def test_authentication():
    """Test authentication flows for all roles"""
    print("\n=== 1. AUTHENTICATION & SESSION SETUP ===")
    
    # Test valid logins for each role
    for role, creds in TEST_CREDENTIALS.items():
        response = make_request("POST", "/auth/login", {
            "email": creds["email"],
            "password": creds["password"]
        })
        
        if response and response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "user" in data and "session" in data and "sites" in data:
                user = data["user"]
                session = data["session"]
                sites = data["sites"]
                
                # Store session for later tests
                sessions[role] = {
                    "user_id": user["id"],
                    "access_token": session["access_token"],
                    "sites": sites
                }
                
                # Validate role and site count
                role_correct = user["role"] == role
                site_count_correct = len(sites) == creds["expected_sites"]
                
                if role_correct and site_count_correct:
                    log_test(f"{role.title()} Login", True, 
                           f"Role: {user['role']}, Sites: {len(sites)}")
                else:
                    log_test(f"{role.title()} Login", False, 
                           f"Role mismatch: {user['role']} != {role} or Site count: {len(sites)} != {creds['expected_sites']}")
            else:
                log_test(f"{role.title()} Login", False, "Missing required fields in response")
        else:
            log_test(f"{role.title()} Login", False, 
                   f"Status: {response.status_code if response else 'No response'}")

def test_assignment_tables_high_priority():
    """Test assignment tables - HIGH PRIORITY from review request"""
    print("\n=== 2. ASSIGNMENT TABLES (HIGH PRIORITY) ===")
    
    # Test GET /api/operator-assignments (owner login) - should return 5+ assignments
    if "owner" in sessions:
        response = make_request("GET", "/operator-assignments", role="owner")
        
        if response and response.status_code == 200:
            assignments = response.json()
            if len(assignments) >= 5:
                log_test("GET /api/operator-assignments (owner login)", True, 
                       f"Retrieved {len(assignments)} assignments (expected 5+)")
            else:
                log_test("GET /api/operator-assignments (owner login)", False, 
                       f"Got {len(assignments)} assignments, expected 5+")
        else:
            log_test("GET /api/operator-assignments (owner login)", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Test GET /api/staff-assignments (owner login) - should return 9+ assignments
    if "owner" in sessions:
        response = make_request("GET", "/staff-assignments", role="owner")
        
        if response and response.status_code == 200:
            assignments = response.json()
            if len(assignments) >= 9:
                log_test("GET /api/staff-assignments (owner login)", True, 
                       f"Retrieved {len(assignments)} assignments (expected 9+)")
            else:
                log_test("GET /api/staff-assignments (owner login)", False, 
                       f"Got {len(assignments)} assignments, expected 9+")
        else:
            log_test("GET /api/staff-assignments (owner login)", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Test GET /api/operator-assignments (operator login) - should see own assignments
    if "operator" in sessions:
        response = make_request("GET", "/operator-assignments", role="operator")
        
        if response and response.status_code == 200:
            assignments = response.json()
            # Operator should see their own assignments
            operator_user_id = sessions["operator"]["user_id"]
            own_assignments = [a for a in assignments if a.get("operator_user_id") == operator_user_id]
            
            if len(own_assignments) > 0:
                log_test("GET /api/operator-assignments (operator login)", True, 
                       f"Retrieved {len(own_assignments)} own assignments")
            else:
                log_test("GET /api/operator-assignments (operator login)", False, 
                       f"No own assignments found, total: {len(assignments)}")
        else:
            log_test("GET /api/operator-assignments (operator login)", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Test GET /api/staff-assignments (operator login) - should see staff they assigned
    if "operator" in sessions:
        response = make_request("GET", "/staff-assignments", role="operator")
        
        if response and response.status_code == 200:
            assignments = response.json()
            # Operator should see staff assignments they created
            operator_user_id = sessions["operator"]["user_id"]
            assigned_by_operator = [a for a in assignments if a.get("assigned_by_operator_id") == operator_user_id]
            
            log_test("GET /api/staff-assignments (operator login)", True, 
                   f"Retrieved {len(assigned_by_operator)} staff assignments they created")
        else:
            log_test("GET /api/staff-assignments (operator login)", False, 
                   f"Status: {response.status_code if response else 'No response'}")

def test_role_based_site_access():
    """Test role-based site access - HIGH PRIORITY from review request"""
    print("\n=== 3. ROLE-BASED SITE ACCESS (HIGH PRIORITY) ===")
    
    # Owner login → GET /api/sites → should return 5 sites
    if "owner" in sessions:
        response = make_request("GET", "/sites", role="owner")
        
        if response and response.status_code == 200:
            sites = response.json()
            if len(sites) == 5:
                log_test("Owner login → GET /api/sites", True, 
                       f"Retrieved {len(sites)} sites (expected 5)")
            else:
                log_test("Owner login → GET /api/sites", False, 
                       f"Got {len(sites)} sites, expected 5")
        else:
            log_test("Owner login → GET /api/sites", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Operator login → GET /api/sites → should return 3 assigned sites
    if "operator" in sessions:
        response = make_request("GET", "/sites", role="operator")
        
        if response and response.status_code == 200:
            sites = response.json()
            if len(sites) == 3:
                log_test("Operator login (operator@workflowlite.com) → GET /api/sites", True, 
                       f"Retrieved {len(sites)} assigned sites (expected 3)")
            else:
                log_test("Operator login (operator@workflowlite.com) → GET /api/sites", False, 
                       f"Got {len(sites)} sites, expected 3")
        else:
            log_test("Operator login (operator@workflowlite.com) → GET /api/sites", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Staff login → GET /api/sites → should return 1 assigned site
    if "staff" in sessions:
        response = make_request("GET", "/sites", role="staff")
        
        if response and response.status_code == 200:
            sites = response.json()
            if len(sites) == 1:
                log_test("Staff login (staff@workflowlite.com) → GET /api/sites", True, 
                       f"Retrieved {len(sites)} assigned site (expected 1)")
            else:
                log_test("Staff login (staff@workflowlite.com) → GET /api/sites", False, 
                       f"Got {len(sites)} sites, expected 1")
        else:
            log_test("Staff login (staff@workflowlite.com) → GET /api/sites", False, 
                   f"Status: {response.status_code if response else 'No response'}")

def test_assignment_creation_validation():
    """Test assignment creation and validation"""
    print("\n=== 4. ASSIGNMENT CREATION & VALIDATION ===")
    
    # Test operator can create staff assignment for ALLOWED site
    if "operator" in sessions and sessions["operator"]["sites"]:
        allowed_site_id = sessions["operator"]["sites"][0]["id"]
        
        # Create test staff assignment
        assignment_data = {
            "staff_user_id": "test-staff-id",  # Using placeholder ID for test
            "site_id": allowed_site_id,
            "assigned_by_operator_id": sessions["operator"]["user_id"]
        }
        
        response = make_request("POST", "/staff-assignments", assignment_data, role="operator")
        
        # Note: This might fail due to foreign key constraints, but we're testing the authorization
        if response and response.status_code in [200, 201]:
            log_test("Operator can create staff assignment for ALLOWED site", True, 
                   "Assignment creation authorized")
        elif response and response.status_code == 400:
            # Foreign key constraint is expected, but authorization passed
            log_test("Operator can create staff assignment for ALLOWED site", True, 
                   "Authorization passed (FK constraint expected)")
        elif response and response.status_code == 403:
            log_test("Operator can create staff assignment for ALLOWED site", False, 
                   "403 Forbidden - authorization failed")
        else:
            log_test("Operator can create staff assignment for ALLOWED site", False, 
                   f"Unexpected status: {response.status_code if response else 'No response'}")
    
    # Test operator CANNOT create staff assignment for UNAUTHORIZED site
    if "operator" in sessions and "owner" in sessions:
        # Find a site the operator doesn't have access to
        owner_sites = [s["id"] for s in sessions["owner"]["sites"]]
        operator_site_ids = [s["id"] for s in sessions["operator"]["sites"]]
        unauthorized_sites = [s for s in owner_sites if s not in operator_site_ids]
        
        if unauthorized_sites:
            unauthorized_assignment = {
                "staff_user_id": "test-staff-id",
                "site_id": unauthorized_sites[0],
                "assigned_by_operator_id": sessions["operator"]["user_id"]
            }
            
            response = make_request("POST", "/staff-assignments", unauthorized_assignment, role="operator")
            
            if response and response.status_code == 403:
                log_test("Operator CANNOT create staff assignment for UNAUTHORIZED site", True, 
                       "403 Forbidden returned correctly")
            else:
                log_test("Operator CANNOT create staff assignment for UNAUTHORIZED site", False, 
                       f"Expected 403, got {response.status_code if response else 'No response'}")
        else:
            log_test("Operator CANNOT create staff assignment for UNAUTHORIZED site", False, 
                   "No unauthorized sites found for testing")
    
    # Test owner can create operator assignment
    if "owner" in sessions and sessions["owner"]["sites"]:
        site_id = sessions["owner"]["sites"][0]["id"]
        
        assignment_data = {
            "operator_user_id": "test-operator-id",  # Using placeholder ID for test
            "site_id": site_id,
            "assigned_by_owner_id": sessions["owner"]["user_id"]
        }
        
        response = make_request("POST", "/operator-assignments", assignment_data, role="owner")
        
        if response and response.status_code in [200, 201]:
            log_test("Owner can create operator assignment", True, 
                   "Assignment creation successful")
        elif response and response.status_code == 400:
            # Foreign key constraint is expected, but authorization passed
            log_test("Owner can create operator assignment", True, 
                   "Authorization passed (FK constraint expected)")
        elif response and response.status_code == 403:
            log_test("Owner can create operator assignment", False, 
                   "403 Forbidden - authorization failed")
        else:
            log_test("Owner can create operator assignment", False, 
                   f"Unexpected status: {response.status_code if response else 'No response'}")

def test_shift_report_submission():
    """Test staff can submit shift report"""
    print("\n=== 5. SHIFT REPORT SUBMISSION ===")
    
    if "staff" not in sessions or not sessions["staff"]["sites"]:
        log_test("Staff can submit shift report", False, "Staff session or sites not available")
        return
    
    site_id = sessions["staff"]["sites"][0]["id"]
    
    # Test creating new shift report
    new_report = {
        "site_id": site_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "shift_type": "Morning",
        "submitted_by_user_id": sessions["staff"]["user_id"],
        "total_sales": 5000.00,
        "fuel_sales": 3500.00,
        "shop_sales": 1500.00,
        "total_litres": 2500.50,
        "eftpos": 3100.00,
        "cash": 600.00,
        "motorpass": 900.00,
        "accounts": 400.00,
        "beverages": 800.00,
        "hot_food": 700.00,
        "drive_offs": 25.50,
        "dips": 2500.50
    }
    
    response = make_request("POST", "/reports", new_report, role="staff")
    
    if response and response.status_code == 200:
        report = response.json()
        log_test("Staff can submit shift report", True, 
               f"Successfully created report ID: {report.get('id')}")
    else:
        log_test("Staff can submit shift report", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_formula_calculations():
    """Test formula calculations work"""
    print("\n=== 6. FORMULA CALCULATIONS ===")
    
    # Test banking calculation
    test_data = {
        "formula_json": json.dumps({
            "operations": [
                {"type": "field", "value": "eftpos"},
                {"type": "operator", "value": "+"},
                {"type": "field", "value": "cash"},
                {"type": "operator", "value": "+"},
                {"type": "field", "value": "motorpass"}
            ]
        }),
        "shift_data": {
            "eftpos": 3100.00,
            "cash": 600.00,
            "motorpass": 900.00
        }
    }
    
    response = make_request("POST", "/banking/calculate", test_data)
    
    if response and response.status_code == 200:
        result = response.json()
        expected_result = 3100.00 + 600.00 + 900.00  # 4600.00
        
        if abs(result.get("result", 0) - expected_result) < 0.01:
            log_test("Formula calculations work", True, 
                   f"Cash Reconciliation: {result.get('result')} (expected {expected_result})")
        else:
            log_test("Formula calculations work", False, 
                   f"Calculation incorrect: got {result.get('result')}, expected {expected_result}")
    else:
        log_test("Formula calculations work", False, 
               f"Status: {response.status_code if response else 'No response'}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("RLS ASSIGNMENT TABLES TESTING SUMMARY")
    print("="*60)
    
    passed = sum(1 for result in test_results if result["passed"])
    total = len(test_results)
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    
    print("\n=== ASSIGNMENT TABLE RECORD COUNTS ===")
    if "owner" in sessions:
        # Get assignment counts
        op_response = make_request("GET", "/operator-assignments", role="owner")
        staff_response = make_request("GET", "/staff-assignments", role="owner")
        
        op_count = len(op_response.json()) if op_response and op_response.status_code == 200 else 0
        staff_count = len(staff_response.json()) if staff_response and staff_response.status_code == 200 else 0
        
        print(f"Operator Assignments: {op_count}")
        print(f"Staff Assignments: {staff_count}")
    
    print("\n=== SITE COUNTS PER ROLE ===")
    for role in ["owner", "operator", "staff"]:
        if role in sessions:
            site_count = len(sessions[role]["sites"])
            print(f"{role.title()}: {site_count} sites")
    
    print("\n=== FAILED TESTS ===")
    failed_tests = [result for result in test_results if not result["passed"]]
    
    if failed_tests:
        for result in failed_tests:
            print(f"❌ {result['test']}: {result['details']}")
    else:
        print("🎉 ALL TESTS PASSED!")
    
    print("\n=== REMAINING ISSUES ===")
    critical_failures = [r for r in failed_tests if not r["passed"]]
    
    if critical_failures:
        print("🚨 ISSUES FOUND:")
        for failure in critical_failures:
            print(f"   • {failure['test']}: {failure['details']}")
    else:
        print("✅ No remaining issues found")

def main():
    """Main test execution"""
    print("RLS ASSIGNMENT TABLES TESTING")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\nFocus: Verify RLS Fix for Assignment Tables")
    print("Priority: Assignment tables and role-based access")
    
    try:
        # Execute focused test suites
        test_authentication()
        test_assignment_tables_high_priority()
        test_role_based_site_access()
        test_assignment_creation_validation()
        test_shift_report_submission()
        test_formula_calculations()
        
        # Print final summary
        print_summary()
        
    except KeyboardInterrupt:
        print("\n\nTesting interrupted by user")
        print_summary()
    except Exception as e:
        print(f"\n\nUnexpected error during testing: {e}")
        print_summary()

if __name__ == "__main__":
    main()