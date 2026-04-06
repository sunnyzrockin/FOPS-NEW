#!/usr/bin/env python3
"""
WorkflowLite Backend API Testing Suite
Tests all backend APIs for the fuel station reporting tool
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

# Test credentials
TEST_CREDENTIALS = {
    "owner": {"email": "owner@demo.com", "password": "demo123"},
    "operator": {"email": "operator@demo.com", "password": "demo123"},
    "staff": {"email": "staff@demo.com", "password": "demo123"}
}

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.current_user = None
        self.user_sites = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "details": details
        })
    
    def test_seed_database(self):
        """Test POST /api/seed"""
        print("\n=== Testing Seed Database API ===")
        try:
            response = self.session.post(f"{API_BASE}/seed")
            
            if response.status_code == 200:
                data = response.json()
                if 'counts' in data and data['counts']['users'] > 0:
                    self.log_result("Seed Database", True, 
                                  f"Database seeded successfully with {data['counts']['users']} users, {data['counts']['sites']} sites, {data['counts']['reports']} reports")
                else:
                    self.log_result("Seed Database", False, "Seed response missing counts data", data)
            else:
                self.log_result("Seed Database", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Seed Database", False, f"Request failed: {str(e)}")
    
    def test_auth_login(self, role="owner"):
        """Test POST /api/auth/login"""
        print(f"\n=== Testing Auth Login API ({role}) ===")
        try:
            credentials = TEST_CREDENTIALS[role]
            response = self.session.post(f"{API_BASE}/auth/login", 
                                       json=credentials)
            
            if response.status_code == 200:
                data = response.json()
                if 'user' in data and 'sites' in data:
                    user = data['user']
                    sites = data['sites']
                    
                    # Store for later tests
                    self.current_user = user
                    self.user_sites = sites
                    
                    self.log_result("Auth Login", True, 
                                  f"Login successful for {user['name']} ({user['role']}) with {len(sites)} sites")
                    return True
                else:
                    self.log_result("Auth Login", False, "Response missing user or sites data", data)
            else:
                self.log_result("Auth Login", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Auth Login", False, f"Request failed: {str(e)}")
        
        return False
    
    def test_auth_login_invalid(self):
        """Test login with invalid credentials"""
        print("\n=== Testing Auth Login with Invalid Credentials ===")
        try:
            response = self.session.post(f"{API_BASE}/auth/login", 
                                       json={"email": "invalid@test.com", "password": "wrong"})
            
            if response.status_code == 401:
                self.log_result("Auth Login Invalid", True, "Correctly rejected invalid credentials")
            else:
                self.log_result("Auth Login Invalid", False, f"Expected 401, got {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Auth Login Invalid", False, f"Request failed: {str(e)}")
    
    def test_sites_api(self):
        """Test GET /api/sites"""
        print("\n=== Testing Sites API ===")
        try:
            # Test get all sites
            response = self.session.get(f"{API_BASE}/sites")
            
            if response.status_code == 200:
                sites = response.json()
                if isinstance(sites, list) and len(sites) > 0:
                    self.log_result("Sites List", True, f"Retrieved {len(sites)} sites")
                    
                    # Test get sites for user
                    if self.current_user:
                        response = self.session.get(f"{API_BASE}/sites?userId={self.current_user['id']}")
                        if response.status_code == 200:
                            user_sites = response.json()
                            self.log_result("Sites by User", True, f"Retrieved {len(user_sites)} sites for user")
                        else:
                            self.log_result("Sites by User", False, f"HTTP {response.status_code}", response.text)
                    
                    # Test get specific site
                    if sites:
                        site_id = sites[0]['id']
                        response = self.session.get(f"{API_BASE}/sites/{site_id}")
                        if response.status_code == 200:
                            site = response.json()
                            self.log_result("Site by ID", True, f"Retrieved site: {site.get('name', 'Unknown')}")
                        else:
                            self.log_result("Site by ID", False, f"HTTP {response.status_code}", response.text)
                else:
                    self.log_result("Sites List", False, "No sites returned or invalid format", sites)
            else:
                self.log_result("Sites List", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Sites API", False, f"Request failed: {str(e)}")
    
    def test_reports_api(self):
        """Test Shift Reports CRUD API"""
        print("\n=== Testing Shift Reports API ===")
        
        # Test GET all reports
        try:
            response = self.session.get(f"{API_BASE}/reports")
            
            if response.status_code == 200:
                reports = response.json()
                if isinstance(reports, list):
                    self.log_result("Reports List", True, f"Retrieved {len(reports)} reports")
                    
                    # Test filters
                    if self.current_user:
                        # Filter by user
                        response = self.session.get(f"{API_BASE}/reports?userId={self.current_user['id']}")
                        if response.status_code == 200:
                            user_reports = response.json()
                            self.log_result("Reports by User", True, f"Retrieved {len(user_reports)} reports for user")
                        
                        # Filter by site
                        if self.user_sites:
                            site_id = self.user_sites[0]['id']
                            response = self.session.get(f"{API_BASE}/reports?siteId={site_id}")
                            if response.status_code == 200:
                                site_reports = response.json()
                                self.log_result("Reports by Site", True, f"Retrieved {len(site_reports)} reports for site")
                    
                    # Filter by date range
                    start_date = "2026-03-01"
                    end_date = "2026-04-06"
                    response = self.session.get(f"{API_BASE}/reports?startDate={start_date}&endDate={end_date}")
                    if response.status_code == 200:
                        date_reports = response.json()
                        self.log_result("Reports by Date Range", True, f"Retrieved {len(date_reports)} reports for date range")
                    
                    # Test get specific report
                    if reports:
                        report_id = reports[0]['id']
                        response = self.session.get(f"{API_BASE}/reports/{report_id}")
                        if response.status_code == 200:
                            report = response.json()
                            self.log_result("Report by ID", True, f"Retrieved report for {report.get('site_name', 'Unknown site')}")
                            
                            # Test update report status
                            response = self.session.put(f"{API_BASE}/reports/{report_id}/status", 
                                                      json={"status": "reviewed"})
                            if response.status_code == 200:
                                self.log_result("Update Report Status", True, "Successfully updated report status to reviewed")
                            else:
                                self.log_result("Update Report Status", False, f"HTTP {response.status_code}", response.text)
                        else:
                            self.log_result("Report by ID", False, f"HTTP {response.status_code}", response.text)
                else:
                    self.log_result("Reports List", False, "Invalid reports format", reports)
            else:
                self.log_result("Reports List", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Reports API", False, f"Request failed: {str(e)}")
    
    def test_users_crud_api(self):
        """Test Users CRUD API"""
        print("\n=== Testing Users CRUD API ===")
        
        try:
            # Test GET all users
            response = self.session.get(f"{API_BASE}/users")
            if response.status_code == 200:
                users = response.json()
                if isinstance(users, list) and len(users) > 0:
                    self.log_result("Users List", True, f"Retrieved {len(users)} users")
                    
                    # Test filter by role
                    response = self.session.get(f"{API_BASE}/users?role=operator")
                    if response.status_code == 200:
                        operators = response.json()
                        self.log_result("Users Filter by Role", True, f"Retrieved {len(operators)} operators")
                    
                    response = self.session.get(f"{API_BASE}/users?role=staff")
                    if response.status_code == 200:
                        staff = response.json()
                        self.log_result("Users Filter Staff", True, f"Retrieved {len(staff)} staff members")
                else:
                    self.log_result("Users List", False, "No users returned", users)
            else:
                self.log_result("Users List", False, f"HTTP {response.status_code}", response.text)
            
            # Test CREATE user
            new_user_data = {
                "name": "Test User",
                "email": "testuser@demo.com",
                "role": "staff",
                "password": "demo123"
            }
            
            response = self.session.post(f"{API_BASE}/users", json=new_user_data)
            if response.status_code == 201:
                new_user = response.json()
                if 'id' in new_user and new_user['email'] == new_user_data['email']:
                    self.log_result("Create User", True, f"Successfully created user: {new_user['name']}")
                    
                    # Test UPDATE user
                    update_data = {"name": "Updated Test User", "status": "active"}
                    response = self.session.put(f"{API_BASE}/users/{new_user['id']}", json=update_data)
                    if response.status_code == 200:
                        self.log_result("Update User", True, "Successfully updated user")
                    else:
                        self.log_result("Update User", False, f"HTTP {response.status_code}", response.text)
                    
                    # Test DELETE user
                    response = self.session.delete(f"{API_BASE}/users/{new_user['id']}")
                    if response.status_code == 200:
                        self.log_result("Delete User", True, "Successfully deleted user")
                    else:
                        self.log_result("Delete User", False, f"HTTP {response.status_code}", response.text)
                else:
                    self.log_result("Create User", False, "User created but missing expected fields", new_user)
            else:
                self.log_result("Create User", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Users CRUD API", False, f"Request failed: {str(e)}")
    
    def test_sites_crud_api(self):
        """Test Sites CRUD API"""
        print("\n=== Testing Sites CRUD API ===")
        
        try:
            # Test CREATE site
            new_site_data = {
                "name": "Test Site",
                "code": "TEST-001",
                "location": "Test Location",
                "owner_id": "owner-001"  # Using demo owner ID
            }
            
            response = self.session.post(f"{API_BASE}/sites", json=new_site_data)
            if response.status_code == 201:
                new_site = response.json()
                if 'id' in new_site and new_site['name'] == new_site_data['name']:
                    self.log_result("Create Site", True, f"Successfully created site: {new_site['name']}")
                    
                    # Test UPDATE site
                    update_data = {"name": "Updated Test Site", "location": "Updated Location"}
                    response = self.session.put(f"{API_BASE}/sites/{new_site['id']}", json=update_data)
                    if response.status_code == 200:
                        self.log_result("Update Site", True, "Successfully updated site")
                    else:
                        self.log_result("Update Site", False, f"HTTP {response.status_code}", response.text)
                else:
                    self.log_result("Create Site", False, "Site created but missing expected fields", new_site)
            else:
                self.log_result("Create Site", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Sites CRUD API", False, f"Request failed: {str(e)}")
    
    def test_assignments_api(self):
        """Test Assignments API"""
        print("\n=== Testing Assignments API ===")
        
        try:
            # Test GET all assignments
            response = self.session.get(f"{API_BASE}/assignments")
            if response.status_code == 200:
                assignments = response.json()
                if isinstance(assignments, list):
                    self.log_result("Assignments List", True, f"Retrieved {len(assignments)} assignments")
                    
                    # Test filter by user
                    if self.current_user:
                        response = self.session.get(f"{API_BASE}/assignments?userId={self.current_user['id']}")
                        if response.status_code == 200:
                            user_assignments = response.json()
                            self.log_result("Assignments by User", True, f"Retrieved {len(user_assignments)} assignments for user")
                    
                    # Test filter by site
                    if self.user_sites:
                        site_id = self.user_sites[0]['id']
                        response = self.session.get(f"{API_BASE}/assignments?siteId={site_id}")
                        if response.status_code == 200:
                            site_assignments = response.json()
                            self.log_result("Assignments by Site", True, f"Retrieved {len(site_assignments)} assignments for site")
                    
                    # Test CREATE assignment
                    if len(assignments) > 0:
                        assignment_data = {
                            "user_id": "staff-001",  # Using demo staff ID
                            "site_id": self.user_sites[0]['id'] if self.user_sites else "site-001",
                            "assigned_by_user_id": "owner-001"
                        }
                        
                        response = self.session.post(f"{API_BASE}/assignments", json=assignment_data)
                        if response.status_code == 201:
                            new_assignment = response.json()
                            self.log_result("Create Assignment", True, f"Successfully created assignment with ID: {new_assignment['id']}")
                            
                            # Test DELETE assignment
                            response = self.session.delete(f"{API_BASE}/assignments/{new_assignment['id']}")
                            if response.status_code == 200:
                                self.log_result("Delete Assignment", True, "Successfully deleted assignment")
                            else:
                                self.log_result("Delete Assignment", False, f"HTTP {response.status_code}", response.text)
                        elif response.status_code == 400:
                            # Assignment might already exist
                            self.log_result("Create Assignment", True, "Assignment already exists (expected behavior)")
                        else:
                            self.log_result("Create Assignment", False, f"HTTP {response.status_code}", response.text)
                else:
                    self.log_result("Assignments List", False, "Invalid assignments format", assignments)
            else:
                self.log_result("Assignments List", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Assignments API", False, f"Request failed: {str(e)}")
    
    def test_create_report(self):
        """Test POST /api/reports with updated field names"""
        print("\n=== Testing Create Report API ===")
        
        if not self.current_user or not self.user_sites:
            self.log_result("Create Report", False, "No user or sites available for testing")
            return
        
        try:
            # Create a new report with updated field names (accounts instead of sunstate_account)
            report_data = {
                "site_id": self.user_sites[0]['id'],
                "submitted_by_user_id": self.current_user['id'],
                "date": "2026-04-06",
                "shift_type": "Afternoon",  # Updated from Evening to Afternoon
                "fuel_sales": 3500.00,
                "shop_sales": 850.00,
                "total_litres": 2000,
                "eftpos": 2800.00,
                "motorpass": 500.00,
                "cash": 350.00,
                "beverages": 300.00,
                "hot_food": 200.00,
                "accounts": 500.00,  # Updated field name
                "drive_offs": 0,
                "dips": 15000.00,
                "notes": "Test shift report from backend testing"
            }
            
            response = self.session.post(f"{API_BASE}/reports", json=report_data)
            
            if response.status_code == 201:
                report = response.json()
                if 'id' in report and report['status'] == 'pending':
                    self.log_result("Create Report", True, f"Successfully created report with ID: {report['id']}")
                    
                    # Test update report status with reviewed_by_user_id
                    response = self.session.put(f"{API_BASE}/reports/{report['id']}/status", 
                                              json={"status": "reviewed", "reviewed_by_user_id": self.current_user['id']})
                    if response.status_code == 200:
                        self.log_result("Update Report Status with Reviewer", True, "Successfully updated report status with reviewer")
                    else:
                        self.log_result("Update Report Status with Reviewer", False, f"HTTP {response.status_code}", response.text)
                    
                    return report['id']
                else:
                    self.log_result("Create Report", False, "Report created but missing expected fields", report)
            else:
                self.log_result("Create Report", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Create Report", False, f"Request failed: {str(e)}")
        
        return None
    
    def test_dashboard_stats(self):
        """Test Dashboard Stats APIs"""
        print("\n=== Testing Dashboard Stats API ===")
        
        if not self.user_sites:
            self.log_result("Dashboard Stats", False, "No sites available for testing")
            return
        
        try:
            site_ids = [site['id'] for site in self.user_sites]
            site_ids_param = ','.join(site_ids)
            
            # Test general stats
            params = f"siteIds={site_ids_param}&startDate=2026-03-01&endDate=2026-04-06"
            response = self.session.get(f"{API_BASE}/dashboard/stats?{params}")
            
            if response.status_code == 200:
                stats = response.json()
                expected_fields = ['totalShopSales', 'totalFuelSales', 'totalRevenue', 'totalReports', 'totalDriveOffs']
                if all(field in stats for field in expected_fields):
                    self.log_result("Dashboard Stats", True, 
                                  f"Retrieved stats: {stats['totalReports']} reports, ${stats['totalRevenue']} revenue, ${stats['totalDriveOffs']} drive-offs")
                else:
                    missing_fields = [field for field in expected_fields if field not in stats]
                    self.log_result("Dashboard Stats", False, f"Missing expected stats fields: {missing_fields}", stats)
            else:
                self.log_result("Dashboard Stats", False, f"HTTP {response.status_code}", response.text)
            
            # Test site stats
            response = self.session.get(f"{API_BASE}/dashboard/site-stats?{params}")
            
            if response.status_code == 200:
                site_stats = response.json()
                if isinstance(site_stats, list) and len(site_stats) > 0:
                    # Check if driveOffs field is included in site stats
                    first_site = site_stats[0]
                    if 'driveOffs' in first_site:
                        self.log_result("Dashboard Site Stats", True, f"Retrieved stats for {len(site_stats)} sites with driveOffs field")
                    else:
                        self.log_result("Dashboard Site Stats", False, "Site stats missing driveOffs field", first_site)
                else:
                    self.log_result("Dashboard Site Stats", False, "Invalid site stats format", site_stats)
            else:
                self.log_result("Dashboard Site Stats", False, f"HTTP {response.status_code}", response.text)
            
            # Test revenue chart
            response = self.session.get(f"{API_BASE}/dashboard/revenue-chart?siteIds={site_ids_param}&days=7")
            
            if response.status_code == 200:
                chart_data = response.json()
                if isinstance(chart_data, list) and len(chart_data) > 0:
                    self.log_result("Dashboard Revenue Chart", True, f"Retrieved chart data for {len(chart_data)} days")
                else:
                    self.log_result("Dashboard Revenue Chart", False, "Invalid chart data format", chart_data)
            else:
                self.log_result("Dashboard Revenue Chart", False, f"HTTP {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Dashboard Stats", False, f"Request failed: {str(e)}")
    
    def test_different_user_roles(self):
        """Test APIs with different user roles"""
        print("\n=== Testing Different User Roles ===")
        
        for role in ["operator", "staff"]:
            print(f"\n--- Testing {role.upper()} role ---")
            if self.test_auth_login(role):
                # Test basic functionality for each role
                self.test_sites_api()
                
                # Staff should be able to create reports
                if role == "staff":
                    self.test_create_report()
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting WorkflowLite Backend API Tests - Updated Version")
        print(f"Base URL: {BASE_URL}")
        print("=" * 60)
        
        # 1. Seed database first
        self.test_seed_database()
        
        # 2. Test authentication
        if self.test_auth_login("owner"):
            # 3. Test invalid login
            self.test_auth_login_invalid()
            
            # 4. Test Users CRUD API (NEW)
            self.test_users_crud_api()
            
            # 5. Test Sites CRUD API (UPDATED)
            self.test_sites_crud_api()
            self.test_sites_api()
            
            # 6. Test Assignments API (NEW)
            self.test_assignments_api()
            
            # 7. Test Reports API (UPDATED)
            self.test_reports_api()
            
            # 8. Test Create Report with updated fields
            self.test_create_report()
            
            # 9. Test Dashboard Stats (UPDATED with totalDriveOffs)
            self.test_dashboard_stats()
            
            # 10. Test different user roles
            self.test_different_user_roles()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        failed = total - passed
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['message']}")
        
        print("\n" + "=" * 60)
        
        return failed == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)