#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@demo.com", "password": "demo123"},
    "operator": {"email": "operator@demo.com", "password": "demo123"},
    "staff": {"email": "staff@demo.com", "password": "demo123"}
}

class WorkflowLiteBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.current_user = None
        self.user_sites = []
        
    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
        
    def login(self, role="owner"):
        """Login with specified role"""
        try:
            creds = CREDENTIALS[role]
            response = self.session.post(f"{BASE_URL}/auth/login", json=creds)
            
            if response.status_code == 200:
                data = response.json()
                self.current_user = data["user"]
                self.user_sites = data["sites"]
                self.log_test(f"Login as {role}", True, f"User: {self.current_user['name']}, Sites: {len(self.user_sites)}")
                return True
            else:
                self.log_test(f"Login as {role}", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test(f"Login as {role}", False, f"Exception: {str(e)}")
            return False
    
    def test_daily_rollup_api_correct_path(self):
        """Test Daily Rollup API with correct path /api/reports/daily-rollup"""
        print("\n=== Testing Daily Rollup API with Correct Path ===")
        
        if not self.login("owner"):
            return
            
        site_id = "site-001"
        test_date = "2026-04-01"
        
        # Test Day view
        try:
            response = self.session.get(f"{BASE_URL}/reports/daily-rollup", params={
                "site_id": site_id,
                "date": test_date,
                "view": "Day"
            })
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Daily Rollup API - Day View", True, f"Returned {len(data)} rollups")
            else:
                self.log_test("Daily Rollup API - Day View", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Daily Rollup API - Day View", False, f"Exception: {str(e)}")
        
        # Test Shift view
        try:
            response = self.session.get(f"{BASE_URL}/reports/daily-rollup", params={
                "site_id": site_id,
                "date": test_date,
                "view": "Shift"
            })
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Daily Rollup API - Shift View", True, f"Returned {len(data)} rollups")
            else:
                self.log_test("Daily Rollup API - Shift View", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Daily Rollup API - Shift View", False, f"Exception: {str(e)}")
    
    def test_site_field_configs_api_correct_path(self):
        """Test Site Field Configs API with correct path /api/site-field-configs"""
        print("\n=== Testing Site Field Configs API with Correct Path ===")
        
        if not self.login("operator"):
            return
            
        site_id = "site-001"
        
        # Test GET with correct path
        try:
            response = self.session.get(f"{BASE_URL}/site-field-configs", params={"site_id": site_id})
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Site Field Configs GET - Correct Path", True, f"Returned {len(data)} configs")
            else:
                self.log_test("Site Field Configs GET - Correct Path", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Site Field Configs GET - Correct Path", False, f"Exception: {str(e)}")
        
        # Test POST with valid custom field
        try:
            custom_field = {
                "site_id": site_id,
                "key": f"test_field_{int(datetime.now().timestamp())}",
                "label": "Test Custom Field",
                "field_type": "number",
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=custom_field)
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Site Field Configs POST - Valid Custom Field", True, f"Created field: {data['key']}")
            else:
                self.log_test("Site Field Configs POST - Valid Custom Field", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Site Field Configs POST - Valid Custom Field", False, f"Exception: {str(e)}")
        
        # Test POST with is_core=true (should reject with 403)
        try:
            core_field_attempt = {
                "site_id": site_id,
                "key": "test_core_field",
                "label": "Test Core Field",
                "field_type": "number",
                "is_core": True,
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=core_field_attempt)
            
            if response.status_code == 403:
                self.log_test("Site Field Configs POST - Core Field Rejection", True, "Correctly rejected core field creation")
            else:
                self.log_test("Site Field Configs POST - Core Field Rejection", False, f"Status: {response.status_code}, Expected 403")
        except Exception as e:
            self.log_test("Site Field Configs POST - Core Field Rejection", False, f"Exception: {str(e)}")
        
        # Test POST with core field key like "date" (should reject)
        try:
            core_key_attempt = {
                "site_id": site_id,
                "key": "date",
                "label": "Date Field",
                "field_type": "text",
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=core_key_attempt)
            
            if response.status_code == 403:
                self.log_test("Site Field Configs POST - Core Key Rejection", True, "Correctly rejected core field key")
            else:
                self.log_test("Site Field Configs POST - Core Key Rejection", False, f"Status: {response.status_code}, Expected 403")
        except Exception as e:
            self.log_test("Site Field Configs POST - Core Key Rejection", False, f"Exception: {str(e)}")
    
    def test_site_banking_formulas_api_correct_path(self):
        """Test Site Banking Formulas API with correct path /api/site-banking-formulas"""
        print("\n=== Testing Site Banking Formulas API with Correct Path ===")
        
        if not self.login("owner"):
            return
            
        site_id = "site-001"
        
        # Test GET with correct path
        try:
            response = self.session.get(f"{BASE_URL}/site-banking-formulas", params={"site_id": site_id})
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Site Banking Formulas GET - Correct Path", True, f"Returned {len(data)} formulas")
            else:
                self.log_test("Site Banking Formulas GET - Correct Path", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Site Banking Formulas GET - Correct Path", False, f"Exception: {str(e)}")
        
        # Test POST with correct path
        try:
            formula_data = {
                "site_id": site_id,
                "name": f"Test Formula {int(datetime.now().timestamp())}",
                "formula_json": json.dumps({
                    "operations": [
                        {"type": "field", "value": "cash"},
                        {"type": "operator", "value": "+"},
                        {"type": "field", "value": "eftpos"}
                    ]
                }),
                "result_label": "Test Banking Total",
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-banking-formulas", json=formula_data)
            
            if response.status_code == 201:
                data = response.json()
                formula_id = data["id"]
                self.log_test("Site Banking Formulas POST - Correct Path", True, f"Created formula: {data['name']}")
                
                # Test DELETE
                delete_response = self.session.delete(f"{BASE_URL}/site-banking-formulas/{formula_id}")
                if delete_response.status_code == 200:
                    self.log_test("Site Banking Formulas DELETE - Correct Path", True, "Successfully deleted formula")
                else:
                    self.log_test("Site Banking Formulas DELETE - Correct Path", False, f"Delete failed: {delete_response.status_code}")
            else:
                self.log_test("Site Banking Formulas POST - Correct Path", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Site Banking Formulas POST - Correct Path", False, f"Exception: {str(e)}")
    
    def test_banking_calculate_api(self):
        """Test Banking Calculate API - NEW ENDPOINT"""
        print("\n=== Testing Banking Calculate API (NEW ENDPOINT) ===")
        
        # Test simple addition
        try:
            formula = {"operator": "+", "value1": 100, "value2": 50}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == 150:
                    self.log_test("Banking Calculate - Addition", True, f"100 + 50 = {data['result']}")
                else:
                    self.log_test("Banking Calculate - Addition", False, f"Expected 150, got {data.get('result')}")
            else:
                self.log_test("Banking Calculate - Addition", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Banking Calculate - Addition", False, f"Exception: {str(e)}")
        
        # Test subtraction
        try:
            formula = {"operator": "-", "value1": 100, "value2": 50}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == 50:
                    self.log_test("Banking Calculate - Subtraction", True, f"100 - 50 = {data['result']}")
                else:
                    self.log_test("Banking Calculate - Subtraction", False, f"Expected 50, got {data.get('result')}")
            else:
                self.log_test("Banking Calculate - Subtraction", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Banking Calculate - Subtraction", False, f"Exception: {str(e)}")
        
        # Test multiplication
        try:
            formula = {"operator": "*", "value1": 10, "value2": 5}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == 50:
                    self.log_test("Banking Calculate - Multiplication", True, f"10 * 5 = {data['result']}")
                else:
                    self.log_test("Banking Calculate - Multiplication", False, f"Expected 50, got {data.get('result')}")
            else:
                self.log_test("Banking Calculate - Multiplication", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Banking Calculate - Multiplication", False, f"Exception: {str(e)}")
        
        # Test division
        try:
            formula = {"operator": "/", "value1": 100, "value2": 4}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == 25:
                    self.log_test("Banking Calculate - Division", True, f"100 / 4 = {data['result']}")
                else:
                    self.log_test("Banking Calculate - Division", False, f"Expected 25, got {data.get('result')}")
            else:
                self.log_test("Banking Calculate - Division", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Banking Calculate - Division", False, f"Exception: {str(e)}")
        
        # Test division by zero (should error)
        try:
            formula = {"operator": "/", "value1": 100, "value2": 0}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 400:
                self.log_test("Banking Calculate - Division by Zero", True, "Correctly rejected division by zero")
            else:
                self.log_test("Banking Calculate - Division by Zero", False, f"Expected 400 error, got {response.status_code}")
        except Exception as e:
            self.log_test("Banking Calculate - Division by Zero", False, f"Exception: {str(e)}")
        
        # Test invalid operator (should error)
        try:
            formula = {"operator": "^", "value1": 100, "value2": 2}
            response = self.session.post(f"{BASE_URL}/banking/calculate", json={"formula_json": formula})
            
            if response.status_code == 400:
                self.log_test("Banking Calculate - Invalid Operator", True, "Correctly rejected invalid operator")
            else:
                self.log_test("Banking Calculate - Invalid Operator", False, f"Expected 400 error, got {response.status_code}")
        except Exception as e:
            self.log_test("Banking Calculate - Invalid Operator", False, f"Exception: {str(e)}")
    
    def test_core_field_protection_security(self):
        """Test Core Field Protection Security - CRITICAL"""
        print("\n=== Testing Core Field Protection Security (CRITICAL) ===")
        
        if not self.login("operator"):
            return
            
        site_id = "site-001"
        
        # Attempt to create field with is_core: true
        try:
            core_field = {
                "site_id": site_id,
                "key": "test_core_security",
                "label": "Test Core Security",
                "field_type": "number",
                "is_core": True,
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=core_field)
            
            if response.status_code == 403:
                self.log_test("Core Field Protection - is_core=true", True, "✅ SECURITY: Correctly blocked is_core=true")
            else:
                self.log_test("Core Field Protection - is_core=true", False, f"❌ SECURITY BREACH: Status {response.status_code}, should be 403")
        except Exception as e:
            self.log_test("Core Field Protection - is_core=true", False, f"Exception: {str(e)}")
        
        # Attempt to create field with core field key
        core_field_keys = ["date", "site_id", "shift_type", "total_sales", "fuel_sales", "shop_sales", "dips", "status"]
        
        for core_key in core_field_keys[:3]:  # Test first 3 core keys
            try:
                core_key_field = {
                    "site_id": site_id,
                    "key": core_key,
                    "label": f"Test {core_key.title()}",
                    "field_type": "number",
                    "created_by_user_id": self.current_user["id"]
                }
                
                response = self.session.post(f"{BASE_URL}/site-field-configs", json=core_key_field)
                
                if response.status_code == 403:
                    self.log_test(f"Core Field Protection - key='{core_key}'", True, f"✅ SECURITY: Correctly blocked core key '{core_key}'")
                else:
                    self.log_test(f"Core Field Protection - key='{core_key}'", False, f"❌ SECURITY BREACH: Status {response.status_code}, should be 403")
            except Exception as e:
                self.log_test(f"Core Field Protection - key='{core_key}'", False, f"Exception: {str(e)}")
        
        # Create valid custom field (should succeed)
        try:
            valid_field = {
                "site_id": site_id,
                "key": f"valid_custom_{int(datetime.now().timestamp())}",
                "label": "Valid Custom Field",
                "field_type": "currency",
                "created_by_user_id": self.current_user["id"]
            }
            
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=valid_field)
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Core Field Protection - Valid Custom Field", True, f"✅ Successfully created custom field: {data['key']}")
            else:
                self.log_test("Core Field Protection - Valid Custom Field", False, f"Failed to create valid field: {response.status_code}")
        except Exception as e:
            self.log_test("Core Field Protection - Valid Custom Field", False, f"Exception: {str(e)}")
    
    def test_regression_check(self):
        """Test backward compatibility and existing functionality"""
        print("\n=== Testing Regression Check (Backward Compatibility) ===")
        
        if not self.login("owner"):
            return
        
        # Test old paths still work
        old_paths = [
            ("field-configs", "site_id=site-001"),
            ("banking-formulas", "site_id=site-001"),
            ("daily-rollups", "siteIds=site-001&startDate=2026-04-01&endDate=2026-04-02")
        ]
        
        for path, params in old_paths:
            try:
                response = self.session.get(f"{BASE_URL}/{path}?{params}")
                
                if response.status_code == 200:
                    data = response.json()
                    self.log_test(f"Backward Compatibility - /{path}", True, f"Old path works, returned {len(data)} items")
                else:
                    self.log_test(f"Backward Compatibility - /{path}", False, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test(f"Backward Compatibility - /{path}", False, f"Exception: {str(e)}")
        
        # Test custom values integration still works
        try:
            report_data = {
                "site_id": "site-001",
                "submitted_by_user_id": self.current_user["id"],
                "date": "2026-04-15",
                "shift_type": "Morning",
                "fuel_sales": 1500.00,
                "shop_sales": 300.00,
                "total_litres": 1200,
                "eftpos": 800.00,
                "cash": 200.00,
                "custom_values": {
                    "test_field": 123.45,
                    "another_field": "test_value"
                }
            }
            
            response = self.session.post(f"{BASE_URL}/reports", json=report_data)
            
            if response.status_code == 201:
                data = response.json()
                report_id = data["id"]
                self.log_test("Regression - Custom Values Integration", True, f"Report created with custom values: {report_id}")
                
                # Verify custom values are saved
                get_response = self.session.get(f"{BASE_URL}/reports/{report_id}")
                if get_response.status_code == 200:
                    report_data = get_response.json()
                    if "custom_values" in report_data and report_data["custom_values"]:
                        self.log_test("Regression - Custom Values Retrieval", True, "Custom values properly saved and retrieved")
                    else:
                        self.log_test("Regression - Custom Values Retrieval", False, "Custom values not found in retrieved report")
                else:
                    self.log_test("Regression - Custom Values Retrieval", False, f"Failed to retrieve report: {get_response.status_code}")
            else:
                self.log_test("Regression - Custom Values Integration", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Regression - Custom Values Integration", False, f"Exception: {str(e)}")
        
        # Test existing CRUD endpoints still functional
        crud_tests = [
            ("GET", "users", {}),
            ("GET", "sites", {}),
            ("GET", "assignments", {}),
            ("GET", "reports", {"siteIds": "site-001"}),
            ("GET", "dashboard/stats", {"siteIds": "site-001"})
        ]
        
        for method, endpoint, params in crud_tests:
            try:
                if method == "GET":
                    response = self.session.get(f"{BASE_URL}/{endpoint}", params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    self.log_test(f"Regression - {method} /{endpoint}", True, f"Endpoint functional, returned data")
                else:
                    self.log_test(f"Regression - {method} /{endpoint}", False, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test(f"Regression - {method} /{endpoint}", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting WorkflowLite Backend Testing - RETEST AFTER FIXES")
        print("=" * 80)
        
        # Seed database first
        try:
            response = self.session.post(f"{BASE_URL}/seed")
            if response.status_code == 200:
                print("✅ Database seeded successfully")
            else:
                print(f"❌ Database seeding failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Database seeding error: {str(e)}")
        
        # Run all test suites
        self.test_daily_rollup_api_correct_path()
        self.test_site_field_configs_api_correct_path()
        self.test_site_banking_formulas_api_correct_path()
        self.test_banking_calculate_api()
        self.test_core_field_protection_security()
        self.test_regression_check()
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for r in self.test_results if r["passed"])
        total = len(self.test_results)
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 90:
            print("🎉 EXCELLENT: All major fixes verified!")
        elif success_rate >= 75:
            print("✅ GOOD: Most fixes working, minor issues remain")
        else:
            print("❌ ISSUES: Significant problems still exist")
        
        # List failed tests
        failed_tests = [r for r in self.test_results if not r["passed"]]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"   • {test['test']}: {test['details']}")
        
        return success_rate >= 75

if __name__ == "__main__":
    tester = WorkflowLiteBackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)