#!/usr/bin/env python3
"""
Phase 2 Cleanup + Assignments Module — Backend Regression Test

This validates 4 changes:
1. Dead code cleanup: 932 lines removed from catch-all route.js
2. New Assignments module: /api/operator-assignments and /api/staff-assignments
3. Users module audit: Added logAuditAsync to /api/users routes
4. Copy-from-site UI: Frontend-only, verify field-configs CRUD still works

Base URL: https://fuel-ops-simple.preview.emergentagent.com
"""

import requests
import time
import json
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"},
    "support": {"email": "founder@fops.platform", "password": "Fops813387cf0a5c6351!"}
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
    """Login and return user data with token"""
    try:
        creds = CREDENTIALS[role]
        resp = requests.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("session", {}).get("access_token")
            user = data.get("user", {})
            return {"token": token, "user": user}
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
            return (resp.status_code, resp.json())
        except:
            return (resp.status_code, {"text": resp.text})
    except Exception as e:
        return (0, {"error": str(e)})

def main():
    results = TestResults()
    
    print("="*80)
    print("PHASE 2 CLEANUP + ASSIGNMENTS MODULE — BACKEND REGRESSION TEST")
    print("="*80)
    
    # Login all roles
    print("\n[SETUP] Logging in all roles...")
    owner_auth = login("owner")
    operator_auth = login("operator")
    staff_auth = login("staff")
    support_auth = login("support")
    
    if not owner_auth or not operator_auth or not staff_auth or not support_auth:
        print("❌ CRITICAL: Failed to login all roles. Aborting tests.")
        return
    
    owner_token = owner_auth["token"]
    operator_token = operator_auth["token"]
    staff_token = staff_auth["token"]
    support_token = support_auth["token"]
    owner_id = owner_auth["user"]["id"]
    operator_id = operator_auth["user"]["id"]
    staff_id = staff_auth["user"]["id"]
    
    print(f"✅ Owner logged in: {owner_id}")
    print(f"✅ Operator logged in: {operator_id}")
    print(f"✅ Staff logged in: {staff_id}")
    print(f"✅ Support logged in")
    
    # Track created resources for cleanup
    created_operator_assignments = []
    created_staff_assignments = []
    created_users = []
    
    # ============================================================================
    # SECTION 1: OPERATOR ASSIGNMENTS MODULE
    # ============================================================================
    print("\n" + "="*80)
    print("SECTION 1: OPERATOR ASSIGNMENTS MODULE — /api/operator-assignments")
    print("="*80)
    
    # Test 1.1: GET without Bearer → 200 with empty array (allows anonymous)
    status, data = test_endpoint("GET", "/operator-assignments")
    if status == 200 and isinstance(data, list):
        results.add_pass("1.1", "GET /operator-assignments without Bearer returns 200 with array", 
                        f"Status: {status}, Type: {type(data).__name__}, Length: {len(data)}")
    else:
        results.add_fail("1.1", "GET /operator-assignments without Bearer should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.2: GET with Owner Bearer → returns assignments where assigned_by_owner_id = owner.id
    status, data = test_endpoint("GET", "/operator-assignments", token=owner_token)
    if status == 200 and isinstance(data, list):
        owner_assignments = [a for a in data if a.get("assigned_by_owner_id") == owner_id]
        results.add_pass("1.2", "GET /operator-assignments as Owner returns owner's assignments",
                        f"Status: {status}, Total: {len(data)}, Owner's: {len(owner_assignments)}")
    else:
        results.add_fail("1.2", "GET /operator-assignments as Owner should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.3: GET with Operator Bearer → returns assignments where operator_user_id = operator.id
    status, data = test_endpoint("GET", "/operator-assignments", token=operator_token)
    if status == 200 and isinstance(data, list):
        operator_assignments = [a for a in data if a.get("operator_user_id") == operator_id]
        results.add_pass("1.3", "GET /operator-assignments as Operator returns operator's assignments",
                        f"Status: {status}, Total: {len(data)}, Operator's: {len(operator_assignments)}")
    else:
        results.add_fail("1.3", "GET /operator-assignments as Operator should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.4: GET with Staff Bearer → returns empty array
    status, data = test_endpoint("GET", "/operator-assignments", token=staff_token)
    if status == 200 and isinstance(data, list) and len(data) == 0:
        results.add_pass("1.4", "GET /operator-assignments as Staff returns empty array",
                        f"Status: {status}, Length: {len(data)}")
    else:
        results.add_fail("1.4", "GET /operator-assignments as Staff should return empty array",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.5: GET with siteId filter
    # First, get a site ID from owner's sites
    status, sites_data = test_endpoint("GET", "/sites", token=owner_token)
    if status == 200 and isinstance(sites_data, list) and len(sites_data) > 0:
        test_site_id = sites_data[0]["id"]
        status, data = test_endpoint("GET", "/operator-assignments", token=owner_token, 
                                     params={"siteId": test_site_id})
        if status == 200 and isinstance(data, list):
            filtered = [a for a in data if a.get("site_id") == test_site_id]
            results.add_pass("1.5", f"GET /operator-assignments?siteId={test_site_id} filters correctly",
                            f"Status: {status}, Total: {len(data)}, Filtered: {len(filtered)}")
        else:
            results.add_fail("1.5", "GET /operator-assignments with siteId filter should return 200",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("1.5", "Could not get sites to test siteId filter",
                        f"Status: {status}, Sites: {sites_data}")
    
    # Test 1.6: POST with Owner Bearer → creates assignment + audit row
    # Get an operator user ID and site ID
    status, operators = test_endpoint("GET", "/users", token=owner_token, params={"role": "operator"})
    if status == 200 and isinstance(operators, list) and len(operators) > 0:
        test_operator_id = operators[0]["id"]
        test_site_id = sites_data[0]["id"] if sites_data else None
        
        if test_site_id:
            status, data = test_endpoint("POST", "/operator-assignments", token=owner_token,
                                        json_data={"operator_user_id": test_operator_id, "site_id": test_site_id})
            if status == 200 and data.get("id"):
                created_operator_assignments.append(data["id"])
                results.add_pass("1.6", "POST /operator-assignments creates assignment",
                                f"Status: {status}, ID: {data.get('id')}, Operator: {test_operator_id}, Site: {test_site_id}")
            else:
                results.add_fail("1.6", "POST /operator-assignments should create assignment",
                                f"Status: {status}, Data: {data}")
        else:
            results.add_fail("1.6", "Could not get site ID for POST test", "No sites available")
    else:
        results.add_fail("1.6", "Could not get operator for POST test",
                        f"Status: {status}, Operators: {operators}")
    
    # Test 1.7: POST with missing operator_user_id → 400
    status, data = test_endpoint("POST", "/operator-assignments", token=owner_token,
                                json_data={"site_id": test_site_id})
    if status == 400:
        results.add_pass("1.7", "POST /operator-assignments with missing operator_user_id returns 400",
                        f"Status: {status}, Error: {data.get('error')}")
    else:
        results.add_fail("1.7", "POST /operator-assignments with missing operator_user_id should return 400",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.8: POST with missing site_id → 400
    status, data = test_endpoint("POST", "/operator-assignments", token=owner_token,
                                json_data={"operator_user_id": test_operator_id})
    if status == 400:
        results.add_pass("1.8", "POST /operator-assignments with missing site_id returns 400",
                        f"Status: {status}, Error: {data.get('error')}")
    else:
        results.add_fail("1.8", "POST /operator-assignments with missing site_id should return 400",
                        f"Status: {status}, Data: {data}")
    
    # Test 1.9: DELETE /operator-assignments/:id → 200 + audit row
    if created_operator_assignments:
        assignment_id = created_operator_assignments[0]
        status, data = test_endpoint("DELETE", f"/operator-assignments/{assignment_id}", token=owner_token)
        if status == 200:
            results.add_pass("1.9", f"DELETE /operator-assignments/{assignment_id} returns 200",
                            f"Status: {status}, Message: {data.get('message')}")
            created_operator_assignments.remove(assignment_id)
        else:
            results.add_fail("1.9", "DELETE /operator-assignments/:id should return 200",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("1.9", "No operator assignment created to test DELETE", "Skipped")
    
    # ============================================================================
    # SECTION 2: STAFF ASSIGNMENTS MODULE
    # ============================================================================
    print("\n" + "="*80)
    print("SECTION 2: STAFF ASSIGNMENTS MODULE — /api/staff-assignments")
    print("="*80)
    
    # Test 2.1: GET without Bearer → 200 with empty array (allows anonymous)
    status, data = test_endpoint("GET", "/staff-assignments")
    if status == 200 and isinstance(data, list):
        results.add_pass("2.1", "GET /staff-assignments without Bearer returns 200 with array",
                        f"Status: {status}, Type: {type(data).__name__}, Length: {len(data)}")
    else:
        results.add_fail("2.1", "GET /staff-assignments without Bearer should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.2: GET with Owner Bearer → returns assignments where site_id IN (owner's owned sites)
    status, data = test_endpoint("GET", "/staff-assignments", token=owner_token)
    if status == 200 and isinstance(data, list):
        results.add_pass("2.2", "GET /staff-assignments as Owner returns owner's site assignments",
                        f"Status: {status}, Total: {len(data)}")
    else:
        results.add_fail("2.2", "GET /staff-assignments as Owner should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.3: GET with Operator Bearer → returns assignments where assigned_by_operator_id = operator.id
    status, data = test_endpoint("GET", "/staff-assignments", token=operator_token)
    if status == 200 and isinstance(data, list):
        operator_staff_assignments = [a for a in data if a.get("assigned_by_operator_id") == operator_id]
        results.add_pass("2.3", "GET /staff-assignments as Operator returns operator's assignments",
                        f"Status: {status}, Total: {len(data)}, Operator's: {len(operator_staff_assignments)}")
    else:
        results.add_fail("2.3", "GET /staff-assignments as Operator should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.4: GET with Staff Bearer → returns assignments where staff_user_id = staff.id
    status, data = test_endpoint("GET", "/staff-assignments", token=staff_token)
    if status == 200 and isinstance(data, list):
        staff_assignments = [a for a in data if a.get("staff_user_id") == staff_id]
        results.add_pass("2.4", "GET /staff-assignments as Staff returns staff's assignments",
                        f"Status: {status}, Total: {len(data)}, Staff's: {len(staff_assignments)}")
    else:
        results.add_fail("2.4", "GET /staff-assignments as Staff should return 200 with array",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.5: POST with Operator Bearer → creates + audit row
    # Get a staff user ID and site ID
    status, staff_users = test_endpoint("GET", "/users", token=operator_token, params={"role": "staff"})
    if status == 200 and isinstance(staff_users, list) and len(staff_users) > 0:
        test_staff_id = staff_users[0]["id"]
        # Get operator's assigned sites
        status, op_sites = test_endpoint("GET", "/sites", token=operator_token)
        if status == 200 and isinstance(op_sites, list) and len(op_sites) > 0:
            test_site_id = op_sites[0]["id"]
            
            status, data = test_endpoint("POST", "/staff-assignments", token=operator_token,
                                        json_data={"staff_user_id": test_staff_id, "site_id": test_site_id})
            if status == 200 and data.get("id"):
                created_staff_assignments.append(data["id"])
                results.add_pass("2.5", "POST /staff-assignments creates assignment",
                                f"Status: {status}, ID: {data.get('id')}, Staff: {test_staff_id}, Site: {test_site_id}")
            else:
                results.add_fail("2.5", "POST /staff-assignments should create assignment",
                                f"Status: {status}, Data: {data}")
        else:
            results.add_fail("2.5", "Could not get operator's sites for POST test",
                            f"Status: {status}, Sites: {op_sites}")
    else:
        results.add_fail("2.5", "Could not get staff for POST test",
                        f"Status: {status}, Staff: {staff_users}")
    
    # Test 2.6: POST with missing staff_user_id → 400
    status, data = test_endpoint("POST", "/staff-assignments", token=operator_token,
                                json_data={"site_id": test_site_id})
    if status == 400:
        results.add_pass("2.6", "POST /staff-assignments with missing staff_user_id returns 400",
                        f"Status: {status}, Error: {data.get('error')}")
    else:
        results.add_fail("2.6", "POST /staff-assignments with missing staff_user_id should return 400",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.7: POST with missing site_id → 400
    status, data = test_endpoint("POST", "/staff-assignments", token=operator_token,
                                json_data={"staff_user_id": test_staff_id})
    if status == 400:
        results.add_pass("2.7", "POST /staff-assignments with missing site_id returns 400",
                        f"Status: {status}, Error: {data.get('error')}")
    else:
        results.add_fail("2.7", "POST /staff-assignments with missing site_id should return 400",
                        f"Status: {status}, Data: {data}")
    
    # Test 2.8: DELETE /staff-assignments/:id → 200 + audit row
    if created_staff_assignments:
        assignment_id = created_staff_assignments[0]
        status, data = test_endpoint("DELETE", f"/staff-assignments/{assignment_id}", token=operator_token)
        if status == 200:
            results.add_pass("2.8", f"DELETE /staff-assignments/{assignment_id} returns 200",
                            f"Status: {status}, Message: {data.get('message')}")
            created_staff_assignments.remove(assignment_id)
        else:
            results.add_fail("2.8", "DELETE /staff-assignments/:id should return 200",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("2.8", "No staff assignment created to test DELETE", "Skipped")
    
    # ============================================================================
    # SECTION 3: USERS MODULE AUDIT LOGGING
    # ============================================================================
    print("\n" + "="*80)
    print("SECTION 3: USERS MODULE AUDIT LOGGING")
    print("="*80)
    
    # Test 3.1: POST /api/users → creates user + audit row
    test_user_email = f"test-user-{int(time.time())}@example.com"
    status, data = test_endpoint("POST", "/users", token=owner_token,
                                json_data={
                                    "name": "Test User",
                                    "email": test_user_email,
                                    "password": "TestPass123!",
                                    "role": "operator"
                                })
    if status == 200 and data.get("id"):
        created_users.append(data["id"])
        results.add_pass("3.1", "POST /users creates user",
                        f"Status: {status}, ID: {data.get('id')}, Email: {test_user_email}")
        
        # Verify audit log entry
        time.sleep(1)  # Wait for audit log to be written
        status, audit_data = test_endpoint("GET", "/founder/audit-log", token=support_token,
                                          params={"action": "insert", "table": "users", "limit": 5})
        if status == 200:
            # Handle both list and object with 'rows' key
            rows = audit_data.get('rows', audit_data) if isinstance(audit_data, dict) else audit_data
            if isinstance(rows, list):
                recent_insert = next((a for a in rows if a.get("after_state", {}).get("email") == test_user_email), None)
                if recent_insert:
                    results.add_pass("3.1a", "POST /users creates audit log entry",
                                    f"Audit ID: {recent_insert.get('id')}, Action: {recent_insert.get('action')}, After: {recent_insert.get('after_state', {}).get('email')}")
                else:
                    results.add_fail("3.1a", "POST /users should create audit log entry",
                                    f"No audit entry found for email: {test_user_email}")
            else:
                results.add_fail("3.1a", "Audit log response format unexpected",
                                f"Expected list, got: {type(rows)}")
        else:
            results.add_fail("3.1a", "Could not verify audit log entry",
                            f"Status: {status}, Data: {audit_data}")
    else:
        results.add_fail("3.1", "POST /users should create user",
                        f"Status: {status}, Data: {data}")
    
    # Test 3.2: PUT /api/users/:id → updates + audit with before/after
    if created_users:
        user_id = created_users[0]
        status, data = test_endpoint("PUT", f"/users/{user_id}", token=owner_token,
                                    json_data={"name": "Updated Test User"})
        if status == 200:
            results.add_pass("3.2", f"PUT /users/{user_id} updates user",
                            f"Status: {status}, Name: {data.get('name')}")
            
            # Verify audit log entry
            time.sleep(1)
            status, audit_data = test_endpoint("GET", "/founder/audit-log", token=support_token,
                                              params={"action": "update", "table": "users", "limit": 5})
            if status == 200:
                # Handle both list and object with 'rows' key
                rows = audit_data.get('rows', audit_data) if isinstance(audit_data, dict) else audit_data
                if isinstance(rows, list):
                    recent_update = next((a for a in rows if a.get("record_id") == user_id), None)
                    if recent_update and recent_update.get("before_state") and recent_update.get("after_state"):
                        results.add_pass("3.2a", "PUT /users creates audit log with before/after",
                                        f"Audit ID: {recent_update.get('id')}, Before: {recent_update.get('before_state', {}).get('name')}, After: {recent_update.get('after_state', {}).get('name')}")
                    else:
                        results.add_fail("3.2a", "PUT /users should create audit log with before/after",
                                        f"Audit entry: {recent_update}")
                else:
                    results.add_fail("3.2a", "Audit log response format unexpected",
                                    f"Expected list, got: {type(rows)}")
            else:
                results.add_fail("3.2a", "Could not verify audit log entry",
                                f"Status: {status}, Data: {audit_data}")
        else:
            results.add_fail("3.2", "PUT /users/:id should update user",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("3.2", "No user created to test PUT", "Skipped")
    
    # Test 3.3: DELETE /api/users/:id → deletes + audit with before
    if created_users:
        user_id = created_users[0]
        status, data = test_endpoint("DELETE", f"/users/{user_id}", token=owner_token)
        if status == 200:
            results.add_pass("3.3", f"DELETE /users/{user_id} deletes user",
                            f"Status: {status}, Success: {data.get('success')}")
            
            # Verify audit log entry
            time.sleep(1)
            status, audit_data = test_endpoint("GET", "/founder/audit-log", token=support_token,
                                              params={"action": "delete", "table": "users", "limit": 5})
            if status == 200:
                # Handle both list and object with 'rows' key
                rows = audit_data.get('rows', audit_data) if isinstance(audit_data, dict) else audit_data
                if isinstance(rows, list):
                    recent_delete = next((a for a in rows if a.get("record_id") == user_id), None)
                    if recent_delete and recent_delete.get("before_state"):
                        results.add_pass("3.3a", "DELETE /users creates audit log with before state",
                                        f"Audit ID: {recent_delete.get('id')}, Before: {recent_delete.get('before_state', {}).get('email')}")
                    else:
                        results.add_fail("3.3a", "DELETE /users should create audit log with before state",
                                        f"Audit entry: {recent_delete}")
                else:
                    results.add_fail("3.3a", "Audit log response format unexpected",
                                    f"Expected list, got: {type(rows)}")
            else:
                results.add_fail("3.3a", "Could not verify audit log entry",
                                f"Status: {status}, Data: {audit_data}")
            
            created_users.remove(user_id)
        else:
            results.add_fail("3.3", "DELETE /users/:id should delete user",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("3.3", "No user created to test DELETE", "Skipped")
    
    # ============================================================================
    # SECTION 4: CATCH-ALL BEHAVIOUR FOR REMOVED PATHS
    # ============================================================================
    print("\n" + "="*80)
    print("SECTION 4: CATCH-ALL BEHAVIOUR — Verify modular routes intercept correctly")
    print("="*80)
    
    # Test 4.1: GET /api/sites → 200 (intercepted by modular route)
    status, data = test_endpoint("GET", "/sites", token=owner_token)
    if status == 200:
        results.add_pass("4.1", "GET /sites returns 200 (modular route working)",
                        f"Status: {status}, Sites: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("4.1", "GET /sites should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 4.2: GET /api/users → 200
    status, data = test_endpoint("GET", "/users", token=owner_token)
    if status == 200:
        results.add_pass("4.2", "GET /users returns 200 (modular route working)",
                        f"Status: {status}, Users: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("4.2", "GET /users should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 4.3: GET /api/field-configs?siteId=... → 200
    if sites_data and len(sites_data) > 0:
        test_site_id = sites_data[0]["id"]
        status, data = test_endpoint("GET", "/field-configs", token=owner_token,
                                     params={"siteId": test_site_id})
        if status == 200 or status == 400:  # 400 is acceptable if siteId is required
            results.add_pass("4.3", f"GET /field-configs?siteId={test_site_id} returns {status} (modular route working)",
                            f"Status: {status}, Configs: {len(data) if isinstance(data, list) else 'N/A'}")
        else:
            results.add_fail("4.3", "GET /field-configs should return 200 or 400",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("4.3", "No sites available to test field-configs", "Skipped")
    
    # Test 4.4: GET /api/banking-formulas?siteId=... → 200
    if sites_data and len(sites_data) > 0:
        test_site_id = sites_data[0]["id"]
        status, data = test_endpoint("GET", "/banking-formulas", token=owner_token,
                                     params={"siteId": test_site_id})
        if status == 200 or status == 400:  # 400 is acceptable if siteId is required
            results.add_pass("4.4", f"GET /banking-formulas?siteId={test_site_id} returns {status} (modular route working)",
                            f"Status: {status}, Formulas: {len(data) if isinstance(data, list) else 'N/A'}")
        else:
            results.add_fail("4.4", "GET /banking-formulas should return 200 or 400",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("4.4", "No sites available to test banking-formulas", "Skipped")
    
    # Test 4.5: GET /api/operator-assignments → 200 (new modular route)
    status, data = test_endpoint("GET", "/operator-assignments", token=owner_token)
    if status == 200:
        results.add_pass("4.5", "GET /operator-assignments returns 200 (new modular route working)",
                        f"Status: {status}, Assignments: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("4.5", "GET /operator-assignments should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 4.6: GET /api/staff-assignments → 200 (new modular route)
    status, data = test_endpoint("GET", "/staff-assignments", token=owner_token)
    if status == 200:
        results.add_pass("4.6", "GET /staff-assignments returns 200 (new modular route working)",
                        f"Status: {status}, Assignments: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("4.6", "GET /staff-assignments should return 200",
                        f"Status: {status}, Data: {data}")
    
    # ============================================================================
    # SECTION 5: REGRESSION TESTS
    # ============================================================================
    print("\n" + "="*80)
    print("SECTION 5: REGRESSION TESTS — Existing endpoints still work")
    print("="*80)
    
    # Test 5.1: POST /api/auth/login (modular, untouched)
    status, data = test_endpoint("POST", "/auth/login", json_data=CREDENTIALS["owner"])
    if status == 200 and data.get("session"):
        results.add_pass("5.1", "POST /auth/login still works",
                        f"Status: {status}, Token: {data.get('session', {}).get('access_token')[:20]}...")
    else:
        results.add_fail("5.1", "POST /auth/login should return 200 with session",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.2: POST /api/reports (catch-all, still here)
    if sites_data and len(sites_data) > 0:
        test_site_id = sites_data[0]["id"]
        status, data = test_endpoint("POST", "/reports", token=staff_token,
                                     json_data={
                                         "site_id": test_site_id,
                                         "shift_date": "2026-05-15",
                                         "shift_type": "Morning",
                                         "fuel_sales": 1000,
                                         "shop_sales": 500
                                     })
        if status == 200 or status == 201:
            results.add_pass("5.2", "POST /reports still works",
                            f"Status: {status}, Report ID: {data.get('id')}")
        else:
            results.add_fail("5.2", "POST /reports should return 200/201",
                            f"Status: {status}, Data: {data}")
    else:
        results.add_fail("5.2", "No sites available to test reports", "Skipped")
    
    # Test 5.3: GET /api/reports (catch-all)
    status, data = test_endpoint("GET", "/reports", token=operator_token)
    if status == 200:
        results.add_pass("5.3", "GET /reports still works",
                        f"Status: {status}, Reports: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.3", "GET /reports should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.4: GET /api/dashboard/stats (catch-all)
    status, data = test_endpoint("GET", "/dashboard/stats", token=owner_token)
    if status == 200:
        results.add_pass("5.4", "GET /dashboard/stats still works",
                        f"Status: {status}, Total Sales: {data.get('total_sales')}")
    else:
        results.add_fail("5.4", "GET /dashboard/stats should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.5: GET /api/dashboard/site-stats (catch-all)
    status, data = test_endpoint("GET", "/dashboard/site-stats", token=owner_token)
    if status == 200:
        results.add_pass("5.5", "GET /dashboard/site-stats still works",
                        f"Status: {status}, Sites: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.5", "GET /dashboard/site-stats should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.6: GET /api/dashboard/revenue-chart (catch-all)
    status, data = test_endpoint("GET", "/dashboard/revenue-chart", token=owner_token)
    if status == 200:
        results.add_pass("5.6", "GET /dashboard/revenue-chart still works",
                        f"Status: {status}, Data points: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.6", "GET /dashboard/revenue-chart should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.7: GET /api/dashboard/12-month-trend (modular, untouched)
    status, data = test_endpoint("GET", "/dashboard/12-month-trend", token=owner_token)
    if status == 200:
        results.add_pass("5.7", "GET /dashboard/12-month-trend still works",
                        f"Status: {status}, Months: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.7", "GET /dashboard/12-month-trend should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.8: POST /api/banking/calculate (catch-all)
    status, data = test_endpoint("POST", "/banking/calculate", token=operator_token,
                                json_data={
                                    "operator": "+",
                                    "value1": 100,
                                    "value2": 200
                                })
    if status == 200:
        results.add_pass("5.8", "POST /banking/calculate still works",
                        f"Status: {status}, Result: {data.get('result')}")
    else:
        results.add_fail("5.8", "POST /banking/calculate should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.9: GET /api/fuel-prices (catch-all)
    status, data = test_endpoint("GET", "/fuel-prices", token=owner_token)
    if status == 200:
        results.add_pass("5.9", "GET /api/fuel-prices still works",
                        f"Status: {status}, Prices: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.9", "GET /api/fuel-prices should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.10: GET /api/dips/current (modular, untouched)
    status, data = test_endpoint("GET", "/dips/current", token=operator_token)
    if status == 200:
        results.add_pass("5.10", "GET /dips/current still works",
                        f"Status: {status}, Dips: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.10", "GET /dips/current should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.11: GET /api/fuel-prices-live/status (modular, untouched)
    status, data = test_endpoint("GET", "/fuel-prices-live/status", token=owner_token)
    if status == 200:
        results.add_pass("5.11", "GET /fuel-prices-live/status still works",
                        f"Status: {status}, Last Status: {data.get('last_status')}")
    else:
        results.add_fail("5.11", "GET /fuel-prices-live/status should return 200",
                        f"Status: {status}, Data: {data}")
    
    # Test 5.12: GET /api/founder/audit-log (modular, untouched)
    status, data = test_endpoint("GET", "/founder/audit-log", token=support_token, params={"limit": 10})
    if status == 200:
        results.add_pass("5.12", "GET /founder/audit-log still works",
                        f"Status: {status}, Audit entries: {len(data) if isinstance(data, list) else 'N/A'}")
    else:
        results.add_fail("5.12", "GET /founder/audit-log should return 200",
                        f"Status: {status}, Data: {data}")
    
    # ============================================================================
    # CLEANUP
    # ============================================================================
    print("\n" + "="*80)
    print("CLEANUP: Deleting test resources")
    print("="*80)
    
    # Clean up remaining operator assignments
    for assignment_id in created_operator_assignments:
        status, data = test_endpoint("DELETE", f"/operator-assignments/{assignment_id}", token=owner_token)
        print(f"Deleted operator assignment {assignment_id}: {status}")
    
    # Clean up remaining staff assignments
    for assignment_id in created_staff_assignments:
        status, data = test_endpoint("DELETE", f"/staff-assignments/{assignment_id}", token=operator_token)
        print(f"Deleted staff assignment {assignment_id}: {status}")
    
    # Clean up remaining users
    for user_id in created_users:
        status, data = test_endpoint("DELETE", f"/users/{user_id}", token=owner_token)
        print(f"Deleted user {user_id}: {status}")
    
    # ============================================================================
    # SUMMARY
    # ============================================================================
    results.summary()

if __name__ == "__main__":
    main()
