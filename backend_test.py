#!/usr/bin/env python3
"""
FOPS Application Comprehensive Backend Testing
Testing all authentication flows, role-based access, and API endpoints
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import uuid

# Test configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
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

# Global variables for session management
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

def test_health_check():
    """Test basic health check endpoint"""
    print("\n=== 1. HEALTH CHECK ===")
    
    response = make_request("GET", "/health")
    if response and response.status_code == 200:
        data = response.json()
        log_test("Health Check", True, f"Status: {data.get('status')}, DB: {data.get('database')}")
    else:
        log_test("Health Check", False, f"Status code: {response.status_code if response else 'No response'}")

def test_authentication():
    """Test authentication flows for all roles"""
    print("\n=== 2. AUTHENTICATION & SESSION ===")
    
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
                           f"Role: {user['role']}, Sites: {len(sites)}, Token: {session['access_token'][:20]}...")
                else:
                    log_test(f"{role.title()} Login", False, 
                           f"Role mismatch: {user['role']} != {role} or Site count: {len(sites)} != {creds['expected_sites']}")
            else:
                log_test(f"{role.title()} Login", False, "Missing required fields in response")
        else:
            log_test(f"{role.title()} Login", False, 
                   f"Status: {response.status_code if response else 'No response'}")
    
    # Test invalid credentials
    response = make_request("POST", "/auth/login", {
        "email": "invalid@example.com",
        "password": "wrongpassword"
    })
    
    if response and response.status_code == 401:
        log_test("Invalid Credentials Rejection", True, "401 Unauthorized returned correctly")
    else:
        log_test("Invalid Credentials Rejection", False, 
               f"Expected 401, got {response.status_code if response else 'No response'}")

def test_sites_api():
    """Test sites API with role-based access"""
    print("\n=== 3. SITES API & ROLE-BASED ACCESS ===")
    
    for role in ["owner", "operator", "staff"]:
        if role not in sessions:
            continue
            
        response = make_request("GET", "/sites", role=role)
        
        if response and response.status_code == 200:
            sites = response.json()
            expected_count = TEST_CREDENTIALS[role]["expected_sites"]
            
            if len(sites) == expected_count:
                log_test(f"{role.title()} Sites Access", True, 
                       f"Retrieved {len(sites)} sites (expected {expected_count})")
            else:
                log_test(f"{role.title()} Sites Access", False, 
                       f"Got {len(sites)} sites, expected {expected_count}")
        else:
            log_test(f"{role.title()} Sites Access", False, 
                   f"Status: {response.status_code if response else 'No response'}")

def test_operator_assignments():
    """Test operator assignment APIs"""
    print("\n=== 4. OPERATOR ROLE WORKFLOWS ===")
    
    if "owner" not in sessions:
        log_test("Operator Assignments", False, "Owner session not available")
        return
    
    # Test GET operator assignments (Owner should see all)
    response = make_request("GET", "/operator-assignments", role="owner")
    
    if response and response.status_code == 200:
        assignments = response.json()
        log_test("GET Operator Assignments", True, f"Retrieved {len(assignments)} assignments")
        
        # Test creating new operator assignment
        if sessions["owner"]["sites"]:
            site_id = sessions["owner"]["sites"][0]["id"]
            
            # First create an operator user
            new_operator_data = {
                "name": "Test Operator",
                "email": f"test-operator-{uuid.uuid4().hex[:8]}@test.com",
                "password": "TestPassword123!",
                "role": "operator"
            }
            
            user_response = make_request("POST", "/users", new_operator_data, role="owner")
            
            if user_response and user_response.status_code == 200:
                operator_user = user_response.json()
                
                # Create assignment
                assignment_data = {
                    "operator_user_id": operator_user["id"],
                    "site_id": site_id,
                    "assigned_by_owner_id": sessions["owner"]["user_id"]
                }
                
                assign_response = make_request("POST", "/operator-assignments", assignment_data, role="owner")
                
                if assign_response and assign_response.status_code == 200:
                    log_test("POST Operator Assignment", True, "Successfully created operator assignment")
                else:
                    log_test("POST Operator Assignment", False, 
                           f"Status: {assign_response.status_code if assign_response else 'No response'}")
            else:
                log_test("Create Operator User", False, "Failed to create test operator")
    else:
        log_test("GET Operator Assignments", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_staff_assignments():
    """Test staff assignment APIs with permission checks"""
    print("\n=== 5. STAFF ROLE WORKFLOWS ===")
    
    if "operator" not in sessions:
        log_test("Staff Assignments", False, "Operator session not available")
        return
    
    # Test GET staff assignments
    response = make_request("GET", "/staff-assignments", role="operator")
    
    if response and response.status_code == 200:
        assignments = response.json()
        log_test("GET Staff Assignments", True, f"Retrieved {len(assignments)} assignments")
        
        # Test creating staff assignment to ALLOWED site
        operator_sites = sessions["operator"]["sites"]
        if operator_sites:
            allowed_site_id = operator_sites[0]["id"]
            
            # Create a staff user first
            new_staff_data = {
                "name": "Test Staff",
                "email": f"test-staff-{uuid.uuid4().hex[:8]}@test.com", 
                "password": "TestPassword123!",
                "role": "staff"
            }
            
            user_response = make_request("POST", "/users", new_staff_data, role="operator")
            
            if user_response and user_response.status_code == 200:
                staff_user = user_response.json()
                
                # Test assignment to ALLOWED site
                assignment_data = {
                    "staff_user_id": staff_user["id"],
                    "site_id": allowed_site_id,
                    "assigned_by_operator_id": sessions["operator"]["user_id"]
                }
                
                assign_response = make_request("POST", "/staff-assignments", assignment_data, role="operator")
                
                if assign_response and assign_response.status_code == 200:
                    log_test("POST Staff Assignment (Allowed Site)", True, "Successfully created staff assignment")
                else:
                    log_test("POST Staff Assignment (Allowed Site)", False, 
                           f"Status: {assign_response.status_code if assign_response else 'No response'}")
                
                # Test assignment to UNAUTHORIZED site (should fail)
                if "owner" in sessions and sessions["owner"]["sites"]:
                    # Find a site the operator doesn't have access to
                    owner_sites = [s["id"] for s in sessions["owner"]["sites"]]
                    operator_site_ids = [s["id"] for s in operator_sites]
                    unauthorized_sites = [s for s in owner_sites if s not in operator_site_ids]
                    
                    if unauthorized_sites:
                        unauthorized_assignment = {
                            "staff_user_id": staff_user["id"],
                            "site_id": unauthorized_sites[0],
                            "assigned_by_operator_id": sessions["operator"]["user_id"]
                        }
                        
                        unauth_response = make_request("POST", "/staff-assignments", unauthorized_assignment, role="operator")
                        
                        if unauth_response and unauth_response.status_code == 403:
                            log_test("POST Staff Assignment (Unauthorized Site)", True, "403 Forbidden returned correctly")
                        else:
                            log_test("POST Staff Assignment (Unauthorized Site)", False, 
                                   f"Expected 403, got {unauth_response.status_code if unauth_response else 'No response'}")
            else:
                log_test("Create Staff User", False, "Failed to create test staff user")
    else:
        log_test("GET Staff Assignments", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_field_configs():
    """Test site field configuration APIs"""
    print("\n=== 6. SITE FIELD CONFIGURATIONS ===")
    
    if "operator" not in sessions or not sessions["operator"]["sites"]:
        log_test("Field Configs", False, "Operator session or sites not available")
        return
    
    site_id = sessions["operator"]["sites"][0]["id"]
    
    # Test GET field configs
    response = make_request("GET", f"/site-field-configs?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        configs = response.json()
        log_test("GET Site Field Configs", True, f"Retrieved {len(configs)} field configurations")
        
        # Test creating new field config
        new_config = {
            "site_id": site_id,
            "field_name": f"test_field_{uuid.uuid4().hex[:8]}",
            "field_label": "Test Field",
            "field_type": "number",
            "is_core_field": False,
            "is_enabled": True,
            "display_order": 999
        }
        
        create_response = make_request("POST", "/site-field-configs", new_config, role="operator")
        
        if create_response and create_response.status_code == 200:
            log_test("POST Site Field Config", True, "Successfully created field configuration")
        else:
            log_test("POST Site Field Config", False, 
                   f"Status: {create_response.status_code if create_response else 'No response'}")
    else:
        log_test("GET Site Field Configs", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_banking_formulas():
    """Test banking formula APIs"""
    print("\n=== 7. BANKING FORMULAS & CALCULATIONS ===")
    
    if "operator" not in sessions or not sessions["operator"]["sites"]:
        log_test("Banking Formulas", False, "Operator session or sites not available")
        return
    
    site_id = sessions["operator"]["sites"][0]["id"]
    
    # Test GET banking formulas
    response = make_request("GET", f"/site-banking-formulas?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        formulas = response.json()
        log_test("GET Site Banking Formulas", True, f"Retrieved {len(formulas)} banking formulas")
        
        # Test creating new banking formula
        new_formula = {
            "site_id": site_id,
            "name": f"Test Formula {uuid.uuid4().hex[:8]}",
            "result_label": "Test Result",
            "formula_json": json.dumps({
                "operations": [
                    {"type": "field", "value": "eftpos"},
                    {"type": "operator", "value": "+"},
                    {"type": "field", "value": "cash"}
                ]
            }),
            "visible_to_staff": True,
            "visible_in_operator_daily_summary": True
        }
        
        create_response = make_request("POST", "/site-banking-formulas", new_formula, role="operator")
        
        if create_response and create_response.status_code == 200:
            log_test("POST Banking Formula", True, "Successfully created banking formula")
            
            # Test banking calculation
            test_data = {
                "formula_json": new_formula["formula_json"],
                "shift_data": {
                    "eftpos": 1500.50,
                    "cash": 250.25
                }
            }
            
            calc_response = make_request("POST", "/banking/calculate", test_data, role="operator")
            
            if calc_response and calc_response.status_code == 200:
                result = calc_response.json()
                expected_result = 1500.50 + 250.25
                
                if abs(result.get("result", 0) - expected_result) < 0.01:
                    log_test("Banking Calculate API", True, f"Calculation correct: {result.get('result')}")
                else:
                    log_test("Banking Calculate API", False, 
                           f"Calculation incorrect: got {result.get('result')}, expected {expected_result}")
            else:
                log_test("Banking Calculate API", False, 
                       f"Status: {calc_response.status_code if calc_response else 'No response'}")
        else:
            log_test("POST Banking Formula", False, 
                   f"Status: {create_response.status_code if create_response else 'No response'}")
    else:
        log_test("GET Site Banking Formulas", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_shift_reports():
    """Test shift report submission and retrieval"""
    print("\n=== 8. SHIFT REPORTS & AUTO-CALCULATION ===")
    
    if "staff" not in sessions or not sessions["staff"]["sites"]:
        log_test("Shift Reports", False, "Staff session or sites not available")
        return
    
    site_id = sessions["staff"]["sites"][0]["id"]
    
    # Test GET reports (staff should see only their own)
    response = make_request("GET", f"/reports?userId={sessions['staff']['user_id']}", role="staff")
    
    if response and response.status_code == 200:
        reports = response.json()
        log_test("GET Staff Reports", True, f"Retrieved {len(reports)} reports")
        
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
        
        create_response = make_request("POST", "/reports", new_report, role="staff")
        
        if create_response and create_response.status_code == 200:
            report = create_response.json()
            log_test("POST Shift Report", True, f"Successfully created report ID: {report.get('id')}")
        else:
            log_test("POST Shift Report", False, 
                   f"Status: {create_response.status_code if create_response else 'No response'}")
    else:
        log_test("GET Staff Reports", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_daily_rollups():
    """Test daily rollup aggregation"""
    print("\n=== 9. DAILY ROLLUPS & AGGREGATION ===")
    
    if "operator" not in sessions or not sessions["operator"]["sites"]:
        log_test("Daily Rollups", False, "Operator session or sites not available")
        return
    
    site_ids = ",".join([site["id"] for site in sessions["operator"]["sites"]])
    
    response = make_request("GET", f"/reports/daily-rollup?siteIds={site_ids}", role="operator")
    
    if response and response.status_code == 200:
        rollups = response.json()
        log_test("GET Daily Rollups", True, f"Retrieved {len(rollups)} daily rollups")
    else:
        log_test("GET Daily Rollups", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_dashboard_stats():
    """Test dashboard statistics"""
    print("\n=== 10. DASHBOARD STATS ===")
    
    for role in ["owner", "operator"]:
        if role not in sessions or not sessions[role]["sites"]:
            continue
            
        site_ids = ",".join([site["id"] for site in sessions[role]["sites"]])
        
        response = make_request("GET", f"/dashboard/stats?siteIds={site_ids}", role=role)
        
        if response and response.status_code == 200:
            stats = response.json()
            required_fields = ["total_sales", "fuel_sales", "shop_sales", "total_reports"]
            
            if all(field in stats for field in required_fields):
                log_test(f"{role.title()} Dashboard Stats", True, 
                       f"Total Sales: ${stats.get('total_sales', 0):,.2f}, Reports: {stats.get('total_reports', 0)}")
            else:
                log_test(f"{role.title()} Dashboard Stats", False, "Missing required fields")
        else:
            log_test(f"{role.title()} Dashboard Stats", False, 
                   f"Status: {response.status_code if response else 'No response'}")

def test_fuel_price_apis():
    """Test fuel price intelligence APIs"""
    print("\n=== 11. FUEL PRICE INTELLIGENCE ===")
    
    if "operator" not in sessions or not sessions["operator"]["sites"]:
        log_test("Fuel Price APIs", False, "Operator session or sites not available")
        return
    
    site_id = sessions["operator"]["sites"][0]["id"]
    
    # Test site competitors
    response = make_request("GET", f"/site-competitors?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        competitors = response.json()
        log_test("GET Site Competitors", True, f"Retrieved {len(competitors)} competitors")
    else:
        log_test("GET Site Competitors", False, 
               f"Status: {response.status_code if response else 'No response'}")
    
    # Test fuel price entries
    response = make_request("GET", f"/fuel-price-entries?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        entries = response.json()
        log_test("GET Fuel Price Entries", True, f"Retrieved {len(entries)} price entries")
    else:
        log_test("GET Fuel Price Entries", False, 
               f"Status: {response.status_code if response else 'No response'}")
    
    # Test competitor prices
    response = make_request("GET", f"/competitor-prices?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        prices = response.json()
        log_test("GET Competitor Prices", True, f"Retrieved {len(prices)} competitor prices")
    else:
        log_test("GET Competitor Prices", False, 
               f"Status: {response.status_code if response else 'No response'}")
    
    # Test fuel price comparison
    response = make_request("GET", f"/fuel-price-comparison?siteId={site_id}", role="operator")
    
    if response and response.status_code == 200:
        comparison = response.json()
        log_test("GET Fuel Price Comparison", True, "Price comparison data retrieved")
    else:
        log_test("GET Fuel Price Comparison", False, 
               f"Status: {response.status_code if response else 'No response'}")

def test_permission_boundaries():
    """Test security boundaries and unauthorized access"""
    print("\n=== 12. PERMISSIONS & SECURITY ===")
    
    # Test owner trying to access staff creation (should fail)
    if "owner" in sessions:
        staff_data = {
            "name": "Unauthorized Staff",
            "email": f"unauth-staff-{uuid.uuid4().hex[:8]}@test.com",
            "password": "TestPassword123!",
            "role": "staff"
        }
        
        response = make_request("POST", "/users", staff_data, role="owner")
        
        if response and response.status_code == 403:
            log_test("Owner → Staff Creation (Should Fail)", True, "403 Forbidden returned correctly")
        else:
            log_test("Owner → Staff Creation (Should Fail)", False, 
                   f"Expected 403, got {response.status_code if response else 'No response'}")
    
    # Test staff trying to access operator endpoints (should fail)
    if "staff" in sessions:
        response = make_request("GET", "/operator-assignments", role="staff")
        
        if response and response.status_code == 403:
            log_test("Staff → Operator Endpoints (Should Fail)", True, "403 Forbidden returned correctly")
        else:
            log_test("Staff → Operator Endpoints (Should Fail)", False, 
                   f"Expected 403, got {response.status_code if response else 'No response'}")

def test_data_seeding():
    """Test database seeding functionality"""
    print("\n=== 13. DATABASE SEEDING ===")
    
    response = make_request("POST", "/seed")
    
    if response and response.status_code == 200:
        result = response.json()
        if result.get("success"):
            log_test("Database Seeding", True, "Seeding completed successfully")
        else:
            log_test("Database Seeding", False, f"Seeding failed: {result.get('error', 'Unknown error')}")
    else:
        log_test("Database Seeding", False, 
               f"Status: {response.status_code if response else 'No response'}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("COMPREHENSIVE BACKEND TESTING SUMMARY")
    print("="*60)
    
    passed = sum(1 for result in test_results if result["passed"])
    total = len(test_results)
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    
    print("\n=== FAILED TESTS ===")
    failed_tests = [result for result in test_results if not result["passed"]]
    
    if failed_tests:
        for result in failed_tests:
            print(f"❌ {result['test']}: {result['details']}")
    else:
        print("🎉 ALL TESTS PASSED!")
    
    print("\n=== CRITICAL ISSUES ===")
    critical_failures = []
    
    # Check for critical authentication failures
    auth_failures = [r for r in failed_tests if "Login" in r["test"] or "Authentication" in r["test"]]
    if auth_failures:
        critical_failures.extend(auth_failures)
    
    # Check for sites API failures
    sites_failures = [r for r in failed_tests if "Sites" in r["test"]]
    if sites_failures:
        critical_failures.extend(sites_failures)
    
    # Check for permission boundary failures
    permission_failures = [r for r in failed_tests if "Should Fail" in r["test"]]
    if permission_failures:
        critical_failures.extend(permission_failures)
    
    if critical_failures:
        print("🚨 CRITICAL SECURITY/AUTH ISSUES FOUND:")
        for failure in critical_failures:
            print(f"   • {failure['test']}: {failure['details']}")
    else:
        print("✅ No critical security issues found")

def main():
    """Main test execution"""
    print("FOPS APPLICATION - COMPREHENSIVE BACKEND TESTING")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Execute all test suites
        test_health_check()
        test_authentication()
        test_sites_api()
        test_operator_assignments()
        test_staff_assignments()
        test_field_configs()
        test_banking_formulas()
        test_shift_reports()
        test_daily_rollups()
        test_dashboard_stats()
        test_fuel_price_apis()
        test_permission_boundaries()
        test_data_seeding()
        
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