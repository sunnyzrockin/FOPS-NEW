#!/usr/bin/env python3
"""
PHASE 3 WIRING INTEGRATION TEST
Tests the NEW backend integration where POST /api/reports also creates dip_readings rows
when the body contains fuel-tank dip fields.

Test Plan (A through H):
A. Happy path — staff submits report with tank levels
B. Shift-type → hour mapping (Morning=8, Afternoon=14, Night=22)
C. Delivery-only entry
D. No dip fields → no dip row
E. Field stripping — make sure shift_reports insert isn't broken
F. RBAC unchanged
G. Edge case: non-fatal dip failure
H. Cleanup
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import random

# Test credentials
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"
PASSWORD = "WorkflowDemo2026!"

OWNER_EMAIL = "owner@workflowlite.com"
OPERATOR_EMAIL = "operator@workflowlite.com"
STAFF_EMAIL = "staff@workflowlite.com"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

# Track created resources for cleanup
created_reports = []
created_dips = []

def log_test(test_name, status, details=""):
    """Log test result with color coding"""
    if status == "PASS":
        print(f"{GREEN}✅ PASS{RESET} - {test_name}")
    elif status == "FAIL":
        print(f"{RED}❌ FAIL{RESET} - {test_name}")
    else:
        print(f"{YELLOW}⚠️  {status}{RESET} - {test_name}")
    if details:
        print(f"   {details}")

def get_jwt_token(email, password):
    """Login and get JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            user_id = data.get("user", {}).get("id")
            token = data.get("session", {}).get("access_token")
            return token, user_id
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text[:200]}")
            return None, None
    except Exception as e:
        print(f"Login error for {email}: {str(e)}")
        return None, None

def get_unique_date():
    """Generate a unique date to avoid constraint violations"""
    # Use dates from December 2025 with random offset
    base_date = datetime(2025, 12, 1)
    offset = random.randint(1, 28)
    unique_date = base_date + timedelta(days=offset)
    return unique_date.strftime("%Y-%m-%d")

