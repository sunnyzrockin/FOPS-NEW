#!/usr/bin/env python3
"""
Focused Backend Testing - Post-Seed Validation
Testing the known issues and critical APIs after seeding
"""

import requests
import json
import os

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://fuel-ops-simple.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

# Test credentials
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

def test_post_seed_validation():
    """Test critical APIs after seeding"""
    print("🔍 POST-SEED VALIDATION TESTING")
    print("=" * 50)
    
    # 1. Test Authentication and get tokens
    print("\n1. AUTHENTICATION TESTING")
    auth_tokens = {}
    
    # Owner login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['owner'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['owner'] = data.get('session', {}).get('access_token')
        sites_in_login = len(data.get('sites', []))
        print(f"✅ Owner Login: {data.get('user', {}).get('name')} - {sites_in_login} sites in login response")
    else:
        print(f"❌ Owner Login Failed: {response.status_code if response else 'No response'}")
        return
    
    # Operator login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['operator'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['operator'] = data.get('session', {}).get('access_token')
        sites_in_login = len(data.get('sites', []))
        print(f"✅ Operator Login: {data.get('user', {}).get('name')} - {sites_in_login} sites in login response")
    else:
        print(f"❌ Operator Login Failed: {response.status_code if response else 'No response'}")
    
    # Staff login
    response = make_request('POST', '/auth/login', TEST_CREDENTIALS['staff'])
    if response and response.status_code == 200:
        data = response.json()
        auth_tokens['staff'] = data.get('session', {}).get('access_token')
        sites_in_login = len(data.get('sites', []))
        print(f"✅ Staff Login: {data.get('user', {}).get('name')} - {sites_in_login} sites in login response")
    else:
        print(f"❌ Staff Login Failed: {response.status_code if response else 'No response'}")
    
    # 2. Test Sites API (KNOWN ISSUE)
    print("\n2. SITES API TESTING (KNOWN ISSUE)")
    
    # Test without auth
    response = make_request('GET', '/sites')
    if response and response.status_code == 200:
        sites = response.json()
        print(f"✅ Sites API (No Auth): {len(sites)} sites")
    else:
        print(f"❌ Sites API (No Auth) Failed: {response.status_code if response else 'No response'}")
    
    # Test with Owner auth token (KNOWN ISSUE)
    if auth_tokens.get('owner'):
        response = make_request('GET', '/sites', auth_token=auth_tokens['owner'])
        if response and response.status_code == 200:
            sites = response.json()
            if len(sites) > 0:
                print(f"✅ Sites API (Owner Auth): {len(sites)} sites - ISSUE RESOLVED!")
            else:
                print(f"❌ Sites API (Owner Auth): 0 sites - KNOWN ISSUE PERSISTS")
        else:
            print(f"❌ Sites API (Owner Auth) Failed: {response.status_code if response else 'No response'}")
    
    # 3. Test Assignments (KNOWN ISSUE)
    print("\n3. ASSIGNMENTS TESTING (KNOWN ISSUE)")
    
    # Operator assignments
    response = make_request('GET', '/operator-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        if len(assignments) > 0:
            print(f"✅ Operator Assignments: {len(assignments)} assignments - ISSUE RESOLVED!")
        else:
            print(f"❌ Operator Assignments: 0 assignments - SEEDING ISSUE PERSISTS")
    else:
        print(f"❌ Operator Assignments Failed: {response.status_code if response else 'No response'}")
    
    # Staff assignments
    response = make_request('GET', '/staff-assignments')
    if response and response.status_code == 200:
        assignments = response.json()
        if len(assignments) > 0:
            print(f"✅ Staff Assignments: {len(assignments)} assignments - ISSUE RESOLVED!")
        else:
            print(f"❌ Staff Assignments: 0 assignments - SEEDING ISSUE PERSISTS")
    else:
        print(f"❌ Staff Assignments Failed: {response.status_code if response else 'No response'}")
    
    # 4. Test Core APIs
    print("\n4. CORE APIS TESTING")
    
    # Users
    response = make_request('GET', '/users')
    if response and response.status_code == 200:
        users = response.json()
        print(f"✅ Users API: {len(users)} users")
    else:
        print(f"❌ Users API Failed: {response.status_code if response else 'No response'}")
    
    # Reports
    response = make_request('GET', '/reports')
    if response and response.status_code == 200:
        reports = response.json()
        print(f"✅ Reports API: {len(reports)} reports")
    else:
        print(f"❌ Reports API Failed: {response.status_code if response else 'No response'}")
    
    # 5. Test Banking and Advanced Features
    print("\n5. ADVANCED FEATURES TESTING")
    
    # Get site for testing
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
                
                # Test calculate API
                if formulas:
                    test_data = {
                        'formula_json': formulas[0].get('formula_json', '{"operations": [{"type": "field", "value": "eftpos"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "cash"}]}'),
                        'shift_data': {'eftpos': 3100, 'cash': 600, 'motorpass': 900}
                    }
                    
                    calc_response = make_request('POST', '/banking/calculate', test_data)
                    if calc_response and calc_response.status_code == 200:
                        result = calc_response.json()
                        print(f"✅ Banking Calculate: Result = {result.get('result')}")
                    else:
                        print(f"❌ Banking Calculate Failed: {calc_response.status_code if calc_response else 'No response'}")
            else:
                print(f"❌ Banking Formulas Failed: {response.status_code if response else 'No response'}")
            
            # Field configs
            response = make_request('GET', f'/site-field-configs?siteId={site_id}')
            if response and response.status_code == 200:
                configs = response.json()
                print(f"✅ Field Configs: {len(configs)} configurations")
            else:
                print(f"❌ Field Configs Failed: {response.status_code if response else 'No response'}")
            
            # Dashboard stats
            response = make_request('GET', f'/dashboard/stats?siteIds={site_id}')
            if response and response.status_code == 200:
                stats = response.json()
                print(f"✅ Dashboard Stats: ${stats.get('total_sales', 0):,.2f} total sales, {stats.get('total_reports', 0)} reports")
            else:
                print(f"❌ Dashboard Stats Failed: {response.status_code if response else 'No response'}")
    
    print("\n" + "=" * 50)
    print("🎯 POST-SEED VALIDATION COMPLETE")

if __name__ == "__main__":
    test_post_seed_validation()