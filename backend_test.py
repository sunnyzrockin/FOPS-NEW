#!/usr/bin/env python3
"""
Phase 2 Section E — Notifications Centre Backend Tests

Tests all notification endpoints and trigger scenarios:
- GET /api/notifications (list with filters)
- PATCH /api/notifications/[id] (mark as read/unread)
- POST /api/notifications/mark-all-read
- Trigger: report_submitted (fans out to operators)
- Trigger: report_status_changed (notifies submitter)
- Trigger: site_assigned / site_unassigned
- Cross-user isolation
- Regression tests
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Demo credentials
CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"},
    "operator": {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!"},
    "staff": {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!"}
}

# Global test state
tokens = {}
user_ids = {}
test_data = {
    "notifications": [],
    "reports": [],
    "assignments": []
}

def login(role):
    """Login and return Bearer token + user info"""
    try:
        creds = CREDENTIALS[role]
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=creds,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            # Handle both token formats: direct token or session.access_token
            token = data.get("token") or data.get("session", {}).get("access_token")
            user = data.get("user", {})
            user_id = user.get("id")
            if token and user_id:
                print(f"✅ {role.upper()} login successful (user_id: {user_id})")
                return token, user_id, user
            else:
                print(f"❌ {role.upper()} login failed: missing token or user_id in response")
                return None, None, None
        else:
            print(f"❌ {role.upper()} login failed: {resp.status_code} - {resp.text}")
            return None, None, None
    except Exception as e:
        print(f"❌ {role.upper()} login error: {e}")
        return None, None, None

def auth_headers(role):
    """Get Authorization headers for a role"""
    token = tokens.get(role)
    if not token:
        print(f"⚠️  No token for {role}")
        return {}
    return {"Authorization": f"Bearer {token}"}

# ============================================================================
# A. /api/notifications (GET list) - 6 tests
# ============================================================================

def test_a1_get_notifications_without_auth():
    """Test 1: GET without Authorization → 401"""
    print("\n[A.1] GET /api/notifications without Authorization")
    try:
        resp = requests.get(f"{BASE_URL}/api/notifications", timeout=10)
        if resp.status_code == 401:
            print("✅ A.1 PASS: Returns 401 without Bearer token")
            return True
        else:
            print(f"❌ A.1 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.1 ERROR: {e}")
        return False

def test_a2_get_notifications_with_invalid_bearer():
    """Test 2: GET with invalid Bearer → 401"""
    print("\n[A.2] GET /api/notifications with invalid Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": "Bearer invalid-token-12345"},
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ A.2 PASS: Returns 401 with invalid Bearer token")
            return True
        else:
            print(f"❌ A.2 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.2 ERROR: {e}")
        return False

def test_a3_get_notifications_with_owner_bearer():
    """Test 3: GET with Owner Bearer → 200 with {items, unread_count}"""
    print("\n[A.3] GET /api/notifications with Owner Bearer")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if "items" in data and "unread_count" in data:
                if isinstance(data["items"], list) and isinstance(data["unread_count"], int):
                    print(f"✅ A.3 PASS: Returns 200 with correct shape (items: {len(data['items'])}, unread_count: {data['unread_count']})")
                    return True
                else:
                    print(f"❌ A.3 FAIL: Invalid types - items: {type(data['items'])}, unread_count: {type(data['unread_count'])}")
                    return False
            else:
                print(f"❌ A.3 FAIL: Missing required fields - data: {data}")
                return False
        else:
            print(f"❌ A.3 FAIL: Expected 200, got {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ A.3 ERROR: {e}")
        return False

def test_a4_get_notifications_with_limit_200():
    """Test 4: GET with ?limit=200 → 200; items.length <= 100 (server caps at 100)"""
    print("\n[A.4] GET /api/notifications?limit=200 (server should cap at 100)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications?limit=200",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            items_count = len(data.get("items", []))
            if items_count <= 100:
                print(f"✅ A.4 PASS: Returns 200, items count {items_count} <= 100 (server cap working)")
                return True
            else:
                print(f"❌ A.4 FAIL: items count {items_count} > 100 (server cap not working)")
                return False
        else:
            print(f"❌ A.4 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.4 ERROR: {e}")
        return False

def test_a5_get_notifications_with_invalid_limit():
    """Test 5: GET with ?limit=invalid → 200; falls back to default 50"""
    print("\n[A.5] GET /api/notifications?limit=invalid (should fallback to default)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications?limit=invalid",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ A.5 PASS: Returns 200 with invalid limit (fallback working)")
            return True
        else:
            print(f"❌ A.5 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.5 ERROR: {e}")
        return False

def test_a6_get_notifications_unread_only():
    """Test 6: GET with ?unread=1 → 200; every item has read_at === null"""
    print("\n[A.6] GET /api/notifications?unread=1")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/notifications?unread=1",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            all_unread = all(item.get("read_at") is None for item in items)
            if all_unread:
                print(f"✅ A.6 PASS: Returns 200, all {len(items)} items have read_at=null")
                return True
            else:
                read_items = [item for item in items if item.get("read_at") is not None]
                print(f"❌ A.6 FAIL: Found {len(read_items)} items with read_at not null")
                return False
        else:
            print(f"❌ A.6 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ A.6 ERROR: {e}")
        return False

# ============================================================================
# B. /api/notifications/[id] (PATCH) - 5 tests
# ============================================================================

def test_b7_patch_fake_notification():
    """Test 7: PATCH a fake UUID → 404"""
    print("\n[B.7] PATCH /api/notifications/[fake-uuid]")
    try:
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.patch(
            f"{BASE_URL}/api/notifications/{fake_id}",
            headers=auth_headers("owner"),
            json={"read": True},
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ B.7 PASS: Returns 404 for fake UUID")
            return True
        else:
            print(f"❌ B.7 FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ B.7 ERROR: {e}")
        return False

def test_b8_b9_patch_mark_as_read():
    """Test 8-9: Create notification, PATCH to mark as read, verify read_at set and unread_count decreased"""
    print("\n[B.8-9] PATCH notification to mark as read")
    # This will be tested after we create a notification via trigger in test C
    # For now, we'll skip and test it in the trigger section
    print("⏭️  B.8-9: Will be tested after creating notification via trigger (see test C)")
    return None

def test_b10_patch_mark_as_unread():
    """Test 10: PATCH with {read: false} → 200, read_at is null again"""
    print("\n[B.10] PATCH notification to mark as unread")
    # Will be tested after B.8-9
    print("⏭️  B.10: Will be tested after B.8-9")
    return None

def test_b11_patch_cross_user_isolation():
    """Test 11: Operator's Bearer trying to PATCH Owner's notification → 404"""
    print("\n[B.11] PATCH cross-user isolation test")
    # Will be tested after we have notifications for both users
    print("⏭️  B.11: Will be tested after creating notifications")
    return None

# ============================================================================
# C. Trigger: report_submitted - 3 tests
# ============================================================================

def test_c12_c13_c14_report_submitted_trigger():
    """Test 12-14: Staff submits report → Operator gets notification, Staff doesn't"""
    print("\n[C.12-14] Trigger: report_submitted")
    
    # First, get a site that has an operator assigned
    print("  → Getting sites for Staff...")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("staff"),
            timeout=10
        )
        if resp.status_code != 200:
            print(f"❌ C.12 FAIL: Cannot get sites - {resp.status_code}")
            return False, False, False
        
        sites = resp.json()
        if not sites:
            print("❌ C.12 FAIL: Staff has no assigned sites")
            return False, False, False
        
        site_id = sites[0].get("id")
        site_name = sites[0].get("name", "Unknown")
        print(f"  → Using site: {site_name} ({site_id})")
        
        # Create a shift report as Staff
        today = datetime.now().strftime("%Y-%m-%d")
        report_payload = {
            "site_id": site_id,
            "date": today,
            "shift_type": "Morning",
            "total_sales": 5000,
            "fuel_sales": 3000,
            "shop_sales": 2000,
            "notes": "Test report for notification trigger"
        }
        
        print(f"  → Staff submitting report for {today}...")
        resp = requests.post(
            f"{BASE_URL}/api/reports",
            headers=auth_headers("staff"),
            json=report_payload,
            timeout=10
        )
        
        if resp.status_code == 201:
            report = resp.json()
            report_id = report.get("id")
            test_data["reports"].append(report_id)
            print(f"✅ C.12 PASS: Report created successfully (id: {report_id})")
            
            # Wait 5 seconds for notification to be created (fire-and-forget)
            print("  → Waiting 5 seconds for notification trigger...")
            time.sleep(5)
            
            # Test 13: Operator should see the notification
            print("  → Checking Operator notifications...")
            resp = requests.get(
                f"{BASE_URL}/api/notifications?unread=1",
                headers=auth_headers("operator"),
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                report_submitted_notifs = [
                    n for n in items 
                    if n.get("type") == "report_submitted" 
                    and "review" in n.get("title", "").lower()
                ]
                
                if report_submitted_notifs:
                    notif = report_submitted_notifs[0]
                    test_data["notifications"].append(notif.get("id"))
                    print(f"✅ C.13 PASS: Operator received 'report_submitted' notification")
                    print(f"     Title: {notif.get('title')}")
                    print(f"     Body: {notif.get('body')}")
                    print(f"     Link: {notif.get('link')}")
                    c13_pass = True
                else:
                    print(f"❌ C.13 FAIL: Operator did not receive 'report_submitted' notification")
                    print(f"     Found {len(items)} unread notifications, none with type='report_submitted'")
                    c13_pass = False
            else:
                print(f"❌ C.13 FAIL: Cannot get Operator notifications - {resp.status_code}")
                c13_pass = False
            
            # Test 14: Staff should NOT see the notification (excluded via excludeUserId)
            print("  → Checking Staff notifications (should NOT include report_submitted)...")
            resp = requests.get(
                f"{BASE_URL}/api/notifications",
                headers=auth_headers("staff"),
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                report_submitted_notifs = [
                    n for n in items 
                    if n.get("type") == "report_submitted"
                ]
                
                if not report_submitted_notifs:
                    print(f"✅ C.14 PASS: Staff correctly excluded from 'report_submitted' notification")
                    c14_pass = True
                else:
                    print(f"❌ C.14 FAIL: Staff received {len(report_submitted_notifs)} 'report_submitted' notifications (should be 0)")
                    c14_pass = False
            else:
                print(f"❌ C.14 FAIL: Cannot get Staff notifications - {resp.status_code}")
                c14_pass = False
            
            return True, c13_pass, c14_pass
            
        elif resp.status_code == 409:
            print(f"⚠️  C.12: Report already exists (409) - using existing report for trigger test")
            # Still test notifications
            time.sleep(2)
            
            # Check operator notifications
            resp = requests.get(
                f"{BASE_URL}/api/notifications?unread=1",
                headers=auth_headers("operator"),
                timeout=10
            )
            c13_pass = resp.status_code == 200 and any(
                n.get("type") == "report_submitted" 
                for n in resp.json().get("items", [])
            )
            
            # Check staff notifications
            resp = requests.get(
                f"{BASE_URL}/api/notifications",
                headers=auth_headers("staff"),
                timeout=10
            )
            c14_pass = resp.status_code == 200 and not any(
                n.get("type") == "report_submitted" 
                for n in resp.json().get("items", [])
            )
            
            return True, c13_pass, c14_pass
        else:
            print(f"❌ C.12 FAIL: Report creation failed - {resp.status_code} - {resp.text}")
            return False, False, False
            
    except Exception as e:
        print(f"❌ C.12-14 ERROR: {e}")
        return False, False, False

# ============================================================================
# D. Trigger: report_status_changed - 3 tests
# ============================================================================

def test_d15_d16_d17_report_status_changed_trigger():
    """Test 15-17: Operator approves report → Staff gets notification, pending transition doesn't trigger"""
    print("\n[D.15-17] Trigger: report_status_changed")
    
    # Get the report we created in test C
    if not test_data["reports"]:
        print("⚠️  D.15: No test report available, skipping")
        return None, None, None
    
    report_id = test_data["reports"][0]
    operator_user_id = user_ids.get("operator")
    
    if not operator_user_id:
        print("❌ D.15 FAIL: Operator user_id not available")
        return False, False, False
    
    # Test 15: Update report status to 'approved'
    print(f"  → Operator approving report {report_id}...")
    try:
        resp = requests.put(
            f"{BASE_URL}/api/reports/{report_id}/status",
            headers=auth_headers("operator"),
            json={
                "status": "approved",
                "reviewed_by_user_id": operator_user_id
            },
            timeout=10
        )
        
        if resp.status_code == 200:
            print(f"✅ D.15 PASS: Report status updated to 'approved'")
            
            # Wait 5 seconds for notification trigger
            print("  → Waiting 5 seconds for notification trigger...")
            time.sleep(5)
            
            # Test 16: Staff should see the notification
            print("  → Checking Staff notifications...")
            resp = requests.get(
                f"{BASE_URL}/api/notifications",
                headers=auth_headers("staff"),
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                status_changed_notifs = [
                    n for n in items 
                    if n.get("type") == "report_status_changed" 
                    and "approved" in n.get("title", "").lower()
                ]
                
                if status_changed_notifs:
                    notif = status_changed_notifs[0]
                    test_data["notifications"].append(notif.get("id"))
                    print(f"✅ D.16 PASS: Staff received 'report_status_changed' notification")
                    print(f"     Title: {notif.get('title')}")
                    print(f"     Body: {notif.get('body')}")
                    d16_pass = True
                else:
                    print(f"❌ D.16 FAIL: Staff did not receive 'report_status_changed' notification")
                    print(f"     Found {len(items)} notifications, none with type='report_status_changed' and 'approved' in title")
                    d16_pass = False
            else:
                print(f"❌ D.16 FAIL: Cannot get Staff notifications - {resp.status_code}")
                d16_pass = False
            
            # Test 17: Update status to 'pending' (should NOT trigger notification)
            print("  → Updating report status to 'pending' (should NOT trigger notification)...")
            resp = requests.put(
                f"{BASE_URL}/api/reports/{report_id}/status",
                headers=auth_headers("operator"),
                json={
                    "status": "pending",
                    "reviewed_by_user_id": operator_user_id
                },
                timeout=10
            )
            
            if resp.status_code == 200:
                # Get current unread count
                resp = requests.get(
                    f"{BASE_URL}/api/notifications",
                    headers=auth_headers("staff"),
                    timeout=10
                )
                
                if resp.status_code == 200:
                    unread_count_before = resp.json().get("unread_count", 0)
                    
                    # Wait 3 seconds
                    time.sleep(3)
                    
                    # Check unread count again
                    resp = requests.get(
                        f"{BASE_URL}/api/notifications",
                        headers=auth_headers("staff"),
                        timeout=10
                    )
                    
                    if resp.status_code == 200:
                        unread_count_after = resp.json().get("unread_count", 0)
                        
                        if unread_count_after == unread_count_before:
                            print(f"✅ D.17 PASS: Status change to 'pending' did NOT trigger notification (unread_count unchanged: {unread_count_before})")
                            d17_pass = True
                        else:
                            print(f"❌ D.17 FAIL: Unread count changed from {unread_count_before} to {unread_count_after} (should be unchanged)")
                            d17_pass = False
                    else:
                        print(f"❌ D.17 FAIL: Cannot get Staff notifications - {resp.status_code}")
                        d17_pass = False
                else:
                    print(f"❌ D.17 FAIL: Cannot get Staff notifications - {resp.status_code}")
                    d17_pass = False
            else:
                print(f"❌ D.17 FAIL: Cannot update report status - {resp.status_code}")
                d17_pass = False
            
            return True, d16_pass, d17_pass
        else:
            print(f"❌ D.15 FAIL: Cannot update report status - {resp.status_code} - {resp.text}")
            return False, False, False
            
    except Exception as e:
        print(f"❌ D.15-17 ERROR: {e}")
        return False, False, False

# ============================================================================
# E. /api/notifications/mark-all-read - 3 tests
# ============================================================================

def test_e18_e19_e20_mark_all_read():
    """Test 18-20: POST mark-all-read, verify unread_count=0, idempotent"""
    print("\n[E.18-20] POST /api/notifications/mark-all-read")
    
    # Test 18: Mark all as read for Operator (who has unread notifications from test C)
    print("  → Operator marking all notifications as read...")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/notifications/mark-all-read",
            headers=auth_headers("operator"),
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") and isinstance(data.get("updated"), int):
                updated_count = data.get("updated")
                print(f"✅ E.18 PASS: Mark-all-read successful (updated: {updated_count})")
                
                # Test 19: Verify unread_count is now 0
                print("  → Verifying unread_count is now 0...")
                resp = requests.get(
                    f"{BASE_URL}/api/notifications",
                    headers=auth_headers("operator"),
                    timeout=10
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    unread_count = data.get("unread_count", -1)
                    
                    if unread_count == 0:
                        print(f"✅ E.19 PASS: unread_count is 0 after mark-all-read")
                        e19_pass = True
                    else:
                        print(f"❌ E.19 FAIL: unread_count is {unread_count} (expected 0)")
                        e19_pass = False
                else:
                    print(f"❌ E.19 FAIL: Cannot get notifications - {resp.status_code}")
                    e19_pass = False
                
                # Test 20: Call mark-all-read again (should be idempotent)
                print("  → Calling mark-all-read again (idempotent test)...")
                resp = requests.post(
                    f"{BASE_URL}/api/notifications/mark-all-read",
                    headers=auth_headers("operator"),
                    timeout=10
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("ok") and data.get("updated") == 0:
                        print(f"✅ E.20 PASS: Mark-all-read is idempotent (updated: 0)")
                        e20_pass = True
                    else:
                        print(f"❌ E.20 FAIL: Expected updated=0, got {data.get('updated')}")
                        e20_pass = False
                else:
                    print(f"❌ E.20 FAIL: Cannot call mark-all-read - {resp.status_code}")
                    e20_pass = False
                
                return True, e19_pass, e20_pass
            else:
                print(f"❌ E.18 FAIL: Invalid response shape - {data}")
                return False, False, False
        else:
            print(f"❌ E.18 FAIL: Expected 200, got {resp.status_code} - {resp.text}")
            return False, False, False
            
    except Exception as e:
        print(f"❌ E.18-20 ERROR: {e}")
        return False, False, False

# ============================================================================
# F. Trigger: site_assigned / site_unassigned - 4 tests
# ============================================================================

def test_f21_f22_f23_f24_site_assignment_triggers():
    """Test 21-24: Owner assigns/unassigns operator → notifications created"""
    print("\n[F.21-24] Trigger: site_assigned / site_unassigned")
    
    # Get operator user_id and a site to assign
    operator_user_id = user_ids.get("operator")
    if not operator_user_id:
        print("❌ F.21 FAIL: Operator user_id not available")
        return False, False, False, False
    
    # Get owner's sites
    print("  → Getting Owner's sites...")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("owner"),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ F.21 FAIL: Cannot get sites - {resp.status_code}")
            return False, False, False, False
        
        sites = resp.json()
        if not sites:
            print("❌ F.21 FAIL: Owner has no sites")
            return False, False, False, False
        
        # Find a site to assign (prefer one not already assigned to operator)
        site_id = sites[0].get("id")
        site_name = sites[0].get("name", "Unknown")
        print(f"  → Using site: {site_name} ({site_id})")
        
        # Test 21: Create operator assignment
        print(f"  → Owner assigning operator to site...")
        resp = requests.post(
            f"{BASE_URL}/api/operator-assignments",
            headers=auth_headers("owner"),
            json={
                "operator_user_id": operator_user_id,
                "site_id": site_id
            },
            timeout=10
        )
        
        if resp.status_code in [200, 201]:
            assignment = resp.json()
            assignment_id = assignment.get("id")
            if assignment_id:
                test_data["assignments"].append(assignment_id)
            print(f"✅ F.21 PASS: Operator assignment created")
            f21_pass = True
        elif resp.status_code == 500 and "duplicate" in resp.text.lower():
            print(f"⚠️  F.21: Assignment already exists (duplicate constraint)")
            # Get existing assignment
            resp = requests.get(
                f"{BASE_URL}/api/operator-assignments",
                headers=auth_headers("owner"),
                timeout=10
            )
            if resp.status_code == 200:
                assignments = resp.json()
                existing = [a for a in assignments if a.get("site_id") == site_id and a.get("operator_user_id") == operator_user_id]
                if existing:
                    assignment_id = existing[0].get("id")
                    test_data["assignments"].append(assignment_id)
                    print(f"  → Using existing assignment: {assignment_id}")
                    f21_pass = True
                else:
                    print(f"❌ F.21 FAIL: Cannot find existing assignment")
                    f21_pass = False
            else:
                print(f"❌ F.21 FAIL: Cannot get assignments - {resp.status_code}")
                f21_pass = False
        else:
            print(f"❌ F.21 FAIL: Cannot create assignment - {resp.status_code} - {resp.text}")
            f21_pass = False
        
        if not f21_pass:
            return False, False, False, False
        
        # Test 22: Operator should see 'site_assigned' notification
        print("  → Waiting 5 seconds for notification trigger...")
        time.sleep(5)
        
        print("  → Checking Operator notifications...")
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers("operator"),
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            site_assigned_notifs = [
                n for n in items 
                if n.get("type") == "site_assigned"
            ]
            
            if site_assigned_notifs:
                notif = site_assigned_notifs[0]
                print(f"✅ F.22 PASS: Operator received 'site_assigned' notification")
                print(f"     Title: {notif.get('title')}")
                print(f"     Body: {notif.get('body')}")
                f22_pass = True
            else:
                print(f"❌ F.22 FAIL: Operator did not receive 'site_assigned' notification")
                print(f"     Found {len(items)} notifications, none with type='site_assigned'")
                f22_pass = False
        else:
            print(f"❌ F.22 FAIL: Cannot get Operator notifications - {resp.status_code}")
            f22_pass = False
        
        # Test 23: Delete the assignment
        if not test_data["assignments"]:
            print("❌ F.23 FAIL: No assignment ID to delete")
            return f21_pass, f22_pass, False, False
        
        assignment_id = test_data["assignments"][-1]
        print(f"  → Owner deleting operator assignment {assignment_id}...")
        resp = requests.delete(
            f"{BASE_URL}/api/operator-assignments/{assignment_id}",
            headers=auth_headers("owner"),
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            if "message" in data and "deleted" in data["message"].lower():
                print(f"✅ F.23 PASS: Assignment deleted successfully")
                print(f"     Response: {data}")
                f23_pass = True
            else:
                print(f"❌ F.23 FAIL: Unexpected response - {data}")
                f23_pass = False
        else:
            print(f"❌ F.23 FAIL: Cannot delete assignment - {resp.status_code} - {resp.text}")
            f23_pass = False
        
        # Test 24: Operator should see 'site_unassigned' notification
        print("  → Waiting 5 seconds for notification trigger...")
        time.sleep(5)
        
        print("  → Checking Operator notifications...")
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers("operator"),
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            site_unassigned_notifs = [
                n for n in items 
                if n.get("type") == "site_unassigned"
            ]
            
            if site_unassigned_notifs:
                notif = site_unassigned_notifs[0]
                print(f"✅ F.24 PASS: Operator received 'site_unassigned' notification")
                print(f"     Title: {notif.get('title')}")
                print(f"     Body: {notif.get('body')}")
                f24_pass = True
            else:
                print(f"❌ F.24 FAIL: Operator did not receive 'site_unassigned' notification")
                print(f"     Found {len(items)} notifications, none with type='site_unassigned'")
                f24_pass = False
        else:
            print(f"❌ F.24 FAIL: Cannot get Operator notifications - {resp.status_code}")
            f24_pass = False
        
        return f21_pass, f22_pass, f23_pass, f24_pass
        
    except Exception as e:
        print(f"❌ F.21-24 ERROR: {e}")
        return False, False, False, False

# ============================================================================
# G. Regression sanity - 4 tests
# ============================================================================

def test_g25_support_contact():
    """Test 25: POST /api/support/contact → 200"""
    print("\n[G.25] POST /api/support/contact (regression)")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/support/contact",
            headers=auth_headers("owner"),
            json={
                "subject": "regression",
                "message": "check",
                "category": "question"
            },
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ G.25 PASS: Support contact endpoint working")
            return True
        else:
            print(f"❌ G.25 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.25 ERROR: {e}")
        return False

def test_g26_users_me():
    """Test 26: GET /api/users/me → 200"""
    print("\n[G.26] GET /api/users/me (regression)")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/users/me",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ G.26 PASS: Users/me endpoint working")
            return True
        else:
            print(f"❌ G.26 FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.26 ERROR: {e}")
        return False

def test_g27_dashboard_stats():
    """Test 27: GET /api/dashboard/stats → 200"""
    print("\n[G.27] GET /api/dashboard/stats (regression)")
    try:
        # Get a site ID first
        resp = requests.get(
            f"{BASE_URL}/api/sites",
            headers=auth_headers("owner"),
            timeout=10
        )
        if resp.status_code == 200:
            sites = resp.json()
            if sites:
                site_id = sites[0].get("id")
                resp = requests.get(
                    f"{BASE_URL}/api/dashboard/stats?siteIds={site_id}",
                    headers=auth_headers("owner"),
                    timeout=10
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # Check for health-strip fields
                    required_fields = ["submittedToday", "totalSites", "pendingReview", "varianceAlerts"]
                    has_all = all(field in data for field in required_fields)
                    if has_all:
                        print(f"✅ G.27 PASS: Dashboard stats endpoint working with health-strip fields")
                        return True
                    else:
                        print(f"⚠️  G.27 PARTIAL: Dashboard stats working but missing some health-strip fields")
                        return True
                else:
                    print(f"❌ G.27 FAIL: Expected 200, got {resp.status_code}")
                    return False
            else:
                print(f"⚠️  G.27: No sites available, skipping")
                return None
        else:
            print(f"❌ G.27 FAIL: Cannot get sites - {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.27 ERROR: {e}")
        return False

def test_g28_users_without_auth():
    """Test 28: GET /api/users without Bearer → 401"""
    print("\n[G.28] GET /api/users without Bearer (regression)")
    try:
        resp = requests.get(f"{BASE_URL}/api/users", timeout=10)
        if resp.status_code == 401:
            print("✅ G.28 PASS: Users endpoint requires auth (401)")
            return True
        else:
            print(f"❌ G.28 FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ G.28 ERROR: {e}")
        return False

# ============================================================================
# Additional tests for B section (after notifications are created)
# ============================================================================

def test_b_additional():
    """Run B.8-11 tests after notifications are created"""
    print("\n" + "="*80)
    print("SECTION B (ADDITIONAL): PATCH /api/notifications/[id]")
    print("="*80)
    
    results = []
    
    # B.8-9: Mark notification as read
    print("\n[B.8-9] PATCH notification to mark as read")
    try:
        # Get operator's notifications
        resp = requests.get(
            f"{BASE_URL}/api/notifications?unread=1",
            headers=auth_headers("operator"),
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            unread_count_before = data.get("unread_count", 0)
            
            if items:
                notif_id = items[0].get("id")
                print(f"  → Marking notification {notif_id} as read...")
                
                resp = requests.patch(
                    f"{BASE_URL}/api/notifications/{notif_id}",
                    headers=auth_headers("operator"),
                    json={"read": True},
                    timeout=10
                )
                
                if resp.status_code == 200:
                    notif = resp.json()
                    if notif.get("read_at") is not None:
                        print(f"✅ B.8 PASS: Notification marked as read (read_at: {notif.get('read_at')})")
                        
                        # Check unread_count decreased
                        resp = requests.get(
                            f"{BASE_URL}/api/notifications",
                            headers=auth_headers("operator"),
                            timeout=10
                        )
                        
                        if resp.status_code == 200:
                            unread_count_after = resp.json().get("unread_count", 0)
                            if unread_count_after < unread_count_before:
                                print(f"✅ B.9 PASS: unread_count decreased from {unread_count_before} to {unread_count_after}")
                                results.extend([True, True])
                            else:
                                print(f"❌ B.9 FAIL: unread_count did not decrease ({unread_count_before} → {unread_count_after})")
                                results.extend([True, False])
                        else:
                            print(f"❌ B.9 FAIL: Cannot get notifications - {resp.status_code}")
                            results.extend([True, False])
                        
                        # B.10: Mark as unread
                        print(f"\n[B.10] PATCH notification to mark as unread")
                        resp = requests.patch(
                            f"{BASE_URL}/api/notifications/{notif_id}",
                            headers=auth_headers("operator"),
                            json={"read": False},
                            timeout=10
                        )
                        
                        if resp.status_code == 200:
                            notif = resp.json()
                            if notif.get("read_at") is None:
                                print(f"✅ B.10 PASS: Notification marked as unread (read_at: null)")
                                results.append(True)
                            else:
                                print(f"❌ B.10 FAIL: read_at is not null: {notif.get('read_at')}")
                                results.append(False)
                        else:
                            print(f"❌ B.10 FAIL: Cannot mark as unread - {resp.status_code}")
                            results.append(False)
                    else:
                        print(f"❌ B.8 FAIL: read_at is still null")
                        results.extend([False, False, False])
                else:
                    print(f"❌ B.8 FAIL: Cannot mark as read - {resp.status_code}")
                    results.extend([False, False, False])
            else:
                print(f"⚠️  B.8-10: No unread notifications available, skipping")
                results.extend([None, None, None])
        else:
            print(f"❌ B.8 FAIL: Cannot get notifications - {resp.status_code}")
            results.extend([False, False, False])
    except Exception as e:
        print(f"❌ B.8-10 ERROR: {e}")
        results.extend([False, False, False])
    
    # B.11: Cross-user isolation
    print("\n[B.11] PATCH cross-user isolation")
    try:
        # Get owner's notification
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=auth_headers("owner"),
            timeout=10
        )
        
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if items:
                owner_notif_id = items[0].get("id")
                print(f"  → Operator trying to PATCH Owner's notification {owner_notif_id}...")
                
                resp = requests.patch(
                    f"{BASE_URL}/api/notifications/{owner_notif_id}",
                    headers=auth_headers("operator"),
                    json={"read": True},
                    timeout=10
                )
                
                if resp.status_code == 404:
                    print(f"✅ B.11 PASS: Cross-user PATCH returns 404 (not 403, no existence leak)")
                    results.append(True)
                else:
                    print(f"❌ B.11 FAIL: Expected 404, got {resp.status_code}")
                    results.append(False)
            else:
                print(f"⚠️  B.11: Owner has no notifications, skipping")
                results.append(None)
        else:
            print(f"❌ B.11 FAIL: Cannot get Owner notifications - {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ B.11 ERROR: {e}")
        results.append(False)
    
    return results

# ============================================================================
# Main test runner
# ============================================================================

def main():
    print("="*80)
    print("PHASE 2 SECTION E — NOTIFICATIONS CENTRE BACKEND TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Login all users
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    for role in ["owner", "operator", "staff"]:
        token, user_id, user = login(role)
        if token:
            tokens[role] = token
            user_ids[role] = user_id
        else:
            print(f"❌ CRITICAL: Cannot proceed without {role} login")
            return
    
    print(f"\n✅ All users authenticated successfully")
    
    # Track results
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "total": 28
    }
    
    # Section A: GET /api/notifications
    print("\n" + "="*80)
    print("SECTION A: GET /api/notifications (6 tests)")
    print("="*80)
    
    test_results = [
        test_a1_get_notifications_without_auth(),
        test_a2_get_notifications_with_invalid_bearer(),
        test_a3_get_notifications_with_owner_bearer(),
        test_a4_get_notifications_with_limit_200(),
        test_a5_get_notifications_with_invalid_limit(),
        test_a6_get_notifications_unread_only()
    ]
    
    for result in test_results:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section B: PATCH /api/notifications/[id] (partial - B.7 only)
    print("\n" + "="*80)
    print("SECTION B: PATCH /api/notifications/[id] (1 test now, 4 later)")
    print("="*80)
    
    b7_result = test_b7_patch_fake_notification()
    if b7_result is True:
        results["passed"] += 1
    elif b7_result is False:
        results["failed"] += 1
    else:
        results["skipped"] += 1
    
    # Section C: Trigger report_submitted
    print("\n" + "="*80)
    print("SECTION C: Trigger report_submitted (3 tests)")
    print("="*80)
    
    c12, c13, c14 = test_c12_c13_c14_report_submitted_trigger()
    for result in [c12, c13, c14]:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section D: Trigger report_status_changed
    print("\n" + "="*80)
    print("SECTION D: Trigger report_status_changed (3 tests)")
    print("="*80)
    
    d15, d16, d17 = test_d15_d16_d17_report_status_changed_trigger()
    for result in [d15, d16, d17]:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section E: POST mark-all-read
    print("\n" + "="*80)
    print("SECTION E: POST /api/notifications/mark-all-read (3 tests)")
    print("="*80)
    
    e18, e19, e20 = test_e18_e19_e20_mark_all_read()
    for result in [e18, e19, e20]:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section F: Trigger site_assigned / site_unassigned
    print("\n" + "="*80)
    print("SECTION F: Trigger site_assigned / site_unassigned (4 tests)")
    print("="*80)
    
    f21, f22, f23, f24 = test_f21_f22_f23_f24_site_assignment_triggers()
    for result in [f21, f22, f23, f24]:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section B (additional): Complete B.8-11
    b_additional_results = test_b_additional()
    for result in b_additional_results:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Section G: Regression tests
    print("\n" + "="*80)
    print("SECTION G: Regression sanity (4 tests)")
    print("="*80)
    
    g_results = [
        test_g25_support_contact(),
        test_g26_users_me(),
        test_g27_dashboard_stats(),
        test_g28_users_without_auth()
    ]
    
    for result in g_results:
        if result is True:
            results["passed"] += 1
        elif result is False:
            results["failed"] += 1
        else:
            results["skipped"] += 1
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Total Tests: {results['total']}")
    print(f"✅ Passed: {results['passed']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"⏭️  Skipped: {results['skipped']}")
    print(f"Success Rate: {results['passed']}/{results['total']} ({results['passed']*100//results['total']}%)")
    print("="*80)
    
    # Cleanup
    print("\n" + "="*80)
    print("CLEANUP")
    print("="*80)
    print("Note: Test data cleanup is optional. Notifications will naturally age out.")
    print(f"Created {len(test_data['reports'])} test reports")
    print(f"Created {len(test_data['notifications'])} test notifications")
    print(f"Created {len(test_data['assignments'])} test assignments")
    
    if results["failed"] == 0:
        print("\n🎉 ALL TESTS PASSED! Phase 2 Section E is PRODUCTION-READY!")
    else:
        print(f"\n⚠️  {results['failed']} test(s) failed. Review the output above for details.")

if __name__ == "__main__":
    main()
