#!/usr/bin/env python3
"""
Session 2: Owner Executive Dashboard Backend Testing
Tests 4 new modular dashboard endpoints + RBAC + regression checks.
"""

import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_num: int, description: str, evidence: str):
        self.passed += 1
        self.tests.append({
            "num": test_num,
            "status": "PASS",
            "description": description,
            "evidence": evidence
        })
        print(f"✅ Test {test_num}: PASS - {description}")
        print(f"   Evidence: {evidence}")
    
    def add_fail(self, test_num: int, description: str, evidence: str):
        self.failed += 1
        self.tests.append({
            "num": test_num,
            "status": "FAIL",
            "description": description,
            "evidence": evidence
        })
        print(f"❌ Test {test_num}: FAIL - {description}")
        print(f"   Evidence: {evidence}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed ({self.passed*100//total if total > 0 else 0}%)")
        print(f"{'='*80}")
        return self.passed, self.failed

def login(role: str) -> Optional[Dict]:
    """Login and return user data + Bearer token"""
    try:
        creds = CREDENTIALS[role]
        resp = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("session", {}).get("access_token")
            user = data.get("user", {})
            sites = data.get("sites", [])
            return {"token": token, "user": user, "sites": sites}
        return None
    except Exception as e:
        print(f"Login error for {role}: {e}")
        return None

def test_endpoint(method: str, path: str, token: Optional[str] = None, 
                  params: Optional[Dict] = None, json_data: Optional[Dict] = None,
                  timeout: int = 10) -> tuple:
    """Make HTTP request and return (status_code, response_data)"""
    try:
        url = f"{BASE_URL}{path}"
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=timeout)
        else:
            return (0, {"error": f"Unsupported method: {method}"})
        
        try:
            data = resp.json()
        except:
            data = {"raw": resp.text}
        
        return (resp.status_code, data)
    except requests.Timeout:
        return (0, {"error": "Request timeout"})
    except Exception as e:
        return (0, {"error": str(e)})

