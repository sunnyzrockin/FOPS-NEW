#!/usr/bin/env python3
"""
Focused Access Control Testing - Critical Features Only
Testing the most important access control features with better error handling
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
TEST_CREDENTIALS = {
    'owner': {'email': 'owner@demo.com', 'password': 'demo123'},
    'operator': {'email': 'operator@demo.com', 'password': 'demo123'},
    'staff': {'email': 'staff@demo.com', 'password': 'demo123'}
}

class FocusedTester:
    def __init__(self):
        self.test_results = []
        self.total_tests = 0
        self.passed_tests = 0
        
    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        
        result = f"{status}: {test_name}"
        if details:
            result += f" - {details}"
        
        print(result)
        self.test_results.append({
            'name': test_name,
            'passed': passed,
            'details': details
        })
        
    def make_request(self, method, endpoint, data=None, timeout=10):
        """Make HTTP request with better error handling"""
        url = f"{BASE_URL}{endpoint}"
        try:
            if method == 'GET':
                response = requests.get(url, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, timeout=timeout)
            elif method == 'PUT':
                response = requests.put(url, json=data, timeout=timeout)
            elif method == 'DELETE':
                response = requests.delete(url, timeout=timeout)
            
            return response
        except requests.exceptions.Timeout:
            print(f"Request timeout for {method} {endpoint}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"Request failed for {method} {endpoint}: {e}")
            return None

    def test_critical_access_control(self):
        """Test the most critical access control features"""
        print("\n=== CRITICAL ACCESS CONTROL TESTS ===")
        
        # 1. Login Hierarchy Test
        print("\n1. Testing Login Hierarchy...")
        
        # Owner login
        response = self.make_request('POST', '/auth/login', TEST_CREDENTIALS['owner'])
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data.get('sites', []))
            user_role = data.get('user', {}).get('role')
            self.log_test("Owner sees all 5 sites", 
                         user_role == 'owner' and sites_count == 5,
                         f"Role: {user_role}, Sites: {sites_count}")
        else:
            self.log_test("Owner login", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Operator login
        response = self.make_request('POST', '/auth/login', TEST_CREDENTIALS['operator'])
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data.get('sites', []))
            user_role = data.get('user', {}).get('role')
            self.log_test("Operator sees only assigned sites (3)", 
                         user_role == 'operator' and sites_count == 3,
                         f"Role: {user_role}, Sites: {sites_count}")
        else:
            self.log_test("Operator login", False, f"Status: {response.status_code if response else 'No response'}")
        
        # 2. Role-Based User Creation Test
        print("\n2. Testing Role-Based User Creation...")
        
        # Owner tries to create staff (should fail with 403)
        staff_data = {
            "name": "Test Staff Forbidden",
            "email": "test.staff.forbidden@demo.com",
            "password": "demo123",
            "role": "staff",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/users', staff_data)
        if response:
            self.log_test("Owner cannot create staff (403 expected)", 
                         response.status_code == 403,
                         f"Status: {response.status_code}, Response: {response.text[:100]}")
        else:
            self.log_test("Owner cannot create staff", False, "No response")
        
        # Operator tries to create operator (should fail with 403)
        operator_data = {
            "name": "Test Operator Forbidden",
            "email": "test.operator.forbidden@demo.com",
            "password": "demo123",
            "role": "operator",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/users', operator_data)
        if response:
            self.log_test("Operator cannot create operator (403 expected)", 
                         response.status_code == 403,
                         f"Status: {response.status_code}, Response: {response.text[:100]}")
        else:
            self.log_test("Operator cannot create operator", False, "No response")
        
        # 3. Staff Assignment Permission Test
        print("\n3. Testing Staff Assignment Permissions...")
        
        # Try to assign staff to site operator doesn't have access to (should fail with 403)
        invalid_assignment = {
            "staff_user_id": "staff-001",
            "site_id": "site-005",  # operator-001 doesn't have access to site-005
            "assigned_by_operator_id": "operator-001"
        }
        response = self.make_request('POST', '/staff-assignments', invalid_assignment)
        if response:
            self.log_test("Staff assignment blocked when operator lacks site access", 
                         response.status_code == 403,
                         f"Status: {response.status_code}, Response: {response.text[:100]}")
        else:
            self.log_test("Staff assignment permission check", False, "No response")
        
        # 4. Field Config Permission Test
        print("\n4. Testing Field Config Permissions...")
        
        # Owner tries to create field config (should fail with 403)
        owner_field_config = {
            "site_id": "site-001",
            "key": "owner_forbidden_field",
            "label": "Owner Forbidden Field",
            "field_type": "number",
            "created_by_user_id": "owner-001",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/site-field-configs', owner_field_config)
        if response:
            self.log_test("Owner cannot create field configs (403 expected)", 
                         response.status_code == 403,
                         f"Status: {response.status_code}, Response: {response.text[:100]}")
        else:
            self.log_test("Owner field config permission check", False, "No response")
        
        # 5. Banking Formula Permission Test
        print("\n5. Testing Banking Formula Permissions...")
        
        # Owner tries to create banking formula (should fail with 403)
        owner_formula = {
            "site_id": "site-001",
            "name": "Owner Forbidden Formula",
            "formula_json": '{"operations": [{"type": "field", "value": "fuel_sales"}]}',
            "result_label": "Owner Result",
            "created_by_user_id": "owner-001",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/site-banking-formulas', owner_formula)
        if response:
            self.log_test("Owner cannot create banking formulas (403 expected)", 
                         response.status_code == 403,
                         f"Status: {response.status_code}, Response: {response.text[:100]}")
        else:
            self.log_test("Owner banking formula permission check", False, "No response")

    def test_positive_cases(self):
        """Test cases that should succeed"""
        print("\n=== POSITIVE ACCESS CONTROL TESTS ===")
        
        # 1. Owner creates operator (should succeed)
        operator_data = {
            "name": "Test Operator Valid",
            "email": f"test.operator.valid.{int(datetime.now().timestamp())}@demo.com",
            "password": "demo123",
            "role": "operator",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/users', operator_data)
        if response:
            self.log_test("Owner can create operators", 
                         response.status_code == 201,
                         f"Status: {response.status_code}")
        else:
            self.log_test("Owner creates operator", False, "No response")
        
        # 2. Operator creates staff (should succeed)
        staff_data = {
            "name": "Test Staff Valid",
            "email": f"test.staff.valid.{int(datetime.now().timestamp())}@demo.com",
            "password": "demo123",
            "role": "staff",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/users', staff_data)
        if response:
            self.log_test("Operator can create staff", 
                         response.status_code == 201,
                         f"Status: {response.status_code}")
        else:
            self.log_test("Operator creates staff", False, "No response")
        
        # 3. Operator creates field config (should succeed)
        field_config_data = {
            "site_id": "site-001",
            "key": f"test_field_{int(datetime.now().timestamp())}",
            "label": "Test Field Valid",
            "field_type": "number",
            "created_by_user_id": "operator-001",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/site-field-configs', field_config_data)
        if response:
            self.log_test("Operator can create field configs", 
                         response.status_code == 201,
                         f"Status: {response.status_code}")
        else:
            self.log_test("Operator creates field config", False, "No response")
        
        # 4. Operator creates banking formula (should succeed)
        formula_data = {
            "site_id": "site-001",
            "name": f"Test Formula {int(datetime.now().timestamp())}",
            "formula_json": '{"operations": [{"type": "field", "value": "fuel_sales"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "shop_sales"}]}',
            "result_label": "Test Result",
            "created_by_user_id": "operator-001",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/site-banking-formulas', formula_data)
        if response:
            self.log_test("Operator can create banking formulas", 
                         response.status_code == 201,
                         f"Status: {response.status_code}")
        else:
            self.log_test("Operator creates banking formula", False, "No response")

    def test_assignment_apis(self):
        """Test the new assignment APIs"""
        print("\n=== ASSIGNMENT API TESTS ===")
        
        # Test operator assignments
        response = self.make_request('GET', '/operator-assignments?operatorId=operator-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            has_enriched_data = all('operator' in item and 'site' in item for item in data)
            self.log_test("Operator assignments API working", 
                         assignments_count == 3 and has_enriched_data,
                         f"Count: {assignments_count}, Enriched: {has_enriched_data}")
        else:
            self.log_test("Operator assignments API", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test staff assignments
        response = self.make_request('GET', '/staff-assignments?operatorId=operator-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            has_enriched_data = all('staff' in item and 'site' in item for item in data)
            self.log_test("Staff assignments API working", 
                         assignments_count == 5 and has_enriched_data,
                         f"Count: {assignments_count}, Enriched: {has_enriched_data}")
        else:
            self.log_test("Staff assignments API", False, f"Status: {response.status_code if response else 'No response'}")

    def test_dashboard_with_performers(self):
        """Test dashboard stats with top/lowest performers"""
        print("\n=== DASHBOARD PERFORMER TESTS ===")
        
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')
        
        response = self.make_request('GET', f'/dashboard/stats?siteIds=site-001,site-002,site-003&startDate={start_date}&endDate={end_date}')
        if response and response.status_code == 200:
            data = response.json()
            has_top_performer = 'topPerformingSite' in data and data['topPerformingSite'] is not None
            has_lowest_performer = 'lowestPerformingSite' in data and data['lowestPerformingSite'] is not None
            
            if has_top_performer and has_lowest_performer:
                top_revenue = data['topPerformingSite'].get('revenue', 0)
                lowest_revenue = data['lowestPerformingSite'].get('revenue', 0)
                revenue_comparison_valid = top_revenue >= lowest_revenue
                
                # Check required fields
                top_has_fields = all(field in data['topPerformingSite'] for field in ['siteId', 'siteName', 'siteCode', 'revenue'])
                lowest_has_fields = all(field in data['lowestPerformingSite'] for field in ['siteId', 'siteName', 'siteCode', 'revenue'])
                
                self.log_test("Dashboard stats include top/lowest performers", 
                             revenue_comparison_valid and top_has_fields and lowest_has_fields,
                             f"Top: ${top_revenue}, Lowest: ${lowest_revenue}")
            else:
                self.log_test("Dashboard performer data", False, "Missing performer data")
        else:
            self.log_test("Dashboard stats API", False, f"Status: {response.status_code if response else 'No response'}")

    def run_focused_tests(self):
        """Run focused access control tests"""
        print("🎯 FOCUSED ACCESS CONTROL TESTING")
        print("=" * 50)
        
        # Seed database first
        print("Seeding database...")
        seed_response = self.make_request('POST', '/seed')
        if seed_response and seed_response.status_code == 200:
            print("✅ Database seeded successfully")
        else:
            print("❌ Database seeding failed")
        
        # Run focused tests
        self.test_critical_access_control()
        self.test_positive_cases()
        self.test_assignment_apis()
        self.test_dashboard_with_performers()
        
        # Print results
        print("\n" + "=" * 50)
        print("🎯 FOCUSED TEST RESULTS")
        print("=" * 50)
        
        success_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0
        print(f"✅ PASSED: {self.passed_tests}/{self.total_tests} ({success_rate:.1f}%)")
        
        if self.passed_tests == self.total_tests:
            print("🎉 ALL FOCUSED TESTS PASSED!")
        else:
            failed_tests = self.total_tests - self.passed_tests
            print(f"❌ FAILED: {failed_tests} tests")
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['name']}: {result['details']}")
        
        return self.passed_tests, self.total_tests

if __name__ == "__main__":
    tester = FocusedTester()
    passed, total = tester.run_focused_tests()
    print(f"\nFinal Result: {passed}/{total} tests passed")
    sys.exit(0 if passed == total else 1)