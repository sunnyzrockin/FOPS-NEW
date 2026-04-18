#!/usr/bin/env python3
"""
Final Comprehensive Backend Test - Post-Deployment Analysis
"""

import requests
import json
import os

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://fuel-ops-simple.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

TEST_CREDENTIALS = {
    'owner': {'email': 'owner@workflowlite.com', 'password': 'WorkflowDemo2026!'},
    'operator': {'email': 'operator@workflowlite.com', 'password': 'WorkflowDemo2026!'},
    'staff': {'email': 'staff@workflowlite.com', 'password': 'WorkflowDemo2026!'}
}

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
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request error for {method} {url}: {e}")
        return None

def run_final_comprehensive_test():
    """Run final comprehensive test"""
    print("🎯 FINAL COMPREHENSIVE BACKEND TEST")
    print("=" * 60)
    
    results = {
        'total_tests': 0,
        'passed_tests': 0,
        'failed_tests': 0,
        'critical_issues': [],
        'working_features': [],
        'broken_features': []
    }
    
    # 1. Health Check
    print("\n1. HEALTH CHECK")
    response = make_request('GET', '/health')
    if response and response.status_code == 200:
        data = response.json()
        print(f"✅ Health Check: {data.get('status')} - {data.get('database')}")
        results['working_features'].append("Health Check")
        results['passed_tests'] += 1
    else:
        print(f"❌ Health Check Failed")
        results['broken_features'].append("Health Check")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # 2. Authentication Tests
    print("\n2. AUTHENTICATION TESTS")
    auth_tokens = {}
    
    # Test each user type
    for user_type, credentials in TEST_CREDENTIALS.items():
        response = make_request('POST', '/auth/login', credentials)
        if response and response.status_code == 200:
            data = response.json()
            auth_tokens[user_type] = data.get('session', {}).get('access_token')
            sites_count = len(data.get('sites', []))
            print(f"✅ {user_type.title()} Login: {data.get('user', {}).get('name')} - {sites_count} sites")
            results['working_features'].append(f"{user_type.title()} Authentication")
            results['passed_tests'] += 1
        else:
            print(f"❌ {user_type.title()} Login Failed: {response.status_code if response else 'No response'}")
            results['broken_features'].append(f"{user_type.title()} Authentication")
            results['failed_tests'] += 1
            if user_type == 'owner':
                results['critical_issues'].append("Owner authentication failed - critical for system access")
        results['total_tests'] += 1
    
    # Test invalid credentials
    response = make_request('POST', '/auth/login', {'email': 'invalid@test.com', 'password': 'wrong'})
    if response and response.status_code == 401:
        print("✅ Invalid Credentials Properly Rejected")
        results['working_features'].append("Invalid Credentials Rejection")
        results['passed_tests'] += 1
    else:
        print(f"❌ Invalid Credentials Not Properly Rejected: {response.status_code if response else 'No response'}")
        results['broken_features'].append("Invalid Credentials Rejection")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # 3. Core Data APIs
    print("\n3. CORE DATA APIS")
    
    # Users API
    response = make_request('GET', '/users')
    if response and response.status_code == 200:
        users = response.json()
        print(f"✅ Users API: {len(users)} users")
        results['working_features'].append("Users API")
        results['passed_tests'] += 1
        if len(users) < 3:
            results['critical_issues'].append(f"Only {len(users)} users in database - seeding incomplete")
    else:
        print(f"❌ Users API Failed")
        results['broken_features'].append("Users API")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # Sites API
    response = make_request('GET', '/sites')
    if response and response.status_code == 200:
        sites = response.json()
        print(f"✅ Sites API: {len(sites)} sites")
        if len(sites) > 0:
            results['working_features'].append("Sites API")
            results['passed_tests'] += 1
        else:
            print("❌ CRITICAL: Sites table is empty")
            results['broken_features'].append("Sites API")
            results['critical_issues'].append("Sites table empty - core functionality broken")
            results['failed_tests'] += 1
    else:
        print(f"❌ Sites API Failed")
        results['broken_features'].append("Sites API")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # Reports API
    response = make_request('GET', '/reports')
    if response and response.status_code == 200:
        reports = response.json()
        print(f"✅ Reports API: {len(reports)} reports")
        results['working_features'].append("Reports API")
        results['passed_tests'] += 1
    else:
        print(f"❌ Reports API Failed")
        results['broken_features'].append("Reports API")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # 4. Role-Based Access (Known Issue)
    print("\n4. ROLE-BASED ACCESS TESTING")
    
    if auth_tokens.get('owner'):
        response = make_request('GET', '/sites', auth_token=auth_tokens['owner'])
        if response and response.status_code == 200:
            sites = response.json()
            if len(sites) > 0:
                print(f"✅ Owner Sites Access: {len(sites)} sites")
                results['working_features'].append("Owner Sites Access")
                results['passed_tests'] += 1
            else:
                print("❌ CRITICAL: Owner sees 0 sites with Bearer token")
                results['broken_features'].append("Owner Sites Access")
                results['critical_issues'].append("Sites API with Bearer token returns 0 sites - authentication issue")
                results['failed_tests'] += 1
        else:
            print(f"❌ Owner Sites Access Failed")
            results['broken_features'].append("Owner Sites Access")
            results['failed_tests'] += 1
    else:
        print("❌ Cannot test Owner Sites Access - no auth token")
        results['broken_features'].append("Owner Sites Access")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # 5. Assignments APIs
    print("\n5. ASSIGNMENTS TESTING")
    
    response = make_request('GET', '/operator-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        if len(assignments) > 0:
            print(f"✅ Operator Assignments: {len(assignments)} assignments")
            results['working_features'].append("Operator Assignments")
            results['passed_tests'] += 1
        else:
            print("❌ Operator Assignments Empty")
            results['broken_features'].append("Operator Assignments")
            results['critical_issues'].append("Operator assignments table empty - role hierarchy broken")
            results['failed_tests'] += 1
    else:
        print(f"❌ Operator Assignments Failed")
        results['broken_features'].append("Operator Assignments")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    response = make_request('GET', '/staff-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        if len(assignments) > 0:
            print(f"✅ Staff Assignments: {len(assignments)} assignments")
            results['working_features'].append("Staff Assignments")
            results['passed_tests'] += 1
        else:
            print("❌ Staff Assignments Empty")
            results['broken_features'].append("Staff Assignments")
            results['critical_issues'].append("Staff assignments table empty - role hierarchy broken")
            results['failed_tests'] += 1
    else:
        print(f"❌ Staff Assignments Failed")
        results['broken_features'].append("Staff Assignments")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # 6. Advanced Features (if sites exist)
    print("\n6. ADVANCED FEATURES TESTING")
    
    sites_response = make_request('GET', '/sites')
    if sites_response and sites_response.status_code == 200:
        sites = sites_response.json()
        if sites:
            site_id = sites[0]['id']
            
            # Banking formulas
            response = make_request('GET', f'/site-banking-formulas?siteId={site_id}')
            if response and response.status_code == 200:
                formulas = response.json()
                print(f"✅ Banking Formulas: {len(formulas)} formulas")
                results['working_features'].append("Banking Formulas")
                results['passed_tests'] += 1
                
                # Test calculate API
                if formulas:
                    test_data = {
                        'formula_json': '{"operations": [{"type": "field", "value": "eftpos"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "cash"}]}',
                        'shift_data': {'eftpos': 3100, 'cash': 600}
                    }
                    
                    calc_response = make_request('POST', '/banking/calculate', test_data)
                    if calc_response and calc_response.status_code == 200:
                        result = calc_response.json()
                        print(f"✅ Banking Calculate: {result.get('result')}")
                        results['working_features'].append("Banking Calculate")
                        results['passed_tests'] += 1
                    else:
                        print(f"❌ Banking Calculate Failed")
                        results['broken_features'].append("Banking Calculate")
                        results['failed_tests'] += 1
                    results['total_tests'] += 1
            else:
                print(f"❌ Banking Formulas Failed")
                results['broken_features'].append("Banking Formulas")
                results['failed_tests'] += 1
            results['total_tests'] += 1
        else:
            print("⚠️  Skipping advanced features - no sites available")
            results['broken_features'].extend(["Banking Formulas", "Banking Calculate"])
            results['failed_tests'] += 2
            results['total_tests'] += 2
    
    # 7. Seed API Test
    print("\n7. SEED API TEST")
    response = make_request('POST', '/seed')
    if response and response.status_code == 200:
        result = response.json()
        print(f"✅ Seed API: {result.get('message')}")
        results['working_features'].append("Seed API")
        results['passed_tests'] += 1
    else:
        print(f"❌ Seed API Failed")
        results['broken_features'].append("Seed API")
        results['failed_tests'] += 1
    results['total_tests'] += 1
    
    # Summary
    print("\n" + "=" * 60)
    print("🎯 FINAL TEST SUMMARY")
    print("=" * 60)
    
    pass_rate = (results['passed_tests'] / results['total_tests'] * 100) if results['total_tests'] > 0 else 0
    
    print(f"Total Tests: {results['total_tests']}")
    print(f"Passed: {results['passed_tests']}")
    print(f"Failed: {results['failed_tests']}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    print(f"\n✅ WORKING FEATURES ({len(results['working_features'])}):")
    for feature in results['working_features']:
        print(f"  • {feature}")
    
    print(f"\n❌ BROKEN FEATURES ({len(results['broken_features'])}):")
    for feature in results['broken_features']:
        print(f"  • {feature}")
    
    print(f"\n🚨 CRITICAL ISSUES ({len(results['critical_issues'])}):")
    for issue in results['critical_issues']:
        print(f"  • {issue}")
    
    return results

if __name__ == "__main__":
    run_final_comprehensive_test()