#!/usr/bin/env python3
"""
Fuel Price Intelligence Panel - Backend Testing
Testing new fuel pricing APIs and insights engine for MVP
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

class FuelPriceTester:
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
    
    def test_seed_data_verification(self):
        """Test 5: Seed Data Verification"""
        print("\n=== TESTING SEED DATA VERIFICATION ===")
        
        # Run seed to ensure fresh data
        response = self.make_request('POST', '/seed')
        if response and response.status_code == 200:
            seed_data = response.json()
            counts = seed_data.get('counts', {})
            
            # Verify expected counts
            expected_competitors = 12  # ~12 competitors (2-3 per site × 5 sites)
            expected_fuel_entries = 105  # 3 fuel types × 7 days × 5 sites
            expected_competitor_prices = 252  # 3 fuel types × 7 days × ~12 competitors
            
            actual_competitors = counts.get('site_competitors', 0)
            actual_fuel_entries = counts.get('fuel_price_entries', 0)
            actual_competitor_prices = counts.get('competitor_prices', 0)
            
            self.log_test(
                "Seed API - Site Competitors Count",
                actual_competitors >= 10 and actual_competitors <= 15,
                f"Expected ~12, got {actual_competitors}"
            )
            
            self.log_test(
                "Seed API - Fuel Price Entries Count", 
                actual_fuel_entries == expected_fuel_entries,
                f"Expected {expected_fuel_entries}, got {actual_fuel_entries}"
            )
            
            self.log_test(
                "Seed API - Competitor Prices Count",
                actual_competitor_prices >= 240 and actual_competitor_prices <= 270,
                f"Expected ~252, got {actual_competitor_prices}"
            )
            
            # Verify all 5 sites have data
            sites_response = self.make_request('GET', '/sites')
            if sites_response and sites_response.status_code == 200:
                sites = sites_response.json()
                self.log_test(
                    "Seed API - Sites Count",
                    len(sites) == 5,
                    f"Expected 5 sites, got {len(sites)}"
                )
        else:
            self.log_test("Seed API - Basic Functionality", False, "Seed API failed")
    
    def test_site_competitors_api(self):
        """Test 1: Site Competitors API"""
        print("\n=== TESTING SITE COMPETITORS API ===")
        
        # GET Tests
        response = self.make_request('GET', '/site-competitors?siteId=site-001')
        if response and response.status_code == 200:
            competitors = response.json()
            self.log_test(
                "Site Competitors GET - Brisbane site",
                len(competitors) >= 2 and len(competitors) <= 3,
                f"Expected 2-3 competitors, got {len(competitors)}"
            )
            
            # Verify response structure
            if competitors:
                comp = competitors[0]
                required_fields = ['id', 'site_id', 'competitor_name', 'distance_km']
                has_all_fields = all(field in comp for field in required_fields)
                self.log_test(
                    "Site Competitors GET - Response Structure",
                    has_all_fields,
                    f"Fields present: {list(comp.keys())}"
                )
                
                # Check realistic competitor names
                realistic_names = any(name in comp['competitor_name'] for name in ['Shell', 'BP', '7-Eleven', 'Caltex', 'United'])
                self.log_test(
                    "Site Competitors GET - Realistic Names",
                    realistic_names,
                    f"Competitor name: {comp['competitor_name']}"
                )
        else:
            self.log_test("Site Competitors GET", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Test - Create new competitor
        new_competitor = {
            "site_id": "site-001",
            "competitor_name": "Test Petrol Station",
            "distance_km": 1.5
        }
        response = self.make_request('POST', '/site-competitors', new_competitor, 201)
        if response and response.status_code == 201:
            created_comp = response.json()
            self.log_test(
                "Site Competitors POST - Create",
                created_comp['competitor_name'] == "Test Petrol Station",
                f"Created: {created_comp.get('competitor_name')}"
            )
            
            # Store ID for update/delete tests
            test_competitor_id = created_comp['id']
            
            # PUT Test - Update competitor
            update_data = {
                "competitor_name": "Updated Test Station",
                "distance_km": 2.0
            }
            response = self.make_request('PUT', f'/site-competitors/{test_competitor_id}', update_data)
            if response and response.status_code == 200:
                self.log_test("Site Competitors PUT - Update", True, "Competitor updated successfully")
            else:
                self.log_test("Site Competitors PUT - Update", False, f"Status: {response.status_code if response else 'No response'}")
            
            # DELETE Test - Delete competitor
            response = self.make_request('DELETE', f'/site-competitors/{test_competitor_id}')
            if response and response.status_code == 200:
                self.log_test("Site Competitors DELETE", True, "Competitor deleted successfully")
            else:
                self.log_test("Site Competitors DELETE", False, f"Status: {response.status_code if response else 'No response'}")
        else:
            self.log_test("Site Competitors POST", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_fuel_price_entries_api(self):
        """Test 2: Fuel Price Entries API"""
        print("\n=== TESTING FUEL PRICE ENTRIES API ===")
        
        # GET Tests
        response = self.make_request('GET', '/fuel-price-entries?siteId=site-001')
        if response and response.status_code == 200:
            entries = response.json()
            self.log_test(
                "Fuel Price Entries GET - Brisbane site",
                len(entries) > 0,
                f"Got {len(entries)} entries"
            )
            
            # Verify response structure
            if entries:
                entry = entries[0]
                required_fields = ['id', 'site_id', 'fuel_type', 'own_price', 'date', 'entered_by_user_id']
                has_all_fields = all(field in entry for field in required_fields)
                self.log_test(
                    "Fuel Price Entries GET - Response Structure",
                    has_all_fields,
                    f"Fields present: {list(entry.keys())}"
                )
                
                # Verify fuel types
                fuel_types = set(e['fuel_type'] for e in entries)
                expected_types = {'ULP', 'Diesel', 'Premium'}
                has_valid_types = fuel_types.issubset(expected_types)
                self.log_test(
                    "Fuel Price Entries GET - Valid Fuel Types",
                    has_valid_types,
                    f"Found types: {fuel_types}"
                )
        else:
            self.log_test("Fuel Price Entries GET", False, f"Status: {response.status_code if response else 'No response'}")
        
        # GET with date range filter
        today = datetime.now().strftime('%Y-%m-%d')
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        response = self.make_request('GET', f'/fuel-price-entries?siteId=site-001&startDate={yesterday}&endDate={today}')
        if response and response.status_code == 200:
            filtered_entries = response.json()
            self.log_test(
                "Fuel Price Entries GET - Date Range Filter",
                len(filtered_entries) >= 0,
                f"Got {len(filtered_entries)} entries for date range"
            )
        else:
            self.log_test("Fuel Price Entries GET - Date Filter", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Test - Create new fuel price entry
        new_entry = {
            "site_id": "site-001",
            "fuel_type": "ULP",
            "own_price": 185.5,
            "date": today,
            "entered_by_user_id": "operator-001"
        }
        response = self.make_request('POST', '/fuel-price-entries', new_entry, 201)
        if response and response.status_code == 201:
            created_entry = response.json()
            self.log_test(
                "Fuel Price Entries POST - Create",
                created_entry['own_price'] == 185.5 and created_entry['fuel_type'] == "ULP",
                f"Created: {created_entry.get('fuel_type')} at {created_entry.get('own_price')}"
            )
            
            # Store ID for update test
            test_entry_id = created_entry['id']
            
            # PUT Test - Update own_price
            update_data = {"own_price": 187.9}
            response = self.make_request('PUT', f'/fuel-price-entries/{test_entry_id}', update_data)
            if response and response.status_code == 200:
                self.log_test("Fuel Price Entries PUT - Update", True, "Price updated successfully")
            else:
                self.log_test("Fuel Price Entries PUT - Update", False, f"Status: {response.status_code if response else 'No response'}")
        else:
            self.log_test("Fuel Price Entries POST", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_competitor_prices_api(self):
        """Test 3: Competitor Prices API"""
        print("\n=== TESTING COMPETITOR PRICES API ===")
        
        # GET Tests
        response = self.make_request('GET', '/competitor-prices?siteId=site-001')
        if response and response.status_code == 200:
            prices = response.json()
            self.log_test(
                "Competitor Prices GET - Brisbane site",
                len(prices) > 0,
                f"Got {len(prices)} competitor prices"
            )
            
            # Verify response structure
            if prices:
                price = prices[0]
                required_fields = ['competitor_name', 'fuel_type', 'price', 'recorded_at']
                has_all_fields = all(field in price for field in required_fields)
                self.log_test(
                    "Competitor Prices GET - Response Structure",
                    has_all_fields,
                    f"Fields present: {list(price.keys())}"
                )
        else:
            self.log_test("Competitor Prices GET", False, f"Status: {response.status_code if response else 'No response'}")
        
        # GET with date filter
        today = datetime.now().strftime('%Y-%m-%d')
        response = self.make_request('GET', f'/competitor-prices?siteId=site-001&startDate={today}&endDate={today}')
        if response and response.status_code == 200:
            today_prices = response.json()
            self.log_test(
                "Competitor Prices GET - Date Filter",
                len(today_prices) >= 0,
                f"Got {len(today_prices)} prices for today"
            )
        else:
            self.log_test("Competitor Prices GET - Date Filter", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Test - Create competitor price
        new_price = {
            "site_id": "site-001",
            "competitor_name": "Shell Brisbane",
            "fuel_type": "ULP",
            "price": 188.9,
            "recorded_at": today,
            "entered_by_user_id": "operator-001"
        }
        response = self.make_request('POST', '/competitor-prices', new_price, 201)
        if response and response.status_code == 201:
            created_price = response.json()
            self.log_test(
                "Competitor Prices POST - Create",
                created_price['price'] == 188.9 and created_price['competitor_name'] == "Shell Brisbane",
                f"Created: {created_price.get('competitor_name')} - {created_price.get('fuel_type')} at {created_price.get('price')}"
            )
            
            # Store ID for update/delete tests
            test_price_id = created_price['id']
            
            # PUT Test - Update price
            update_data = {"price": 189.5}
            response = self.make_request('PUT', f'/competitor-prices/{test_price_id}', update_data)
            if response and response.status_code == 200:
                self.log_test("Competitor Prices PUT - Update", True, "Price updated successfully")
            else:
                self.log_test("Competitor Prices PUT - Update", False, f"Status: {response.status_code if response else 'No response'}")
            
            # DELETE Test - Delete price
            response = self.make_request('DELETE', f'/competitor-prices/{test_price_id}')
            if response and response.status_code == 200:
                self.log_test("Competitor Prices DELETE", True, "Price deleted successfully")
            else:
                self.log_test("Competitor Prices DELETE", False, f"Status: {response.status_code if response else 'No response'}")
        else:
            self.log_test("Competitor Prices POST", False, f"Status: {response.status_code if response else 'No response'}")
        
        # POST Test - Multiple fuel types
        diesel_price = {
            "site_id": "site-001",
            "competitor_name": "BP Brisbane",
            "fuel_type": "Diesel",
            "price": 179.9,
            "recorded_at": today,
            "entered_by_user_id": "operator-001"
        }
        response = self.make_request('POST', '/competitor-prices', diesel_price, 201)
        if response and response.status_code == 201:
            self.log_test("Competitor Prices POST - Multiple Fuel Types", True, "Diesel price created successfully")
        else:
            self.log_test("Competitor Prices POST - Multiple Fuel Types", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_fuel_price_comparison_insights(self):
        """Test 4: Fuel Price Comparison with Insights (CRITICAL)"""
        print("\n=== TESTING FUEL PRICE COMPARISON WITH INSIGHTS (CRITICAL) ===")
        
        # Test basic comparison
        today = datetime.now().strftime('%Y-%m-%d')
        response = self.make_request('GET', f'/fuel-price-comparison?siteIds=site-001,site-002&date={today}')
        if response and response.status_code == 200:
            comparisons = response.json()
            self.log_test(
                "Fuel Price Comparison GET - Basic",
                len(comparisons) >= 1,
                f"Got {len(comparisons)} site comparisons"
            )
            
            if comparisons:
                comparison = comparisons[0]
                
                # Verify structure
                required_fields = ['site_id', 'site_name', 'site_code', 'date', 'fuel_data']
                has_structure = all(field in comparison for field in required_fields)
                self.log_test(
                    "Fuel Price Comparison - Response Structure",
                    has_structure,
                    f"Fields present: {list(comparison.keys())}"
                )
                
                # Verify fuel_data structure
                fuel_data = comparison.get('fuel_data', {})
                if fuel_data:
                    # Check for fuel types
                    fuel_types = list(fuel_data.keys())
                    has_fuel_types = any(ft in fuel_types for ft in ['ULP', 'Diesel', 'Premium'])
                    self.log_test(
                        "Fuel Price Comparison - Fuel Types Present",
                        has_fuel_types,
                        f"Fuel types: {fuel_types}"
                    )
                    
                    # Test insights engine logic for each fuel type
                    for fuel_type, data in fuel_data.items():
                        if data.get('own_price') is not None and data.get('min_competitor_price') is not None:
                            own_price = data['own_price']
                            min_comp = data['min_competitor_price']
                            max_comp = data['max_competitor_price']
                            insight_type = data.get('insight_type')
                            difference = data.get('difference_from_min')
                            
                            # Verify required fields
                            required_insight_fields = ['own_price', 'competitor_prices', 'min_competitor_price', 'max_competitor_price', 'insight', 'insight_type', 'difference_from_min']
                            has_insight_fields = all(field in data for field in required_insight_fields)
                            self.log_test(
                                f"Fuel Price Comparison - {fuel_type} Structure",
                                has_insight_fields,
                                f"Fields: {list(data.keys())}"
                            )
                            
                            # Test insights logic
                            diff = own_price - min_comp
                            
                            # Test insight type logic
                            expected_type = None
                            if diff < 0:
                                expected_type = 'good'
                            elif diff <= 2:
                                expected_type = 'neutral'
                            elif diff <= 5:
                                expected_type = 'warning'
                            else:
                                expected_type = 'danger'
                            
                            self.log_test(
                                f"Fuel Price Comparison - {fuel_type} Insight Type Logic",
                                insight_type == expected_type,
                                f"Own: {own_price}, Min: {min_comp}, Diff: {diff:.1f}, Type: {insight_type} (expected: {expected_type})"
                            )
                            
                            # Test difference calculation
                            expected_diff = round(diff, 1)
                            actual_diff = float(difference) if difference else None
                            self.log_test(
                                f"Fuel Price Comparison - {fuel_type} Difference Calculation",
                                abs(actual_diff - expected_diff) < 0.1 if actual_diff is not None else False,
                                f"Expected: {expected_diff}, Got: {actual_diff}"
                            )
                            
                            # Test min/max calculation
                            comp_prices = [cp['price'] for cp in data.get('competitor_prices', [])]
                            if comp_prices:
                                expected_min = min(comp_prices)
                                expected_max = max(comp_prices)
                                self.log_test(
                                    f"Fuel Price Comparison - {fuel_type} Min/Max Calculation",
                                    min_comp == expected_min and max_comp == expected_max,
                                    f"Min: {min_comp} (expected: {expected_min}), Max: {max_comp} (expected: {expected_max})"
                                )
        else:
            self.log_test("Fuel Price Comparison GET", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test edge cases
        # Test with single site
        response = self.make_request('GET', f'/fuel-price-comparison?siteIds=site-001&date={today}')
        if response and response.status_code == 200:
            single_comparison = response.json()
            self.log_test(
                "Fuel Price Comparison - Single Site",
                len(single_comparison) == 1,
                f"Got {len(single_comparison)} comparison for single site"
            )
        else:
            self.log_test("Fuel Price Comparison - Single Site", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test with empty siteIds
        response = self.make_request('GET', f'/fuel-price-comparison?siteIds=&date={today}')
        if response and response.status_code == 200:
            empty_comparison = response.json()
            self.log_test(
                "Fuel Price Comparison - Empty Site IDs",
                len(empty_comparison) == 0,
                f"Got {len(empty_comparison)} comparisons for empty siteIds"
            )
        else:
            self.log_test("Fuel Price Comparison - Empty Site IDs", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_regression_apis(self):
        """Test 6: Regression Tests - Existing APIs Still Work"""
        print("\n=== TESTING REGRESSION - EXISTING APIS ===")
        
        # Test existing reports API
        response = self.make_request('GET', '/reports')
        if response and response.status_code == 200:
            reports = response.json()
            self.log_test(
                "Regression - Reports API",
                len(reports) > 0,
                f"Got {len(reports)} reports"
            )
        else:
            self.log_test("Regression - Reports API", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test existing sites API
        response = self.make_request('GET', '/sites')
        if response and response.status_code == 200:
            sites = response.json()
            self.log_test(
                "Regression - Sites API",
                len(sites) == 5,
                f"Got {len(sites)} sites"
            )
        else:
            self.log_test("Regression - Sites API", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test existing dashboard stats API
        response = self.make_request('GET', '/dashboard/stats')
        if response and response.status_code == 200:
            stats = response.json()
            required_fields = ['totalRevenue', 'totalReports', 'topPerformingSite', 'lowestPerformingSite']
            has_fields = all(field in stats for field in required_fields)
            self.log_test(
                "Regression - Dashboard Stats API",
                has_fields,
                f"Fields present: {list(stats.keys())}"
            )
        else:
            self.log_test("Regression - Dashboard Stats API", False, f"Status: {response.status_code if response else 'No response'}")
    
    def run_all_tests(self):
        """Run all fuel price intelligence tests"""
        print("🚀 STARTING FUEL PRICE INTELLIGENCE PANEL BACKEND TESTING")
        print("=" * 80)
        
        # Run tests in priority order
        self.test_seed_data_verification()  # Test 5 first to ensure fresh data
        self.test_site_competitors_api()    # Test 1
        self.test_fuel_price_entries_api()  # Test 2
        self.test_competitor_prices_api()   # Test 3
        self.test_fuel_price_comparison_insights()  # Test 4 - CRITICAL
        self.test_regression_apis()         # Test 6
        
        # Print summary
        print("\n" + "=" * 80)
        print("🎯 FUEL PRICE INTELLIGENCE TESTING SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.total_tests - self.passed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests*100):.1f}%")
        
        if self.passed_tests == self.total_tests:
            print("🎉 ALL TESTS PASSED! Fuel Price Intelligence Panel is ready for production!")
        else:
            print("⚠️  Some tests failed. Please review the issues above.")
            
        return self.passed_tests == self.total_tests

if __name__ == "__main__":
    tester = FuelPriceTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)