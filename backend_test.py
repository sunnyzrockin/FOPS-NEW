#!/usr/bin/env python3
"""
WorkflowLite Backend API Testing Suite
Post-Deployment Validation - Comprehensive Backend Testing

Tests all backend workflows and APIs:
1. Authentication Flows (Owner, Operator, Staff)
2. Role-Based Access & Hierarchy
3. Site Management APIs
4. User & Assignment Management
5. Shift Reports Workflow
6. Banking Formula System
7. Daily Rollups & Aggregations
8. Dynamic Field Configuration
9. Dashboard Statistics
10. Fuel Price Intelligence
11. Data Integrity
"""

import requests
import json
import os
from datetime import datetime, timedelta

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://fuel-ops-simple.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
TEST_CREDENTIALS = {
    'owner': {'email': 'owner@workflowlite.com', 'password': 'WorkflowDemo2026!'},
    'operator': {'email': 'operator@workflowlite.com', 'password': 'WorkflowDemo2026!'},
    'staff': {'email': 'staff@workflowlite.com', 'password': 'WorkflowDemo2026!'}
}

# Global test state
test_results = []
auth_tokens = {}
user_data = {}

def log_test(test_name, success, details=""):
    """Log test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    test_results.append({
        'test': test_name,
        'success': success,
        'details': details,
        'status': status
    })
    print(f"{status}: {test_name}")
    if details:
        print(f"    Details: {details}")

def make_request(method, endpoint, data=None, headers=None, auth_token=None):
    """Make HTTP request with proper error handling"""
    url = f"{API_BASE}/{endpoint.lstrip('/')}"
    
    request_headers = {'Content-Type': 'application/json'}
    if headers:
        request_headers.update(headers)
    if auth_token:
        request_headers['Authorization'] = f'Bearer {auth_token}'
    
    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=request_headers, timeout=30)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, headers=request_headers, timeout=30)
        elif method.upper() == 'PUT':
            response = requests.put(url, json=data, headers=request_headers, timeout=30)
        elif method.upper() == 'DELETE':
            response = requests.delete(url, headers=request_headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request error for {method} {url}: {e}")
        return None

def test_health_check():
    """Test basic API health"""
    response = make_request('GET', '/health')
    if response and response.status_code == 200:
        data = response.json()
        log_test("Health Check", True, f"Status: {data.get('status')}, Database: {data.get('database')}")
        return True
    else:
        log_test("Health Check", False, f"Status code: {response.status_code if response else 'No response'}")
        return False

def test_authentication_flows():
    """Test all authentication flows"""
    print("\n=== AUTHENTICATION FLOWS ===")
    
    # Test Owner Login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['owner'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['owner'] = data.get('session', {}).get('access_token')
        user_data['owner'] = data.get('user')
        sites_count = len(data.get('sites', []))
        log_test("Owner Login", True, f"User: {data.get('user', {}).get('name')}, Sites: {sites_count}, Role: {data.get('user', {}).get('role')}")
    else:
        log_test("Owner Login", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Operator Login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['operator'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['operator'] = data.get('session', {}).get('access_token')
        user_data['operator'] = data.get('user')
        sites_count = len(data.get('sites', []))
        log_test("Operator Login", True, f"User: {data.get('user', {}).get('name')}, Sites: {sites_count}, Role: {data.get('user', {}).get('role')}")
    else:
        log_test("Operator Login", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Staff Login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['staff'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['staff'] = data.get('session', {}).get('access_token')
        user_data['staff'] = data.get('user')
        sites_count = len(data.get('sites', []))
        log_test("Staff Login", True, f"User: {data.get('user', {}).get('name')}, Sites: {sites_count}, Role: {data.get('user', {}).get('role')}")
    else:
        log_test("Staff Login", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Invalid Credentials
    response = make_request('POST', '/auth/login', {'email': 'invalid@test.com', 'password': 'wrongpassword'})
    if response and response.status_code == 401:
        log_test("Invalid Credentials Rejection", True, "Correctly rejected invalid credentials")
    else:
        log_test("Invalid Credentials Rejection", False, f"Expected 401, got {response.status_code if response else 'No response'}")

def test_role_based_access():
    """Test role-based access and hierarchy - KNOWN ISSUE TO RETEST"""
    print("\n=== ROLE-BASED ACCESS & HIERARCHY ===")
    
    # Test Sites API with Bearer token (KNOWN ISSUE)
    if auth_tokens.get('owner'):
        response = make_request('GET', '/sites', auth_token=auth_tokens['owner'])
        if response and response.status_code == 200:
            sites = response.json()
            sites_count = len(sites)
            if sites_count > 0:
                log_test("Sites API with Auth Token (Owner)", True, f"Owner sees {sites_count} sites")
            else:
                log_test("Sites API with Auth Token (Owner)", False, "CRITICAL: Owner sees 0 sites with Bearer token (known issue)")
        else:
            log_test("Sites API with Auth Token (Owner)", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Operator Sites Access
    if auth_tokens.get('operator'):
        response = make_request('GET', '/sites', auth_token=auth_tokens['operator'])
        if response and response.status_code == 200:
            sites = response.json()
            sites_count = len(sites)
            log_test("Sites API with Auth Token (Operator)", sites_count > 0, f"Operator sees {sites_count} sites")
        else:
            log_test("Sites API with Auth Token (Operator)", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Staff Sites Access
    if auth_tokens.get('staff'):
        response = make_request('GET', '/sites', auth_token=auth_tokens['staff'])
        if response and response.status_code == 200:
            sites = response.json()
            sites_count = len(sites)
            log_test("Sites API with Auth Token (Staff)", sites_count > 0, f"Staff sees {sites_count} sites")
        else:
            log_test("Sites API with Auth Token (Staff)", False, f"Status: {response.status_code if response else 'No response'}")

def test_site_assignments():
    """Test site assignments - KNOWN ISSUE TO RETEST"""
    print("\n=== SITE ASSIGNMENTS ===")
    
    # Test Operator Assignments
    response = make_request('GET', '/operator-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        assignments_count = len(assignments)
        if assignments_count > 0:
            log_test("Operator Assignments API", True, f"Found {assignments_count} operator assignments")
        else:
            log_test("Operator Assignments API", False, "SEEDING ISSUE: Operator assignments table empty")
    else:
        log_test("Operator Assignments API", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Staff Assignments
    response = make_request('GET', '/staff-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        assignments_count = len(assignments)
        if assignments_count > 0:
            log_test("Staff Assignments API", True, f"Found {assignments_count} staff assignments")
        else:
            log_test("Staff Assignments API", False, "SEEDING ISSUE: Staff assignments table empty")
    else:
        log_test("Staff Assignments API", False, f"Status: {response.status_code if response else 'No response'}")

def test_site_management():
    """Test site management APIs"""
    print("\n=== SITE MANAGEMENT ===")
    
    # Test GET Sites (without auth - should work)
    response = make_request('GET', '/sites')
    if response and response.status_code == 200:
        sites = response.json()
        log_test("GET Sites API", True, f"Retrieved {len(sites)} sites")
    else:
        log_test("GET Sites API", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test GET Site by ID
    if response and response.status_code == 200 and sites:
        site_id = sites[0]['id']
        response = make_request('GET', f'/sites/{site_id}')
        if response and response.status_code == 200:
            site = response.json()
            log_test("GET Site by ID", True, f"Retrieved site: {site.get('name')}")
        else:
            log_test("GET Site by ID", False, f"Status: {response.status_code if response else 'No response'}")

def test_user_management():
    """Test user management APIs"""
    print("\n=== USER MANAGEMENT ===")
    
    # Test GET Users
    response = make_request('GET', '/users')
    if response and response.status_code == 200:
        users = response.json()
        log_test("GET Users API", True, f"Retrieved {len(users)} users")
    else:
        log_test("GET Users API", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test GET Users by Role
    response = make_request('GET', '/users?role=operator')
    if response and response.status_code == 200:
        operators = response.json()
        log_test("GET Users by Role (Operator)", True, f"Found {len(operators)} operators")
    else:
        log_test("GET Users by Role (Operator)", False, f"Status: {response.status_code if response else 'No response'}")

def test_shift_reports():
    """Test shift reports workflow"""
    print("\n=== SHIFT REPORTS WORKFLOW ===")
    
    # Test GET Reports
    response = make_request('GET', '/reports')
    if response and response.status_code == 200:
        reports = response.json()
        log_test("GET Reports API", True, f"Retrieved {len(reports)} reports")
        
        # Test with filters
        if reports:
            # Test site filter
            site_id = reports[0].get('site_id')
            if site_id:
                response = make_request('GET', f'/reports?siteId={site_id}')
                if response and response.status_code == 200:
                    filtered_reports = response.json()
                    log_test("GET Reports with Site Filter", True, f"Filtered to {len(filtered_reports)} reports")
                else:
                    log_test("GET Reports with Site Filter", False, f"Status: {response.status_code if response else 'No response'}")
            
            # Test status filter
            response = make_request('GET', '/reports?status=pending')
            if response and response.status_code == 200:
                pending_reports = response.json()
                log_test("GET Reports with Status Filter", True, f"Found {len(pending_reports)} pending reports")
            else:
                log_test("GET Reports with Status Filter", False, f"Status: {response.status_code if response else 'No response'}")
    else:
        log_test("GET Reports API", False, f"Status: {response.status_code if response else 'No response'}")

def test_banking_formulas():
    """Test banking formula system"""
    print("\n=== BANKING FORMULA SYSTEM ===")
    
    # Get a site ID for testing
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_id = sites[0]['id']
            
            # Test GET Banking Formulas
            response = make_request('GET', f'/site-banking-formulas?siteId={site_id}')
            if response and response.status_code == 200:
                formulas = response.json()
                log_test("GET Banking Formulas API", True, f"Retrieved {len(formulas)} formulas for site")
                
                # Test Banking Calculate API
                if formulas:
                    formula = formulas[0]
                    test_data = {
                        'formula_json': formula.get('formula_json', '{"operations": [{"type": "field", "value": "eftpos"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "cash"}]}'),
                        'shift_data': {
                            'eftpos': 3100,
                            'cash': 600,
                            'motorpass': 900
                        }
                    }
                    
                    response = make_request('POST', '/banking/calculate', test_data)
                    if response and response.status_code == 200:
                        result = response.json()
                        log_test("Banking Calculate API", True, f"Formula calculation result: {result.get('result')}")
                    else:
                        log_test("Banking Calculate API", False, f"Status: {response.status_code if response else 'No response'}")
            else:
                log_test("GET Banking Formulas API", False, f"Status: {response.status_code if response else 'No response'}")

def test_daily_rollups():
    """Test daily rollups and aggregations"""
    print("\n=== DAILY ROLLUPS & AGGREGATIONS ===")
    
    # Get site IDs for testing
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_ids = ','.join([site['id'] for site in sites[:2]])  # Test with first 2 sites
            
            # Test Daily Rollups API
            response = make_request('GET', f'/daily-rollups?siteIds={site_ids}')
            if response and response.status_code == 200:
                rollups = response.json()
                log_test("Daily Rollups API", True, f"Retrieved {len(rollups)} daily rollups")
            else:
                log_test("Daily Rollups API", False, f"Status: {response.status_code if response else 'No response'}")

def test_field_configuration():
    """Test dynamic field configuration"""
    print("\n=== DYNAMIC FIELD CONFIGURATION ===")
    
    # Get a site ID for testing
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_id = sites[0]['id']
            
            # Test GET Field Configs
            response = make_request('GET', f'/site-field-configs?siteId={site_id}')
            if response and response.status_code == 200:
                configs = response.json()
                log_test("GET Field Configs API", True, f"Retrieved {len(configs)} field configurations")
            else:
                log_test("GET Field Configs API", False, f"Status: {response.status_code if response else 'No response'}")

def test_dashboard_statistics():
    """Test dashboard statistics"""
    print("\n=== DASHBOARD STATISTICS ===")
    
    # Get site IDs for testing
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_ids = ','.join([site['id'] for site in sites])
            
            # Test Dashboard Stats API
            response = make_request('GET', f'/dashboard/stats?siteIds={site_ids}')
            if response and response.status_code == 200:
                stats = response.json()
                total_sales = stats.get('total_sales', 0)
                total_reports = stats.get('total_reports', 0)
                log_test("Dashboard Stats API", True, f"Total Sales: ${total_sales:,.2f}, Reports: {total_reports}")
            else:
                log_test("Dashboard Stats API", False, f"Status: {response.status_code if response else 'No response'}")

def test_fuel_price_intelligence():
    """Test fuel price intelligence APIs"""
    print("\n=== FUEL PRICE INTELLIGENCE ===")
    
    # Get a site ID for testing
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_id = sites[0]['id']
            
            # Test Site Competitors API
            response = make_request('GET', f'/site-competitors?siteId={site_id}')
            if response and response.status_code == 200:
                competitors = response.json()
                log_test("Site Competitors API", True, f"Retrieved {len(competitors)} competitors")
            else:
                log_test("Site Competitors API", False, f"Status: {response.status_code if response else 'No response'}")
            
            # Test Fuel Price Entries API
            response = make_request('GET', f'/fuel-price-entries?siteId={site_id}')
            if response and response.status_code == 200:
                entries = response.json()
                log_test("Fuel Price Entries API", True, f"Retrieved {len(entries)} fuel price entries")
            else:
                log_test("Fuel Price Entries API", False, f"Status: {response.status_code if response else 'No response'}")
            
            # Test Competitor Prices API
            response = make_request('GET', f'/competitor-prices?siteId={site_id}')
            if response and response.status_code == 200:
                prices = response.json()
                log_test("Competitor Prices API", True, f"Retrieved {len(prices)} competitor prices")
            else:
                log_test("Competitor Prices API", False, f"Status: {response.status_code if response else 'No response'}")
            
            # Test Fuel Price Comparison API
            response = make_request('GET', f'/fuel-price-comparison?siteId={site_id}')
            if response and response.status_code == 200:
                comparison = response.json()
                log_test("Fuel Price Comparison API", True, f"Retrieved comparison for site: {comparison.get('site', {}).get('name')}")
            else:
                log_test("Fuel Price Comparison API", False, f"Status: {response.status_code if response else 'No response'}")

def test_data_integrity():
    """Test data integrity and PostgreSQL integration"""
    print("\n=== DATA INTEGRITY ===")
    
    # Test Users table
    response = make_request('GET', '/users')
    if response and response.status_code == 200:
        users = response.json()
        log_test("Users Table Integrity", len(users) > 0, f"Users table has {len(users)} records")
    else:
        log_test("Users Table Integrity", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Sites table
    response = make_request('GET', '/sites')
    if response and response.status_code == 200:
        sites = response.json()
        log_test("Sites Table Integrity", len(sites) > 0, f"Sites table has {len(sites)} records")
    else:
        log_test("Sites Table Integrity", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test Reports table
    response = make_request('GET', '/reports')
    if response and response.status_code == 200:
        reports = response.json()
        log_test("Reports Table Integrity", len(reports) > 0, f"Reports table has {len(reports)} records")
    else:
        log_test("Reports Table Integrity", False, f"Status: {response.status_code if response else 'No response'}")

def test_seed_database():
    """Test seed database functionality"""
    print("\n=== SEED DATABASE ===")
    
    response = make_request('POST', '/seed')
    if response and response.status_code == 200:
        result = response.json()
        log_test("Seed Database API", True, f"Seed result: {result.get('message', 'Success')}")
    else:
        log_test("Seed Database API", False, f"Status: {response.status_code if response else 'No response'}")

def run_all_tests():
    """Run all backend tests"""
    print("🚀 Starting WorkflowLite Backend API Testing Suite")
    print("=" * 60)
    
    # Basic connectivity
    if not test_health_check():
        print("❌ Health check failed - aborting tests")
        return
    
    # Core authentication and authorization
    test_authentication_flows()
    test_role_based_access()
    test_site_assignments()
    
    # API functionality
    test_site_management()
    test_user_management()
    test_shift_reports()
    test_banking_formulas()
    test_daily_rollups()
    test_field_configuration()
    test_dashboard_statistics()
    test_fuel_price_intelligence()
    test_data_integrity()
    
    # Seed functionality
    test_seed_database()
    
    # Summary
    print("\n" + "=" * 60)
    print("🎯 TEST SUMMARY")
    print("=" * 60)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results if result['success'])
    failed_tests = total_tests - passed_tests
    pass_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
    
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if failed_tests > 0:
        print(f"\n❌ FAILED TESTS ({failed_tests}):")
        for result in test_results:
            if not result['success']:
                print(f"  • {result['test']}: {result['details']}")
    
    print(f"\n🎉 BACKEND TESTING COMPLETE - {pass_rate:.1f}% SUCCESS RATE")
    
    return {
        'total': total_tests,
        'passed': passed_tests,
        'failed': failed_tests,
        'pass_rate': pass_rate,
        'results': test_results
    }

if __name__ == "__main__":
    run_all_tests()