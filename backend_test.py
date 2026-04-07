#!/usr/bin/env python3
"""
Comprehensive Backend Testing - Access Control Refactoring
Testing new 3-tier hierarchy (Owner → Operator → Staff) with strict permission enforcement
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    'owner': {'email': 'owner@demo.com', 'password': 'demo123'},
    'operator': {'email': 'operator@demo.com', 'password': 'demo123'},
    'staff': {'email': 'staff@demo.com', 'password': 'demo123'}
}

class AccessControlTester:
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
        
    def make_request(self, method, endpoint, data=None, expected_status=200):
        """Make HTTP request and return response"""
        url = f"{BASE_URL}{endpoint}"
        try:
            if method == 'GET':
                response = requests.get(url)
            elif method == 'POST':
                response = requests.post(url, json=data)
            elif method == 'PUT':
                response = requests.put(url, json=data)
            elif method == 'DELETE':
                response = requests.delete(url)
            
            return response
        except Exception as e:
            print(f"Request failed: {e}")
            return None

    def test_login_hierarchy(self):
        """Test P0-1: Login API with New Hierarchy"""
        print("\n=== P0-1: LOGIN API WITH NEW HIERARCHY ===")
        
        # Test Owner login - should return ALL sites (5 sites owned)
        response = self.make_request('POST', '/auth/login', TEST_CREDENTIALS['owner'])
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data.get('sites', []))
            user_role = data.get('user', {}).get('role')
            self.log_test("Owner login returns user+sites", 
                         user_role == 'owner' and sites_count == 5,
                         f"Role: {user_role}, Sites: {sites_count}")
        else:
            self.log_test("Owner login", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test Operator login - should return only assigned sites
        response = self.make_request('POST', '/auth/login', TEST_CREDENTIALS['operator'])
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data.get('sites', []))
            user_role = data.get('user', {}).get('role')
            # operator@demo.com is operator-001 who should have 3 sites (BNE-001, GC-002, SC-003)
            self.log_test("Operator login returns assigned sites only", 
                         user_role == 'operator' and sites_count == 3,
                         f"Role: {user_role}, Sites: {sites_count}")
        else:
            self.log_test("Operator login", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test Staff login - should return only assigned sites
        response = self.make_request('POST', '/auth/login', TEST_CREDENTIALS['staff'])
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data.get('sites', []))
            user_role = data.get('user', {}).get('role')
            # staff@demo.com is staff-001 who should have 1 site (BNE-001)
            self.log_test("Staff login returns assigned sites only", 
                         user_role == 'staff' and sites_count >= 1,
                         f"Role: {user_role}, Sites: {sites_count}")
        else:
            self.log_test("Staff login", False, f"Status: {response.status_code if response else 'No response'}")

    def test_operator_assignments_api(self):
        """Test P0-2: Operator Assignments API (Owner → Operator)"""
        print("\n=== P0-2: OPERATOR ASSIGNMENTS API ===")
        
        # GET Tests
        # Test: GET assignments for operator-001 (should return 3 assignments)
        response = self.make_request('GET', '/operator-assignments?operatorId=operator-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            has_enriched_data = all('operator' in item and 'site' in item for item in data)
            self.log_test("GET operator-001 assignments", 
                         assignments_count == 3 and has_enriched_data,
                         f"Count: {assignments_count}, Enriched: {has_enriched_data}")
        else:
            self.log_test("GET operator-001 assignments", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET assignments for operator-002 (should return 2 assignments)
        response = self.make_request('GET', '/operator-assignments?operatorId=operator-002')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            self.log_test("GET operator-002 assignments", 
                         assignments_count == 2,
                         f"Count: {assignments_count}")
        else:
            self.log_test("GET operator-002 assignments", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET assignments by owner (should return all 5 assignments)
        response = self.make_request('GET', '/operator-assignments?ownerId=owner-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            self.log_test("GET assignments by owner", 
                         assignments_count == 5,
                         f"Count: {assignments_count}")
        else:
            self.log_test("GET assignments by owner", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Tests
        # Test: Create new operator assignment (should succeed)
        new_assignment = {
            "operator_user_id": "operator-001",
            "site_id": "site-004",  # Try to assign operator-001 to site-004 (normally operator-002's)
            "assigned_by_owner_id": "owner-001"
        }
        response = self.make_request('POST', '/operator-assignments', new_assignment)
        created_assignment_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_assignment_id = data.get('id')
            self.log_test("POST create operator assignment", True, "Assignment created successfully")
        else:
            self.log_test("POST create operator assignment", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Try to create duplicate assignment (should fail with 400)
        if created_assignment_id:
            response = self.make_request('POST', '/operator-assignments', new_assignment)
            self.log_test("POST duplicate assignment prevention", 
                         response and response.status_code == 400,
                         f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Try to assign to non-operator user (should fail with 400)
        invalid_assignment = {
            "operator_user_id": "staff-001",  # Staff user, not operator
            "site_id": "site-001",
            "assigned_by_owner_id": "owner-001"
        }
        response = self.make_request('POST', '/operator-assignments', invalid_assignment)
        self.log_test("POST invalid operator assignment", 
                     response and response.status_code == 400,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # DELETE Tests
        # Test: Delete the created assignment (should succeed)
        if created_assignment_id:
            response = self.make_request('DELETE', f'/operator-assignments/{created_assignment_id}')
            self.log_test("DELETE operator assignment", 
                         response and response.status_code == 200,
                         f"Status: {response.status_code if response else 'No response'}")

    def test_staff_assignments_api(self):
        """Test P0-3: Staff Assignments API (Operator → Staff)"""
        print("\n=== P0-3: STAFF ASSIGNMENTS API ===")
        
        # GET Tests
        # Test: GET assignments for operator-001 (should return 5 staff assignments)
        response = self.make_request('GET', '/staff-assignments?operatorId=operator-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            has_enriched_data = all('staff' in item and 'site' in item for item in data)
            self.log_test("GET staff assignments for operator-001", 
                         assignments_count == 5 and has_enriched_data,
                         f"Count: {assignments_count}, Enriched: {has_enriched_data}")
        else:
            self.log_test("GET staff assignments for operator-001", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET assignments for operator-002 (should return 4 staff assignments)
        response = self.make_request('GET', '/staff-assignments?operatorId=operator-002')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            self.log_test("GET staff assignments for operator-002", 
                         assignments_count == 4,
                         f"Count: {assignments_count}")
        else:
            self.log_test("GET staff assignments for operator-002", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET assignments for staff-001 (should return their assignments)
        response = self.make_request('GET', '/staff-assignments?staffId=staff-001')
        if response and response.status_code == 200:
            data = response.json()
            assignments_count = len(data)
            self.log_test("GET assignments for staff-001", 
                         assignments_count >= 1,
                         f"Count: {assignments_count}")
        else:
            self.log_test("GET assignments for staff-001", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Tests
        # Test: Create staff assignment where operator HAS access to site (should succeed)
        valid_assignment = {
            "staff_user_id": "staff-001",
            "site_id": "site-002",  # operator-001 has access to site-002
            "assigned_by_operator_id": "operator-001"
        }
        response = self.make_request('POST', '/staff-assignments', valid_assignment)
        created_assignment_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_assignment_id = data.get('id')
            self.log_test("POST valid staff assignment", True, "Assignment created successfully")
        else:
            self.log_test("POST valid staff assignment", False, f"Status: {response.status_code if response else 'No response'}")
        
        # CRITICAL Test: Try to create staff assignment where operator does NOT have access to site (should fail with 403)
        invalid_assignment = {
            "staff_user_id": "staff-001",
            "site_id": "site-005",  # operator-001 does NOT have access to site-005 (operator-002's site)
            "assigned_by_operator_id": "operator-001"
        }
        response = self.make_request('POST', '/staff-assignments', invalid_assignment)
        self.log_test("POST staff assignment - operator lacks site access", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Try to create duplicate assignment (should fail with 400)
        if created_assignment_id:
            response = self.make_request('POST', '/staff-assignments', valid_assignment)
            self.log_test("POST duplicate staff assignment prevention", 
                         response and response.status_code == 400,
                         f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Try to assign non-staff user (should fail with 400)
        invalid_user_assignment = {
            "staff_user_id": "operator-001",  # Operator user, not staff
            "site_id": "site-001",
            "assigned_by_operator_id": "operator-001"
        }
        response = self.make_request('POST', '/staff-assignments', invalid_user_assignment)
        self.log_test("POST invalid staff user assignment", 
                     response and response.status_code == 400,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # DELETE Tests
        # Test: Delete the created assignment (should succeed)
        if created_assignment_id:
            response = self.make_request('DELETE', f'/staff-assignments/{created_assignment_id}')
            self.log_test("DELETE staff assignment", 
                         response and response.status_code == 200,
                         f"Status: {response.status_code if response else 'No response'}")

    def test_user_creation_role_enforcement(self):
        """Test P0-4: User Creation with Role Enforcement"""
        print("\n=== P0-4: USER CREATION WITH ROLE ENFORCEMENT ===")
        
        # Test: Owner creates operator (should succeed)
        operator_data = {
            "name": "Test Operator",
            "email": "test.operator@demo.com",
            "password": "demo123",
            "role": "operator",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/users', operator_data)
        created_operator_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_operator_id = data.get('id')
            self.log_test("Owner creates operator", True, "Operator created successfully")
        else:
            self.log_test("Owner creates operator", False, f"Status: {response.status_code if response else 'No response'}")
        
        # CRITICAL Test: Owner tries to create staff (should fail with 403)
        staff_data = {
            "name": "Test Staff",
            "email": "test.staff@demo.com",
            "password": "demo123",
            "role": "staff",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/users', staff_data)
        self.log_test("Owner tries to create staff (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Operator creates staff (should succeed)
        staff_data_valid = {
            "name": "Test Staff Valid",
            "email": "test.staff.valid@demo.com",
            "password": "demo123",
            "role": "staff",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/users', staff_data_valid)
        created_staff_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_staff_id = data.get('id')
            self.log_test("Operator creates staff", True, "Staff created successfully")
        else:
            self.log_test("Operator creates staff", False, f"Status: {response.status_code if response else 'No response'}")
        
        # CRITICAL Test: Operator tries to create operator (should fail with 403)
        operator_data_invalid = {
            "name": "Test Operator Invalid",
            "email": "test.operator.invalid@demo.com",
            "password": "demo123",
            "role": "operator",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/users', operator_data_invalid)
        self.log_test("Operator tries to create operator (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Try to create user with existing email (should fail with 400)
        duplicate_email_data = {
            "name": "Duplicate Email",
            "email": "owner@demo.com",  # Existing email
            "password": "demo123",
            "role": "operator",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/users', duplicate_email_data)
        self.log_test("Create user with existing email (should fail)", 
                     response and response.status_code == 400,
                     f"Status: {response.status_code if response else 'No response'}")

    def test_field_config_permission_enforcement(self):
        """Test P0-5: Field Config Permission Enforcement"""
        print("\n=== P0-5: FIELD CONFIG PERMISSION ENFORCEMENT ===")
        
        # Test: Operator creates field config (should succeed)
        field_config_data = {
            "site_id": "site-001",
            "key": "test_field",
            "label": "Test Field",
            "field_type": "number",
            "created_by_user_id": "operator-001",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/site-field-configs', field_config_data)
        created_config_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_config_id = data.get('id')
            self.log_test("Operator creates field config", True, "Field config created successfully")
        else:
            self.log_test("Operator creates field config", False, f"Status: {response.status_code if response else 'No response'}")
        
        # CRITICAL Test: Owner tries to create field config (should fail with 403)
        owner_field_config = {
            "site_id": "site-001",
            "key": "owner_test_field",
            "label": "Owner Test Field",
            "field_type": "number",
            "created_by_user_id": "owner-001",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/site-field-configs', owner_field_config)
        self.log_test("Owner tries to create field config (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Staff tries to create field config (should fail with 403)
        staff_field_config = {
            "site_id": "site-001",
            "key": "staff_test_field",
            "label": "Staff Test Field",
            "field_type": "number",
            "created_by_user_id": "staff-001",
            "creatorRole": "staff"
        }
        response = self.make_request('POST', '/site-field-configs', staff_field_config)
        self.log_test("Staff tries to create field config (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")

    def test_banking_formula_permission_enforcement(self):
        """Test P0-6: Banking Formula Permission Enforcement"""
        print("\n=== P0-6: BANKING FORMULA PERMISSION ENFORCEMENT ===")
        
        # Test: Operator creates formula (should succeed)
        formula_data = {
            "site_id": "site-001",
            "name": "Test Formula",
            "formula_json": '{"operations": [{"type": "field", "value": "fuel_sales"}, {"type": "operator", "value": "+"}, {"type": "field", "value": "shop_sales"}]}',
            "result_label": "Test Result",
            "created_by_user_id": "operator-001",
            "creatorRole": "operator"
        }
        response = self.make_request('POST', '/site-banking-formulas', formula_data)
        created_formula_id = None
        if response and response.status_code == 201:
            data = response.json()
            created_formula_id = data.get('id')
            self.log_test("Operator creates banking formula", True, "Formula created successfully")
        else:
            self.log_test("Operator creates banking formula", False, f"Status: {response.status_code if response else 'No response'}")
        
        # CRITICAL Test: Owner tries to create formula (should fail with 403)
        owner_formula = {
            "site_id": "site-001",
            "name": "Owner Test Formula",
            "formula_json": '{"operations": [{"type": "field", "value": "fuel_sales"}]}',
            "result_label": "Owner Result",
            "created_by_user_id": "owner-001",
            "creatorRole": "owner"
        }
        response = self.make_request('POST', '/site-banking-formulas', owner_formula)
        self.log_test("Owner tries to create banking formula (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Staff tries to create formula (should fail with 403)
        staff_formula = {
            "site_id": "site-001",
            "name": "Staff Test Formula",
            "formula_json": '{"operations": [{"type": "field", "value": "shop_sales"}]}',
            "result_label": "Staff Result",
            "created_by_user_id": "staff-001",
            "creatorRole": "staff"
        }
        response = self.make_request('POST', '/site-banking-formulas', staff_formula)
        self.log_test("Staff tries to create banking formula (should fail)", 
                     response and response.status_code == 403,
                     f"Status: {response.status_code if response else 'No response'}")

    def test_dashboard_stats_with_performers(self):
        """Test P0-7: Dashboard Stats with Top/Lowest Performers"""
        print("\n=== P0-7: DASHBOARD STATS WITH TOP/LOWEST PERFORMERS ===")
        
        # Test: Get stats with date range (should include topPerformingSite and lowestPerformingSite)
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
                
                self.log_test("Dashboard stats with top/lowest performers", 
                             revenue_comparison_valid and top_has_fields and lowest_has_fields,
                             f"Top: ${top_revenue}, Lowest: ${lowest_revenue}")
            else:
                self.log_test("Dashboard stats with top/lowest performers", False, "Missing performer data")
        else:
            self.log_test("Dashboard stats with top/lowest performers", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: Get stats for single site (top and lowest should be the same site)
        response = self.make_request('GET', f'/dashboard/stats?siteIds=site-001&startDate={start_date}&endDate={end_date}')
        if response and response.status_code == 200:
            data = response.json()
            has_performers = 'topPerformingSite' in data and 'lowestPerformingSite' in data
            if has_performers and data['topPerformingSite'] and data['lowestPerformingSite']:
                same_site = data['topPerformingSite']['siteId'] == data['lowestPerformingSite']['siteId']
                self.log_test("Single site stats - top equals lowest", same_site, 
                             f"Top: {data['topPerformingSite']['siteId']}, Lowest: {data['lowestPerformingSite']['siteId']}")
            else:
                self.log_test("Single site stats - top equals lowest", False, "Missing performer data")
        else:
            self.log_test("Single site stats - top equals lowest", False, f"Status: {response.status_code if response else 'No response'}")

    def test_seed_api_new_structure(self):
        """Test P0-8: Seed API with New Structure"""
        print("\n=== P0-8: SEED API WITH NEW STRUCTURE ===")
        
        # Test: Run seed (should return counts for operator_assignments and staff_assignments)
        response = self.make_request('POST', '/seed')
        if response and response.status_code == 200:
            data = response.json()
            counts = data.get('counts', {})
            
            operator_assignments = counts.get('operator_assignments', 0)
            staff_assignments = counts.get('staff_assignments', 0)
            reports = counts.get('reports', 0)
            field_configs = counts.get('field_configs', 0)
            banking_formulas = counts.get('banking_formulas', 0)
            
            # Verify expected counts
            operator_assignments_valid = operator_assignments == 5
            staff_assignments_valid = staff_assignments == 9
            has_reports = reports > 0
            has_field_configs = field_configs > 0
            has_banking_formulas = banking_formulas > 0
            
            self.log_test("Seed API returns correct counts", 
                         operator_assignments_valid and staff_assignments_valid,
                         f"Operator: {operator_assignments}, Staff: {staff_assignments}")
            
            self.log_test("Seed API populates all collections", 
                         has_reports and has_field_configs and has_banking_formulas,
                         f"Reports: {reports}, Configs: {field_configs}, Formulas: {banking_formulas}")
        else:
            self.log_test("Seed API execution", False, f"Status: {response.status_code if response else 'No response'}")

    def test_regression_existing_apis(self):
        """Test P1-9: Regression Tests - Existing APIs Still Work"""
        print("\n=== P1-9: REGRESSION TESTS ===")
        
        # Test: GET /api/reports (should still return reports)
        response = self.make_request('GET', '/reports')
        if response and response.status_code == 200:
            data = response.json()
            reports_count = len(data)
            self.log_test("GET /api/reports still works", 
                         reports_count > 0,
                         f"Reports count: {reports_count}")
        else:
            self.log_test("GET /api/reports still works", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET /api/sites (should still return sites)
        response = self.make_request('GET', '/sites')
        if response and response.status_code == 200:
            data = response.json()
            sites_count = len(data)
            self.log_test("GET /api/sites still works", 
                         sites_count > 0,
                         f"Sites count: {sites_count}")
        else:
            self.log_test("GET /api/sites still works", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET /api/dashboard/site-stats (should still work)
        response = self.make_request('GET', '/dashboard/site-stats')
        if response and response.status_code == 200:
            data = response.json()
            stats_count = len(data)
            self.log_test("GET /api/dashboard/site-stats still works", 
                         stats_count > 0,
                         f"Stats count: {stats_count}")
        else:
            self.log_test("GET /api/dashboard/site-stats still works", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET /api/site-field-configs (should still work)
        response = self.make_request('GET', '/site-field-configs?site_id=site-001')
        if response and response.status_code == 200:
            data = response.json()
            configs_count = len(data)
            self.log_test("GET /api/site-field-configs still works", 
                         configs_count > 0,
                         f"Configs count: {configs_count}")
        else:
            self.log_test("GET /api/site-field-configs still works", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test: GET /api/site-banking-formulas (should still work)
        response = self.make_request('GET', '/site-banking-formulas?site_id=site-001')
        if response and response.status_code == 200:
            data = response.json()
            formulas_count = len(data)
            self.log_test("GET /api/site-banking-formulas still works", 
                         formulas_count > 0,
                         f"Formulas count: {formulas_count}")
        else:
            self.log_test("GET /api/site-banking-formulas still works", False, f"Status: {response.status_code if response else 'No response'}")

    def run_all_tests(self):
        """Run all access control tests"""
        print("🚀 STARTING COMPREHENSIVE ACCESS CONTROL TESTING")
        print("=" * 60)
        
        # First, seed the database to ensure clean state
        print("Seeding database for clean test state...")
        seed_response = self.make_request('POST', '/seed')
        if seed_response and seed_response.status_code == 200:
            print("✅ Database seeded successfully")
        else:
            print("❌ Database seeding failed - tests may be unreliable")
        
        # Run all test suites
        self.test_login_hierarchy()
        self.test_operator_assignments_api()
        self.test_staff_assignments_api()
        self.test_user_creation_role_enforcement()
        self.test_field_config_permission_enforcement()
        self.test_banking_formula_permission_enforcement()
        self.test_dashboard_stats_with_performers()
        self.test_seed_api_new_structure()
        self.test_regression_existing_apis()
        
        # Print final results
        print("\n" + "=" * 60)
        print("🎯 FINAL TEST RESULTS")
        print("=" * 60)
        
        success_rate = (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0
        print(f"✅ PASSED: {self.passed_tests}/{self.total_tests} ({success_rate:.1f}%)")
        
        if self.passed_tests == self.total_tests:
            print("🎉 ALL TESTS PASSED - ACCESS CONTROL REFACTORING IS WORKING PERFECTLY!")
        else:
            failed_tests = self.total_tests - self.passed_tests
            print(f"❌ FAILED: {failed_tests} tests")
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['name']}: {result['details']}")
        
        return self.passed_tests == self.total_tests

if __name__ == "__main__":
    tester = AccessControlTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)