def test_a_happy_path():
    """A. Happy path — staff submits report with tank levels"""
    print(f"\n{BLUE}=== A. HAPPY PATH - Staff submits report with tank levels ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test A{RESET}")
        return 0, 2
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test A1: POST /api/reports with dip fields
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 5000,
        "shop_sales": 1200,
        "dips": 10,
        "drive_offs": 0,
        "dip_ulp_litres": 18000,
        "dip_diesel_litres": 11500,
        "dip_premium_litres": 5300,
        "delivery_ulp_litres": 0,
        "delivery_diesel_litres": 0,
        "delivery_premium_litres": 0,
        "notes": "Phase3 wiring test A"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers=headers,
            json=report_body,
            timeout=10
        )
        
        if response.status_code == 201:
            report = response.json()
            report_id = report.get("id")
            created_reports.append(report_id)
            
            # Verify dip fields are NOT in the returned report
            has_dip_fields = any(key in report for key in [
                "dip_ulp_litres", "dip_diesel_litres", "dip_premium_litres",
                "delivery_ulp_litres", "delivery_diesel_litres", "delivery_premium_litres"
            ])
            
            if not has_dip_fields:
                log_test("A1: POST /api/reports with dip fields", "PASS", 
                        f"201, report created without dip fields in response. Report ID: {report_id}")
                tests_passed += 1
            else:
                log_test("A1: POST /api/reports with dip fields", "FAIL", 
                        f"201 but dip fields present in response: {json.dumps(report)[:300]}")
        else:
            log_test("A1: POST /api/reports with dip fields", "FAIL", 
                    f"Expected 201, got {response.status_code}: {response.text[:300]}")
    except Exception as e:
        log_test("A1: POST /api/reports with dip fields", "FAIL", f"Exception: {str(e)}")
    
    # Test A2: GET /api/dips to verify dip_readings row was created
    tests_total += 1
    try:
        response = requests.get(
            f"{BASE_URL}/api/dips?site_id=site-001",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            dips = response.json()
            
            # Find the most recent dip with "Auto-logged" in notes and reading_label="Morning shift"
            matching_dip = None
            for dip in dips:
                if "Auto-logged" in dip.get("notes", "") and dip.get("reading_label") == "Morning shift":
                    # Check if this is the most recent one (by created_at or reading_time)
                    if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                        matching_dip = dip
            
            if matching_dip:
                created_dips.append(matching_dip.get("id"))
                
                # Verify all expected fields
                checks = []
                checks.append(("operator_user_id", matching_dip.get("operator_user_id") == staff_user_id))
                checks.append(("ulp_litres", matching_dip.get("ulp_litres") == 18000))
                checks.append(("diesel_litres", matching_dip.get("diesel_litres") == 11500))
                checks.append(("premium_litres", matching_dip.get("premium_litres") == 5300))
                checks.append(("deliveries_ulp_litres", matching_dip.get("deliveries_ulp_litres") == 0))
                checks.append(("deliveries_diesel_litres", matching_dip.get("deliveries_diesel_litres") == 0))
                checks.append(("deliveries_premium_litres", matching_dip.get("deliveries_premium_litres") == 0))
                
                # Check reading_time hour is 8 (Morning)
                reading_time = matching_dip.get("reading_time", "")
                if reading_time:
                    try:
                        dt = datetime.fromisoformat(reading_time.replace('Z', '+00:00'))
                        hour_check = dt.hour == 8
                        checks.append(("reading_time hour", hour_check))
                    except:
                        checks.append(("reading_time hour", False))
                
                # Check notes starts with "Auto-logged from Morning shift report"
                notes_check = matching_dip.get("notes", "").startswith("Auto-logged from Morning shift report")
                checks.append(("notes format", notes_check))
                
                all_passed = all(check[1] for check in checks)
                
                if all_passed:
                    log_test("A2: GET /api/dips verifies dip_readings row", "PASS", 
                            f"Found matching dip row with all expected fields. Dip ID: {matching_dip.get('id')}")
                    tests_passed += 1
                else:
                    failed_checks = [check[0] for check in checks if not check[1]]
                    log_test("A2: GET /api/dips verifies dip_readings row", "FAIL", 
                            f"Dip row found but failed checks: {', '.join(failed_checks)}")
            else:
                log_test("A2: GET /api/dips verifies dip_readings row", "FAIL", 
                        f"No matching dip row found with 'Auto-logged' and 'Morning shift'")
        else:
            log_test("A2: GET /api/dips verifies dip_readings row", "FAIL", 
                    f"Expected 200, got {response.status_code}: {response.text[:300]}")
    except Exception as e:
        log_test("A2: GET /api/dips verifies dip_readings row", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test A: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_b_shift_hour_mapping():
    """B. Shift-type → hour mapping (Morning=8, Afternoon=14, Night=22)"""
    print(f"\n{BLUE}=== B. SHIFT-TYPE → HOUR MAPPING ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test B{RESET}")
        return 0, 2
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test B1: Afternoon shift → hour 14
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Afternoon",
        "fuel_sales": 4500,
        "shop_sales": 1100,
        "dips": 8,
        "drive_offs": 0,
        "dip_diesel_litres": 11400,
        "notes": "Phase3 wiring test B1"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        if response.status_code == 201:
            report_id = response.json().get("id")
            created_reports.append(report_id)
            
            # Get dips and verify
            response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
            if response.status_code == 200:
                dips = response.json()
                matching_dip = None
                for dip in dips:
                    if dip.get("reading_label") == "Afternoon shift" and "Auto-logged" in dip.get("notes", ""):
                        if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                            matching_dip = dip
                
                if matching_dip:
                    created_dips.append(matching_dip.get("id"))
                    reading_time = matching_dip.get("reading_time", "")
                    try:
                        dt = datetime.fromisoformat(reading_time.replace('Z', '+00:00'))
                        if dt.hour == 14 and matching_dip.get("diesel_litres") == 11400:
                            log_test("B1: Afternoon shift → hour 14", "PASS", 
                                    f"reading_label='Afternoon shift', hour=14, diesel_litres=11400")
                            tests_passed += 1
                        else:
                            log_test("B1: Afternoon shift → hour 14", "FAIL", 
                                    f"Hour={dt.hour} (expected 14), diesel={matching_dip.get('diesel_litres')}")
                    except:
                        log_test("B1: Afternoon shift → hour 14", "FAIL", f"Could not parse reading_time")
                else:
                    log_test("B1: Afternoon shift → hour 14", "FAIL", "No matching dip row found")
            else:
                log_test("B1: Afternoon shift → hour 14", "FAIL", f"GET /api/dips failed: {response.status_code}")
        else:
            log_test("B1: Afternoon shift → hour 14", "FAIL", f"POST /api/reports failed: {response.status_code}")
    except Exception as e:
        log_test("B1: Afternoon shift → hour 14", "FAIL", f"Exception: {str(e)}")
    
    # Test B2: Night shift → hour 22
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Night",
        "fuel_sales": 3500,
        "shop_sales": 900,
        "dips": 6,
        "drive_offs": 0,
        "dip_premium_litres": 5100,
        "notes": "Phase3 wiring test B2"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        if response.status_code == 201:
            report_id = response.json().get("id")
            created_reports.append(report_id)
            
            # Get dips and verify
            response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
            if response.status_code == 200:
                dips = response.json()
                matching_dip = None
                for dip in dips:
                    if dip.get("reading_label") == "Night shift" and "Auto-logged" in dip.get("notes", ""):
                        if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                            matching_dip = dip
                
                if matching_dip:
                    created_dips.append(matching_dip.get("id"))
                    reading_time = matching_dip.get("reading_time", "")
                    try:
                        dt = datetime.fromisoformat(reading_time.replace('Z', '+00:00'))
                        if dt.hour == 22 and matching_dip.get("premium_litres") == 5100:
                            log_test("B2: Night shift → hour 22", "PASS", 
                                    f"reading_label='Night shift', hour=22, premium_litres=5100")
                            tests_passed += 1
                        else:
                            log_test("B2: Night shift → hour 22", "FAIL", 
                                    f"Hour={dt.hour} (expected 22), premium={matching_dip.get('premium_litres')}")
                    except:
                        log_test("B2: Night shift → hour 22", "FAIL", f"Could not parse reading_time")
                else:
                    log_test("B2: Night shift → hour 22", "FAIL", "No matching dip row found")
            else:
                log_test("B2: Night shift → hour 22", "FAIL", f"GET /api/dips failed: {response.status_code}")
        else:
            log_test("B2: Night shift → hour 22", "FAIL", f"POST /api/reports failed: {response.status_code}")
    except Exception as e:
        log_test("B2: Night shift → hour 22", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test B: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_c_delivery_only():
    """C. Delivery-only entry"""
    print(f"\n{BLUE}=== C. DELIVERY-ONLY ENTRY ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test C{RESET}")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test C1: POST with delivery_ulp_litres only (no dip levels)
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 4000,
        "shop_sales": 1000,
        "dips": 5,
        "drive_offs": 0,
        "delivery_ulp_litres": 5000,
        "notes": "Phase3 wiring test C"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        if response.status_code == 201:
            report_id = response.json().get("id")
            created_reports.append(report_id)
            
            # Get dips and verify
            response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
            if response.status_code == 200:
                dips = response.json()
                matching_dip = None
                for dip in dips:
                    if "Phase3 wiring test C" in dip.get("notes", "") or \
                       (dip.get("deliveries_ulp_litres") == 5000 and 
                        dip.get("ulp_litres") is None and 
                        "Auto-logged" in dip.get("notes", "")):
                        if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                            matching_dip = dip
                
                if matching_dip:
                    created_dips.append(matching_dip.get("id"))
                    checks = [
                        matching_dip.get("ulp_litres") is None,
                        matching_dip.get("diesel_litres") is None,
                        matching_dip.get("premium_litres") is None,
                        matching_dip.get("deliveries_ulp_litres") == 5000,
                        matching_dip.get("deliveries_diesel_litres") == 0,
                        matching_dip.get("deliveries_premium_litres") == 0
                    ]
                    
                    if all(checks):
                        log_test("C1: Delivery-only entry", "PASS", 
                                f"Dip row has deliveries_ulp_litres=5000, all level fields null")
                        tests_passed += 1
                    else:
                        log_test("C1: Delivery-only entry", "FAIL", 
                                f"Dip row found but fields incorrect: {json.dumps(matching_dip)[:300]}")
                else:
                    log_test("C1: Delivery-only entry", "FAIL", "No matching dip row found")
            else:
                log_test("C1: Delivery-only entry", "FAIL", f"GET /api/dips failed: {response.status_code}")
        else:
            log_test("C1: Delivery-only entry", "FAIL", f"POST /api/reports failed: {response.status_code}")
    except Exception as e:
        log_test("C1: Delivery-only entry", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test C: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_d_no_dip_fields():
    """D. No dip fields → no dip row"""
    print(f"\n{BLUE}=== D. NO DIP FIELDS → NO DIP ROW ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test D{RESET}")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test D1: POST without any dip fields
    tests_total += 1
    
    # Get count of dips BEFORE
    try:
        response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
        count_before = len(response.json()) if response.status_code == 200 else 0
    except:
        count_before = 0
    
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 3000,
        "shop_sales": 800,
        "dips": 4,
        "drive_offs": 0,
        "notes": "Phase3 wiring test D - no dip fields"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        if response.status_code == 201:
            report_id = response.json().get("id")
            created_reports.append(report_id)
            
            # Get count of dips AFTER
            response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
            if response.status_code == 200:
                count_after = len(response.json())
                
                if count_after == count_before:
                    log_test("D1: No dip fields → no dip row", "PASS", 
                            f"Dip count unchanged: {count_before} before, {count_after} after")
                    tests_passed += 1
                else:
                    log_test("D1: No dip fields → no dip row", "FAIL", 
                            f"Dip count changed: {count_before} before, {count_after} after (expected no change)")
            else:
                log_test("D1: No dip fields → no dip row", "FAIL", f"GET /api/dips failed: {response.status_code}")
        else:
            log_test("D1: No dip fields → no dip row", "FAIL", f"POST /api/reports failed: {response.status_code}")
    except Exception as e:
        log_test("D1: No dip fields → no dip row", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test D: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_e_field_stripping():
    """E. Field stripping — make sure shift_reports insert isn't broken"""
    print(f"\n{BLUE}=== E. FIELD STRIPPING ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test E{RESET}")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test E1: POST with all dip fields + bogus extra field
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 5500,
        "shop_sales": 1300,
        "dips": 12,
        "drive_offs": 0,
        "dip_ulp_litres": 19000,
        "dip_diesel_litres": 12000,
        "dip_premium_litres": 5500,
        "delivery_ulp_litres": 1000,
        "delivery_diesel_litres": 500,
        "delivery_premium_litres": 200,
        "bogus_extra_col": "x",
        "notes": "Phase3 wiring test E"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        # Accept either 201 (success) or 400 (validation error)
        if response.status_code == 201:
            report = response.json()
            report_id = report.get("id")
            created_reports.append(report_id)
            
            # Verify dip fields are NOT in the returned report
            has_dip_fields = any(key in report for key in [
                "dip_ulp_litres", "dip_diesel_litres", "dip_premium_litres",
                "delivery_ulp_litres", "delivery_diesel_litres", "delivery_premium_litres"
            ])
            
            if not has_dip_fields:
                log_test("E1: Field stripping", "PASS", 
                        f"201, dip fields stripped from shift_reports insert")
                tests_passed += 1
            else:
                log_test("E1: Field stripping", "FAIL", 
                        f"201 but dip fields present in response")
        elif response.status_code == 400:
            error = response.json().get("error", "")
            # Check if error is about bogus_extra_col, not about dip fields
            if "bogus_extra_col" in error or "column" in error.lower():
                # This is acceptable - the bogus field caused the error
                if not any(dip_field in error for dip_field in ["dip_ulp", "dip_diesel", "dip_premium", "delivery_"]):
                    log_test("E1: Field stripping", "PASS", 
                            f"400 due to bogus_extra_col (not dip fields), dip fields were stripped correctly")
                    tests_passed += 1
                else:
                    log_test("E1: Field stripping", "FAIL", 
                            f"400 but error mentions dip fields: {error}")
            else:
                log_test("E1: Field stripping", "FAIL", 
                        f"400 with unexpected error: {error}")
        else:
            log_test("E1: Field stripping", "FAIL", 
                    f"Unexpected status {response.status_code}: {response.text[:300]}")
    except Exception as e:
        log_test("E1: Field stripping", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test E: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_f_rbac_unchanged():
    """F. RBAC unchanged"""
    print(f"\n{BLUE}=== F. RBAC UNCHANGED ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Test F1: Owner can POST reports with dip fields
    tests_total += 1
    owner_token, owner_user_id = get_jwt_token(OWNER_EMAIL, PASSWORD)
    if owner_token:
        headers = {"Authorization": f"Bearer {owner_token}"}
        unique_date = get_unique_date()
        report_body = {
            "site_id": "site-005",
            "date": unique_date,
            "shift_type": "Morning",
            "fuel_sales": 6000,
            "shop_sales": 1500,
            "dips": 15,
            "drive_offs": 0,
            "dip_ulp_litres": 22000,
            "notes": "Phase3 wiring test F1"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
            
            if response.status_code == 201:
                report_id = response.json().get("id")
                created_reports.append(report_id)
                
                # Verify dip row was created with owner's user_id
                response = requests.get(f"{BASE_URL}/api/dips?site_id=site-005", headers=headers, timeout=10)
                if response.status_code == 200:
                    dips = response.json()
                    matching_dip = None
                    for dip in dips:
                        if "Phase3 wiring test F1" in dip.get("notes", "") or \
                           (dip.get("operator_user_id") == owner_user_id and 
                            dip.get("ulp_litres") == 22000 and 
                            "Auto-logged" in dip.get("notes", "")):
                            if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                                matching_dip = dip
                    
                    if matching_dip:
                        created_dips.append(matching_dip.get("id"))
                        if matching_dip.get("operator_user_id") == owner_user_id:
                            log_test("F1: Owner can POST with dip fields", "PASS", 
                                    f"201, dip row created with operator_user_id={owner_user_id}")
                            tests_passed += 1
                        else:
                            log_test("F1: Owner can POST with dip fields", "FAIL", 
                                    f"Dip row has wrong operator_user_id: {matching_dip.get('operator_user_id')}")
                    else:
                        log_test("F1: Owner can POST with dip fields", "FAIL", "No matching dip row found")
                else:
                    log_test("F1: Owner can POST with dip fields", "FAIL", f"GET /api/dips failed: {response.status_code}")
            else:
                log_test("F1: Owner can POST with dip fields", "FAIL", f"POST /api/reports failed: {response.status_code}")
        except Exception as e:
            log_test("F1: Owner can POST with dip fields", "FAIL", f"Exception: {str(e)}")
    else:
        log_test("F1: Owner can POST with dip fields", "SKIP", "Could not get owner token")
    
    # Test F2: POST without auth → 401
    tests_total += 1
    try:
        unique_date = get_unique_date()
        report_body = {
            "site_id": "site-001",
            "date": unique_date,
            "shift_type": "Morning",
            "fuel_sales": 4000,
            "shop_sales": 1000,
            "dips": 8,
            "drive_offs": 0,
            "dip_ulp_litres": 20000
        }
        
        response = requests.post(f"{BASE_URL}/api/reports", json=report_body, timeout=10)
        
        if response.status_code == 401:
            log_test("F2: POST without auth → 401", "PASS", "401 as expected")
            tests_passed += 1
        else:
            log_test("F2: POST without auth → 401", "FAIL", 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("F2: POST without auth → 401", "FAIL", f"Exception: {str(e)}")
    
    # Test F3: POST with bad token → 401
    tests_total += 1
    try:
        unique_date = get_unique_date()
        report_body = {
            "site_id": "site-001",
            "date": unique_date,
            "shift_type": "Morning",
            "fuel_sales": 4000,
            "shop_sales": 1000,
            "dips": 8,
            "drive_offs": 0,
            "dip_ulp_litres": 20000
        }
        
        response = requests.post(
            f"{BASE_URL}/api/reports",
            headers={"Authorization": "Bearer bad-token-12345"},
            json=report_body,
            timeout=10
        )
        
        if response.status_code == 401:
            log_test("F3: POST with bad token → 401", "PASS", "401 as expected")
            tests_passed += 1
        else:
            log_test("F3: POST with bad token → 401", "FAIL", 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("F3: POST with bad token → 401", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test F: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_g_edge_case():
    """G. Edge case: non-fatal dip failure"""
    print(f"\n{BLUE}=== G. EDGE CASE - Non-fatal dip failure ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get staff JWT
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT - skipping test G{RESET}")
        return 0, 1
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Test G1: POST with invalid dip value (string instead of number)
    tests_total += 1
    unique_date = get_unique_date()
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 4500,
        "shop_sales": 1100,
        "dips": 9,
        "drive_offs": 0,
        "dip_ulp_litres": "not-a-number",
        "notes": "Phase3 wiring test G"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
        
        # Should still return 201 (non-fatal dip failure)
        if response.status_code == 201:
            report_id = response.json().get("id")
            created_reports.append(report_id)
            
            log_test("G1: Non-fatal dip failure", "PASS", 
                    f"201, shift_report created despite invalid dip value (non-fatal)")
            tests_passed += 1
        else:
            log_test("G1: Non-fatal dip failure", "FAIL", 
                    f"Expected 201, got {response.status_code}: {response.text[:300]}")
    except Exception as e:
        log_test("G1: Non-fatal dip failure", "FAIL", f"Exception: {str(e)}")
    
    print(f"\n{BLUE}Test G: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def test_h_cleanup():
    """H. Cleanup"""
    print(f"\n{BLUE}=== H. CLEANUP ==={RESET}")
    
    tests_passed = 0
    tests_total = 0
    
    # Get owner JWT for cleanup
    owner_token, owner_user_id = get_jwt_token(OWNER_EMAIL, PASSWORD)
    if not owner_token:
        print(f"{RED}Failed to get owner JWT - skipping cleanup{RESET}")
        return 0, 2
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test H1: Delete all created shift_reports
    tests_total += 1
    deleted_reports = 0
    failed_reports = 0
    
    for report_id in created_reports:
        try:
            response = requests.delete(f"{BASE_URL}/api/reports/{report_id}", headers=headers, timeout=10)
            if response.status_code in [200, 204]:
                deleted_reports += 1
            else:
                failed_reports += 1
        except:
            failed_reports += 1
    
    if failed_reports == 0:
        log_test("H1: Delete shift_reports", "PASS", 
                f"Deleted {deleted_reports} shift_reports")
        tests_passed += 1
    else:
        log_test("H1: Delete shift_reports", "FAIL", 
                f"Deleted {deleted_reports}, failed {failed_reports}")
    
    # Test H2: Delete all created dip_readings
    tests_total += 1
    deleted_dips = 0
    failed_dips = 0
    
    for dip_id in created_dips:
        try:
            response = requests.delete(f"{BASE_URL}/api/dips/{dip_id}", headers=headers, timeout=10)
            if response.status_code in [200, 204]:
                deleted_dips += 1
            else:
                failed_dips += 1
        except:
            failed_dips += 1
    
    if failed_dips == 0:
        log_test("H2: Delete dip_readings", "PASS", 
                f"Deleted {deleted_dips} dip_readings")
        tests_passed += 1
    else:
        log_test("H2: Delete dip_readings", "FAIL", 
                f"Deleted {deleted_dips}, failed {failed_dips}")
    
    print(f"\n{BLUE}Test H: {tests_passed}/{tests_total} passed{RESET}")
    return tests_passed, tests_total

def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}PHASE 3 WIRING INTEGRATION TEST{RESET}")
    print(f"{BLUE}Testing POST /api/reports → dip_readings integration{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    total_passed = 0
    total_tests = 0
    
    # Run all test suites
    passed, total = test_a_happy_path()
    total_passed += passed
    total_tests += total
    
    passed, total = test_b_shift_hour_mapping()
    total_passed += passed
    total_tests += total
    
    passed, total = test_c_delivery_only()
    total_passed += passed
    total_tests += total
    
    passed, total = test_d_no_dip_fields()
    total_passed += passed
    total_tests += total
    
    passed, total = test_e_field_stripping()
    total_passed += passed
    total_tests += total
    
    passed, total = test_f_rbac_unchanged()
    total_passed += passed
    total_tests += total
    
    passed, total = test_g_edge_case()
    total_passed += passed
    total_tests += total
    
    passed, total = test_h_cleanup()
    total_passed += passed
    total_tests += total
    
    # Final summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}FINAL SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
    
    if total_passed == total_tests:
        print(f"{GREEN}✅ ALL TESTS PASSED: {total_passed}/{total_tests} ({success_rate:.1f}%){RESET}")
    else:
        print(f"{YELLOW}⚠️  SOME TESTS FAILED: {total_passed}/{total_tests} ({success_rate:.1f}%){RESET}")
        print(f"{YELLOW}Failed: {total_tests - total_passed} tests{RESET}")
    
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    # Exit with appropriate code
    sys.exit(0 if total_passed == total_tests else 1)

if __name__ == "__main__":
    main()
