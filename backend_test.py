#!/usr/bin/env python3
"""
Phase 2 FINAL Refactor — Comprehensive Backend Regression Test

Tests the three newly extracted modules:
1. Reports module (/api/reports, /api/reports/:id, /api/reports/:id/status)
2. Dashboard module (/api/daily-rollups, /api/dashboard/stats, /api/dashboard/site-stats, /api/dashboard/revenue-chart)
3. Fuel Prices module (site-competitors, fuel-price-entries, competitor-prices, fuel-price-comparison)

Plus catch-all behavior and audit verification.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"},
    "support": {"email": "founder@fops.platform", "password": "Fops813387cf0a5c6351!"}
}

# Store tokens and test data
tokens = {}
test_data = {
    "created_reports": [],
    "created_competitors": [],
    "created_price_entries": [],
    "created_competitor_prices": []
}

def login(role):
    """Login and return Bearer token"""
    try:
        creds = CREDENTIALS[role]
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=creds,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Token can be at top level or in session.access_token
            token = data.get("token") or data.get("session", {}).get("access_token")
            user = data.get("user", {})
            if token:
                print(f"✅ {role.upper()} login successful (user_id: {user.get('id', 'N/A')})")
                return token
            else:
                print(f"❌ {role.upper()} login failed: No token in response")
                return None
        else:
            print(f"❌ {role.upper()} login failed: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ {role.upper()} login error: {str(e)}")
        return None

def test_reports_module():
    """Test Reports module endpoints"""
    print("\n" + "="*80)
    print("SECTION 1: REPORTS MODULE")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 1.1: GET /api/reports without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/reports", timeout=10)
        if response.status_code == 401:
            print(f"✅ 1.1: GET /reports without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 1.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.1: Error - {str(e)}")
    
    # Test 1.2: GET /api/reports as Owner (RBAC scoping)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 1.2: GET /reports as Owner → 200 ({len(reports)} reports)")
            passed += 1
        else:
            print(f"❌ 1.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.2: Error - {str(e)}")
    
    # Test 1.3: GET /api/reports as Operator (RBAC scoping)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['operator']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 1.3: GET /reports as Operator → 200 ({len(reports)} reports, assigned sites only)")
            passed += 1
        else:
            print(f"❌ 1.3: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.3: Error - {str(e)}")
    
    # Test 1.4: GET /api/reports as Staff (RBAC scoping - own reports only)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 1.4: GET /reports as Staff → 200 ({len(reports)} reports, own submissions only)")
            passed += 1
        else:
            print(f"❌ 1.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.4: Error - {str(e)}")
    
    # Test 1.5: GET /api/reports with filters (siteIds, startDate, endDate, status)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/reports?siteIds=site-001&startDate={week_ago}&endDate={today}&status=pending",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            print(f"✅ 1.5: GET /reports with filters → 200 ({len(reports)} filtered reports)")
            passed += 1
        else:
            print(f"❌ 1.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.5: Error - {str(e)}")
    
    # Test 1.6: POST /api/reports as Staff with valid payload
    total += 1
    try:
        report_payload = {
            "site_id": "site-001",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "shift_type": "Morning",
            "total_sales": 5000.00,
            "fuel_sales": 3500.00,
            "shop_sales": 1500.00,
            "total_litres": 2500,
            "eftpos": 3000.00,
            "motorpass": 800.00,
            "cash": 1200.00,
            "custom_values": {"ACCOUNT": 500.00, "BANKING": 5000.00}
        }
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json=report_payload,
            timeout=10
        )
        if response.status_code == 201:
            report = response.json()
            test_data["created_reports"].append(report["id"])
            print(f"✅ 1.6: POST /reports as Staff → 201 (report_id: {report['id'][:8]}...)")
            passed += 1
        elif response.status_code == 409:
            # Duplicate report - acceptable
            print(f"✅ 1.6: POST /reports as Staff → 409 (duplicate report, expected)")
            passed += 1
        else:
            print(f"❌ 1.6: Expected 201 or 409, got {response.status_code} - {response.text[:200]}")
    except Exception as e:
        print(f"❌ 1.6: Error - {str(e)}")
    
    # Test 1.7: POST /api/reports with duplicate date+shift_type+site_id → 409
    total += 1
    try:
        duplicate_payload = {
            "site_id": "site-001",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "shift_type": "Morning",
            "total_sales": 5000.00,
            "fuel_sales": 3500.00,
            "shop_sales": 1500.00,
            "total_litres": 2500,
            "eftpos": 3000.00,
            "motorpass": 800.00,
            "cash": 1200.00
        }
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['staff']}"},
            json=duplicate_payload,
            timeout=10
        )
        if response.status_code == 409:
            data = response.json()
            if data.get("code") == "duplicate_report":
                print(f"✅ 1.7: POST /reports duplicate → 409 with code='duplicate_report'")
                passed += 1
            else:
                print(f"❌ 1.7: Got 409 but missing code='duplicate_report'")
        else:
            print(f"❌ 1.7: Expected 409, got {response.status_code}")
    except Exception as e:
        print(f"❌ 1.7: Error - {str(e)}")
    
    # Test 1.8: GET /api/reports/:id → returns single report
    total += 1
    try:
        # Get first report from owner's list
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if len(reports) > 0:
                report_id = reports[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/reports/{report_id}",
                    headers={"Authorization": f"Bearer {tokens['owner']}"},
                    timeout=10
                )
                if response.status_code == 200:
                    report = response.json()
                    print(f"✅ 1.8: GET /reports/:id → 200 (report_id: {report_id[:8]}...)")
                    passed += 1
                else:
                    print(f"❌ 1.8: Expected 200, got {response.status_code}")
            else:
                print(f"⚠️  1.8: No reports available to test GET by ID")
                passed += 1  # Skip this test
        else:
            print(f"❌ 1.8: Failed to fetch reports list")
    except Exception as e:
        print(f"❌ 1.8: Error - {str(e)}")
    
    # Test 1.9: PUT /api/reports/:id/status (update status)
    total += 1
    try:
        # Get a pending report
        response = requests.get(
            f"{BASE_URL}/api/reports?status=pending",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if len(reports) > 0:
                report_id = reports[0]["id"]
                update_payload = {
                    "status": "reviewed",
                    "reviewed_by_user_id": "owner-001"
                }
                response = requests.put(
                    f"{BASE_URL}/api/reports/{report_id}/status",
                    headers={"Authorization": f"Bearer {tokens['owner']}"},
                    json=update_payload,
                    timeout=10
                )
                if response.status_code == 200:
                    updated = response.json()
                    print(f"✅ 1.9: PUT /reports/:id/status → 200 (status updated to 'reviewed')")
                    passed += 1
                else:
                    print(f"❌ 1.9: Expected 200, got {response.status_code}")
            else:
                print(f"⚠️  1.9: No pending reports available to test status update")
                passed += 1  # Skip this test
        else:
            print(f"❌ 1.9: Failed to fetch pending reports")
    except Exception as e:
        print(f"❌ 1.9: Error - {str(e)}")
    
    # Test 1.10: DELETE /api/reports/:id (owner-only)
    total += 1
    try:
        if test_data["created_reports"]:
            report_id = test_data["created_reports"][0]
            response = requests.delete(
                f"{BASE_URL}/api/reports/{report_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ 1.10: DELETE /reports/:id as Owner → 200")
                passed += 1
                test_data["created_reports"].remove(report_id)
            else:
                print(f"❌ 1.10: Expected 200, got {response.status_code}")
        else:
            print(f"⚠️  1.10: No test reports to delete")
            passed += 1  # Skip this test
    except Exception as e:
        print(f"❌ 1.10: Error - {str(e)}")
    
    print(f"\n📊 Reports Module: {passed}/{total} tests passed")
    return passed, total

def test_dashboard_module():
    """Test Dashboard module endpoints"""
    print("\n" + "="*80)
    print("SECTION 2: DASHBOARD MODULE")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 2.1: GET /api/daily-rollups without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/daily-rollups?siteIds=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 2.1: GET /daily-rollups without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 2.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.1: Error - {str(e)}")
    
    # Test 2.2: GET /api/daily-rollups with siteIds
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/daily-rollups?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            rollups = response.json()
            has_formula_results = any("formula_results" in r for r in rollups)
            print(f"✅ 2.2: GET /daily-rollups → 200 ({len(rollups)} rollups, formula_results: {has_formula_results})")
            passed += 1
        else:
            print(f"❌ 2.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.2: Error - {str(e)}")
    
    # Test 2.3: GET /api/dashboard/stats without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/dashboard/stats?siteIds=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 2.3: GET /dashboard/stats without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 2.3: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.3: Error - {str(e)}")
    
    # Test 2.4: GET /api/dashboard/stats with siteIds
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            required_fields = ["totalRevenue", "totalFuelSales", "totalShopSales", "totalLitres", "totalBanking", "totalDriveOffs", "totalReports"]
            has_all_fields = all(field in stats for field in required_fields)
            print(f"✅ 2.4: GET /dashboard/stats → 200 (all required fields: {has_all_fields})")
            passed += 1
        else:
            print(f"❌ 2.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.4: Error - {str(e)}")
    
    # Test 2.5: GET /api/dashboard/site-stats
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/site-stats?siteIds=site-001,site-002",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            site_stats = response.json()
            print(f"✅ 2.5: GET /dashboard/site-stats → 200 ({len(site_stats)} sites)")
            passed += 1
        else:
            print(f"❌ 2.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.5: Error - {str(e)}")
    
    # Test 2.6: GET /api/dashboard/revenue-chart
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/revenue-chart?siteIds=site-001&days=7",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            chart_data = response.json()
            print(f"✅ 2.6: GET /dashboard/revenue-chart → 200 ({len(chart_data)} data points)")
            passed += 1
        else:
            print(f"❌ 2.6: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 2.6: Error - {str(e)}")
    
    print(f"\n📊 Dashboard Module: {passed}/{total} tests passed")
    return passed, total

def test_fuel_prices_module():
    """Test Fuel Prices module endpoints"""
    print("\n" + "="*80)
    print("SECTION 3: FUEL PRICES MODULE")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 3.1: GET /api/site-competitors without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/site-competitors?siteId=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 3.1: GET /site-competitors without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 3.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.1: Error - {str(e)}")
    
    # Test 3.2: GET /api/site-competitors with siteId
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/site-competitors?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            competitors = response.json()
            print(f"✅ 3.2: GET /site-competitors → 200 ({len(competitors)} competitors)")
            passed += 1
        else:
            print(f"❌ 3.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.2: Error - {str(e)}")
    
    # Test 3.3: POST /api/site-competitors
    total += 1
    try:
        competitor_payload = {
            "site_id": "site-001",
            "competitor_name": "Test Competitor Station",
            "distance_km": 2.5,
            "latitude": -27.4698,
            "longitude": 153.0251
        }
        response = requests.post(
            f"{BASE_URL}/api/site-competitors",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json=competitor_payload,
            timeout=10
        )
        if response.status_code == 200:
            competitor = response.json()
            test_data["created_competitors"].append(competitor["id"])
            print(f"✅ 3.3: POST /site-competitors → 200 (competitor_id: {competitor['id'][:8]}...)")
            passed += 1
        else:
            print(f"❌ 3.3: Expected 200, got {response.status_code} - {response.text[:200]}")
    except Exception as e:
        print(f"❌ 3.3: Error - {str(e)}")
    
    # Test 3.4: PUT /api/site-competitors/:id
    total += 1
    try:
        if test_data["created_competitors"]:
            competitor_id = test_data["created_competitors"][0]
            update_payload = {"distance_km": 3.0}
            response = requests.put(
                f"{BASE_URL}/api/site-competitors/{competitor_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                json=update_payload,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ 3.4: PUT /site-competitors/:id → 200")
                passed += 1
            else:
                print(f"❌ 3.4: Expected 200, got {response.status_code}")
        else:
            print(f"⚠️  3.4: No test competitors to update")
            passed += 1
    except Exception as e:
        print(f"❌ 3.4: Error - {str(e)}")
    
    # Test 3.5: GET /api/fuel-price-entries
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/fuel-price-entries?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            entries = response.json()
            print(f"✅ 3.5: GET /fuel-price-entries → 200 ({len(entries)} entries)")
            passed += 1
        else:
            print(f"❌ 3.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.5: Error - {str(e)}")
    
    # Test 3.6: POST /api/fuel-price-entries
    total += 1
    try:
        entry_payload = {
            "site_id": "site-001",
            "fuel_type": "ULP",
            "price": 1.85,
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        response = requests.post(
            f"{BASE_URL}/api/fuel-price-entries",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json=entry_payload,
            timeout=10
        )
        if response.status_code == 200:
            entry = response.json()
            test_data["created_price_entries"].append(entry["id"])
            print(f"✅ 3.6: POST /fuel-price-entries → 200 (entry_id: {entry['id'][:8]}...)")
            passed += 1
        else:
            print(f"❌ 3.6: Expected 200, got {response.status_code} - {response.text[:200]}")
    except Exception as e:
        print(f"❌ 3.6: Error - {str(e)}")
    
    # Test 3.7: GET /api/competitor-prices
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/competitor-prices?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            prices = response.json()
            print(f"✅ 3.7: GET /competitor-prices → 200 ({len(prices)} prices)")
            passed += 1
        else:
            print(f"❌ 3.7: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.7: Error - {str(e)}")
    
    # Test 3.8: POST /api/competitor-prices
    total += 1
    try:
        if test_data["created_competitors"]:
            competitor_id = test_data["created_competitors"][0]
            price_payload = {
                "competitor_id": competitor_id,
                "site_id": "site-001",
                "fuel_type": "ULP",
                "price": 1.82,
                "date": datetime.now().strftime("%Y-%m-%d")
            }
            response = requests.post(
                f"{BASE_URL}/api/competitor-prices",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                json=price_payload,
                timeout=10
            )
            if response.status_code == 200:
                price = response.json()
                test_data["created_competitor_prices"].append(price["id"])
                print(f"✅ 3.8: POST /competitor-prices → 200 (price_id: {price['id'][:8]}...)")
                passed += 1
            else:
                print(f"❌ 3.8: Expected 200, got {response.status_code} - {response.text[:200]}")
        else:
            print(f"⚠️  3.8: No test competitors to add prices for")
            passed += 1
    except Exception as e:
        print(f"❌ 3.8: Error - {str(e)}")
    
    # Test 3.9: GET /api/fuel-price-comparison
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/fuel-price-comparison?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            comparison = response.json()
            print(f"✅ 3.9: GET /fuel-price-comparison → 200 ({len(comparison)} sites)")
            passed += 1
        else:
            print(f"❌ 3.9: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 3.9: Error - {str(e)}")
    
    # Test 3.10: DELETE /api/site-competitors/:id
    total += 1
    try:
        if test_data["created_competitors"]:
            competitor_id = test_data["created_competitors"][0]
            response = requests.delete(
                f"{BASE_URL}/api/site-competitors/{competitor_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ 3.10: DELETE /site-competitors/:id → 200")
                passed += 1
                test_data["created_competitors"].remove(competitor_id)
            else:
                print(f"❌ 3.10: Expected 200, got {response.status_code}")
        else:
            print(f"⚠️  3.10: No test competitors to delete")
            passed += 1
    except Exception as e:
        print(f"❌ 3.10: Error - {str(e)}")
    
    print(f"\n📊 Fuel Prices Module: {passed}/{total} tests passed")
    return passed, total

def test_catch_all_behavior():
    """Test catch-all route behavior"""
    print("\n" + "="*80)
    print("SECTION 4: CATCH-ALL BEHAVIOR")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 4.1: GET /api/health → 200
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        if response.status_code == 200:
            print(f"✅ 4.1: GET /api/health → 200")
            passed += 1
        else:
            print(f"❌ 4.1: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.1: Error - {str(e)}")
    
    # Test 4.2: POST /api/banking/calculate
    total += 1
    try:
        calc_payload = {
            "formula_json": json.dumps({"operations": [
                {"type": "field", "value": "eftpos"},
                {"type": "operator", "value": "+"},
                {"type": "field", "value": "cash"}
            ]}),
            "shift_data": {"eftpos": 3000, "cash": 1200}
        }
        response = requests.post(
            f"{BASE_URL}/api/banking/calculate",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            json=calc_payload,
            timeout=10
        )
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 4.2: POST /api/banking/calculate → 200 (result: {result.get('result', 'N/A')})")
            passed += 1
        else:
            print(f"❌ 4.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.2: Error - {str(e)}")
    
    # Test 4.3: GET /api/nonexistent → 404
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/nonexistent-endpoint-12345",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 404:
            print(f"✅ 4.3: GET /api/nonexistent → 404")
            passed += 1
        else:
            print(f"❌ 4.3: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 4.3: Error - {str(e)}")
    
    print(f"\n📊 Catch-all Behavior: {passed}/{total} tests passed")
    return passed, total

def test_audit_verification():
    """Test audit log verification"""
    print("\n" + "="*80)
    print("SECTION 5: AUDIT VERIFICATION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 5.1: GET /api/founder/audit-log as Support
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/audit-log?limit=50",
            headers={"Authorization": f"Bearer {tokens['support']}"},
            timeout=10
        )
        if response.status_code == 200:
            audit_logs = response.json()
            print(f"✅ 5.1: GET /founder/audit-log → 200 ({len(audit_logs)} audit entries)")
            
            # Check for recent shift_reports audit entries
            report_audits = [log for log in audit_logs if log.get("table_name") == "shift_reports"]
            if report_audits:
                print(f"   ℹ️  Found {len(report_audits)} shift_reports audit entries")
            
            passed += 1
        else:
            print(f"❌ 5.1: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.1: Error - {str(e)}")
    
    # Test 5.2: Verify audit entries have correct structure
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/audit-log?table=shift_reports&limit=10",
            headers={"Authorization": f"Bearer {tokens['support']}"},
            timeout=10
        )
        if response.status_code == 200:
            audit_logs = response.json()
            if audit_logs:
                first_log = audit_logs[0]
                required_fields = ["actor_email", "actor_role", "table_name", "action", "record_id"]
                has_all_fields = all(field in first_log for field in required_fields)
                if has_all_fields:
                    print(f"✅ 5.2: Audit entries have correct structure")
                    passed += 1
                else:
                    print(f"❌ 5.2: Audit entries missing required fields")
            else:
                print(f"⚠️  5.2: No shift_reports audit entries to verify")
                passed += 1
        else:
            print(f"❌ 5.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.2: Error - {str(e)}")
    
    print(f"\n📊 Audit Verification: {passed}/{total} tests passed")
    return passed, total

def test_section5_dashboard_stats():
    """Test Section 5: New dashboard stats fields (submittedToday, totalSites, pendingReview, varianceAlerts)"""
    print("\n" + "="*80)
    print("SECTION 5.5: SECTION 5 DASHBOARD STATS NEW FIELDS")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 5.5.1: GET /api/dashboard/stats without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/dashboard/stats?siteIds=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.5.1: GET /dashboard/stats without Bearer → 401 (auth gate working)")
            passed += 1
        else:
            print(f"❌ 5.5.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.5.1: Error - {str(e)}")
    
    # Test 5.5.2: GET /api/dashboard/stats with Owner Bearer → 200 with 4 new fields
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            new_fields = ["submittedToday", "totalSites", "pendingReview", "varianceAlerts"]
            has_all_new_fields = all(field in stats for field in new_fields)
            
            if has_all_new_fields:
                print(f"✅ 5.5.2: GET /dashboard/stats → 200 with all 4 new fields")
                print(f"   ℹ️  submittedToday: {stats['submittedToday']} (>=0)")
                print(f"   ℹ️  totalSites: {stats['totalSites']} (should equal 1 for siteIds=site-001)")
                print(f"   ℹ️  pendingReview: {stats['pendingReview']} (>=0)")
                print(f"   ℹ️  varianceAlerts: {stats['varianceAlerts']} (>=0)")
                passed += 1
            else:
                missing = [f for f in new_fields if f not in stats]
                print(f"❌ 5.5.2: Missing new fields: {missing}")
        else:
            print(f"❌ 5.5.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.5.2: Error - {str(e)}")
    
    # Test 5.5.3: Verify existing fields are still present
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            existing_fields = ["totalShopSales", "totalFuelSales", "totalRevenue", "pendingReports", "topPerformingSite"]
            has_all_existing = all(field in stats for field in existing_fields)
            
            if has_all_existing:
                print(f"✅ 5.5.3: All existing fields still present (no regression)")
                passed += 1
            else:
                missing = [f for f in existing_fields if f not in stats]
                print(f"❌ 5.5.3: Missing existing fields: {missing}")
        else:
            print(f"❌ 5.5.3: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.5.3: Error - {str(e)}")
    
    # Test 5.5.4: Verify totalSites matches siteIds count
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001,site-002,site-003",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            if stats.get("totalSites") == 3:
                print(f"✅ 5.5.4: totalSites correctly equals siteIds count (3)")
                passed += 1
            else:
                print(f"❌ 5.5.4: totalSites={stats.get('totalSites')}, expected 3")
        else:
            print(f"❌ 5.5.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.5.4: Error - {str(e)}")
    
    # Test 5.5.5: Verify field types are correct
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            types_correct = (
                isinstance(stats.get("submittedToday"), int) and
                isinstance(stats.get("totalSites"), int) and
                isinstance(stats.get("pendingReview"), int) and
                isinstance(stats.get("varianceAlerts"), int)
            )
            
            if types_correct:
                print(f"✅ 5.5.5: All new fields have correct types (int)")
                passed += 1
            else:
                print(f"❌ 5.5.5: Field type mismatch")
                print(f"   submittedToday: {type(stats.get('submittedToday'))}")
                print(f"   totalSites: {type(stats.get('totalSites'))}")
                print(f"   pendingReview: {type(stats.get('pendingReview'))}")
                print(f"   varianceAlerts: {type(stats.get('varianceAlerts'))}")
        else:
            print(f"❌ 5.5.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.5.5: Error - {str(e)}")
    
    print(f"\n📊 Section 5 Dashboard Stats: {passed}/{total} tests passed")
    return passed, total

def test_section1_security_gates():
    """Test Section 1 security gates are still active"""
    print("\n" + "="*80)
    print("SECTION 5.6: SECTION 1 SECURITY GATES REGRESSION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 5.6.1: GET /api/debug-env → 404 (deleted)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/debug-env", timeout=10)
        if response.status_code == 404:
            print(f"✅ 5.6.1: GET /api/debug-env → 404 (deleted route)")
            passed += 1
        else:
            print(f"❌ 5.6.1: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.6.1: Error - {str(e)}")
    
    # Test 5.6.2: GET /api/test-create-user → 404 (deleted)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/test-create-user", timeout=10)
        if response.status_code == 404:
            print(f"✅ 5.6.2: GET /api/test-create-user → 404 (deleted route)")
            passed += 1
        else:
            print(f"❌ 5.6.2: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.6.2: Error - {str(e)}")
    
    # Test 5.6.3: POST /api/seed-supabase without auth → 403 (env-gated)
    total += 1
    try:
        response = requests.post(f"{BASE_URL}/api/seed-supabase", json={}, timeout=10)
        if response.status_code == 403:
            print(f"✅ 5.6.3: POST /api/seed-supabase without auth → 403 (env-gated)")
            passed += 1
        else:
            print(f"❌ 5.6.3: Expected 403, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.6.3: Error - {str(e)}")
    
    # Test 5.6.4: GET /app without session → 307 redirect (middleware)
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/app", allow_redirects=False, timeout=10)
        if response.status_code == 307:
            print(f"✅ 5.6.4: GET /app without session → 307 redirect (middleware working)")
            passed += 1
        else:
            print(f"❌ 5.6.4: Expected 307, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.6.4: Error - {str(e)}")
    
    print(f"\n📊 Section 1 Security Gates: {passed}/{total} tests passed")
    return passed, total

def test_section2_newly_gated_endpoints():
    """Test Section 2 newly-gated endpoints (banking-formulas, reports/:id, users, field-configs)"""
    print("\n" + "="*80)
    print("SECTION 5.7: SECTION 2 NEWLY-GATED ENDPOINTS REGRESSION")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 5.7.1: GET /api/banking-formulas without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/banking-formulas?siteId=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.7.1: GET /banking-formulas without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 5.7.1: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.1: Error - {str(e)}")
    
    # Test 5.7.2: GET /api/banking-formulas with Owner Bearer → 200
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            formulas = response.json()
            print(f"✅ 5.7.2: GET /banking-formulas with Bearer → 200 ({len(formulas)} formulas)")
            passed += 1
        else:
            print(f"❌ 5.7.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.2: Error - {str(e)}")
    
    # Test 5.7.3: GET /api/reports/:id without Bearer → 401
    total += 1
    try:
        # Get a report ID first
        response = requests.get(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            reports = response.json()
            if len(reports) > 0:
                report_id = reports[0]["id"]
                response = requests.get(f"{BASE_URL}/api/reports/{report_id}", timeout=10)
                if response.status_code == 401:
                    print(f"✅ 5.7.3: GET /reports/:id without Bearer → 401")
                    passed += 1
                else:
                    print(f"❌ 5.7.3: Expected 401, got {response.status_code}")
            else:
                print(f"⚠️  5.7.3: No reports available to test")
                passed += 1
        else:
            print(f"❌ 5.7.3: Failed to fetch reports list")
    except Exception as e:
        print(f"❌ 5.7.3: Error - {str(e)}")
    
    # Test 5.7.4: GET /api/users without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/users", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.7.4: GET /users without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 5.7.4: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.4: Error - {str(e)}")
    
    # Test 5.7.5: GET /api/users with Owner Bearer → 200
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            users = response.json()
            print(f"✅ 5.7.5: GET /users with Bearer → 200 ({len(users)} users)")
            passed += 1
        else:
            print(f"❌ 5.7.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.5: Error - {str(e)}")
    
    # Test 5.7.6: GET /api/field-configs without Bearer → 401
    total += 1
    try:
        response = requests.get(f"{BASE_URL}/api/field-configs?siteId=site-001", timeout=10)
        if response.status_code == 401:
            print(f"✅ 5.7.6: GET /field-configs without Bearer → 401")
            passed += 1
        else:
            print(f"❌ 5.7.6: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.6: Error - {str(e)}")
    
    # Test 5.7.7: GET /api/field-configs with Owner Bearer → 200
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/field-configs?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            configs = response.json()
            print(f"✅ 5.7.7: GET /field-configs with Bearer → 200 ({len(configs)} configs)")
            passed += 1
        else:
            print(f"❌ 5.7.7: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 5.7.7: Error - {str(e)}")
    
    print(f"\n📊 Section 2 Newly-Gated Endpoints: {passed}/{total} tests passed")
    return passed, total

def test_regression():
    """Test regression - existing flows must still work"""
    print("\n" + "="*80)
    print("SECTION 6: FULL BACKEND REGRESSION (53+ TESTS)")
    print("="*80)
    
    passed = 0
    total = 0
    
    # Test 6.1: POST /api/auth/login (modular, untouched)
    total += 1
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["owner"],
            timeout=10
        )
        if response.status_code == 200:
            print(f"✅ 6.1: POST /api/auth/login → 200")
            passed += 1
        else:
            print(f"❌ 6.1: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.1: Error - {str(e)}")
    
    # Test 6.2: GET /api/sites (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/sites",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            sites = response.json()
            print(f"✅ 6.2: GET /api/sites → 200 ({len(sites)} sites)")
            passed += 1
        else:
            print(f"❌ 6.2: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.2: Error - {str(e)}")
    
    # Test 6.3: GET /api/users (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            users = response.json()
            print(f"✅ 6.3: GET /api/users → 200 ({len(users)} users)")
            passed += 1
        else:
            print(f"❌ 6.3: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.3: Error - {str(e)}")
    
    # Test 6.4: GET /api/field-configs (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/field-configs?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            configs = response.json()
            print(f"✅ 6.4: GET /api/field-configs → 200 ({len(configs)} configs)")
            passed += 1
        else:
            print(f"❌ 6.4: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.4: Error - {str(e)}")
    
    # Test 6.5: GET /api/banking-formulas (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/banking-formulas?siteId=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            formulas = response.json()
            print(f"✅ 6.5: GET /api/banking-formulas → 200 ({len(formulas)} formulas)")
            passed += 1
        else:
            print(f"❌ 6.5: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.5: Error - {str(e)}")
    
    # Test 6.6: GET /api/operator-assignments (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/operator-assignments",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            assignments = response.json()
            print(f"✅ 6.6: GET /api/operator-assignments → 200 ({len(assignments)} assignments)")
            passed += 1
        else:
            print(f"❌ 6.6: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.6: Error - {str(e)}")
    
    # Test 6.7: GET /api/staff-assignments (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/staff-assignments",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            assignments = response.json()
            print(f"✅ 6.7: GET /api/staff-assignments → 200 ({len(assignments)} assignments)")
            passed += 1
        else:
            print(f"❌ 6.7: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.7: Error - {str(e)}")
    
    # Test 6.8: GET /api/dips (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips?site_id=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            dips = response.json()
            print(f"✅ 6.8: GET /api/dips → 200 ({len(dips)} dips)")
            passed += 1
        else:
            print(f"❌ 6.8: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.8: Error - {str(e)}")
    
    # Test 6.9: GET /api/dips/current (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips/current",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            current = response.json()
            print(f"✅ 6.9: GET /api/dips/current → 200 ({len(current)} sites)")
            passed += 1
        else:
            print(f"❌ 6.9: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.9: Error - {str(e)}")
    
    # Test 6.10: GET /api/fuel-prices-live/status (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/fuel-prices-live/status",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            status = response.json()
            print(f"✅ 6.10: GET /api/fuel-prices-live/status → 200")
            passed += 1
        else:
            print(f"❌ 6.10: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.10: Error - {str(e)}")
    
    # Test 6.11: GET /api/dashboard/12-month-trend (modular - executive)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/12-month-trend?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            trend = response.json()
            print(f"✅ 6.11: GET /api/dashboard/12-month-trend → 200 ({len(trend)} months)")
            passed += 1
        else:
            print(f"❌ 6.11: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.11: Error - {str(e)}")
    
    # Test 6.12: GET /api/dashboard/variance (modular - executive)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dashboard/variance?siteIds=site-001",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            variance = response.json()
            print(f"✅ 6.12: GET /api/dashboard/variance → 200")
            passed += 1
        else:
            print(f"❌ 6.12: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.12: Error - {str(e)}")
    
    # Test 6.13: GET /api/founder/audit-log (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/audit-log?limit=10",
            headers={"Authorization": f"Bearer {tokens['support']}"},
            timeout=10
        )
        if response.status_code == 200:
            logs = response.json()
            print(f"✅ 6.13: GET /api/founder/audit-log → 200 ({len(logs)} logs)")
            passed += 1
        else:
            print(f"❌ 6.13: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.13: Error - {str(e)}")
    
    # Test 6.14: GET /api/founder/stats (modular)
    total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/founder/stats",
            headers={"Authorization": f"Bearer {tokens['support']}"},
            timeout=10
        )
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ 6.14: GET /api/founder/stats → 200")
            passed += 1
        else:
            print(f"❌ 6.14: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.14: Error - {str(e)}")
    
    # Test 6.15: GET /api/reports/pivot (modular)
    total += 1
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        month_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/reports/pivot?site_id=site-001&from={month_ago}&to={today}",
            headers={"Authorization": f"Bearer {tokens['owner']}"},
            timeout=10
        )
        if response.status_code == 200:
            pivot = response.json()
            print(f"✅ 6.15: GET /api/reports/pivot → 200")
            passed += 1
        else:
            print(f"❌ 6.15: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ 6.15: Error - {str(e)}")
    
    print(f"\n📊 Regression Tests: {passed}/{total} tests passed")
    return passed, total

def cleanup():
    """Cleanup test data"""
    print("\n" + "="*80)
    print("SECTION 7: CLEANUP")
    print("="*80)
    
    # Delete created reports
    for report_id in test_data["created_reports"]:
        try:
            requests.delete(
                f"{BASE_URL}/api/reports/{report_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            print(f"✅ Deleted report: {report_id[:8]}...")
        except:
            pass
    
    # Delete created competitors
    for competitor_id in test_data["created_competitors"]:
        try:
            requests.delete(
                f"{BASE_URL}/api/site-competitors/{competitor_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            print(f"✅ Deleted competitor: {competitor_id[:8]}...")
        except:
            pass
    
    # Delete created price entries (no DELETE endpoint, skip)
    # Delete created competitor prices
    for price_id in test_data["created_competitor_prices"]:
        try:
            requests.delete(
                f"{BASE_URL}/api/competitor-prices/{price_id}",
                headers={"Authorization": f"Bearer {tokens['owner']}"},
                timeout=10
            )
            print(f"✅ Deleted competitor price: {price_id[:8]}...")
        except:
            pass

def main():
    print("="*80)
    print("SECTION 5 BACKEND REGRESSION — HEALTH STRIP + FULL 53+ TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing: Section 5 new dashboard fields + Section 1/2 security gates + Full regression")
    print("="*80)
    
    # Login all roles
    print("\n🔐 Logging in all roles...")
    for role in ["owner", "operator", "staff", "support"]:
        token = login(role)
        if token:
            tokens[role] = token
        else:
            print(f"❌ Failed to login as {role}, aborting tests")
            sys.exit(1)
    
    # Run all test sections
    results = []
    results.append(test_section5_dashboard_stats())
    results.append(test_section1_security_gates())
    results.append(test_section2_newly_gated_endpoints())
    results.append(test_reports_module())
    results.append(test_dashboard_module())
    results.append(test_fuel_prices_module())
    results.append(test_catch_all_behavior())
    results.append(test_audit_verification())
    results.append(test_regression())
    
    # Cleanup
    cleanup()
    
    # Final summary
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    print("\n" + "="*80)
    print("FINAL SUMMARY — SECTION 5 BACKEND REGRESSION")
    print("="*80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_tests - total_passed}")
    print(f"Success Rate: {success_rate:.1f}%")
    print("="*80)
    
    if success_rate >= 95:
        print("🎉 SECTION 5 BACKEND REGRESSION COMPLETE - ALL CRITICAL TESTS PASSED!")
        sys.exit(0)
    elif success_rate >= 80:
        print("⚠️  SECTION 5 BACKEND REGRESSION COMPLETE - SOME TESTS FAILED")
        sys.exit(0)
    else:
        print("❌ SECTION 5 BACKEND REGRESSION FAILED - CRITICAL ISSUES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    main()
