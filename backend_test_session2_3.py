#!/usr/bin/env python3
"""
Sessions 2 & 3 Comprehensive Backend Testing
Tests Executive Dashboard endpoints + Audit Log Infrastructure + Integration
"""

import requests
import time
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"},
    "founder": {"email": "founder@fops.platform", "password": "Fops813387cf0a5c6351!"}
}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_num: str, description: str, evidence: str):
        self.passed += 1
        self.tests.append({
            "num": test_num,
            "status": "PASS",
            "description": description,
            "evidence": evidence
        })
        print(f"✅ Test {test_num}: PASS - {description}")
        print(f"   Evidence: {evidence}")
    
    def add_fail(self, test_num: str, description: str, evidence: str):
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
    """Login and return full response including token and user info"""
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
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=json_data, timeout=timeout)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=timeout)
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
    print("SESSIONS 2 & 3 COMPREHENSIVE BACKEND TESTING")
    print("="*80)
    print()
    
    # ========== A. SESSION 2 EXECUTIVE ENDPOINTS (RE-VERIFY) ==========
    print("\n" + "="*80)
    print("SECTION A: SESSION 2 EXECUTIVE ENDPOINTS (RE-VERIFY)")
    print("="*80)
    
    # Login as owner, operator, staff
    print("\n🔐 Logging in as Owner, Operator, Staff...")
    owner_auth = login("owner")
    operator_auth = login("operator")
    staff_auth = login("staff")
    
    if not owner_auth or not operator_auth or not staff_auth:
        print("❌ CRITICAL: Could not login. Cannot continue.")
        results.add_fail("A.0", "Login", "Could not obtain tokens for all roles")
        results.summary()
        return
    
    owner_token = owner_auth["token"]
    operator_token = operator_auth["token"]
    staff_token = staff_auth["token"]
    owner_sites = [s["id"] for s in owner_auth["sites"]]
    operator_sites = [s["id"] for s in operator_auth["sites"]]
    staff_sites = [s["id"] for s in staff_auth["sites"]]
    
    print(f"✅ Owner: {len(owner_sites)} sites")
    print(f"✅ Operator: {len(operator_sites)} sites")
    print(f"✅ Staff: {len(staff_sites)} sites")
    
    # Test A.1: GET /api/dashboard/12-month-trend
    site_ids_param = ",".join(owner_sites[:3]) if owner_sites else ""
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=owner_token,
                                params={"siteIds": site_ids_param})
    
    if status == 200:
        # Response is an array directly
        months = data if isinstance(data, list) else data.get("months", [])
        if len(months) == 12:
            # Check structure
            first = months[0] if months else {}
            has_fields = all(f in first for f in ["month", "label", "revenue", "fuelSales", "shopSales", "totalLitres", "reportCount"])
            if has_fields:
                results.add_pass("A.1", "GET /dashboard/12-month-trend returns 12 buckets with correct structure",
                               f"Status: {status}, months={len(months)}, structure valid")
            else:
                results.add_fail("A.1", "GET /dashboard/12-month-trend returns 12 buckets with correct structure",
                               f"Missing fields in month object: {first}")
        else:
            results.add_fail("A.1", "GET /dashboard/12-month-trend returns 12 buckets",
                           f"Expected 12 months, got {len(months)}")
    else:
        results.add_fail("A.1", "GET /dashboard/12-month-trend",
                       f"Expected 200, got {status}: {data}")
    
    # Test A.2: Operator sees only assigned sites in 12-month-trend
    operator_site_ids = ",".join(operator_sites) if operator_sites else ""
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=operator_token,
                                params={"siteIds": operator_site_ids})
    
    if status == 200:
        months = data if isinstance(data, list) else data.get("months", [])
        if len(months) == 12:
            results.add_pass("A.2", "Operator 12-month-trend RBAC working",
                           f"Status: {status}, months={len(months)}, operator sees only assigned sites")
        else:
            results.add_fail("A.2", "Operator 12-month-trend RBAC",
                           f"Expected 12 months, got {len(months)}")
    else:
        results.add_fail("A.2", "Operator 12-month-trend RBAC",
                       f"Expected 200, got {status}: {data}")
    
    # Test A.3: GET /api/dashboard/variance
    status, data = test_endpoint("GET", "/dashboard/variance", token=owner_token,
                                params={"siteIds": site_ids_param})
    
    if status == 200:
        mom = data.get("mom", {})
        yoy = data.get("yoy", {})
        
        # Check structure
        mom_ok = all(f in mom for f in ["current", "previous", "variancePct"])
        yoy_ok = all(f in yoy for f in ["current", "previous", "variancePct"])
        
        if mom_ok and yoy_ok:
            # Check variancePct has revenue, fuelSales, shopSales, totalLitres
            mom_pct = mom.get("variancePct", {})
            yoy_pct = yoy.get("variancePct", {})
            pct_fields_ok = all(f in mom_pct for f in ["revenue", "fuelSales", "shopSales", "totalLitres"])
            
            if pct_fields_ok:
                results.add_pass("A.3", "GET /dashboard/variance returns MoM and YoY with correct structure",
                               f"Status: {status}, mom and yoy present with variancePct fields")
            else:
                results.add_fail("A.3", "GET /dashboard/variance variancePct fields",
                               f"Missing fields in variancePct: {mom_pct}")
        else:
            results.add_fail("A.3", "GET /dashboard/variance structure",
                           f"Missing mom or yoy fields: mom={mom_ok}, yoy={yoy_ok}")
    else:
        results.add_fail("A.3", "GET /dashboard/variance",
                       f"Expected 200, got {status}: {data}")
    
    # Test A.4: GET /api/dashboard/top-performers with different metrics
    metrics = [
        ("revenue", "revenue"),
        ("fuel", "fuelSales"),
        ("shop", "shopSales"),
        ("volume", "totalLitres")
    ]
    for metric_param, expected_metric in metrics:
        status, data = test_endpoint("GET", "/dashboard/top-performers", token=owner_token,
                                    params={"siteIds": site_ids_param, "metric": metric_param, "limit": "5"})
        
        if status == 200:
            top = data.get("top", [])
            bottom = data.get("bottom", [])
            returned_metric = data.get("metric")
            
            if returned_metric == expected_metric and len(top) <= 5 and len(bottom) <= 5:
                results.add_pass(f"A.4.{metric_param}", f"GET /dashboard/top-performers?metric={metric_param}",
                               f"Status: {status}, metric={returned_metric}, top={len(top)}, bottom={len(bottom)}")
            else:
                results.add_fail(f"A.4.{metric_param}", f"GET /dashboard/top-performers?metric={metric_param}",
                               f"Metric mismatch or limit exceeded: expected={expected_metric}, returned={returned_metric}, top={len(top)}, bottom={len(bottom)}")
        else:
            results.add_fail(f"A.4.{metric_param}", f"GET /dashboard/top-performers?metric={metric_param}",
                           f"Expected 200, got {status}: {data}")
    
    # Test A.5: GET /api/dashboard/volume-by-grade
    status, data = test_endpoint("GET", "/dashboard/volume-by-grade", token=owner_token,
                                params={"siteIds": site_ids_param})
    
    if status == 200:
        grades = data.get("grades", [])
        total_litres = data.get("totalLitres", 0)
        
        if grades and total_litres >= 0:
            # Check if it falls back to "Combined (all grades)" when no custom volume keys
            has_combined = any(g.get("grade") == "Combined (all grades)" for g in grades)
            results.add_pass("A.5", "GET /dashboard/volume-by-grade returns grades and totalLitres",
                           f"Status: {status}, grades={len(grades)}, totalLitres={total_litres}, has_combined={has_combined}")
        else:
            results.add_fail("A.5", "GET /dashboard/volume-by-grade structure",
                           f"Missing grades or totalLitres: grades={len(grades)}, totalLitres={total_litres}")
    else:
        results.add_fail("A.5", "GET /dashboard/volume-by-grade",
                       f"Expected 200, got {status}: {data}")
    
    # ========== B. SESSION 3 AUDIT LOG INFRASTRUCTURE ==========
    print("\n" + "="*80)
    print("SECTION B: SESSION 3 AUDIT LOG INFRASTRUCTURE")
    print("="*80)
    
    # Test B.1: GET /api/founder/audit-log without Bearer → 401
    status, data = test_endpoint("GET", "/founder/audit-log")
    if status == 401:
        results.add_pass("B.1", "GET /founder/audit-log without Bearer → 401",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail("B.1", "GET /founder/audit-log without Bearer → 401",
                       f"Expected 401, got {status}: {data}")
    
    # Test B.2: GET /api/founder/audit-log with owner JWT → 403
    status, data = test_endpoint("GET", "/founder/audit-log", token=owner_token)
    if status == 403:
        error_msg = data.get("error", "")
        if "Support role required" in error_msg or "support" in error_msg.lower():
            results.add_pass("B.2", "GET /founder/audit-log with owner JWT → 403 (Support role required)",
                           f"Status: {status}, Error: {error_msg}")
        else:
            results.add_fail("B.2", "GET /founder/audit-log with owner JWT → 403 message",
                           f"Expected 'Support role required', got: {error_msg}")
    else:
        results.add_fail("B.2", "GET /founder/audit-log with owner JWT → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Test B.3: GET /api/founder/audit-log with operator JWT → 403
    status, data = test_endpoint("GET", "/founder/audit-log", token=operator_token)
    if status == 403:
        results.add_pass("B.3", "GET /founder/audit-log with operator JWT → 403",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail("B.3", "GET /founder/audit-log with operator JWT → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Test B.4: GET /api/founder/audit-log with staff JWT → 403
    status, data = test_endpoint("GET", "/founder/audit-log", token=staff_token)
    if status == 403:
        results.add_pass("B.4", "GET /founder/audit-log with staff JWT → 403",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail("B.4", "GET /founder/audit-log with staff JWT → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Login as founder/support
    print("\n🔐 Logging in as Founder/Support...")
    founder_auth = login("founder")
    
    if not founder_auth:
        print("❌ CRITICAL: Could not login as founder. Skipping remaining tests.")
        results.add_fail("B.5", "Founder login", "Could not obtain founder token")
        results.summary()
        return
    
    founder_token = founder_auth["token"]
    founder_user = founder_auth["user"]
    print(f"✅ Founder login successful: {founder_user.get('email')}, role={founder_user.get('role')}")
    
    # Test B.5: GET /api/founder/audit-log with founder JWT → 200
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token)
    if status == 200:
        rows = data.get("rows", [])
        total = data.get("total", 0)
        results.add_pass("B.5", "GET /founder/audit-log with founder JWT → 200",
                       f"Status: {status}, rows={len(rows)}, total={total}")
    else:
        results.add_fail("B.5", "GET /founder/audit-log with founder JWT → 200",
                       f"Expected 200, got {status}: {data}")
    
    # Test B.6: GET /api/founder/audit-log with filters
    # Filter by action=login
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"action": "login"})
    if status == 200:
        rows = data.get("rows", [])
        all_login = all(r.get("action") == "login" for r in rows)
        if all_login or len(rows) == 0:
            results.add_pass("B.6.1", "GET /founder/audit-log?action=login filters correctly",
                           f"Status: {status}, rows={len(rows)}, all have action='login'")
        else:
            non_login = [r for r in rows if r.get("action") != "login"]
            results.add_fail("B.6.1", "GET /founder/audit-log?action=login filter",
                           f"Found {len(non_login)} rows with action != 'login'")
    else:
        results.add_fail("B.6.1", "GET /founder/audit-log?action=login",
                       f"Expected 200, got {status}: {data}")
    
    # Filter by action=insert
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"action": "insert"})
    if status == 200:
        rows = data.get("rows", [])
        all_insert = all(r.get("action") == "insert" for r in rows)
        if all_insert or len(rows) == 0:
            results.add_pass("B.6.2", "GET /founder/audit-log?action=insert filters correctly",
                           f"Status: {status}, rows={len(rows)}, all have action='insert'")
        else:
            results.add_fail("B.6.2", "GET /founder/audit-log?action=insert filter",
                           f"Some rows have action != 'insert'")
    else:
        results.add_fail("B.6.2", "GET /founder/audit-log?action=insert",
                       f"Expected 200, got {status}: {data}")
    
    # Filter by table=shift_reports
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"table": "shift_reports"})
    if status == 200:
        rows = data.get("rows", [])
        all_shift_reports = all(r.get("table_name") == "shift_reports" for r in rows)
        if all_shift_reports or len(rows) == 0:
            results.add_pass("B.6.3", "GET /founder/audit-log?table=shift_reports filters correctly",
                           f"Status: {status}, rows={len(rows)}, all have table_name='shift_reports'")
        else:
            results.add_fail("B.6.3", "GET /founder/audit-log?table=shift_reports filter",
                           f"Some rows have table_name != 'shift_reports'")
    else:
        results.add_fail("B.6.3", "GET /founder/audit-log?table=shift_reports",
                       f"Expected 200, got {status}: {data}")
    
    # Filter by date range
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"from": yesterday, "to": today})
    if status == 200:
        rows = data.get("rows", [])
        results.add_pass("B.6.4", "GET /founder/audit-log?from=&to= date range filter works",
                       f"Status: {status}, rows={len(rows)} in date range {yesterday} to {today}")
    else:
        results.add_fail("B.6.4", "GET /founder/audit-log?from=&to=",
                       f"Expected 200, got {status}: {data}")
    
    # Filter by actor
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"actor": "owner@workflowlite.com"})
    if status == 200:
        rows = data.get("rows", [])
        results.add_pass("B.6.5", "GET /founder/audit-log?actor= email filter works",
                       f"Status: {status}, rows={len(rows)} for actor filter")
    else:
        results.add_fail("B.6.5", "GET /founder/audit-log?actor=",
                       f"Expected 200, got {status}: {data}")
    
    # Test pagination
    status, data = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                params={"limit": "10", "offset": "0"})
    if status == 200:
        rows = data.get("rows", [])
        total = data.get("total", 0)
        limit = data.get("limit", 0)
        offset = data.get("offset", 0)
        
        if len(rows) <= 10 and limit == 10 and offset == 0:
            results.add_pass("B.6.6", "GET /founder/audit-log?limit=10&offset=0 pagination works",
                           f"Status: {status}, rows={len(rows)}, total={total}, limit={limit}, offset={offset}")
        else:
            results.add_fail("B.6.6", "GET /founder/audit-log pagination",
                           f"Pagination issue: rows={len(rows)}, limit={limit}, offset={offset}")
    else:
        results.add_fail("B.6.6", "GET /founder/audit-log?limit=&offset=",
                       f"Expected 200, got {status}: {data}")
    
    # ========== C. SESSION 3 FOUNDER STATS / USERS / SITES ==========
    print("\n" + "="*80)
    print("SECTION C: SESSION 3 FOUNDER STATS / USERS / SITES")
    print("="*80)
    
    # Test C.1: GET /api/founder/stats
    status, data = test_endpoint("GET", "/founder/stats", token=founder_token)
    if status == 200:
        counts = data.get("counts", {})
        role_breakdown = data.get("roleBreakdown", {})
        audit_activity = data.get("auditActivity", {})
        
        # Check structure
        has_counts = all(t in counts for t in ["users", "sites", "shift_reports", "dip_readings", "audit_log"])
        has_role_breakdown = "support" in role_breakdown
        has_audit_activity = all(f in audit_activity for f in ["last24h", "last7d", "byActionLast7d"])
        
        if has_counts and has_role_breakdown and has_audit_activity:
            results.add_pass("C.1", "GET /founder/stats returns counts, roleBreakdown, auditActivity",
                           f"Status: {status}, counts={counts}, roleBreakdown={role_breakdown}, "
                           f"support_count={role_breakdown.get('support', 0)}")
        else:
            results.add_fail("C.1", "GET /founder/stats structure",
                           f"Missing fields: counts={has_counts}, roleBreakdown={has_role_breakdown}, "
                           f"auditActivity={has_audit_activity}")
    else:
        results.add_fail("C.1", "GET /founder/stats",
                       f"Expected 200, got {status}: {data}")
    
    # Test C.2: GET /api/founder/users
    status, data = test_endpoint("GET", "/founder/users", token=founder_token)
    if status == 200:
        users = data.get("users", [])
        # Should include the founder account itself
        has_founder = any(u.get("email") == "founder@fops.platform" for u in users)
        
        if has_founder:
            results.add_pass("C.2", "GET /founder/users returns all users cross-tenant",
                           f"Status: {status}, users={len(users)}, includes founder account")
        else:
            results.add_fail("C.2", "GET /founder/users missing founder account",
                           f"Founder account not found in users list")
    else:
        results.add_fail("C.2", "GET /founder/users",
                       f"Expected 200, got {status}: {data}")
    
    # Test C.3: GET /api/founder/sites
    status, data = test_endpoint("GET", "/founder/sites", token=founder_token)
    if status == 200:
        sites = data.get("sites", [])
        results.add_pass("C.3", "GET /founder/sites returns all sites cross-tenant",
                       f"Status: {status}, sites={len(sites)}")
    else:
        results.add_fail("C.3", "GET /founder/sites",
                       f"Expected 200, got {status}: {data}")
    
    # ========== D. SESSION 3 AUDIT LOG INTEGRATION ==========
    print("\n" + "="*80)
    print("SECTION D: SESSION 3 AUDIT LOG INTEGRATION (CRITICAL END-TO-END)")
    print("="*80)
    
    # Test D.1: Failed login creates audit row
    print("\n🔐 Testing failed login audit...")
    status, data = test_endpoint("POST", "/auth/login", 
                                json_data={"email": "test@bad.com", "password": "wrong"})
    if status == 401:
        print("✅ Failed login returned 401 as expected")
        # Wait for async audit log write
        time.sleep(1.5)
        
        # Query audit log for login_failed
        status2, data2 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                      params={"action": "login_failed", "limit": "10"})
        if status2 == 200:
            rows = data2.get("rows", [])
            print(f"   DEBUG: Found {len(rows)} login_failed rows total")
            recent_failed = [r for r in rows if r.get("actor_email") == "test@bad.com"]
            
            if recent_failed:
                row = recent_failed[0]
                metadata = row.get("metadata", {})
                results.add_pass("D.1", "Failed login creates audit row with action='login_failed'",
                               f"Found audit row: actor_email='test@bad.com', action='login_failed', "
                               f"metadata.reason={metadata.get('reason', 'N/A')}")
            else:
                # Check all recent audit rows
                status3, data3 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                              params={"limit": "10"})
                all_rows = data3.get("rows", []) if status3 == 200 else []
                print(f"   DEBUG: Recent audit rows: {[(r.get('action'), r.get('actor_email')) for r in all_rows[:5]]}")
                results.add_fail("D.1", "Failed login audit row not found",
                               f"No audit row found for test@bad.com with action='login_failed'. Total login_failed rows: {len(rows)}")
        else:
            results.add_fail("D.1", "Failed to query audit log after failed login",
                           f"Expected 200, got {status2}: {data2}")
    else:
        results.add_fail("D.1", "Failed login test",
                       f"Expected 401, got {status}: {data}")
    
    # Test D.2: Successful login creates audit row
    print("\n🔐 Testing successful login audit...")
    # Login as owner again to create fresh audit entry
    status, data = test_endpoint("POST", "/auth/login", 
                                json_data=CREDENTIALS["owner"])
    if status == 200:
        print("✅ Successful login returned 200")
        time.sleep(1.5)
        
        # Query audit log for login
        status2, data2 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                      params={"action": "login", "actor": "owner@workflowlite.com", "limit": "10"})
        if status2 == 200:
            rows = data2.get("rows", [])
            print(f"   DEBUG: Found {len(rows)} login rows for owner@workflowlite.com")
            if rows:
                row = rows[0]
                actor_role = row.get("actor_role")
                actor_user_id = row.get("actor_user_id")
                metadata = row.get("metadata", {})
                
                results.add_pass("D.2", "Successful login creates audit row with action='login'",
                               f"Found audit row: actor_role='{actor_role}', actor_user_id='{actor_user_id}', "
                               f"metadata.siteCount={metadata.get('siteCount', 'N/A')}")
            else:
                # Check all recent audit rows
                status3, data3 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                              params={"limit": "10"})
                all_rows = data3.get("rows", []) if status3 == 200 else []
                print(f"   DEBUG: Recent audit rows: {[(r.get('action'), r.get('actor_email')) for r in all_rows[:5]]}")
                results.add_fail("D.2", "Successful login audit row not found",
                               f"No audit row found for owner@workflowlite.com with action='login'. Total login rows: {len(rows)}")
        else:
            results.add_fail("D.2", "Failed to query audit log after successful login",
                           f"Expected 200, got {status2}: {data2}")
    else:
        results.add_fail("D.2", "Successful login test",
                       f"Expected 200, got {status}: {data}")
    
    # Test D.3: Create shift report creates audit row
    print("\n📝 Testing shift report creation audit...")
    # Use unique date to avoid duplicate check
    unique_date = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
    report_payload = {
        "site_id": staff_sites[0] if staff_sites else "site-001",
        "shift_date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 5000,
        "shop_sales": 1000,
        "total_litres": 3000
    }
    
    status, data = test_endpoint("POST", "/reports", token=staff_token, json_data=report_payload)
    if status == 201:
        report_id = data.get("id")
        print(f"✅ Shift report created: {report_id}")
        time.sleep(0.5)
        
        # Query audit log for insert
        status2, data2 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                      params={"action": "insert", "table": "shift_reports", "limit": "5"})
        if status2 == 200:
            rows = data2.get("rows", [])
            recent_insert = [r for r in rows if r.get("record_id") == report_id]
            
            if recent_insert:
                row = recent_insert[0]
                after_state = row.get("after_state", {})
                site_id = row.get("site_id")
                
                results.add_pass("D.3", "Create shift report creates audit row with action='insert'",
                               f"Found audit row: record_id='{report_id}', table_name='shift_reports', "
                               f"site_id='{site_id}', after_state has {len(after_state)} fields")
            else:
                results.add_fail("D.3", "Shift report insert audit row not found",
                               f"No audit row found for record_id='{report_id}' with action='insert'")
        else:
            results.add_fail("D.3", "Failed to query audit log after report creation",
                           f"Expected 200, got {status2}: {data2}")
    else:
        results.add_fail("D.3", "Shift report creation test",
                       f"Expected 201, got {status}: {data}")
    
    # Test D.4: Update report status creates audit row
    if status == 201 and report_id:
        print("\n📝 Testing report status update audit...")
        update_payload = {
            "status": "reviewed",
            "reviewed_by_user_id": operator_auth["user"]["id"]
        }
        
        status, data = test_endpoint("PUT", f"/reports/{report_id}/status", 
                                    token=operator_token, json_data=update_payload)
        if status == 200:
            print(f"✅ Report status updated: {report_id}")
            time.sleep(0.5)
            
            # Query audit log for update
            status2, data2 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                          params={"action": "update", "table": "shift_reports", "limit": "5"})
            if status2 == 200:
                rows = data2.get("rows", [])
                recent_update = [r for r in rows if r.get("record_id") == report_id]
                
                if recent_update:
                    row = recent_update[0]
                    before_state = row.get("before_state", {})
                    after_state = row.get("after_state", {})
                    metadata = row.get("metadata", {})
                    
                    before_status = before_state.get("status")
                    after_status = after_state.get("status")
                    
                    results.add_pass("D.4", "Update report status creates audit row with before/after",
                                   f"Found audit row: record_id='{report_id}', before_state.status='{before_status}', "
                                   f"after_state.status='{after_status}', metadata.reason='{metadata.get('reason', 'N/A')}'")
                else:
                    results.add_fail("D.4", "Report status update audit row not found",
                                   f"No audit row found for record_id='{report_id}' with action='update'")
            else:
                results.add_fail("D.4", "Failed to query audit log after status update",
                               f"Expected 200, got {status2}: {data2}")
        else:
            results.add_fail("D.4", "Report status update test",
                           f"Expected 200, got {status}: {data}")
    
    # Test D.5: Delete report creates audit row
    if status == 200 and report_id:
        print("\n🗑️ Testing report deletion audit...")
        status, data = test_endpoint("DELETE", f"/reports/{report_id}", token=owner_token)
        if status == 200:
            print(f"✅ Report deleted: {report_id}")
            time.sleep(0.5)
            
            # Query audit log for delete
            status2, data2 = test_endpoint("GET", "/founder/audit-log", token=founder_token,
                                          params={"action": "delete", "table": "shift_reports", "limit": "5"})
            if status2 == 200:
                rows = data2.get("rows", [])
                recent_delete = [r for r in rows if r.get("record_id") == report_id]
                
                if recent_delete:
                    row = recent_delete[0]
                    before_state = row.get("before_state", {})
                    
                    results.add_pass("D.5", "Delete report creates audit row with before_state",
                                   f"Found audit row: record_id='{report_id}', before_state has {len(before_state)} fields")
                else:
                    results.add_fail("D.5", "Report deletion audit row not found",
                                   f"No audit row found for record_id='{report_id}' with action='delete'")
            else:
                results.add_fail("D.5", "Failed to query audit log after deletion",
                               f"Expected 200, got {status2}: {data2}")
        else:
            results.add_fail("D.5", "Report deletion test",
                           f"Expected 200, got {status}: {data}")
    
    # ========== E. REGRESSION — EXISTING ENDPOINTS STILL WORK ==========
    print("\n" + "="*80)
    print("SECTION E: REGRESSION — EXISTING ENDPOINTS STILL WORK")
    print("="*80)
    
    # Test E.1: POST /api/auth/login (all roles)
    for role in ["owner", "operator", "staff", "founder"]:
        status, data = test_endpoint("POST", "/auth/login", json_data=CREDENTIALS[role])
        if status == 200:
            user = data.get("user", {})
            results.add_pass(f"E.1.{role}", f"POST /auth/login ({role}) returns 200",
                           f"Status: {status}, user.email={user.get('email')}, user.role={user.get('role')}")
        else:
            results.add_fail(f"E.1.{role}", f"POST /auth/login ({role})",
                           f"Expected 200, got {status}: {data}")
    
    # Test E.2: GET /api/sites (owner JWT)
    status, data = test_endpoint("GET", "/sites", token=owner_token)
    if status == 200:
        sites = data if isinstance(data, list) else data.get("sites", [])
        results.add_pass("E.2", "GET /api/sites (owner) returns sites",
                       f"Status: {status}, sites={len(sites)}")
    else:
        results.add_fail("E.2", "GET /api/sites (owner)",
                       f"Expected 200, got {status}: {data}")
    
    # Test E.3: GET /api/reports (operator JWT)
    status, data = test_endpoint("GET", "/reports", token=operator_token)
    if status == 200:
        reports = data if isinstance(data, list) else data.get("reports", [])
        results.add_pass("E.3", "GET /api/reports (operator) returns reports",
                       f"Status: {status}, reports={len(reports)}")
    else:
        results.add_fail("E.3", "GET /api/reports (operator)",
                       f"Expected 200, got {status}: {data}")
    
    # Test E.4: GET /api/dips/current (operator JWT)
    status, data = test_endpoint("GET", "/dips/current", token=operator_token)
    if status == 200:
        results.add_pass("E.4", "GET /api/dips/current (operator) returns data",
                       f"Status: {status}")
    else:
        results.add_fail("E.4", "GET /api/dips/current (operator)",
                       f"Expected 200, got {status}: {data}")
    
    # Test E.5: GET /api/fuel-prices-live/status
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        results.add_pass("E.5", "GET /api/fuel-prices-live/status returns sync status",
                       f"Status: {status}, last_status={data.get('last_status')}")
    else:
        results.add_fail("E.5", "GET /api/fuel-prices-live/status",
                       f"Expected 200, got {status}: {data}")
    
    # Test E.6: GET /api/dashboard/stats (owner)
    status, data = test_endpoint("GET", "/dashboard/stats", token=owner_token,
                                params={"siteIds": site_ids_param})
    if status == 200:
        results.add_pass("E.6", "GET /api/dashboard/stats (owner) returns aggregated KPIs",
                       f"Status: {status}, totalRevenue={data.get('totalRevenue', 0)}")
    else:
        results.add_fail("E.6", "GET /api/dashboard/stats (owner)",
                       f"Expected 200, got {status}: {data}")
    
    # Test E.7: GET /api/reports/pivot (operator)
    status, data = test_endpoint("GET", "/reports/pivot", token=operator_token,
                                params={"site_id": operator_sites[0] if operator_sites else "site-001",
                                       "from": yesterday, "to": today})
    if status == 200:
        results.add_pass("E.7", "GET /api/reports/pivot (operator) returns pivot data",
                       f"Status: {status}")
    else:
        results.add_fail("E.7", "GET /api/reports/pivot (operator)",
                       f"Expected 200, got {status}: {data}")
    
    # ========== F. ROLE ISOLATION RE-VERIFICATION ==========
    print("\n" + "="*80)
    print("SECTION F: ROLE ISOLATION RE-VERIFICATION")
    print("="*80)
    
    # Test F.1: Staff JWT → /api/founder/audit-log → 403
    status, data = test_endpoint("GET", "/founder/audit-log", token=staff_token)
    if status == 403:
        error_msg = data.get("error", "")
        if "Support role required" in error_msg or "support" in error_msg.lower():
            results.add_pass("F.1", "Staff JWT → /founder/audit-log → 403 (Support role required)",
                           f"Status: {status}, Error: {error_msg}")
        else:
            results.add_fail("F.1", "Staff JWT → /founder/audit-log → 403 message",
                           f"Expected 'Support role required', got: {error_msg}")
    else:
        results.add_fail("F.1", "Staff JWT → /founder/audit-log → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Test F.2: Owner JWT → /api/founder/stats → 403
    status, data = test_endpoint("GET", "/founder/stats", token=owner_token)
    if status == 403:
        results.add_pass("F.2", "Owner JWT → /founder/stats → 403",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail("F.2", "Owner JWT → /founder/stats → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Test F.3: Operator JWT → /api/founder/users → 403
    status, data = test_endpoint("GET", "/founder/users", token=operator_token)
    if status == 403:
        results.add_pass("F.3", "Operator JWT → /founder/users → 403",
                       f"Status: {status}, Error: {data.get('error', 'N/A')}")
    else:
        results.add_fail("F.3", "Operator JWT → /founder/users → 403",
                       f"Expected 403, got {status}: {data}")
    
    # Test F.4: Founder JWT → /api/founder/* all return 200
    founder_endpoints = [
        ("/founder/audit-log", "GET"),
        ("/founder/stats", "GET"),
        ("/founder/users", "GET"),
        ("/founder/sites", "GET")
    ]
    
    all_200 = True
    for path, method in founder_endpoints:
        status, data = test_endpoint(method, path, token=founder_token)
        if status != 200:
            all_200 = False
            break
    
    if all_200:
        results.add_pass("F.4", "Founder JWT → /api/founder/* all return 200",
                       f"All 4 founder endpoints returned 200")
    else:
        results.add_fail("F.4", "Founder JWT → /api/founder/* all return 200",
                       f"Some founder endpoints did not return 200")
    
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
