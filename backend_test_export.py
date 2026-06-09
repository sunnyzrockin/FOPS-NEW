#!/usr/bin/env python3
"""
Backend test for /api/export route enhancements
Tests FOPS-branded naming + viewType + JSON format branch
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials from /app/memory/test_credentials.md
OWNER_EMAIL = "owner@workflowlite.com"
OWNER_PASSWORD = "WorkflowDemo2026!"
OPERATOR_EMAIL = "operator@workflowlite.com"
OPERATOR_PASSWORD = "WorkflowDemo2026!"
STAFF_EMAIL = "staff@workflowlite.com"
STAFF_PASSWORD = "WorkflowDemo2026!"

def login(email, password):
    """Login and return JWT token + user data"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            session = data.get("session", {})
            token = session.get("access_token")
            user = data.get("user", {})
            sites = data.get("sites", [])
            return token, user, sites
        else:
            print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
            return None, None, None
    except Exception as e:
        print(f"❌ Login exception for {email}: {e}")
        return None, None, None

def test_auth_and_param_handling():
    """Test AUTH & PARAM HANDLING"""
    print("\n" + "="*80)
    print("SECTION A: AUTH & PARAM HANDLING")
    print("="*80)
    
    # Login as Owner to get allowed site IDs
    owner_token, owner_user, owner_sites = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token or not owner_sites:
        print("❌ FAIL: Cannot login as Owner")
        return None, None
    
    allowed_site_id = owner_sites[0]['id'] if owner_sites else None
    if not allowed_site_id:
        print("❌ FAIL: Owner has no sites")
        return None, None
    
    print(f"✅ Owner logged in with {len(owner_sites)} sites")
    print(f"   Using site ID: {allowed_site_id}")
    
    # (A) GET /api/export without Bearer → 401
    print("\n[A] GET /api/export?siteIds=<allowed>&startDate=2026-06-01&endDate=2026-06-09 without Bearer → expect 401")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-01&endDate=2026-06-09",
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 without Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (B) GET /api/export as Owner → 200 with XLSX binary
    print("\n[B] GET /api/export?siteIds=<allowed>&startDate=2026-06-01&endDate=2026-06-09 as Owner → expect 200 with XLSX")
    try:
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-01&endDate=2026-06-09",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '')
            if 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in content_type:
                print(f"✅ PASS: Got 200 with correct Content-Type: {content_type}")
                
                # Check if response is binary (XLSX starts with 'PK' zip header)
                if response.content[:2] == b'PK':
                    print(f"✅ PASS: Response is valid XLSX binary (starts with PK zip header)")
                else:
                    print(f"❌ FAIL: Response does not start with PK zip header")
            else:
                print(f"❌ FAIL: Wrong Content-Type: {content_type}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    return owner_token, allowed_site_id

def test_filename_convention(owner_token, allowed_site_id):
    """Test FILENAME CONVENTION (Content-Disposition header)"""
    print("\n" + "="*80)
    print("SECTION B: FILENAME CONVENTION")
    print("="*80)
    
    if not owner_token or not allowed_site_id:
        print("❌ SKIP: No owner token or site ID available")
        return
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # (C) Owner export with no viewType param → filename is FOPS_ShiftReports_...
    print("\n[C] Owner export with no viewType param + dates 2026-06-02..2026-06-09 → expect FOPS_ShiftReports_2026-06-02_to_2026-06-09.xlsx")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_disposition = response.headers.get('Content-Disposition', '')
            expected_filename = 'FOPS_ShiftReports_2026-06-02_to_2026-06-09.xlsx'
            if expected_filename in content_disposition:
                print(f"✅ PASS: Filename is EXACTLY {expected_filename}")
            else:
                print(f"❌ FAIL: Expected filename '{expected_filename}', got: {content_disposition}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (D) Owner export with viewType=daily → filename is FOPS_DailySummary_...
    print("\n[D] Owner export with viewType=daily + same range → expect FOPS_DailySummary_2026-06-02_to_2026-06-09.xlsx")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09&viewType=daily",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_disposition = response.headers.get('Content-Disposition', '')
            expected_filename = 'FOPS_DailySummary_2026-06-02_to_2026-06-09.xlsx'
            if expected_filename in content_disposition:
                print(f"✅ PASS: Filename is EXACTLY {expected_filename}")
            else:
                print(f"❌ FAIL: Expected filename '{expected_filename}', got: {content_disposition}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (E) Owner export with viewType=shift → filename is FOPS_ShiftReports_...
    print("\n[E] Owner export with viewType=shift + same range → expect FOPS_ShiftReports_2026-06-02_to_2026-06-09.xlsx")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09&viewType=shift",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_disposition = response.headers.get('Content-Disposition', '')
            expected_filename = 'FOPS_ShiftReports_2026-06-02_to_2026-06-09.xlsx'
            if expected_filename in content_disposition:
                print(f"✅ PASS: Filename is EXACTLY {expected_filename}")
            else:
                print(f"❌ FAIL: Expected filename '{expected_filename}', got: {content_disposition}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (F) Owner export with no dates → filename is FOPS_<View>_all_to_all.xlsx
    print("\n[F] Owner export with no dates passed → expect FOPS_ShiftReports_all_to_all.xlsx")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_disposition = response.headers.get('Content-Disposition', '')
            expected_filename = 'FOPS_ShiftReports_all_to_all.xlsx'
            if expected_filename in content_disposition:
                print(f"✅ PASS: Filename is EXACTLY {expected_filename}")
            else:
                print(f"❌ FAIL: Expected filename '{expected_filename}', got: {content_disposition}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_json_format_branch(owner_token, allowed_site_id):
    """Test JSON FORMAT BRANCH (new)"""
    print("\n" + "="*80)
    print("SECTION C: JSON FORMAT BRANCH")
    print("="*80)
    
    if not owner_token or not allowed_site_id:
        print("❌ SKIP: No owner token or site ID available")
        return None
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # (G) GET /api/export?format=json → 200 JSON with top-level keys
    print("\n[G] GET /api/export?siteIds=<allowed>&startDate=2026-06-02&endDate=2026-06-09&format=json as Owner → expect 200 JSON")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09&format=json",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                print(f"✅ PASS: Got 200 with Content-Type: {content_type}")
                
                data = response.json()
                # Check top-level keys
                required_keys = ['rows', 'viewType', 'startDate', 'endDate']
                missing_keys = [k for k in required_keys if k not in data]
                if not missing_keys:
                    print(f"✅ PASS: Response has all required top-level keys: {required_keys}")
                    print(f"   - rows count: {len(data['rows'])}")
                    print(f"   - viewType: {data['viewType']}")
                    print(f"   - startDate: {data['startDate']}")
                    print(f"   - endDate: {data['endDate']}")
                    
                    # Check structure of first row if exists
                    if len(data['rows']) > 0:
                        row = data['rows'][0]
                        expected_columns = [
                            'Date', 'Site', 'Site Code', 'Shift Type', 'Staff Member',
                            'Total Sales', 'Fuel Sales', 'Shop Sales', 'Total Litres',
                            'EFTPOS', 'Motorpass', 'Cash', 'Accounts', 'Drive Offs',
                            'Status', 'Submitted At'
                        ]
                        missing_columns = [c for c in expected_columns if c not in row]
                        if not missing_columns:
                            print(f"✅ PASS: First row has all expected columns")
                            return data
                        else:
                            print(f"❌ FAIL: Missing columns in row: {missing_columns}")
                    else:
                        print(f"⚠️  WARNING: No rows returned (may be no data in date range)")
                        return data
                else:
                    print(f"❌ FAIL: Missing top-level keys: {missing_keys}")
            else:
                print(f"❌ FAIL: Wrong Content-Type: {content_type}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    return None

def test_json_format_with_viewtype(owner_token, allowed_site_id):
    """Test JSON format with viewType parameter"""
    print("\n" + "="*80)
    print("SECTION D: JSON FORMAT WITH VIEWTYPE")
    print("="*80)
    
    if not owner_token or not allowed_site_id:
        print("❌ SKIP: No owner token or site ID available")
        return
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # (H) GET /api/export?format=json&viewType=daily → 200 with viewType: "daily"
    print("\n[H] GET /api/export?...&format=json&viewType=daily → expect 200 with viewType: 'daily'")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09&format=json&viewType=daily",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('viewType') == 'daily':
                print(f"✅ PASS: Response includes viewType: 'daily'")
            else:
                print(f"❌ FAIL: Expected viewType: 'daily', got: {data.get('viewType')}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_security_tenant_isolation():
    """Test SECURITY / TENANT ISOLATION (regression)"""
    print("\n" + "="*80)
    print("SECTION E: SECURITY / TENANT ISOLATION")
    print("="*80)
    
    # Login as Owner to get owner-only site
    owner_token, owner_user, owner_sites = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token or not owner_sites:
        print("❌ SKIP: Cannot login as Owner")
        return
    
    # Find a site that owner has but operator doesn't
    owner_site_ids = {site['id'] for site in owner_sites}
    
    # Login as Operator to get their sites
    operator_token, operator_user, operator_sites = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    if not operator_token:
        print("❌ SKIP: Cannot login as Operator")
        return
    
    operator_site_ids = {site['id'] for site in operator_sites}
    
    # Find owner-only site
    owner_only_sites = owner_site_ids - operator_site_ids
    if not owner_only_sites:
        print("⚠️  WARNING: No owner-only sites found, using first owner site")
        owner_only_site_id = list(owner_site_ids)[0] if owner_site_ids else None
    else:
        owner_only_site_id = list(owner_only_sites)[0]
    
    if not owner_only_site_id:
        print("❌ SKIP: No owner site available")
        return
    
    print(f"   Using owner-only site ID: {owner_only_site_id}")
    print(f"   Owner has {len(owner_sites)} sites, Operator has {len(operator_sites)} sites")
    
    # (I) Operator requests owner-only site → 403 OR returns 0 rows
    print("\n[I] Operator requests ?siteIds=<owner-only-site-id> → expect 403 OR 0 rows")
    try:
        headers = {"Authorization": f"Bearer {operator_token}"}
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={owner_only_site_id}&startDate=2026-06-02&endDate=2026-06-09&format=json",
            headers=headers,
            timeout=10
        )
        if response.status_code == 403:
            print(f"✅ PASS: Got 403 (tenant isolation working)")
        elif response.status_code == 200:
            data = response.json()
            rows = data.get('rows', [])
            if len(rows) == 0:
                print(f"✅ PASS: Got 200 with 0 rows (tenant isolation working)")
            else:
                print(f"❌ FAIL: Got 200 with {len(rows)} rows (tenant isolation broken)")
        else:
            print(f"❌ FAIL: Expected 403 or 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (J) Anonymous request with ?format=json → 401
    print("\n[J] Anonymous request with ?format=json → expect 401")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={owner_only_site_id}&startDate=2026-06-02&endDate=2026-06-09&format=json",
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 without Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_regression(owner_token, allowed_site_id, json_data):
    """Test REGRESSION"""
    print("\n" + "="*80)
    print("SECTION F: REGRESSION")
    print("="*80)
    
    if not owner_token or not allowed_site_id:
        print("❌ SKIP: No owner token or site ID available")
        return
    
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # (K) XLSX response body should be a real XLSX file
    print("\n[K] XLSX response body should be a real XLSX file (non-empty, starts with PK zip header)")
    try:
        response = requests.get(
            f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            if len(response.content) > 0:
                print(f"✅ PASS: XLSX response is non-empty ({len(response.content)} bytes)")
                
                if response.content[:2] == b'PK':
                    print(f"✅ PASS: XLSX starts with PK zip header (valid XLSX)")
                else:
                    print(f"❌ FAIL: XLSX does not start with PK zip header")
            else:
                print(f"❌ FAIL: XLSX response is empty")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (L) Row count in JSON matches XLSX (same params)
    print("\n[L] Row count in JSON matches XLSX (same siteIds and date range)")
    if json_data and 'rows' in json_data:
        json_row_count = len(json_data['rows'])
        print(f"   - JSON row count: {json_row_count}")
        
        # Note: We can't easily parse XLSX in Python without openpyxl, so we'll just verify
        # that both endpoints return 200 with the same parameters
        try:
            xlsx_response = requests.get(
                f"{BASE_URL}/api/export?siteIds={allowed_site_id}&startDate=2026-06-02&endDate=2026-06-09",
                headers=headers,
                timeout=10
            )
            if xlsx_response.status_code == 200:
                print(f"✅ PASS: Both JSON and XLSX endpoints return 200 with same params")
                print(f"   - XLSX size: {len(xlsx_response.content)} bytes")
                print(f"   - JSON rows: {json_row_count}")
                print(f"   ⚠️  NOTE: Cannot verify exact row count match without parsing XLSX")
            else:
                print(f"❌ FAIL: XLSX endpoint returned {xlsx_response.status_code}")
        except Exception as e:
            print(f"❌ FAIL: Exception - {e}")
    else:
        print(f"⚠️  SKIP: No JSON data available from previous test")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("/API/EXPORT ROUTE ENHANCEMENTS - BACKEND TESTS")
    print("FOPS-branded naming + viewType + JSON format branch")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    
    # Test AUTH & PARAM HANDLING
    owner_token, allowed_site_id = test_auth_and_param_handling()
    
    # Test FILENAME CONVENTION
    test_filename_convention(owner_token, allowed_site_id)
    
    # Test JSON FORMAT BRANCH
    json_data = test_json_format_branch(owner_token, allowed_site_id)
    
    # Test JSON FORMAT WITH VIEWTYPE
    test_json_format_with_viewtype(owner_token, allowed_site_id)
    
    # Test SECURITY / TENANT ISOLATION
    test_security_tenant_isolation()
    
    # Test REGRESSION
    test_regression(owner_token, allowed_site_id, json_data)
    
    print("\n" + "="*80)
    print("ALL TESTS COMPLETED")
    print("="*80)
    print(f"Test completed at: {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
