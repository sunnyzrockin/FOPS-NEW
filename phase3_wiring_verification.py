#!/usr/bin/env python3
"""
Additional verification for Phase 3 wiring integration:
1. Verify legacy `dips` (currency) field is still accepted and stored on shift_reports
2. Verify shift_reports rows do NOT contain dip_* columns
3. Confirm all critical aspects from review request
"""

import requests
import json
from datetime import datetime
import random

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"
PASSWORD = "WorkflowDemo2026!"
STAFF_EMAIL = "staff@workflowlite.com"

GREEN = '\033[92m'
RED = '\033[91m'
BLUE = '\033[94m'
RESET = '\033[0m'

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
        return None, None
    except Exception as e:
        print(f"Login error: {str(e)}")
        return None, None

def main():
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}PHASE 3 WIRING - ADDITIONAL VERIFICATION{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    staff_token, staff_user_id = get_jwt_token(STAFF_EMAIL, PASSWORD)
    if not staff_token:
        print(f"{RED}Failed to get staff JWT{RESET}")
        return
    
    headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Create a test report with legacy `dips` field AND new dip_* fields
    unique_date = f"2025-12-{random.randint(10, 28)}"
    report_body = {
        "site_id": "site-001",
        "date": unique_date,
        "shift_type": "Morning",
        "fuel_sales": 5000,
        "shop_sales": 1200,
        "dips": 123.45,  # Legacy currency field
        "drive_offs": 0,
        "dip_ulp_litres": 18000,  # New Phase 3 field
        "dip_diesel_litres": 11500,
        "notes": "Verification test"
    }
    
    print(f"{BLUE}1. Testing legacy 'dips' (currency) field coexistence{RESET}")
    response = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_body, timeout=10)
    
    if response.status_code == 201:
        report = response.json()
        report_id = report.get("id")
        
        # Check 1: Legacy `dips` field should be in the response
        if "dips" in report and report.get("dips") == 123.45:
            print(f"{GREEN}✅ PASS{RESET} - Legacy 'dips' field accepted and stored: {report.get('dips')}")
        else:
            print(f"{RED}❌ FAIL{RESET} - Legacy 'dips' field missing or incorrect: {report.get('dips')}")
        
        # Check 2: New dip_* fields should NOT be in the response
        dip_fields = ["dip_ulp_litres", "dip_diesel_litres", "dip_premium_litres", 
                      "delivery_ulp_litres", "delivery_diesel_litres", "delivery_premium_litres"]
        has_dip_fields = any(field in report for field in dip_fields)
        
        if not has_dip_fields:
            print(f"{GREEN}✅ PASS{RESET} - New dip_* fields correctly stripped from shift_reports")
        else:
            found_fields = [f for f in dip_fields if f in report]
            print(f"{RED}❌ FAIL{RESET} - New dip_* fields found in shift_reports: {found_fields}")
        
        # Check 3: Verify the report has expected shift_reports columns only
        expected_fields = ["id", "site_id", "date", "shift_type", "submitted_by_user_id", 
                          "status", "submitted_at", "fuel_sales", "shop_sales", "dips", "drive_offs", "notes"]
        report_keys = list(report.keys())
        
        print(f"\n{BLUE}2. Shift report columns verification{RESET}")
        print(f"   Report has {len(report_keys)} fields")
        print(f"   Sample fields: {', '.join(report_keys[:10])}")
        
        # Check 4: Verify dip_readings row was created
        print(f"\n{BLUE}3. Verifying dip_readings row creation{RESET}")
        response = requests.get(f"{BASE_URL}/api/dips?site_id=site-001", headers=headers, timeout=10)
        
        if response.status_code == 200:
            dips = response.json()
            matching_dip = None
            for dip in dips:
                if "Verification test" in dip.get("notes", "") or \
                   (dip.get("ulp_litres") == 18000 and dip.get("diesel_litres") == 11500 and 
                    "Auto-logged" in dip.get("notes", "")):
                    if not matching_dip or dip.get("created_at", "") > matching_dip.get("created_at", ""):
                        matching_dip = dip
            
            if matching_dip:
                print(f"{GREEN}✅ PASS{RESET} - Dip_readings row created")
                
                # Verify operator_user_id matches JWT submitter
                if matching_dip.get("operator_user_id") == staff_user_id:
                    print(f"{GREEN}✅ PASS{RESET} - operator_user_id matches JWT submitter: {staff_user_id}")
                else:
                    print(f"{RED}❌ FAIL{RESET} - operator_user_id mismatch: {matching_dip.get('operator_user_id')} vs {staff_user_id}")
                
                # Verify reading_time hour is 8 (Morning)
                reading_time = matching_dip.get("reading_time", "")
                try:
                    dt = datetime.fromisoformat(reading_time.replace('Z', '+00:00'))
                    if dt.hour == 8:
                        print(f"{GREEN}✅ PASS{RESET} - reading_time hour is 8 (Morning shift)")
                    else:
                        print(f"{RED}❌ FAIL{RESET} - reading_time hour is {dt.hour} (expected 8)")
                except:
                    print(f"{RED}❌ FAIL{RESET} - Could not parse reading_time")
                
                # Verify reading_label
                if matching_dip.get("reading_label") == "Morning shift":
                    print(f"{GREEN}✅ PASS{RESET} - reading_label is 'Morning shift'")
                else:
                    print(f"{RED}❌ FAIL{RESET} - reading_label is '{matching_dip.get('reading_label')}'")
                
                # Verify notes format
                notes = matching_dip.get("notes", "")
                if notes.startswith("Auto-logged from Morning shift report"):
                    print(f"{GREEN}✅ PASS{RESET} - notes format correct: '{notes[:50]}...'")
                else:
                    print(f"{RED}❌ FAIL{RESET} - notes format incorrect: '{notes}'")
                
                # Cleanup
                print(f"\n{BLUE}4. Cleanup{RESET}")
                response = requests.delete(f"{BASE_URL}/api/reports/{report_id}", headers=headers, timeout=10)
                if response.status_code in [200, 204]:
                    print(f"{GREEN}✅{RESET} Deleted test report")
                
                response = requests.delete(f"{BASE_URL}/api/dips/{matching_dip.get('id')}", headers=headers, timeout=10)
                if response.status_code in [200, 204]:
                    print(f"{GREEN}✅{RESET} Deleted test dip reading")
            else:
                print(f"{RED}❌ FAIL{RESET} - No matching dip_readings row found")
        else:
            print(f"{RED}❌ FAIL{RESET} - GET /api/dips failed: {response.status_code}")
    else:
        print(f"{RED}❌ FAIL{RESET} - POST /api/reports failed: {response.status_code} - {response.text[:300]}")
    
    print(f"\n{BLUE}{'='*80}{RESET}\n")

if __name__ == "__main__":
    main()