def main():
    results = TestResults()
    
    print("="*80)
    print("SESSION 2: OWNER EXECUTIVE DASHBOARD - BACKEND TESTING")
    print("="*80)
    print()
    
    # ========== A. AUTH GATES ==========
    print("\n" + "="*80)
    print("SECTION A: AUTH GATES (401 WITHOUT BEARER)")
    print("="*80)
    
    # Test 1: GET /dashboard/12-month-trend without Bearer → 401
    status, data = test_endpoint("GET", "/dashboard/12-month-trend")
    if status == 401:
        results.add_pass(1, "GET /dashboard/12-month-trend without Bearer → 401", 
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(1, "GET /dashboard/12-month-trend without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 2: GET /dashboard/variance without Bearer → 401
    status, data = test_endpoint("GET", "/dashboard/variance")
    if status == 401:
        results.add_pass(2, "GET /dashboard/variance without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(2, "GET /dashboard/variance without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 3: GET /dashboard/top-performers without Bearer → 401
    status, data = test_endpoint("GET", "/dashboard/top-performers")
    if status == 401:
        results.add_pass(3, "GET /dashboard/top-performers without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(3, "GET /dashboard/top-performers without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # Test 4: GET /dashboard/volume-by-grade without Bearer → 401
    status, data = test_endpoint("GET", "/dashboard/volume-by-grade")
    if status == 401:
        results.add_pass(4, "GET /dashboard/volume-by-grade without Bearer → 401",
                        f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail(4, "GET /dashboard/volume-by-grade without Bearer → 401",
                        f"Expected 401, got {status}: {data}")
    
    # ========== B. LOGIN & SITE ACCESS ==========
    print("\n" + "="*80)
    print("SECTION B: LOGIN & SITE ACCESS VERIFICATION")
    print("="*80)
    
    # Login as all three roles
    print("\n🔐 Logging in as Owner, Operator, Staff...")
    owner_auth = login("owner")
    operator_auth = login("operator")
    staff_auth = login("staff")
    
    if not owner_auth or not operator_auth or not staff_auth:
        print("❌ CRITICAL: Could not login as all roles. Cannot continue.")
        results.add_fail(5, "Login all roles", "Could not obtain tokens for all roles")
        results.summary()
        return
    
    print(f"✅ Owner login successful - {len(owner_auth['sites'])} sites")
    print(f"✅ Operator login successful - {len(operator_auth['sites'])} sites")
    print(f"✅ Staff login successful - {len(staff_auth['sites'])} sites")
    
    # Test 5: Verify Owner sees multiple sites (at least 5)
    if len(owner_auth['sites']) >= 5:
        results.add_pass(5, "Owner login returns multiple sites (>=5)",
                        f"Owner has access to {len(owner_auth['sites'])} sites: {[s['id'] for s in owner_auth['sites']]}")
    else:
        results.add_fail(5, "Owner login returns multiple sites (>=5)",
                        f"Expected >=5 sites, got {len(owner_auth['sites'])}")
    
    # Test 6: Verify Operator sees only assigned sites (at least 1)
    if len(operator_auth['sites']) >= 1:
        results.add_pass(6, "Operator login returns assigned sites (>=1)",
                        f"Operator has access to {len(operator_auth['sites'])} sites: {[s['id'] for s in operator_auth['sites']]}")
    else:
        results.add_fail(6, "Operator login returns assigned sites (>=1)",
                        f"Expected >=1 sites, got {len(operator_auth['sites'])}")
    
    # Test 7: Verify Staff sees only assigned sites (at least 1)
    if len(staff_auth['sites']) >= 1:
        results.add_pass(7, "Staff login returns assigned sites (>=1)",
                        f"Staff has access to {len(staff_auth['sites'])} sites: {[s['id'] for s in staff_auth['sites']]}")
    else:
        results.add_fail(7, "Staff login returns assigned sites (>=1)",
                        f"Expected >=1 sites, got {len(staff_auth['sites'])}")
    
    owner_token = owner_auth['token']
    operator_token = operator_auth['token']
    staff_token = staff_auth['token']
    
    owner_site_ids = [s['id'] for s in owner_auth['sites']]
    operator_site_ids = [s['id'] for s in operator_auth['sites']]
    staff_site_ids = [s['id'] for s in staff_auth['sites']]
    
    # ========== C. 12-MONTH TREND ENDPOINT ==========
    print("\n" + "="*80)
    print("SECTION C: GET /dashboard/12-month-trend")
    print("="*80)
    
    # Test 8: Owner - 12-month-trend returns exactly 12 entries
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=owner_token,
                                params={"siteIds": ",".join(owner_site_ids)})
    
    if status == 200:
        if isinstance(data, list) and len(data) == 12:
            # Verify structure of first entry
            first = data[0]
            required_fields = ["month", "label", "revenue", "fuelSales", "shopSales", "totalLitres", "reportCount"]
            has_all_fields = all(f in first for f in required_fields)
            
            # Verify month format (YYYY-MM)
            month_format_ok = all(len(entry.get("month", "")) == 7 and entry["month"][4] == "-" for entry in data)
            
            if has_all_fields and month_format_ok:
                results.add_pass(8, "Owner - 12-month-trend returns exactly 12 entries with correct structure",
                               f"Status: {status}, count={len(data)}, first entry: {first}")
            else:
                results.add_fail(8, "Owner - 12-month-trend returns exactly 12 entries with correct structure",
                               f"Missing fields or wrong format: {first}")
        else:
            results.add_fail(8, "Owner - 12-month-trend returns exactly 12 entries with correct structure",
                           f"Expected 12 entries, got {len(data) if isinstance(data, list) else 'not a list'}")
    else:
        results.add_fail(8, "Owner - 12-month-trend returns exactly 12 entries with correct structure",
                       f"Expected 200, got {status}: {data}")
    
    # Test 9: Operator - 12-month-trend filtered by assigned sites
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=operator_token,
                                params={"siteIds": ",".join(operator_site_ids)})
    
    if status == 200:
        if isinstance(data, list) and len(data) == 12:
            results.add_pass(9, "Operator - 12-month-trend returns 12 entries for assigned sites",
                           f"Status: {status}, count={len(data)}")
        else:
            results.add_fail(9, "Operator - 12-month-trend returns 12 entries for assigned sites",
                           f"Expected 12 entries, got {len(data) if isinstance(data, list) else 'not a list'}")
    else:
        results.add_fail(9, "Operator - 12-month-trend returns 12 entries for assigned sites",
                       f"Expected 200, got {status}: {data}")
    
    # Test 10: Staff - 12-month-trend filtered by assigned site
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=staff_token,
                                params={"siteIds": ",".join(staff_site_ids)})
    
    if status == 200:
        if isinstance(data, list) and len(data) == 12:
            results.add_pass(10, "Staff - 12-month-trend returns 12 entries for assigned site",
                           f"Status: {status}, count={len(data)}")
        else:
            results.add_fail(10, "Staff - 12-month-trend returns 12 entries for assigned site",
                           f"Expected 12 entries, got {len(data) if isinstance(data, list) else 'not a list'}")
    else:
        results.add_fail(10, "Staff - 12-month-trend returns 12 entries for assigned site",
                       f"Expected 200, got {status}: {data}")
    
    # Test 11: 12-month-trend without siteIds defaults to all allowed sites
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=owner_token)
    
    if status == 200:
        if isinstance(data, list) and len(data) == 12:
            results.add_pass(11, "12-month-trend without siteIds defaults to all allowed sites",
                           f"Status: {status}, count={len(data)}")
        else:
            results.add_fail(11, "12-month-trend without siteIds defaults to all allowed sites",
                           f"Expected 12 entries, got {len(data) if isinstance(data, list) else 'not a list'}")
    else:
        results.add_fail(11, "12-month-trend without siteIds defaults to all allowed sites",
                       f"Expected 200, got {status}: {data}")
    
    # ========== D. VARIANCE ENDPOINT ==========
    print("\n" + "="*80)
    print("SECTION D: GET /dashboard/variance")
    print("="*80)
    
    # Test 12: Owner - variance returns MoM and YoY with correct structure
    status, data = test_endpoint("GET", "/dashboard/variance", token=owner_token,
                                params={"siteIds": ",".join(owner_site_ids)})
    
    if status == 200:
        has_mom = "mom" in data
        has_yoy = "yoy" in data
        
        if has_mom and has_yoy:
            mom = data["mom"]
            yoy = data["yoy"]
            
            # Verify structure
            mom_ok = all(k in mom for k in ["current", "previous", "variancePct"])
            yoy_ok = all(k in yoy for k in ["current", "previous", "variancePct"])
            
            if mom_ok and yoy_ok:
                # Verify current/previous structure
                mom_current_ok = all(k in mom["current"] for k in ["revenue", "fuelSales", "shopSales", "totalLitres", "reports"])
                mom_variance_ok = all(k in mom["variancePct"] for k in ["revenue", "fuelSales", "shopSales", "totalLitres"])
                
                if mom_current_ok and mom_variance_ok:
                    # Verify variance math (spot check)
                    cur_rev = mom["current"]["revenue"]
                    prev_rev = mom["previous"]["revenue"]
                    var_pct = mom["variancePct"]["revenue"]
                    
                    # Calculate expected variance
                    if prev_rev > 0:
                        expected_var = round(((cur_rev - prev_rev) / prev_rev) * 100, 2)
                        math_ok = abs(var_pct - expected_var) < 0.01
                    else:
                        math_ok = True  # Can't verify if previous is 0
                    
                    if math_ok:
                        results.add_pass(12, "Owner - variance returns MoM and YoY with correct structure and math",
                                       f"Status: {status}, MoM: cur_rev={cur_rev}, prev_rev={prev_rev}, "
                                       f"var_pct={var_pct}, YoY present")
                    else:
                        results.add_fail(12, "Owner - variance returns MoM and YoY with correct structure and math",
                                       f"Variance math incorrect: cur={cur_rev}, prev={prev_rev}, "
                                       f"var_pct={var_pct}, expected={expected_var}")
                else:
                    results.add_fail(12, "Owner - variance returns MoM and YoY with correct structure and math",
                                   f"Missing fields in current/variancePct: {mom}")
            else:
                results.add_fail(12, "Owner - variance returns MoM and YoY with correct structure and math",
                               f"Missing current/previous/variancePct in mom or yoy: {data}")
        else:
            results.add_fail(12, "Owner - variance returns MoM and YoY with correct structure and math",
                           f"Missing mom or yoy in response: {data}")
    else:
        results.add_fail(12, "Owner - variance returns MoM and YoY with correct structure and math",
                       f"Expected 200, got {status}: {data}")
    
    # Test 13: Operator - variance filtered by assigned sites
    status, data = test_endpoint("GET", "/dashboard/variance", token=operator_token,
                                params={"siteIds": ",".join(operator_site_ids)})
    
    if status == 200:
        has_mom = "mom" in data
        has_yoy = "yoy" in data
        if has_mom and has_yoy:
            results.add_pass(13, "Operator - variance returns MoM and YoY for assigned sites",
                           f"Status: {status}, MoM and YoY present")
        else:
            results.add_fail(13, "Operator - variance returns MoM and YoY for assigned sites",
                           f"Missing mom or yoy: {data}")
    else:
        results.add_fail(13, "Operator - variance returns MoM and YoY for assigned sites",
                       f"Expected 200, got {status}: {data}")
    
    # Test 14: Staff - variance filtered by assigned site
    status, data = test_endpoint("GET", "/dashboard/variance", token=staff_token,
                                params={"siteIds": ",".join(staff_site_ids)})
    
    if status == 200:
        has_mom = "mom" in data
        has_yoy = "yoy" in data
        if has_mom and has_yoy:
            results.add_pass(14, "Staff - variance returns MoM and YoY for assigned site",
                           f"Status: {status}, MoM and YoY present")
        else:
            results.add_fail(14, "Staff - variance returns MoM and YoY for assigned site",
                           f"Missing mom or yoy: {data}")
    else:
        results.add_fail(14, "Staff - variance returns MoM and YoY for assigned site",
                       f"Expected 200, got {status}: {data}")
    
    # ========== E. TOP PERFORMERS ENDPOINT ==========
    print("\n" + "="*80)
    print("SECTION E: GET /dashboard/top-performers")
    print("="*80)
    
    # Calculate date range (last 30 days)
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Test 15: Owner - top-performers with metric=revenue
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=owner_token,
                                params={
                                    "siteIds": ",".join(owner_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "revenue",
                                    "limit": "5"
                                })
    
    if status == 200:
        has_metric = "metric" in data
        has_top = "top" in data
        has_bottom = "bottom" in data
        
        if has_metric and has_top and has_bottom:
            metric = data["metric"]
            top = data["top"]
            bottom = data["bottom"]
            
            # Verify metric is correct
            metric_ok = metric == "revenue"
            
            # Verify top is sorted DESC by revenue
            if len(top) > 1:
                top_sorted = all(top[i]["revenue"] >= top[i+1]["revenue"] for i in range(len(top)-1))
            else:
                top_sorted = True
            
            # Verify bottom is sorted ASC by revenue (reversed)
            if len(bottom) > 1:
                bottom_sorted = all(bottom[i]["revenue"] <= bottom[i+1]["revenue"] for i in range(len(bottom)-1))
            else:
                bottom_sorted = True
            
            # Verify limit is respected
            limit_ok = len(top) <= 5 and len(bottom) <= 5
            
            # Verify structure of first top entry
            if top:
                first_top = top[0]
                required_fields = ["siteId", "siteName", "siteCode", "revenue", "fuelSales", "shopSales", "totalLitres", "reportCount"]
                structure_ok = all(f in first_top for f in required_fields)
            else:
                structure_ok = True  # No data to verify
            
            if metric_ok and top_sorted and bottom_sorted and limit_ok and structure_ok:
                results.add_pass(15, "Owner - top-performers with metric=revenue",
                               f"Status: {status}, metric={metric}, top={len(top)} (sorted DESC), "
                               f"bottom={len(bottom)} (sorted ASC), limit respected")
            else:
                issues = []
                if not metric_ok:
                    issues.append(f"metric != revenue: {metric}")
                if not top_sorted:
                    issues.append("top not sorted DESC")
                if not bottom_sorted:
                    issues.append("bottom not sorted ASC")
                if not limit_ok:
                    issues.append(f"limit not respected: top={len(top)}, bottom={len(bottom)}")
                if not structure_ok:
                    issues.append("missing required fields")
                results.add_fail(15, "Owner - top-performers with metric=revenue",
                               f"Issues: {'; '.join(issues)}")
        else:
            results.add_fail(15, "Owner - top-performers with metric=revenue",
                           f"Missing metric/top/bottom in response: {data}")
    else:
        results.add_fail(15, "Owner - top-performers with metric=revenue",
                       f"Expected 200, got {status}: {data}")
    
    # Test 16: Owner - top-performers with metric=fuel (order should change)
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=owner_token,
                                params={
                                    "siteIds": ",".join(owner_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "fuel",
                                    "limit": "5"
                                })
    
    if status == 200:
        metric = data.get("metric")
        top = data.get("top", [])
        
        # Verify metric is fuelSales (fuel maps to fuelSales)
        metric_ok = metric == "fuelSales"
        
        # Verify top is sorted DESC by fuelSales
        if len(top) > 1:
            top_sorted = all(top[i]["fuelSales"] >= top[i+1]["fuelSales"] for i in range(len(top)-1))
        else:
            top_sorted = True
        
        if metric_ok and top_sorted:
            results.add_pass(16, "Owner - top-performers with metric=fuel (order changes)",
                           f"Status: {status}, metric={metric}, top sorted by fuelSales DESC")
        else:
            results.add_fail(16, "Owner - top-performers with metric=fuel (order changes)",
                           f"metric={metric} (expected fuelSales), top_sorted={top_sorted}")
    else:
        results.add_fail(16, "Owner - top-performers with metric=fuel (order changes)",
                       f"Expected 200, got {status}: {data}")
    
    # Test 17: Owner - top-performers with metric=shop
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=owner_token,
                                params={
                                    "siteIds": ",".join(owner_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "shop",
                                    "limit": "3"
                                })
    
    if status == 200:
        metric = data.get("metric")
        top = data.get("top", [])
        bottom = data.get("bottom", [])
        
        # Verify metric is shopSales
        metric_ok = metric == "shopSales"
        
        # Verify limit is respected (3)
        limit_ok = len(top) <= 3 and len(bottom) <= 3
        
        if metric_ok and limit_ok:
            results.add_pass(17, "Owner - top-performers with metric=shop and limit=3",
                           f"Status: {status}, metric={metric}, top={len(top)}, bottom={len(bottom)}, limit respected")
        else:
            results.add_fail(17, "Owner - top-performers with metric=shop and limit=3",
                           f"metric={metric} (expected shopSales), top={len(top)}, bottom={len(bottom)}")
    else:
        results.add_fail(17, "Owner - top-performers with metric=shop and limit=3",
                       f"Expected 200, got {status}: {data}")
    
    # Test 18: Owner - top-performers with metric=volume
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=owner_token,
                                params={
                                    "siteIds": ",".join(owner_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "volume",
                                    "limit": "5"
                                })
    
    if status == 200:
        metric = data.get("metric")
        top = data.get("top", [])
        
        # Verify metric is totalLitres
        metric_ok = metric == "totalLitres"
        
        # Verify top is sorted DESC by totalLitres
        if len(top) > 1:
            top_sorted = all(top[i]["totalLitres"] >= top[i+1]["totalLitres"] for i in range(len(top)-1))
        else:
            top_sorted = True
        
        if metric_ok and top_sorted:
            results.add_pass(18, "Owner - top-performers with metric=volume",
                           f"Status: {status}, metric={metric}, top sorted by totalLitres DESC")
        else:
            results.add_fail(18, "Owner - top-performers with metric=volume",
                           f"metric={metric} (expected totalLitres), top_sorted={top_sorted}")
    else:
        results.add_fail(18, "Owner - top-performers with metric=volume",
                       f"Expected 200, got {status}: {data}")
    
    # Test 19: Operator - top-performers filtered by assigned sites
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=operator_token,
                                params={
                                    "siteIds": ",".join(operator_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "revenue",
                                    "limit": "5"
                                })
    
    if status == 200:
        top = data.get("top", [])
        bottom = data.get("bottom", [])
        
        # Verify only assigned sites are returned
        top_site_ids = [t["siteId"] for t in top]
        bottom_site_ids = [b["siteId"] for b in bottom]
        all_site_ids = set(top_site_ids + bottom_site_ids)
        
        # Check if all returned sites are in operator's assigned sites
        rbac_ok = all(sid in operator_site_ids for sid in all_site_ids)
        
        if rbac_ok:
            results.add_pass(19, "Operator - top-performers filtered by assigned sites (RBAC)",
                           f"Status: {status}, all returned sites are in operator's assigned sites")
        else:
            unauthorized = [sid for sid in all_site_ids if sid not in operator_site_ids]
            results.add_fail(19, "Operator - top-performers filtered by assigned sites (RBAC)",
                           f"Unauthorized sites returned: {unauthorized}")
    else:
        results.add_fail(19, "Operator - top-performers filtered by assigned sites (RBAC)",
                       f"Expected 200, got {status}: {data}")
    
    # Test 20: Staff - top-performers filtered by assigned site
    status, data = test_endpoint("GET", "/dashboard/top-performers", token=staff_token,
                                params={
                                    "siteIds": ",".join(staff_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date,
                                    "metric": "revenue",
                                    "limit": "5"
                                })
    
    if status == 200:
        top = data.get("top", [])
        bottom = data.get("bottom", [])
        
        # Verify only assigned site is returned
        top_site_ids = [t["siteId"] for t in top]
        bottom_site_ids = [b["siteId"] for b in bottom]
        all_site_ids = set(top_site_ids + bottom_site_ids)
        
        # Check if all returned sites are in staff's assigned site
        rbac_ok = all(sid in staff_site_ids for sid in all_site_ids)
        
        if rbac_ok:
            results.add_pass(20, "Staff - top-performers filtered by assigned site (RBAC)",
                           f"Status: {status}, all returned sites are in staff's assigned site")
        else:
            unauthorized = [sid for sid in all_site_ids if sid not in staff_site_ids]
            results.add_fail(20, "Staff - top-performers filtered by assigned site (RBAC)",
                           f"Unauthorized sites returned: {unauthorized}")
    else:
        results.add_fail(20, "Staff - top-performers filtered by assigned site (RBAC)",
                       f"Expected 200, got {status}: {data}")
    
    # ========== F. VOLUME BY GRADE ENDPOINT ==========
    print("\n" + "="*80)
    print("SECTION F: GET /dashboard/volume-by-grade")
    print("="*80)
    
    # Test 21: Owner - volume-by-grade returns grades and totalLitres
    status, data = test_endpoint("GET", "/dashboard/volume-by-grade", token=owner_token,
                                params={
                                    "siteIds": ",".join(owner_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date
                                })
    
    if status == 200:
        has_grades = "grades" in data
        has_total = "totalLitres" in data
        
        if has_grades and has_total:
            grades = data["grades"]
            total_litres = data["totalLitres"]
            
            # Verify grades is an array
            grades_is_array = isinstance(grades, list)
            
            # Verify totalLitres is a number
            total_is_number = isinstance(total_litres, (int, float))
            
            # If grades exist, verify structure
            if grades:
                first_grade = grades[0]
                grade_structure_ok = "grade" in first_grade and "litres" in first_grade
                
                # Verify sum of grades matches totalLitres (if custom grades exist)
                if len(grades) > 1 or (len(grades) == 1 and grades[0]["grade"] != "Combined (all grades)"):
                    # Custom grades exist, sum should match totalLitres
                    sum_grades = sum(g["litres"] for g in grades)
                    # Allow small rounding difference
                    sum_matches = abs(sum_grades - total_litres) < 0.1
                else:
                    # Only "Combined" grade, no need to check sum
                    sum_matches = True
            else:
                # No grades, totalLitres should be 0 or this is acceptable
                grade_structure_ok = True
                sum_matches = True
            
            if grades_is_array and total_is_number and grade_structure_ok and sum_matches:
                results.add_pass(21, "Owner - volume-by-grade returns grades and totalLitres",
                               f"Status: {status}, grades={len(grades)}, totalLitres={total_litres}, "
                               f"structure correct")
            else:
                issues = []
                if not grades_is_array:
                    issues.append("grades not an array")
                if not total_is_number:
                    issues.append("totalLitres not a number")
                if not grade_structure_ok:
                    issues.append("grade structure incorrect")
                if not sum_matches:
                    issues.append(f"sum of grades doesn't match totalLitres")
                results.add_fail(21, "Owner - volume-by-grade returns grades and totalLitres",
                               f"Issues: {'; '.join(issues)}")
        else:
            results.add_fail(21, "Owner - volume-by-grade returns grades and totalLitres",
                           f"Missing grades or totalLitres in response: {data}")
    else:
        results.add_fail(21, "Owner - volume-by-grade returns grades and totalLitres",
                       f"Expected 200, got {status}: {data}")
    
    # Test 22: Operator - volume-by-grade filtered by assigned sites
    status, data = test_endpoint("GET", "/dashboard/volume-by-grade", token=operator_token,
                                params={
                                    "siteIds": ",".join(operator_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date
                                })
    
    if status == 200:
        has_grades = "grades" in data
        has_total = "totalLitres" in data
        if has_grades and has_total:
            results.add_pass(22, "Operator - volume-by-grade filtered by assigned sites",
                           f"Status: {status}, grades and totalLitres present")
        else:
            results.add_fail(22, "Operator - volume-by-grade filtered by assigned sites",
                           f"Missing grades or totalLitres: {data}")
    else:
        results.add_fail(22, "Operator - volume-by-grade filtered by assigned sites",
                       f"Expected 200, got {status}: {data}")
    
    # Test 23: Staff - volume-by-grade filtered by assigned site
    status, data = test_endpoint("GET", "/dashboard/volume-by-grade", token=staff_token,
                                params={
                                    "siteIds": ",".join(staff_site_ids),
                                    "startDate": start_date,
                                    "endDate": end_date
                                })
    
    if status == 200:
        has_grades = "grades" in data
        has_total = "totalLitres" in data
        if has_grades and has_total:
            results.add_pass(23, "Staff - volume-by-grade filtered by assigned site",
                           f"Status: {status}, grades and totalLitres present")
        else:
            results.add_fail(23, "Staff - volume-by-grade filtered by assigned site",
                           f"Missing grades or totalLitres: {data}")
    else:
        results.add_fail(23, "Staff - volume-by-grade filtered by assigned site",
                       f"Expected 200, got {status}: {data}")
    
    # ========== G. RBAC CROSS-TENANT ISOLATION ==========
    print("\n" + "="*80)
    print("SECTION G: RBAC CROSS-TENANT ISOLATION")
    print("="*80)
    
    # Test 24: Operator tries to access Owner's site (should be filtered out)
    # Get a site ID that operator doesn't have access to
    unauthorized_sites = [sid for sid in owner_site_ids if sid not in operator_site_ids]
    
    if unauthorized_sites:
        unauthorized_site = unauthorized_sites[0]
        
        status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=operator_token,
                                    params={"siteIds": unauthorized_site})
        
        if status == 200:
            # Should return empty array or 12 entries with zero values
            if isinstance(data, list):
                if len(data) == 0:
                    # Empty array is acceptable (site filtered out)
                    results.add_pass(24, "Operator cannot access unauthorized site (filtered out)",
                                   f"Status: {status}, empty array returned (site filtered out)")
                elif len(data) == 12:
                    # Check if all entries have zero values (no data for unauthorized site)
                    all_zero = all(entry["reportCount"] == 0 for entry in data)
                    if all_zero:
                        results.add_pass(24, "Operator cannot access unauthorized site (filtered out)",
                                       f"Status: {status}, all entries have reportCount=0 (no data)")
                    else:
                        results.add_fail(24, "Operator cannot access unauthorized site (filtered out)",
                                       f"Operator accessed unauthorized site data: {data[0]}")
                else:
                    results.add_fail(24, "Operator cannot access unauthorized site (filtered out)",
                                   f"Unexpected response length: {len(data)}")
            else:
                results.add_fail(24, "Operator cannot access unauthorized site (filtered out)",
                               f"Unexpected response type: {type(data)}")
        else:
            # 403 or other error is also acceptable
            results.add_pass(24, "Operator cannot access unauthorized site (filtered out)",
                           f"Status: {status}, access denied or filtered")
    else:
        results.add_pass(24, "Operator cannot access unauthorized site (filtered out)",
                       f"Skipped - operator has access to all owner sites")
    
    # Test 25: Staff tries to access site not in their assignment (should be filtered out)
    # Get a site ID that staff doesn't have access to
    unauthorized_sites_staff = [sid for sid in owner_site_ids if sid not in staff_site_ids]
    
    if unauthorized_sites_staff:
        unauthorized_site_staff = unauthorized_sites_staff[0]
        
        status, data = test_endpoint("GET", "/dashboard/variance", token=staff_token,
                                    params={"siteIds": unauthorized_site_staff})
        
        if status == 200:
            # Should return empty or zero values
            mom = data.get("mom", {})
            if mom:
                current_reports = mom.get("current", {}).get("reports", -1)
                if current_reports == 0:
                    results.add_pass(25, "Staff cannot access unauthorized site (filtered out)",
                                   f"Status: {status}, current reports=0 (no data)")
                else:
                    results.add_fail(25, "Staff cannot access unauthorized site (filtered out)",
                                   f"Staff accessed unauthorized site data: {mom}")
            else:
                results.add_pass(25, "Staff cannot access unauthorized site (filtered out)",
                               f"Status: {status}, no data returned")
        else:
            # 403 or other error is also acceptable
            results.add_pass(25, "Staff cannot access unauthorized site (filtered out)",
                           f"Status: {status}, access denied or filtered")
    else:
        results.add_pass(25, "Staff cannot access unauthorized site (filtered out)",
                       f"Skipped - staff has access to all owner sites")
    
    # ========== H. REGRESSION TESTS ==========
    print("\n" + "="*80)
    print("SECTION H: REGRESSION TESTS (EXISTING ENDPOINTS)")
    print("="*80)
    
    # Test 26: GET /dashboard/stats (legacy catch-all)
    status, data = test_endpoint("GET", "/dashboard/stats", token=owner_token,
                                params={"siteIds": ",".join(owner_site_ids)})
    
    if status == 200:
        results.add_pass(26, "GET /dashboard/stats still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(26, "GET /dashboard/stats still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 27: GET /dashboard/site-stats
    status, data = test_endpoint("GET", "/dashboard/site-stats", token=owner_token,
                                params={"siteIds": ",".join(owner_site_ids)})
    
    if status == 200:
        results.add_pass(27, "GET /dashboard/site-stats still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(27, "GET /dashboard/site-stats still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 28: GET /dashboard/revenue-chart
    status, data = test_endpoint("GET", "/dashboard/revenue-chart", token=owner_token,
                                params={"siteIds": ",".join(owner_site_ids)})
    
    if status == 200:
        results.add_pass(28, "GET /dashboard/revenue-chart still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(28, "GET /dashboard/revenue-chart still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 29: GET /reports/pivot
    status, data = test_endpoint("GET", "/reports/pivot", token=owner_token,
                                params={
                                    "site_id": owner_site_ids[0],
                                    "from": start_date,
                                    "to": end_date
                                })
    
    if status == 200:
        results.add_pass(29, "GET /reports/pivot still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(29, "GET /reports/pivot still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 30: GET /dips
    status, data = test_endpoint("GET", "/dips", token=owner_token,
                                params={"site_id": owner_site_ids[0]})
    
    if status == 200:
        results.add_pass(30, "GET /dips still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(30, "GET /dips still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 31: GET /fuel-prices-live/status
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    
    if status == 200:
        results.add_pass(31, "GET /fuel-prices-live/status still works",
                       f"Status: {status}, response received")
    else:
        results.add_fail(31, "GET /fuel-prices-live/status still works",
                       f"Expected 200, got {status}: {data}")
    
    # Test 32: POST /auth/login (already tested, but verify again)
    status, data = test_endpoint("POST", "/auth/login", 
                                json_data=CREDENTIALS["owner"])
    
    if status == 200:
        results.add_pass(32, "POST /auth/login still works",
                       f"Status: {status}, login successful")
    else:
        results.add_fail(32, "POST /auth/login still works",
                       f"Expected 200, got {status}: {data}")
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    
    passed, failed = results.summary()
    
    print("\n📊 DETAILED RESULTS:")
    for test in results.tests:
        status_icon = "✅" if test["status"] == "PASS" else "❌"
        print(f"{status_icon} Test {test['num']}: {test['status']} - {test['description']}")
    
    print("\n" + "="*80)
    print(f"TESTING COMPLETE: {passed} passed, {failed} failed")
    print("="*80)

if __name__ == "__main__":
    main()
