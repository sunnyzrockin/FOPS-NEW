#!/usr/bin/env python3
"""
Comprehensive Backend Testing for FOPS Application
Testing the Owner → Operator → Staff 3-tier hierarchy flow

This script tests all P0 production failures that were just fixed:
1. POST /api/users - Create user (auth + DB row in single call)
2. GET /api/users?role=staff/operator - List users with role filtering
3. POST /api/auth/login - Login with role-based site filtering
4. Staff/Operator assignments CRUD operations
5. Sites GET with userId param support
6. End-to-end hierarchy flow simulation
"""

import requests
import json
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test credentials from /app/memory/test_credentials.md
TEST_CREDENTIALS = {
    "owner": {
        "email": "owner@workflowlite.com",
        "password": "WorkflowDemo2026!",
        "user_id": "owner-001",
        "role": "owner"
    },
    "operator": {
        "email": "operator@workflowlite.com", 
        "password": "WorkflowDemo2026!",
        "user_id": "operator-001",
        "role": "operator"
    },
    "staff": {
        "email": "staff@workflowlite.com",
        "password": "WorkflowDemo2026!", 
        "user_id": "staff-001",
        "role": "staff"
    }
}

class FOPSBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.test_results = []
        self.created_users = []  # Track for cleanup
        self.created_assignments = []  # Track for cleanup
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: dict = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response_preview"] = str(response_data)[:200] + "..." if len(str(response_data)) > 200 else str(response_data)
        
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {result['response_preview']}")
        print()

    def make_request(self, method: str, endpoint: str, data: dict = None, params: dict = None, headers: dict = None) -> Tuple[bool, dict, int]:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{API_BASE}/{endpoint.lstrip('/')}"
        
        try:
            req_headers = self.session.headers.copy()
            if headers:
                req_headers.update(headers)
                
            if method.upper() == 'GET':
                response = self.session.get(url, params=params, headers=req_headers, timeout=30)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, params=params, headers=req_headers, timeout=30)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data, params=params, headers=req_headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, params=params, headers=req_headers, timeout=30)
            else:
                return False, {"error": f"Unsupported method: {method}"}, 0
                
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text, "status_code": response.status_code}
                
            return response.status_code < 400, response_data, response.status_code
            
        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}, 0
        except requests.exceptions.RequestException as e:
            return False, {"error": f"Request failed: {str(e)}"}, 0

    def test_user_creation_endpoint(self):
        """Test P0: Production User Creation Endpoint (/api/users POST)"""
        print("🧪 Testing P0: Production User Creation Endpoint")
        
        # Generate unique email to avoid duplicates
        timestamp = int(time.time())
        
        # Test 1: Create operator user
        operator_data = {
            "name": f"E2E Test Operator {timestamp}",
            "email": f"e2e-op-{timestamp}@example.com",
            "password": "TestPass123!",
            "role": "operator"
        }
        
        success, response, status_code = self.make_request('POST', '/users', operator_data)
        if success and 'id' in response:
            self.created_users.append(response['id'])
            self.log_test("POST /api/users - Create Operator", True, 
                         f"Created operator with ID: {response['id']}")
        else:
            self.log_test("POST /api/users - Create Operator", False, 
                         f"Status: {status_code}", response)
            
        # Test 2: Create staff user
        staff_data = {
            "name": f"E2E Test Staff {timestamp}",
            "email": f"e2e-staff-{timestamp}@example.com", 
            "password": "TestPass123!",
            "role": "staff"
        }
        
        success, response, status_code = self.make_request('POST', '/users', staff_data)
        if success and 'id' in response:
            self.created_users.append(response['id'])
            self.log_test("POST /api/users - Create Staff", True,
                         f"Created staff with ID: {response['id']}")
        else:
            self.log_test("POST /api/users - Create Staff", False,
                         f"Status: {status_code}", response)
            
        # Test 3: Missing fields validation
        invalid_data = {"name": "Test User"}  # Missing email and role
        success, response, status_code = self.make_request('POST', '/users', invalid_data)
        if not success and status_code == 400:
            self.log_test("POST /api/users - Missing Fields Validation", True,
                         "Correctly rejected missing fields with 400")
        else:
            self.log_test("POST /api/users - Missing Fields Validation", False,
                         f"Expected 400, got {status_code}", response)
            
        # Test 4: Duplicate email handling
        success, response, status_code = self.make_request('POST', '/users', operator_data)
        if not success and status_code == 500:
            # Check if it's the expected email_exists error
            error_msg = response.get('error', '').lower()
            if 'email' in error_msg or 'duplicate' in error_msg or response.get('code') == 'email_exists':
                self.log_test("POST /api/users - Duplicate Email Handling", True,
                             "Correctly rejected duplicate email")
            else:
                self.log_test("POST /api/users - Duplicate Email Handling", False,
                             f"Wrong error type: {response}", response)
        else:
            self.log_test("POST /api/users - Duplicate Email Handling", False,
                         f"Expected 500 error, got {status_code}", response)

    def test_user_listing_endpoint(self):
        """Test P0: User Listing (/api/users GET) - admin client to bypass RLS"""
        print("🧪 Testing P0: User Listing with Role Filtering")
        
        # Test 1: Get all staff users
        success, response, status_code = self.make_request('GET', '/users', params={'role': 'staff'})
        if success and isinstance(response, list):
            staff_count = len(response)
            self.log_test("GET /api/users?role=staff", True,
                         f"Retrieved {staff_count} staff users")
        else:
            self.log_test("GET /api/users?role=staff", False,
                         f"Status: {status_code}", response)
            
        # Test 2: Get all operator users  
        success, response, status_code = self.make_request('GET', '/users', params={'role': 'operator'})
        if success and isinstance(response, list):
            operator_count = len(response)
            self.log_test("GET /api/users?role=operator", True,
                         f"Retrieved {operator_count} operator users")
        else:
            self.log_test("GET /api/users?role=operator", False,
                         f"Status: {status_code}", response)
            
        # Test 3: Get all users (no role filter)
        success, response, status_code = self.make_request('GET', '/users')
        if success and isinstance(response, list):
            total_count = len(response)
            self.log_test("GET /api/users (all users)", True,
                         f"Retrieved {total_count} total users")
        else:
            self.log_test("GET /api/users (all users)", False,
                         f"Status: {status_code}", response)

    def test_login_with_role_based_sites(self):
        """Test P0: Operator Login Returns Sites (/api/auth/login)"""
        print("🧪 Testing P0: Login with Role-Based Site Filtering")
        
        # Test 1: Owner login - should return 5 sites
        owner_creds = TEST_CREDENTIALS["owner"]
        success, response, status_code = self.make_request('POST', '/auth/login', {
            'email': owner_creds['email'],
            'password': owner_creds['password']
        })
        
        if success and 'user' in response and 'sites' in response:
            sites_count = len(response['sites'])
            user_role = response['user'].get('role')
            if user_role == 'owner' and sites_count == 5:
                self.log_test("Owner Login - Site Count", True,
                             f"Owner sees {sites_count} sites (expected 5)")
            else:
                self.log_test("Owner Login - Site Count", False,
                             f"Owner role: {user_role}, sites: {sites_count}, expected 5 sites")
        else:
            self.log_test("Owner Login - Site Count", False,
                         f"Status: {status_code}", response)
            
        # Test 2: Operator login - should return 3 assigned sites
        operator_creds = TEST_CREDENTIALS["operator"]
        success, response, status_code = self.make_request('POST', '/auth/login', {
            'email': operator_creds['email'],
            'password': operator_creds['password']
        })
        
        if success and 'user' in response and 'sites' in response:
            sites_count = len(response['sites'])
            user_role = response['user'].get('role')
            if user_role == 'operator' and sites_count == 3:
                self.log_test("Operator Login - Site Count", True,
                             f"Operator sees {sites_count} sites (expected 3)")
            else:
                self.log_test("Operator Login - Site Count", False,
                             f"Operator role: {user_role}, sites: {sites_count}, expected 3 sites")
        else:
            self.log_test("Operator Login - Site Count", False,
                         f"Status: {status_code}", response)
            
        # Test 3: Staff login - should return 1 assigned site
        staff_creds = TEST_CREDENTIALS["staff"]
        success, response, status_code = self.make_request('POST', '/auth/login', {
            'email': staff_creds['email'],
            'password': staff_creds['password']
        })
        
        if success and 'user' in response and 'sites' in response:
            sites_count = len(response['sites'])
            user_role = response['user'].get('role')
            if user_role == 'staff' and sites_count == 1:
                self.log_test("Staff Login - Site Count", True,
                             f"Staff sees {sites_count} sites (expected 1)")
            else:
                self.log_test("Staff Login - Site Count", False,
                             f"Staff role: {user_role}, sites: {sites_count}, expected 1 sites")
        else:
            self.log_test("Staff Login - Site Count", False,
                         f"Status: {status_code}", response)
            
        # Test 4: Invalid credentials
        success, response, status_code = self.make_request('POST', '/auth/login', {
            'email': 'invalid@example.com',
            'password': 'wrongpassword'
        })
        
        if not success and status_code == 401:
            self.log_test("Invalid Credentials Rejection", True,
                         "Correctly rejected invalid credentials with 401")
        else:
            self.log_test("Invalid Credentials Rejection", False,
                         f"Expected 401, got {status_code}", response)

    def test_staff_assignments_crud(self):
        """Test P0: Staff Site Assignments CRUD (/api/staff-assignments)"""
        print("🧪 Testing P0: Staff Site Assignments CRUD")
        
        # Test 1: GET staff assignments by operatorId
        success, response, status_code = self.make_request('GET', '/staff-assignments', 
                                                          params={'operatorId': 'operator-001'})
        if success and isinstance(response, list):
            assignments_count = len(response)
            self.log_test("GET /api/staff-assignments?operatorId=operator-001", True,
                         f"Retrieved {assignments_count} staff assignments")
            
            # Verify enriched data structure
            if assignments_count > 0 and 'staff' in response[0] and 'site' in response[0]:
                self.log_test("Staff Assignments - Enriched Data", True,
                             "Assignments include embedded staff and site objects")
            elif assignments_count > 0:
                self.log_test("Staff Assignments - Enriched Data", False,
                             "Missing embedded staff/site objects in response")
        else:
            self.log_test("GET /api/staff-assignments?operatorId=operator-001", False,
                         f"Status: {status_code}", response)
            
        # Test 2: GET staff assignments by ownerId
        success, response, status_code = self.make_request('GET', '/staff-assignments',
                                                          params={'ownerId': 'owner-001'})
        if success and isinstance(response, list):
            owner_assignments_count = len(response)
            self.log_test("GET /api/staff-assignments?ownerId=owner-001", True,
                         f"Retrieved {owner_assignments_count} assignments scoped to owner's sites")
        else:
            self.log_test("GET /api/staff-assignments?ownerId=owner-001", False,
                         f"Status: {status_code}", response)
            
        # Test 3: POST new staff assignment
        assignment_data = {
            "staff_user_id": "staff-001",
            "site_id": "site-001", 
            "assigned_by_operator_id": "operator-001"
        }
        
        success, response, status_code = self.make_request('POST', '/staff-assignments', assignment_data)
        if success and 'id' in response:
            assignment_id = response['id']
            self.created_assignments.append(('staff', assignment_id))
            self.log_test("POST /api/staff-assignments - Create", True,
                         f"Created staff assignment with ID: {assignment_id}")
            
            # Test 4: Verify assignment appears in GET
            success, response, status_code = self.make_request('GET', '/staff-assignments',
                                                              params={'operatorId': 'operator-001'})
            if success and any(a['id'] == assignment_id for a in response):
                self.log_test("Staff Assignment - Verification", True,
                             "New assignment appears in GET response")
            else:
                self.log_test("Staff Assignment - Verification", False,
                             "New assignment not found in GET response")
                
            # Test 5: DELETE assignment
            success, response, status_code = self.make_request('DELETE', f'/staff-assignments/{assignment_id}')
            if success:
                self.log_test("DELETE /api/staff-assignments - Remove", True,
                             f"Successfully deleted assignment {assignment_id}")
                self.created_assignments.remove(('staff', assignment_id))
            else:
                self.log_test("DELETE /api/staff-assignments - Remove", False,
                             f"Status: {status_code}", response)
        else:
            self.log_test("POST /api/staff-assignments - Create", False,
                         f"Status: {status_code}", response)

    def test_operator_assignments_crud(self):
        """Test P0: Operator Site Assignments CRUD (/api/operator-assignments)"""
        print("🧪 Testing P0: Operator Site Assignments CRUD")
        
        # Test 1: GET operator assignments by ownerId
        success, response, status_code = self.make_request('GET', '/operator-assignments',
                                                          params={'ownerId': 'owner-001'})
        if success and isinstance(response, list):
            assignments_count = len(response)
            # Based on seed data, expect 5 assignments
            if assignments_count == 5:
                self.log_test("GET /api/operator-assignments?ownerId=owner-001", True,
                             f"Retrieved {assignments_count} operator assignments (expected 5)")
            else:
                self.log_test("GET /api/operator-assignments?ownerId=owner-001", False,
                             f"Retrieved {assignments_count} assignments, expected 5")
        else:
            self.log_test("GET /api/operator-assignments?ownerId=owner-001", False,
                         f"Status: {status_code}", response)
            
        # Test 2: POST new operator assignment
        assignment_data = {
            "operator_user_id": "operator-001",
            "site_id": "site-004",  # Try assigning to a different site
            "assigned_by_owner_id": "owner-001"
        }
        
        success, response, status_code = self.make_request('POST', '/operator-assignments', assignment_data)
        if success and 'id' in response:
            assignment_id = response['id']
            self.created_assignments.append(('operator', assignment_id))
            self.log_test("POST /api/operator-assignments - Create", True,
                         f"Created operator assignment with ID: {assignment_id}")
            
            # Test 3: DELETE assignment
            success, response, status_code = self.make_request('DELETE', f'/operator-assignments/{assignment_id}')
            if success:
                self.log_test("DELETE /api/operator-assignments - Remove", True,
                             f"Successfully deleted assignment {assignment_id}")
                self.created_assignments.remove(('operator', assignment_id))
            else:
                self.log_test("DELETE /api/operator-assignments - Remove", False,
                             f"Status: {status_code}", response)
        else:
            self.log_test("POST /api/operator-assignments - Create", False,
                         f"Status: {status_code}", response)

    def test_sites_with_userid_param(self):
        """Test Sites GET supports userId param (/api/sites?userId=xxx)"""
        print("🧪 Testing Sites GET with userId Parameter")
        
        # Test 1: Owner sites
        success, response, status_code = self.make_request('GET', '/sites', params={'userId': 'owner-001'})
        if success and isinstance(response, list):
            sites_count = len(response)
            if sites_count == 5:
                self.log_test("GET /api/sites?userId=owner-001", True,
                             f"Owner sees {sites_count} sites (expected 5)")
            else:
                self.log_test("GET /api/sites?userId=owner-001", False,
                             f"Owner sees {sites_count} sites, expected 5")
        else:
            self.log_test("GET /api/sites?userId=owner-001", False,
                         f"Status: {status_code}", response)
            
        # Test 2: Operator sites
        success, response, status_code = self.make_request('GET', '/sites', params={'userId': 'operator-001'})
        if success and isinstance(response, list):
            sites_count = len(response)
            if sites_count == 3:
                self.log_test("GET /api/sites?userId=operator-001", True,
                             f"Operator sees {sites_count} sites (expected 3)")
            else:
                self.log_test("GET /api/sites?userId=operator-001", False,
                             f"Operator sees {sites_count} sites, expected 3")
        else:
            self.log_test("GET /api/sites?userId=operator-001", False,
                         f"Status: {status_code}", response)
            
        # Test 3: Staff sites
        success, response, status_code = self.make_request('GET', '/sites', params={'userId': 'staff-001'})
        if success and isinstance(response, list):
            sites_count = len(response)
            if sites_count == 1:
                self.log_test("GET /api/sites?userId=staff-001", True,
                             f"Staff sees {sites_count} sites (expected 1)")
            else:
                self.log_test("GET /api/sites?userId=staff-001", False,
                             f"Staff sees {sites_count} sites, expected 1")
        else:
            self.log_test("GET /api/sites?userId=staff-001", False,
                         f"Status: {status_code}", response)
            
        # Test 4: Non-existent user
        success, response, status_code = self.make_request('GET', '/sites', params={'userId': 'non-existent-id'})
        if success and isinstance(response, list) and len(response) == 0:
            self.log_test("GET /api/sites?userId=non-existent-id", True,
                         "Non-existent user returns empty array (no crash)")
        else:
            self.log_test("GET /api/sites?userId=non-existent-id", False,
                         f"Expected empty array, got: {response}")

    def test_end_to_end_hierarchy_flow(self):
        """Test End-to-end hierarchy flow simulation"""
        print("🧪 Testing End-to-End Hierarchy Flow")
        
        timestamp = int(time.time())
        test_operator_email = f"e2e-hierarchy-op-{timestamp}@example.com"
        test_staff_email = f"e2e-hierarchy-staff-{timestamp}@example.com"
        
        # Step 1: Login as owner
        owner_creds = TEST_CREDENTIALS["owner"]
        success, login_response, status_code = self.make_request('POST', '/auth/login', {
            'email': owner_creds['email'],
            'password': owner_creds['password']
        })
        
        if not success:
            self.log_test("E2E Flow - Owner Login", False, f"Status: {status_code}", login_response)
            return
            
        owner_sites = login_response.get('sites', [])
        self.log_test("E2E Flow - Owner Login", True, f"Owner logged in, sees {len(owner_sites)} sites")
        
        # Step 2: Owner creates operator
        operator_data = {
            "name": f"E2E Test Operator {timestamp}",
            "email": test_operator_email,
            "password": "TestPass123!",
            "role": "operator"
        }
        
        success, operator_response, status_code = self.make_request('POST', '/users', operator_data)
        if not success:
            self.log_test("E2E Flow - Create Operator", False, f"Status: {status_code}", operator_response)
            return
            
        operator_id = operator_response['id']
        self.created_users.append(operator_id)
        self.log_test("E2E Flow - Create Operator", True, f"Created operator: {operator_id}")
        
        # Step 3: Owner assigns sites to operator
        if owner_sites:
            site_id = owner_sites[0]['id']  # Assign first site
            assignment_data = {
                "operator_user_id": operator_id,
                "site_id": site_id,
                "assigned_by_owner_id": owner_creds['user_id']
            }
            
            success, assignment_response, status_code = self.make_request('POST', '/operator-assignments', assignment_data)
            if success:
                assignment_id = assignment_response['id']
                self.created_assignments.append(('operator', assignment_id))
                self.log_test("E2E Flow - Assign Site to Operator", True, f"Assigned site {site_id} to operator")
                
                # Step 4: Login as operator to verify site access
                success, op_login_response, status_code = self.make_request('POST', '/auth/login', {
                    'email': test_operator_email,
                    'password': 'TestPass123!'
                })
                
                if success:
                    operator_sites = op_login_response.get('sites', [])
                    if len(operator_sites) == 1 and operator_sites[0]['id'] == site_id:
                        self.log_test("E2E Flow - Operator Site Access", True, 
                                     f"Operator now sees assigned site: {site_id}")
                        
                        # Step 5: Operator creates staff
                        staff_data = {
                            "name": f"E2E Test Staff {timestamp}",
                            "email": test_staff_email,
                            "password": "TestPass123!",
                            "role": "staff"
                        }
                        
                        success, staff_response, status_code = self.make_request('POST', '/users', staff_data)
                        if success:
                            staff_id = staff_response['id']
                            self.created_users.append(staff_id)
                            self.log_test("E2E Flow - Operator Creates Staff", True, f"Created staff: {staff_id}")
                            
                            # Step 6: Operator assigns site to staff
                            staff_assignment_data = {
                                "staff_user_id": staff_id,
                                "site_id": site_id,
                                "assigned_by_operator_id": operator_id
                            }
                            
                            success, staff_assignment_response, status_code = self.make_request('POST', '/staff-assignments', staff_assignment_data)
                            if success:
                                staff_assignment_id = staff_assignment_response['id']
                                self.created_assignments.append(('staff', staff_assignment_id))
                                self.log_test("E2E Flow - Assign Site to Staff", True, f"Assigned site to staff")
                                
                                # Step 7: Login as staff to verify site access
                                success, staff_login_response, status_code = self.make_request('POST', '/auth/login', {
                                    'email': test_staff_email,
                                    'password': 'TestPass123!'
                                })
                                
                                if success:
                                    staff_sites = staff_login_response.get('sites', [])
                                    if len(staff_sites) == 1 and staff_sites[0]['id'] == site_id:
                                        self.log_test("E2E Flow - Staff Site Access", True,
                                                     f"Staff now sees assigned site: {site_id}")
                                        self.log_test("E2E Flow - Complete Hierarchy", True,
                                                     "Full Owner→Operator→Staff hierarchy flow successful")
                                    else:
                                        self.log_test("E2E Flow - Staff Site Access", False,
                                                     f"Staff sees {len(staff_sites)} sites, expected 1")
                                else:
                                    self.log_test("E2E Flow - Staff Login", False, f"Status: {status_code}", staff_login_response)
                            else:
                                self.log_test("E2E Flow - Assign Site to Staff", False, f"Status: {status_code}", staff_assignment_response)
                        else:
                            self.log_test("E2E Flow - Operator Creates Staff", False, f"Status: {status_code}", staff_response)
                    else:
                        self.log_test("E2E Flow - Operator Site Access", False,
                                     f"Operator sees {len(operator_sites)} sites, expected 1")
                else:
                    self.log_test("E2E Flow - Operator Login", False, f"Status: {status_code}", op_login_response)
            else:
                self.log_test("E2E Flow - Assign Site to Operator", False, f"Status: {status_code}", assignment_response)
        else:
            self.log_test("E2E Flow - No Sites Available", False, "Owner has no sites to assign")

    def cleanup_test_data(self):
        """Clean up test users and assignments created during testing"""
        print("🧹 Cleaning up test data...")
        
        # Clean up assignments first (foreign key dependencies)
        for assignment_type, assignment_id in self.created_assignments:
            endpoint = f"/{assignment_type}-assignments/{assignment_id}"
            success, response, status_code = self.make_request('DELETE', endpoint)
            if success:
                print(f"   ✅ Deleted {assignment_type} assignment: {assignment_id}")
            else:
                print(f"   ❌ Failed to delete {assignment_type} assignment: {assignment_id}")
        
        # Clean up users
        for user_id in self.created_users:
            success, response, status_code = self.make_request('DELETE', f'/users/{user_id}')
            if success:
                print(f"   ✅ Deleted user: {user_id}")
            else:
                print(f"   ❌ Failed to delete user: {user_id}")

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Comprehensive FOPS Backend Testing")
        print(f"📍 Testing against: {BASE_URL}")
        print("=" * 60)
        
        try:
            # Run all test suites
            self.test_user_creation_endpoint()
            self.test_user_listing_endpoint()
            self.test_login_with_role_based_sites()
            self.test_staff_assignments_crud()
            self.test_operator_assignments_crud()
            self.test_sites_with_userid_param()
            self.test_end_to_end_hierarchy_flow()
            
        except Exception as e:
            print(f"❌ CRITICAL ERROR during testing: {str(e)}")
            self.log_test("CRITICAL_ERROR", False, str(e))
        
        finally:
            # Always attempt cleanup
            self.cleanup_test_data()
            
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r['success']])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        print("\n" + "=" * 60)

if __name__ == "__main__":
    tester = FOPSBackendTester()
    tester.run_all_tests()