#!/usr/bin/env python3
"""
Comprehensive E2E Backend Testing for FOPS (Field Operations System)
Tests the full Owner → Operator → Staff 3-tier hierarchy plus portfolio endpoint
"""

import requests
import json
from datetime import datetime
from typing import Dict, Optional

# Configuration
BASE_URL = "http://localhost:3000"
SUPABASE_URL = "https://xjpelthxnnetecfympmv.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_qWlmWcHoiwSqZlzLi9YmWw_xlB-kpsr"
PASSWORD = "WorkflowDemo2026!"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "expected_sites": 5},
    "operator": {"email": "operator@workflowlite.com", "expected_sites": 3},
    "staff": {"email": "staff@workflowlite.com", "expected_sites": 1}
}

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")
    
    test_results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1

def get_supabase_jwt(email: str, password: str) -> Optional[str]:
    """Get JWT token from Supabase Auth"""
    try:
        url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        }
        body = {
            "email": email,
            "password": password
        }
        
        response = requests.post(url, headers=headers, json=body)
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
        else:
            print(f"Failed to get JWT for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Exception getting JWT for {email}: {str(e)}")
        return None

def test_auth_flows():
    """A) AUTH FLOW (Sanity)"""
    print("\n" + "="*80)
    print("A) AUTH FLOW TESTS")
    print("="*80)
    
    # Test 1: Owner login
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CREDENTIALS["owner"]["email"], "password": PASSWORD}
        )
        passed = response.status_code == 200
        if passed:
            data = response.json()
            sites_count = len(data.get("sites", []))
            passed = sites_count == CREDENTIALS["owner"]["expected_sites"]
            log_test(
                "Owner login returns 5 sites",
                passed,
                f"Status: {response.status_code}, Sites: {sites_count}"
            )
        else:
            log_test("Owner login returns 5 sites", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Owner login returns 5 sites", False, str(e))
    
    # Test 2: Operator login
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CREDENTIALS["operator"]["email"], "password": PASSWORD}
        )
        passed = response.status_code == 200
        if passed:
            data = response.json()
            sites_count = len(data.get("sites", []))
            passed = sites_count == CREDENTIALS["operator"]["expected_sites"]
            log_test(
                "Operator login returns 3 sites",
                passed,
                f"Status: {response.status_code}, Sites: {sites_count}"
            )
        else:
            log_test("Operator login returns 3 sites", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Operator login returns 3 sites", False, str(e))
    
    # Test 3: Staff login
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CREDENTIALS["staff"]["email"], "password": PASSWORD}
        )
        passed = response.status_code == 200
        if passed:
            data = response.json()
            sites_count = len(data.get("sites", []))
            passed = sites_count == CREDENTIALS["staff"]["expected_sites"]
            log_test(
                "Staff login returns 1 site",
                passed,
                f"Status: {response.status_code}, Sites: {sites_count}"
            )
        else:
            log_test("Staff login returns 1 site", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Staff login returns 1 site", False, str(e))
    
    # Test 4: Invalid credentials
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CREDENTIALS["owner"]["email"], "password": "WrongPassword123!"}
        )
        passed = response.status_code == 401
        log_test(
            "Invalid credentials rejected with 401",
            passed,
            f"Status: {response.status_code}"
        )
    except Exception as e:
        log_test("Invalid credentials rejected with 401", False, str(e))
    
    # Test 5: Supabase JWT issuance for all 3 users
    jwt_tokens = {}
    for role, creds in CREDENTIALS.items():
        token = get_supabase_jwt(creds["email"], PASSWORD)
        jwt_tokens[role] = token
        log_test(
            f"Supabase JWT issuance for {role}",
            token is not None,
            f"Token length: {len(token) if token else 0}"
        )
    
    return jwt_tokens

