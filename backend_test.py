#!/usr/bin/env python3
"""
WorkflowLite Backend Testing Suite
Tests all new features implemented by the main agent
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"
CREDENTIALS = {
    "owner": {"email": "owner@demo.com", "password": "demo123"},
    "operator": {"email": "operator@demo.com", "password": "demo123"},
    "staff": {"email": "staff@demo.com", "password": "demo123"}
}

class WorkflowLiteTest:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.current_user = None
        self.user_sites = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "details": details or {}
        }
        self.test_results.append(result)
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def login(self, role="owner"):
        """Login with specified role"""
        try:
            creds = CREDENTIALS[role]
            response = self.session.post(f"{BASE_URL}/auth/login", json=creds)
            
            if response.status_code == 200:
                data = response.json()
                self.current_user = data["user"]
                self.user_sites = data["sites"]
                self.log_result(f"Login as {role}", True, f"Logged in as {self.current_user['name']}")
                return True
            else:
                self.log_result(f"Login as {role}", False, f"Login failed: {response.status_code}")
                return False
        except Exception as e:
            self.log_result(f"Login as {role}", False, f"Login error: {str(e)}")
            return False
    
    def seed_database(self):
        """Seed the database with test data"""
        try:
            response = self.session.post(f"{BASE_URL}/seed")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Database Seed", True, f"Seeded {data['counts']['users']} users, {data['counts']['sites']} sites, {data['counts']['reports']} reports")
                return True
            else:
                self.log_result("Database Seed", False, f"Seed failed: {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Database Seed", False, f"Seed error: {str(e)}")
            return False
    
    def test_daily_rollup_api(self):
        """Test Daily Rollup API with Day/Shift views"""
        print("\n=== TESTING DAILY ROLLUP API ===")
        
        # Test 1: Check if endpoint exists at /api/reports/daily-rollup
        try:
            site_id = self.user_sites[0]["id"] if self.user_sites else "site-001"
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Test Day view
            response = self.session.get(f"{BASE_URL}/reports/daily-rollup", params={
                "view": "Day",
                "site_id": site_id,
                "date": today
            })
            
            if response.status_code == 404:
                self.log_result("Daily Rollup API - Day View", False, "Endpoint /api/reports/daily-rollup not found", {"status_code": 404})
            elif response.status_code == 200:
                data = response.json()
                self.log_result("Daily Rollup API - Day View", True, f"Day view returned {len(data)} records")
            else:
                self.log_result("Daily Rollup API - Day View", False, f"Unexpected status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Daily Rollup API - Day View", False, f"Error: {str(e)}")
        
        # Test 2: Check alternative endpoint /api/daily-rollups
        try:
            site_ids = [site["id"] for site in self.user_sites[:2]] if self.user_sites else ["site-001"]
            response = self.session.get(f"{BASE_URL}/daily-rollups", params={
                "siteIds": ",".join(site_ids),
                "startDate": (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
                "endDate": datetime.now().strftime("%Y-%m-%d")
            })
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Daily Rollups API (Alternative)", True, f"Returned {len(data)} daily rollups")
                
                # Verify aggregation fields
                if data:
                    sample = data[0]
                    required_fields = ["site_id", "date", "total_sales", "fuel_sales", "shop_sales", "shift_count", "banking_value"]
                    missing_fields = [f for f in required_fields if f not in sample]
                    if missing_fields:
                        self.log_result("Daily Rollup Aggregation", False, f"Missing fields: {missing_fields}")
                    else:
                        self.log_result("Daily Rollup Aggregation", True, "All required aggregation fields present")
            else:
                self.log_result("Daily Rollups API (Alternative)", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Daily Rollups API (Alternative)", False, f"Error: {str(e)}")
    
    def test_dynamic_field_configuration_api(self):
        """Test Dynamic Field Configuration API"""
        print("\n=== TESTING DYNAMIC FIELD CONFIGURATION API ===")
        
        site_id = self.user_sites[0]["id"] if self.user_sites else "site-001"
        
        # Test 1: GET field configs - check correct endpoint
        try:
            # Test expected endpoint /api/site-field-configs
            response = self.session.get(f"{BASE_URL}/site-field-configs", params={"site_id": site_id})
            
            if response.status_code == 404:
                self.log_result("Site Field Configs GET (Expected)", False, "Endpoint /api/site-field-configs not found")
                
                # Try alternative endpoint
                response = self.session.get(f"{BASE_URL}/field-configs", params={"siteId": site_id})
                if response.status_code == 200:
                    data = response.json()
                    self.log_result("Field Configs GET (Alternative)", True, f"Retrieved {len(data)} field configs")
                    
                    # Verify field structure
                    if data:
                        sample = data[0]
                        required_fields = ["id", "site_id", "key", "label", "field_type", "is_core"]
                        missing_fields = [f for f in required_fields if f not in sample]
                        if missing_fields:
                            self.log_result("Field Config Structure", False, f"Missing fields: {missing_fields}")
                        else:
                            self.log_result("Field Config Structure", True, "All required fields present")
                            
                            # Check field types
                            field_types = set(config.get("field_type") for config in data)
                            expected_types = {"number", "currency", "percent"}
                            if not field_types.issubset(expected_types):
                                self.log_result("Field Type Validation", False, f"Unexpected field types: {field_types - expected_types}")
                            else:
                                self.log_result("Field Type Validation", True, "Field types are valid")
                else:
                    self.log_result("Field Configs GET (Alternative)", False, f"Status: {response.status_code}")
            else:
                data = response.json()
                self.log_result("Site Field Configs GET (Expected)", True, f"Retrieved {len(data)} field configs")
                
        except Exception as e:
            self.log_result("Field Configs GET", False, f"Error: {str(e)}")
        
        # Test 2: POST new field config
        try:
            new_field = {
                "site_id": site_id,
                "key": "test_custom_field",
                "label": "Test Custom Field",
                "field_type": "currency",
                "is_core": False,
                "created_by_user_id": self.current_user["id"]
            }
            
            # Try expected endpoint first
            response = self.session.post(f"{BASE_URL}/site-field-configs", json=new_field)
            
            if response.status_code == 404:
                # Try alternative endpoint
                response = self.session.post(f"{BASE_URL}/field-configs", json=new_field)
                
            if response.status_code == 201:
                data = response.json()
                self.log_result("Create Field Config", True, f"Created field config: {data['label']}")
                
                # Test core field protection
                core_field_test = {
                    "site_id": site_id,
                    "key": "fuel_sales",
                    "label": "Modified Fuel Sales",
                    "field_type": "number",
                    "is_core": True,
                    "created_by_user_id": self.current_user["id"]
                }
                
                response = self.session.post(f"{BASE_URL}/field-configs", json=core_field_test)
                if response.status_code in [400, 403]:
                    self.log_result("Core Field Protection", True, "Core field creation properly blocked")
                else:
                    self.log_result("Core Field Protection", False, f"Core field creation allowed: {response.status_code}")
                    
            else:
                self.log_result("Create Field Config", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Create Field Config", False, f"Error: {str(e)}")
    
    def test_shift_report_custom_values(self):
        """Test Shift Report Custom Values Integration"""
        print("\n=== TESTING SHIFT REPORT CUSTOM VALUES ===")
        
        site_id = self.user_sites[0]["id"] if self.user_sites else "site-001"
        
        # Test 1: Create report with custom values
        try:
            report_data = {
                "site_id": site_id,
                "submitted_by_user_id": self.current_user["id"],
                "date": datetime.now().strftime("%Y-%m-%d"),
                "shift_type": "Morning",
                "fuel_sales": 1500.00,
                "shop_sales": 300.00,
                "total_litres": 1200,
                "eftpos": 800.00,
                "cash": 200.00,
                "custom_values": [
                    {"field_config_id": "test-field-1", "numeric_value": 150.50},
                    {"field_config_id": "test-field-2", "numeric_value": 75.25}
                ]
            }
            
            response = self.session.post(f"{BASE_URL}/reports", json=report_data)
            
            if response.status_code == 201:
                report = response.json()
                self.log_result("Create Report with Custom Values", True, f"Created report: {report['id']}")
                
                # Test 2: Verify custom values are saved
                # Check if custom_values are in the response
                if "custom_values" in report:
                    if isinstance(report["custom_values"], list) and len(report["custom_values"]) > 0:
                        self.log_result("Custom Values Storage", True, "Custom values saved as array")
                    elif isinstance(report["custom_values"], dict):
                        self.log_result("Custom Values Storage", False, "Custom values saved as object instead of array")
                    else:
                        self.log_result("Custom Values Storage", False, "Custom values not properly saved")
                else:
                    self.log_result("Custom Values Storage", False, "Custom values not in response")
                
                # Test 3: Retrieve report and verify custom values
                response = self.session.get(f"{BASE_URL}/reports/{report['id']}")
                if response.status_code == 200:
                    retrieved_report = response.json()
                    if "custom_values" in retrieved_report:
                        self.log_result("Custom Values Retrieval", True, "Custom values retrieved successfully")
                    else:
                        self.log_result("Custom Values Retrieval", False, "Custom values not in retrieved report")
                else:
                    self.log_result("Custom Values Retrieval", False, f"Failed to retrieve report: {response.status_code}")
                    
            else:
                self.log_result("Create Report with Custom Values", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Shift Report Custom Values", False, f"Error: {str(e)}")
    
    def test_banking_formula_management_api(self):
        """Test Banking Formula Management API"""
        print("\n=== TESTING BANKING FORMULA MANAGEMENT API ===")
        
        site_id = self.user_sites[0]["id"] if self.user_sites else "site-001"
        
        # Test 1: GET banking formulas - check correct endpoint
        try:
            # Test expected endpoint /api/site-banking-formulas
            response = self.session.get(f"{BASE_URL}/site-banking-formulas", params={"site_id": site_id})
            
            if response.status_code == 404:
                self.log_result("Site Banking Formulas GET (Expected)", False, "Endpoint /api/site-banking-formulas not found")
                
                # Try alternative endpoint
                response = self.session.get(f"{BASE_URL}/banking-formulas", params={"siteId": site_id})
                if response.status_code == 200:
                    data = response.json()
                    self.log_result("Banking Formulas GET (Alternative)", True, f"Retrieved {len(data)} banking formulas")
                    
                    # Verify formula structure
                    if data:
                        sample = data[0]
                        required_fields = ["id", "site_id", "name", "formula_json"]
                        missing_fields = [f for f in required_fields if f not in sample]
                        if missing_fields:
                            self.log_result("Banking Formula Structure", False, f"Missing fields: {missing_fields}")
                        else:
                            self.log_result("Banking Formula Structure", True, "All required fields present")
                            
                            # Verify formula_json structure
                            try:
                                formula_data = json.loads(sample["formula_json"]) if isinstance(sample["formula_json"], str) else sample["formula_json"]
                                if "operations" in formula_data:
                                    self.log_result("Formula JSON Structure", True, "Formula JSON has operations array")
                                else:
                                    self.log_result("Formula JSON Structure", False, "Formula JSON missing operations array")
                            except:
                                self.log_result("Formula JSON Structure", False, "Invalid formula JSON format")
                else:
                    self.log_result("Banking Formulas GET (Alternative)", False, f"Status: {response.status_code}")
            else:
                data = response.json()
                self.log_result("Site Banking Formulas GET (Expected)", True, f"Retrieved {len(data)} banking formulas")
                
        except Exception as e:
            self.log_result("Banking Formulas GET", False, f"Error: {str(e)}")
        
        # Test 2: POST new banking formula
        try:
            new_formula = {
                "site_id": site_id,
                "name": "Test Banking Formula",
                "formula_json": {
                    "operations": [
                        {"type": "field", "value": "cash"},
                        {"type": "operator", "value": "+"},
                        {"type": "field", "value": "eftpos"},
                        {"type": "operator", "value": "-"},
                        {"type": "number", "value": "50"}
                    ]
                },
                "result_label": "Test Banking Result",
                "created_by_user_id": self.current_user["id"]
            }
            
            # Try expected endpoint first
            response = self.session.post(f"{BASE_URL}/site-banking-formulas", json=new_formula)
            
            if response.status_code == 404:
                # Try alternative endpoint
                response = self.session.post(f"{BASE_URL}/banking-formulas", json=new_formula)
                
            if response.status_code == 201:
                data = response.json()
                self.log_result("Create Banking Formula", True, f"Created formula: {data['name']}")
                
                # Test 3: DELETE banking formula
                formula_id = data["id"]
                delete_response = self.session.delete(f"{BASE_URL}/banking-formulas/{formula_id}")
                if delete_response.status_code == 200:
                    self.log_result("Delete Banking Formula", True, "Formula deleted successfully")
                else:
                    self.log_result("Delete Banking Formula", False, f"Delete failed: {delete_response.status_code}")
                    
            else:
                self.log_result("Create Banking Formula", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Banking Formula Management", False, f"Error: {str(e)}")
    
    def test_banking_formula_calculate_api(self):
        """Test Banking Formula Calculate API"""
        print("\n=== TESTING BANKING FORMULA CALCULATE API ===")
        
        # Test 1: Basic calculation
        try:
            formula_data = {
                "formula_json": {
                    "operator": "+",
                    "value1": 100,
                    "value2": 50
                }
            }
            
            response = self.session.post(f"{BASE_URL}/banking/calculate", json=formula_data)
            
            if response.status_code == 404:
                self.log_result("Banking Calculate API", False, "Endpoint /api/banking/calculate not found")
            elif response.status_code == 200:
                data = response.json()
                if "result" in data and data["result"] == 150:
                    self.log_result("Banking Calculate - Addition", True, f"Correct result: {data['result']}")
                else:
                    self.log_result("Banking Calculate - Addition", False, f"Incorrect result: {data}")
            else:
                self.log_result("Banking Calculate - Addition", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Banking Calculate - Addition", False, f"Error: {str(e)}")
        
        # Test 2: Test all operators
        operators_tests = [
            ("+", 100, 50, 150),
            ("-", 100, 30, 70),
            ("*", 10, 5, 50),
            ("/", 100, 4, 25)
        ]
        
        for operator, val1, val2, expected in operators_tests:
            try:
                formula_data = {
                    "formula_json": {
                        "operator": operator,
                        "value1": val1,
                        "value2": val2
                    }
                }
                
                response = self.session.post(f"{BASE_URL}/banking/calculate", json=formula_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "result" in data and abs(data["result"] - expected) < 0.01:
                        self.log_result(f"Banking Calculate - {operator}", True, f"Correct result: {data['result']}")
                    else:
                        self.log_result(f"Banking Calculate - {operator}", False, f"Expected {expected}, got {data}")
                else:
                    self.log_result(f"Banking Calculate - {operator}", False, f"Status: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"Banking Calculate - {operator}", False, f"Error: {str(e)}")
        
        # Test 3: Division by zero
        try:
            formula_data = {
                "formula_json": {
                    "operator": "/",
                    "value1": 100,
                    "value2": 0
                }
            }
            
            response = self.session.post(f"{BASE_URL}/banking/calculate", json=formula_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Banking Calculate - Division by Zero", True, f"Handled gracefully: {data}")
            elif response.status_code == 400:
                self.log_result("Banking Calculate - Division by Zero", True, "Properly rejected division by zero")
            else:
                self.log_result("Banking Calculate - Division by Zero", False, f"Unexpected status: {response.status_code}")
                
        except Exception as e:
            self.log_result("Banking Calculate - Division by Zero", False, f"Error: {str(e)}")
    
    def test_regression_checks(self):
        """Test that existing APIs still work"""
        print("\n=== REGRESSION TESTING ===")
        
        # Test existing reports API
        try:
            response = self.session.get(f"{BASE_URL}/reports")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Reports API Regression", True, f"Retrieved {len(data)} reports")
            else:
                self.log_result("Reports API Regression", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("Reports API Regression", False, f"Error: {str(e)}")
        
        # Test dashboard stats
        try:
            site_ids = [site["id"] for site in self.user_sites] if self.user_sites else []
            response = self.session.get(f"{BASE_URL}/dashboard/stats", params={"siteIds": ",".join(site_ids)})
            if response.status_code == 200:
                data = response.json()
                required_fields = ["totalRevenue", "totalReports", "pendingReports"]
                missing_fields = [f for f in required_fields if f not in data]
                if missing_fields:
                    self.log_result("Dashboard Stats Regression", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_result("Dashboard Stats Regression", True, "All dashboard stats fields present")
            else:
                self.log_result("Dashboard Stats Regression", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("Dashboard Stats Regression", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting WorkflowLite Backend Testing Suite")
        print("=" * 60)
        
        # Setup
        if not self.seed_database():
            print("❌ Database seeding failed - aborting tests")
            return
            
        if not self.login("owner"):
            print("❌ Login failed - aborting tests")
            return
        
        # Run new feature tests
        self.test_daily_rollup_api()
        self.test_dynamic_field_configuration_api()
        self.test_shift_report_custom_values()
        self.test_banking_formula_management_api()
        self.test_banking_formula_calculate_api()
        
        # Run regression tests
        self.test_regression_checks()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if "✅ PASS" in r["status"]])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result["status"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = WorkflowLiteTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)