def test_portfolio_endpoint(jwt_tokens: Dict[str, str]):
    """B) NEW /api/portfolio (Bearer-auth — HIGH PRIORITY)"""
    print("\n" + "="*80)
    print("B) PORTFOLIO ENDPOINT TESTS")
    print("="*80)
    
    # Test 1: No Authorization header
    try:
        response = requests.get(f"{BASE_URL}/api/portfolio")
        passed = response.status_code == 401
        if passed:
            data = response.json()
            passed = "Missing Authorization header" in data.get("error", "")
        log_test(
            "Portfolio without auth returns 401 with correct error",
            passed,
            f"Status: {response.status_code}, Body: {response.text[:100]}"
        )
    except Exception as e:
        log_test("Portfolio without auth returns 401", False, str(e))
    
    # Test 2: Invalid Bearer token
    try:
        headers = {"Authorization": "Bearer abc"}
        response = requests.get(f"{BASE_URL}/api/portfolio", headers=headers)
        passed = response.status_code == 401
        if passed:
            data = response.json()
            passed = "Invalid or expired token" in data.get("error", "")
        log_test(
            "Portfolio with invalid token returns 401",
            passed,
            f"Status: {response.status_code}, Body: {response.text[:100]}"
        )
    except Exception as e:
        log_test("Portfolio with invalid token returns 401", False, str(e))
    
    # Test 3: Owner with historical date
    if jwt_tokens.get("owner"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['owner']}"}
            response = requests.get(
                f"{BASE_URL}/api/portfolio?date=2026-04-13",
                headers=headers
            )
            passed = response.status_code == 200
            if passed:
                data = response.json()
                # Validate response shape
                has_user = "user" in data and data["user"].get("role") == "owner"
                has_date = data.get("date") == "2026-04-13"
                has_summary = "summary" in data and "total_sites" in data["summary"]
                has_sites = "sites" in data and isinstance(data["sites"], list)
                
                summary = data.get("summary", {})
                sites = data.get("sites", [])
                
                # Check summary fields
                summary_valid = all(k in summary for k in [
                    "total_sites", "total_sales_today", "total_sales_yesterday",
                    "sales_change_pct", "total_litres_today", "total_litres_yesterday",
                    "litres_change_pct", "total_reports_today", "sites_with_reports_today"
                ])
                
                # Check site count
                site_count_valid = summary.get("total_sites") == 5 and len(sites) == 5
                
                # Check site structure
                site_valid = True
                if sites:
                    site = sites[0]
                    required_fields = ["id", "name", "owner_id", "status", "todayStats", 
                                     "yesterdayStats", "fuelPrices", "competitorPrices"]
                    site_valid = all(k in site for k in required_fields)
                    
                    # Check stats structure
                    if "todayStats" in site:
                        stats_fields = ["total_sales", "fuel_sales", "shop_sales", "total_litres",
                                      "eftpos", "motorpass", "cash", "accounts", "report_count",
                                      "shifts_covered", "latest_report_at", "latest_report_id"]
                        site_valid = site_valid and all(k in site["todayStats"] for k in stats_fields)
                
                passed = (has_user and has_date and has_summary and has_sites and 
                         summary_valid and site_count_valid and site_valid)
                
                log_test(
                    "Owner portfolio with date=2026-04-13 returns correct shape",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}, "
                    f"Total Sales Today: ${summary.get('total_sales_today', 0):.2f}, "
                    f"Reports Today: {summary.get('total_reports_today', 0)}"
                )
            else:
                log_test("Owner portfolio with date=2026-04-13", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Owner portfolio with date=2026-04-13", False, str(e))
    
    # Test 4: Operator with historical date (RBAC check)
    if jwt_tokens.get("operator"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['operator']}"}
            response = requests.get(
                f"{BASE_URL}/api/portfolio?date=2026-04-13",
                headers=headers
            )
            passed = response.status_code == 200
            if passed:
                data = response.json()
                summary = data.get("summary", {})
                sites = data.get("sites", [])
                
                # Operator should see only 3 sites
                passed = summary.get("total_sites") == 3 and len(sites) == 3
                
                # Check site names (should be Brisbane, Gold Coast, Sunshine Coast)
                site_names = [s.get("name", "") for s in sites]
                expected_names = ["Brisbane Central", "Gold Coast", "Sunshine Coast"]
                rbac_valid = all(any(exp in name for exp in expected_names) for name in site_names)
                
                passed = passed and rbac_valid
                
                log_test(
                    "Operator portfolio shows only 3 assigned sites (RBAC)",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}, Names: {site_names}"
                )
            else:
                log_test("Operator portfolio RBAC", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Operator portfolio RBAC", False, str(e))
    
    # Test 5: Staff with historical date (RBAC check)
    if jwt_tokens.get("staff"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['staff']}"}
            response = requests.get(
                f"{BASE_URL}/api/portfolio?date=2026-04-13",
                headers=headers
            )
            passed = response.status_code == 200
            if passed:
                data = response.json()
                summary = data.get("summary", {})
                sites = data.get("sites", [])
                
                # Staff should see only 1 site
                passed = summary.get("total_sites") == 1 and len(sites) == 1
                
                # Check site name (should be Brisbane)
                if sites:
                    site_name = sites[0].get("name", "")
                    passed = passed and "Brisbane" in site_name
                
                log_test(
                    "Staff portfolio shows only 1 assigned site (RBAC)",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}"
                )
            else:
                log_test("Staff portfolio RBAC", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Staff portfolio RBAC", False, str(e))
    
    # Test 6: Owner without date param (defaults to today)
    if jwt_tokens.get("owner"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['owner']}"}
            response = requests.get(f"{BASE_URL}/api/portfolio", headers=headers)
            passed = response.status_code == 200
            if passed:
                data = response.json()
                today = datetime.utcnow().strftime("%Y-%m-%d")
                passed = data.get("date") == today
                log_test(
                    "Owner portfolio without date defaults to today",
                    passed,
                    f"Status: {response.status_code}, Date: {data.get('date')}, Expected: {today}"
                )
            else:
                log_test("Owner portfolio without date", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Owner portfolio without date", False, str(e))
    
    # Test 7: Status indicator logic validation
    if jwt_tokens.get("owner"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['owner']}"}
            response = requests.get(
                f"{BASE_URL}/api/portfolio?date=2026-04-13",
                headers=headers
            )
            if response.status_code == 200:
                data = response.json()
                sites = data.get("sites", [])
                
                # Check for different status types
                statuses = [s.get("status") for s in sites]
                has_critical = "critical" in statuses
                has_warning = "warning" in statuses
                has_good = "good" in statuses
                
                # Validate status logic for at least one site
                status_logic_valid = True
                for site in sites:
                    status = site.get("status")
                    today_stats = site.get("todayStats", {})
                    yesterday_stats = site.get("yesterdayStats", {})
                    
                    report_count = today_stats.get("report_count", 0)
                    today_sales = today_stats.get("total_sales", 0)
                    yesterday_sales = yesterday_stats.get("total_sales", 0)
                    
                    # Validate critical status
                    if status == "critical" and report_count > 0:
                        status_logic_valid = False
                        break
                    
                    # Validate warning status
                    if status == "warning":
                        if report_count == 0 or yesterday_sales == 0:
                            status_logic_valid = False
                            break
                        if today_sales >= yesterday_sales * 0.8:
                            status_logic_valid = False
                            break
                
                passed = status_logic_valid and (has_good or has_critical or has_warning)
                
                log_test(
                    "Status indicator logic validation",
                    passed,
                    f"Statuses found: {set(statuses)}, Logic valid: {status_logic_valid}"
                )
            else:
                log_test("Status indicator logic", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Status indicator logic", False, str(e))

def test_catch_all_routes():
    """C) CATCH-ALL ROUTES (verify they work after vercel.json fix)"""
    print("\n" + "="*80)
    print("C) CATCH-ALL ROUTES TESTS")
    print("="*80)
    
    routes = [
        ("GET /api/sites?userId=owner-001", f"{BASE_URL}/api/sites?userId=owner-001", "GET", None, 5),
        ("GET /api/sites?userId=operator-001", f"{BASE_URL}/api/sites?userId=operator-001", "GET", None, 3),
        ("GET /api/reports", f"{BASE_URL}/api/reports", "GET", None, None),
        ("GET /api/operator-assignments?ownerId=owner-001", f"{BASE_URL}/api/operator-assignments?ownerId=owner-001", "GET", None, None),
        ("GET /api/staff-assignments?operatorId=operator-001", f"{BASE_URL}/api/staff-assignments?operatorId=operator-001", "GET", None, None),
        ("GET /api/site-competitors?siteId=site-001", f"{BASE_URL}/api/site-competitors?siteId=site-001", "GET", None, None),
        ("GET /api/fuel-price-entries?siteId=site-001", f"{BASE_URL}/api/fuel-price-entries?siteId=site-001", "GET", None, None),
        ("GET /api/competitor-prices?siteId=site-001", f"{BASE_URL}/api/competitor-prices?siteId=site-001", "GET", None, None),
        ("GET /api/daily-rollups?siteIds=site-001&date=2026-04-13", f"{BASE_URL}/api/daily-rollups?siteIds=site-001&date=2026-04-13", "GET", None, None),
        ("GET /api/dashboard/stats?siteIds=site-001", f"{BASE_URL}/api/dashboard/stats?siteIds=site-001", "GET", None, None),
        ("GET /api/site-field-configs?siteId=site-001", f"{BASE_URL}/api/site-field-configs?siteId=site-001", "GET", None, None),
        ("GET /api/site-banking-formulas?siteId=site-001", f"{BASE_URL}/api/site-banking-formulas?siteId=site-001", "GET", None, None),
        ("POST /api/banking/calculate", f"{BASE_URL}/api/banking/calculate", "POST", {"formula_json": '{"operations":[{"type":"field","value":"eftpos"},{"type":"operator","value":"+"},{"type":"field","value":"cash"}]}', "shift_data": {"eftpos": 100, "cash": 50}}, None),
    ]
    
    for test_name, url, method, body, expected_count in routes:
        try:
            if method == "GET":
                response = requests.get(url)
            else:
                response = requests.post(url, json=body)
            
            passed = response.status_code == 200
            
            if passed:
                try:
                    data = response.json()
                    # Verify it's JSON, not HTML
                    is_json = isinstance(data, (dict, list))
                    passed = is_json
                    
                    # Check expected count if provided
                    if expected_count is not None and isinstance(data, list):
                        actual_count = len(data)
                        passed = passed and actual_count == expected_count
                        details = f"Status: {response.status_code}, Count: {actual_count}, Expected: {expected_count}"
                    elif isinstance(data, dict) and "result" in data:
                        details = f"Status: {response.status_code}, Result: {data.get('result')}"
                    else:
                        details = f"Status: {response.status_code}, Type: {type(data).__name__}"
                    
                    log_test(test_name, passed, details)
                except:
                    log_test(test_name, False, f"Status: {response.status_code}, Not JSON")
            else:
                log_test(test_name, False, f"Status: {response.status_code}")
        except Exception as e:
            log_test(test_name, False, str(e))

def test_hierarchy_e2e(jwt_tokens: Dict[str, str]):
    """D) FULL HIERARCHY E2E FLOW"""
    print("\n" + "="*80)
    print("D) FULL HIERARCHY E2E FLOW")
    print("="*80)
    
    # Test 1: Owner logs in and fetches portfolio
    if jwt_tokens.get("owner"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['owner']}"}
            response = requests.get(f"{BASE_URL}/api/portfolio", headers=headers)
            passed = response.status_code == 200
            if passed:
                data = response.json()
                sites = data.get("sites", [])
                passed = len(sites) == 5
                log_test(
                    "Owner fetches portfolio and sees all 5 sites",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}"
                )
            else:
                log_test("Owner fetches portfolio", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Owner fetches portfolio", False, str(e))
    
    # Test 2: Owner fetches operators
    try:
        response = requests.get(f"{BASE_URL}/api/users?role=operator")
        passed = response.status_code == 200
        if passed:
            data = response.json()
            passed = isinstance(data, list) and len(data) > 0
            log_test(
                "Owner fetches list of operators",
                passed,
                f"Status: {response.status_code}, Count: {len(data) if isinstance(data, list) else 0}"
            )
        else:
            log_test("Owner fetches operators", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Owner fetches operators", False, str(e))
    
    # Test 3: Operator logs in and fetches portfolio
    if jwt_tokens.get("operator"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['operator']}"}
            response = requests.get(f"{BASE_URL}/api/portfolio", headers=headers)
            passed = response.status_code == 200
            if passed:
                data = response.json()
                sites = data.get("sites", [])
                passed = len(sites) == 3
                log_test(
                    "Operator fetches portfolio and sees only 3 assigned sites",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}"
                )
            else:
                log_test("Operator fetches portfolio", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Operator fetches portfolio", False, str(e))
    
    # Test 4: Operator fetches staff assignments
    try:
        response = requests.get(f"{BASE_URL}/api/staff-assignments?operatorId=operator-001")
        passed = response.status_code == 200
        if passed:
            data = response.json()
            passed = isinstance(data, list)
            log_test(
                "Operator fetches staff assignments",
                passed,
                f"Status: {response.status_code}, Count: {len(data) if isinstance(data, list) else 0}"
            )
        else:
            log_test("Operator fetches staff assignments", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Operator fetches staff assignments", False, str(e))
    
    # Test 5: Staff logs in and fetches portfolio
    if jwt_tokens.get("staff"):
        try:
            headers = {"Authorization": f"Bearer {jwt_tokens['staff']}"}
            response = requests.get(f"{BASE_URL}/api/portfolio", headers=headers)
            passed = response.status_code == 200
            if passed:
                data = response.json()
                sites = data.get("sites", [])
                passed = len(sites) == 1
                log_test(
                    "Staff fetches portfolio and sees only 1 assigned site",
                    passed,
                    f"Status: {response.status_code}, Sites: {len(sites)}"
                )
            else:
                log_test("Staff fetches portfolio", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test("Staff fetches portfolio", False, str(e))

def test_health_endpoint():
    """E) /api/health (Sanity)"""
    print("\n" + "="*80)
    print("E) HEALTH ENDPOINT TEST")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        passed = response.status_code == 200
        if passed:
            data = response.json()
            version_marker = data.get("version_marker")
            expected_marker = "fops-2026-05-09-portfolio-v2-bearer-04"
            passed = version_marker == expected_marker
            log_test(
                "Health endpoint returns correct version marker",
                passed,
                f"Status: {response.status_code}, Marker: {version_marker}, Expected: {expected_marker}"
            )
        else:
            log_test("Health endpoint", False, f"Status: {response.status_code}")
    except Exception as e:
        log_test("Health endpoint", False, str(e))

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = test_results["passed"] + test_results["failed"]
    success_rate = (test_results["passed"] / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success Rate: {success_rate:.1f}%")
    
    if test_results["failed"] > 0:
        print("\nFailed Tests:")
        for test in test_results["tests"]:
            if not test["passed"]:
                print(f"  ❌ {test['name']}")
                if test["details"]:
                    print(f"     {test['details']}")

def main():
    """Main test execution"""
    print("="*80)
    print("FOPS COMPREHENSIVE E2E BACKEND TESTING")
    print("Testing against: " + BASE_URL)
    print("="*80)
    
    # Run all test suites
    jwt_tokens = test_auth_flows()
    test_portfolio_endpoint(jwt_tokens)
    test_catch_all_routes()
    test_hierarchy_e2e(jwt_tokens)
    test_health_endpoint()
    
    # Print summary
    print_summary()
    
    # Return exit code based on results
    return 0 if test_results["failed"] == 0 else 1

if __name__ == "__main__":
    exit(main())
