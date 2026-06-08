#!/usr/bin/env python3
"""
Backend test for Notifications API Canonical Contract Migration
Tests the rewritten /api/notifications route (GET/PATCH/POST)
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

# Test credentials
OPERATOR_EMAIL = "operator@workflowlite.com"
OPERATOR_PASSWORD = "WorkflowDemo2026!"
OPERATOR2_EMAIL = "operator2@workflowlite.com"
OPERATOR2_PASSWORD = "WorkflowDemo2026!"
STAFF_EMAIL = "staff@workflowlite.com"
STAFF_PASSWORD = "WorkflowDemo2026!"

def login(email, password):
    """Login and return JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            # Token is in session.access_token
            session = data.get("session", {})
            return session.get("access_token")
        else:
            print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {email}: {e}")
        return None

def test_shape_get():
    """Test SHAPE / GET scenarios"""
    print("\n" + "="*80)
    print("SECTION A: SHAPE / GET TESTS")
    print("="*80)
    
    # (A) GET without Bearer → 401
    print("\n[A] GET /api/notifications without Bearer → expect 401")
    try:
        response = requests.get(f"{BASE_URL}/api/notifications", timeout=10)
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 without Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (B) GET with bogus Bearer → 401
    print("\n[B] GET /api/notifications with bogus Bearer → expect 401")
    try:
        headers = {"Authorization": "Bearer bogus-token-12345"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers, timeout=10)
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 with bogus Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # Login as Operator for remaining tests
    operator_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    if not operator_token:
        print("❌ FAIL: Cannot login as Operator, skipping remaining GET tests")
        return None
    
    # (C) GET ?limit=50 as Operator → 200 with correct shape
    print("\n[C] GET /api/notifications?limit=50 as Operator → expect 200 with correct shape")
    try:
        headers = {"Authorization": f"Bearer {operator_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications?limit=50", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Check top-level keys
            if "notifications" in data and "unreadCount" in data:
                print(f"✅ PASS: Got 200 with correct top-level keys: notifications (array), unreadCount (number)")
                print(f"   - notifications count: {len(data['notifications'])}")
                print(f"   - unreadCount: {data['unreadCount']}")
                
                # Check structure of first notification if exists
                if len(data['notifications']) > 0:
                    notif = data['notifications'][0]
                    required_fields = ['id', 'user_id', 'type', 'title', 'body', 'link', 'read_at', 'created_at']
                    missing_fields = [f for f in required_fields if f not in notif]
                    if not missing_fields:
                        print(f"✅ PASS: First notification has all required fields")
                        return data  # Return data for use in other tests
                    else:
                        print(f"❌ FAIL: Missing fields in notification: {missing_fields}")
                else:
                    print(f"⚠️  WARNING: No notifications found for operator")
                    return data
            else:
                print(f"❌ FAIL: Missing top-level keys. Got: {list(data.keys())}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    return None

def test_get_filters(operator_token):
    """Test GET filter scenarios"""
    print("\n" + "="*80)
    print("SECTION B: GET FILTER TESTS")
    print("="*80)
    
    if not operator_token:
        print("❌ SKIP: No operator token available")
        return
    
    headers = {"Authorization": f"Bearer {operator_token}"}
    
    # (D) GET ?unread=1 → all returned rows have read_at === null
    print("\n[D] GET /api/notifications?unread=1 → expect all rows have read_at === null")
    try:
        response = requests.get(f"{BASE_URL}/api/notifications?unread=1", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            unread_count = data.get('unreadCount', 0)
            
            if len(notifications) > 0:
                all_unread = all(n.get('read_at') is None for n in notifications)
                if all_unread:
                    print(f"✅ PASS: All {len(notifications)} returned notifications have read_at === null")
                    print(f"   - Total unreadCount: {unread_count}")
                else:
                    read_notifications = [n for n in notifications if n.get('read_at') is not None]
                    print(f"❌ FAIL: Found {len(read_notifications)} notifications with read_at not null")
            else:
                print(f"⚠️  WARNING: No unread notifications found (unreadCount: {unread_count})")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (E) GET ?limit=200 → capped at 100
    print("\n[E] GET /api/notifications?limit=200 → expect limit capped at 100")
    try:
        response = requests.get(f"{BASE_URL}/api/notifications?limit=200", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            if len(notifications) <= 100:
                print(f"✅ PASS: Returned {len(notifications)} notifications (≤ 100, limit capped)")
            else:
                print(f"❌ FAIL: Returned {len(notifications)} notifications (> 100, limit not capped)")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_patch_mark_one_read(operator_token, operator_data):
    """Test PATCH (mark one read) scenarios"""
    print("\n" + "="*80)
    print("SECTION C: PATCH (MARK ONE READ) TESTS")
    print("="*80)
    
    # (F) PATCH without Bearer → 401
    print("\n[F] PATCH /api/notifications without Bearer → expect 401")
    try:
        response = requests.patch(
            f"{BASE_URL}/api/notifications",
            json={"id": "test-id"},
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 without Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    if not operator_token:
        print("❌ SKIP: No operator token available for remaining PATCH tests")
        return None
    
    headers = {"Authorization": f"Bearer {operator_token}"}
    
    # (G) PATCH with body {} (missing id) → 400
    print("\n[G] PATCH /api/notifications with body {} (missing id) → expect 400")
    try:
        response = requests.patch(
            f"{BASE_URL}/api/notifications",
            json={},
            headers=headers,
            timeout=10
        )
        if response.status_code == 400:
            data = response.json()
            print(f"✅ PASS: Got 400 with error message: {data.get('error')}")
        else:
            print(f"❌ FAIL: Expected 400, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # Find an unread notification for operator
    own_notification_id = None
    if operator_data and 'notifications' in operator_data:
        unread_notifications = [n for n in operator_data['notifications'] if n.get('read_at') is None]
        if unread_notifications:
            own_notification_id = unread_notifications[0]['id']
    
    # (H) PATCH with body { id: "<own-notification-id>" } → 200
    print("\n[H] PATCH /api/notifications with body { id: '<own-notification-id>' } → expect 200")
    if own_notification_id:
        try:
            response = requests.patch(
                f"{BASE_URL}/api/notifications",
                json={"id": own_notification_id},
                headers=headers,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get('read_at') is not None:
                    print(f"✅ PASS: Got 200, notification marked as read (read_at: {data.get('read_at')})")
                else:
                    print(f"❌ FAIL: Got 200 but read_at is still null")
            else:
                print(f"❌ FAIL: Expected 200, got {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ FAIL: Exception - {e}")
    else:
        print(f"⚠️  SKIP: No unread notification found for operator")
    
    # (I) PATCH with body { id: "00000000-0000-0000-0000-000000000000" } → 404
    print("\n[I] PATCH /api/notifications with non-existent id → expect 404")
    try:
        response = requests.patch(
            f"{BASE_URL}/api/notifications",
            json={"id": "00000000-0000-0000-0000-000000000000"},
            headers=headers,
            timeout=10
        )
        if response.status_code == 404:
            data = response.json()
            print(f"✅ PASS: Got 404 with message: {data.get('error')}")
        else:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    return own_notification_id

def test_cross_tenant_isolation():
    """Test cross-tenant isolation (J)"""
    print("\n" + "="*80)
    print("SECTION D: CROSS-TENANT ISOLATION TEST")
    print("="*80)
    
    # (J) Cross-tenant: Operator2 cannot mark Operator1's notification
    print("\n[J] Cross-tenant: Operator2 tries to mark Operator1's notification → expect 404")
    
    # Login as Operator1 and get an unread notification
    operator1_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    if not operator1_token:
        print("❌ SKIP: Cannot login as Operator1")
        return
    
    headers1 = {"Authorization": f"Bearer {operator1_token}"}
    try:
        response = requests.get(f"{BASE_URL}/api/notifications?unread=1", headers=headers1, timeout=10)
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            if len(notifications) > 0:
                operator1_notification_id = notifications[0]['id']
                print(f"   - Found Operator1's unread notification: {operator1_notification_id}")
                
                # Login as Operator2 and try to mark Operator1's notification
                operator2_token = login(OPERATOR2_EMAIL, OPERATOR2_PASSWORD)
                if not operator2_token:
                    print("❌ SKIP: Cannot login as Operator2")
                    return
                
                headers2 = {"Authorization": f"Bearer {operator2_token}"}
                response = requests.patch(
                    f"{BASE_URL}/api/notifications",
                    json={"id": operator1_notification_id},
                    headers=headers2,
                    timeout=10
                )
                
                if response.status_code == 404:
                    print(f"✅ PASS: Operator2 got 404 when trying to mark Operator1's notification")
                    
                    # Verify Operator1's notification is still unread
                    response = requests.get(f"{BASE_URL}/api/notifications", headers=headers1, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        notif = next((n for n in data['notifications'] if n['id'] == operator1_notification_id), None)
                        if notif and notif.get('read_at') is None:
                            print(f"✅ PASS: Operator1's notification is still unread (cross-tenant isolation working)")
                        else:
                            print(f"❌ FAIL: Operator1's notification was affected")
                else:
                    print(f"❌ FAIL: Expected 404, got {response.status_code}")
            else:
                print(f"⚠️  SKIP: No unread notifications found for Operator1")
        else:
            print(f"❌ FAIL: Cannot fetch Operator1's notifications: {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_post_mark_all_read(operator_token):
    """Test POST (mark all read) scenarios"""
    print("\n" + "="*80)
    print("SECTION E: POST (MARK ALL READ) TESTS")
    print("="*80)
    
    # (K) POST without Bearer → 401
    print("\n[K] POST /api/notifications without Bearer → expect 401")
    try:
        response = requests.post(f"{BASE_URL}/api/notifications", timeout=10)
        if response.status_code == 401:
            print(f"✅ PASS: Got 401 without Bearer")
        else:
            print(f"❌ FAIL: Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    if not operator_token:
        print("❌ SKIP: No operator token available for remaining POST tests")
        return
    
    headers = {"Authorization": f"Bearer {operator_token}"}
    
    # (L) POST as Operator → 200 with { ok: true }, unreadCount becomes 0
    print("\n[L] POST /api/notifications as Operator → expect 200 with { ok: true }")
    try:
        response = requests.post(f"{BASE_URL}/api/notifications", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') is True:
                print(f"✅ PASS: Got 200 with {{ ok: true }}")
                
                # Verify unreadCount is now 0
                response = requests.get(f"{BASE_URL}/api/notifications?limit=50", headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    unread_count = data.get('unreadCount', -1)
                    if unread_count == 0:
                        print(f"✅ PASS: unreadCount is now 0 after mark-all-read")
                    else:
                        print(f"❌ FAIL: unreadCount is {unread_count}, expected 0")
            else:
                print(f"❌ FAIL: Got 200 but response is not {{ ok: true }}: {data}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (M) Calling POST again is idempotent
    print("\n[M] POST /api/notifications again (idempotent) → expect 200 with { ok: true }")
    try:
        response = requests.post(f"{BASE_URL}/api/notifications", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') is True:
                print(f"✅ PASS: Got 200 with {{ ok: true }} (idempotent)")
                
                # Verify unreadCount is still 0
                response = requests.get(f"{BASE_URL}/api/notifications?limit=50", headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    unread_count = data.get('unreadCount', -1)
                    if unread_count == 0:
                        print(f"✅ PASS: unreadCount is still 0 (idempotent)")
                    else:
                        print(f"⚠️  WARNING: unreadCount is {unread_count}, expected 0")
            else:
                print(f"❌ FAIL: Got 200 but response is not {{ ok: true }}: {data}")
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_legacy_routes_deleted():
    """Test that legacy routes are deleted"""
    print("\n" + "="*80)
    print("SECTION F: LEGACY ROUTES (SHOULD BE DELETED)")
    print("="*80)
    
    # Login to get a valid token
    operator_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    if not operator_token:
        print("❌ SKIP: Cannot login as Operator")
        return
    
    headers = {"Authorization": f"Bearer {operator_token}"}
    
    # (N) GET /api/notifications/<some-id> → 404
    print("\n[N] GET /api/notifications/<some-id> → expect 404 (route deleted)")
    try:
        response = requests.get(
            f"{BASE_URL}/api/notifications/test-id-12345",
            headers=headers,
            timeout=10
        )
        if response.status_code == 404:
            print(f"✅ PASS: Got 404 (legacy route deleted)")
        else:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
    
    # (O) POST /api/notifications/mark-all-read → 404
    print("\n[O] POST /api/notifications/mark-all-read → expect 404 (route deleted)")
    try:
        response = requests.post(
            f"{BASE_URL}/api/notifications/mark-all-read",
            headers=headers,
            timeout=10
        )
        if response.status_code == 404:
            print(f"✅ PASS: Got 404 (legacy route deleted)")
        else:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def test_regression():
    """Test regression scenario"""
    print("\n" + "="*80)
    print("SECTION G: REGRESSION TEST")
    print("="*80)
    
    # (P) After marking all read, trigger a notification via POST /api/staff-assignments
    print("\n[P] Regression: Trigger notification via POST /api/staff-assignments")
    
    # Login as Operator
    operator_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    if not operator_token:
        print("❌ SKIP: Cannot login as Operator")
        return
    
    headers = {"Authorization": f"Bearer {operator_token}"}
    
    # Get staff-001 token
    staff_token = login(STAFF_EMAIL, STAFF_PASSWORD)
    if not staff_token:
        print("   ❌ SKIP: Cannot login as Staff")
        return
    
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    
    # First, mark all staff notifications as read
    print("   - Step 1: Mark all staff notifications as read")
    try:
        response = requests.post(f"{BASE_URL}/api/notifications", headers=staff_headers, timeout=10)
        if response.status_code == 200:
            print(f"   ✅ Marked all staff notifications as read")
        else:
            print(f"   ⚠️  Failed to mark all as read: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Exception: {e}")
    
    # Verify unreadCount is 0
    print("   - Step 2: Verify staff unreadCount is 0")
    try:
        response = requests.get(f"{BASE_URL}/api/notifications", headers=staff_headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            unread_count = data.get('unreadCount', -1)
            if unread_count == 0:
                print(f"   ✅ Staff unreadCount is 0")
            else:
                print(f"   ⚠️  Staff unreadCount is {unread_count}, expected 0")
    except Exception as e:
        print(f"   ❌ Exception: {e}")
    
    # Create a staff assignment to trigger a notification
    print("   - Step 3: Create/update staff assignment to trigger notification")
    try:
        # First, try to delete existing assignment if it exists
        response = requests.get(f"{BASE_URL}/api/staff-assignments", headers=headers, timeout=10)
        if response.status_code == 200:
            assignments = response.json()
            existing = next(
                (a for a in assignments if a.get('staff_user_id') == 'staff-001' and a.get('site_id') == 'site-002'),
                None
            )
            if existing:
                assignment_id = existing.get('id')
                response = requests.delete(
                    f"{BASE_URL}/api/staff-assignments/{assignment_id}",
                    headers=headers,
                    timeout=10
                )
                print(f"   - Deleted existing assignment (status: {response.status_code})")
        
        # Now create a new assignment
        assignment_data = {
            "staff_user_id": "staff-001",
            "site_id": "site-002"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/staff-assignments",
            json=assignment_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            print(f"   ✅ Staff assignment created (status: {response.status_code})")
            
            # Check if staff-001 has a new unread notification
            print("   - Step 4: Check if staff-001 has new unread notification")
            response = requests.get(
                f"{BASE_URL}/api/notifications?unread=1",
                headers=staff_headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                unread_count = data.get('unreadCount', 0)
                notifications = data.get('notifications', [])
                
                if unread_count > 0 and len(notifications) > 0:
                    # Check if the notification has read_at === null
                    first_notif = notifications[0]
                    if first_notif.get('read_at') is None:
                        print(f"   ✅ PASS: Staff has new unread notification (unreadCount: {unread_count})")
                        print(f"      - Notification type: {first_notif.get('type')}")
                        print(f"      - Notification title: {first_notif.get('title')}")
                    else:
                        print(f"   ❌ FAIL: Notification has read_at not null: {first_notif.get('read_at')}")
                else:
                    print(f"   ❌ FAIL: No unread notifications found for staff (unreadCount: {unread_count})")
            else:
                print(f"   ❌ FAIL: Cannot fetch staff notifications: {response.status_code}")
        else:
            print(f"   ❌ FAIL: Cannot create staff assignment: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"   ❌ FAIL: Exception - {e}")

def test_patch_with_staff_notifications():
    """Test PATCH scenarios using staff account with unread notifications"""
    print("\n" + "="*80)
    print("SECTION H: ADDITIONAL PATCH TESTS (WITH STAFF UNREAD NOTIFICATIONS)")
    print("="*80)
    
    # Login as Staff (who has unread notifications)
    staff_token = login(STAFF_EMAIL, STAFF_PASSWORD)
    if not staff_token:
        print("❌ SKIP: Cannot login as Staff")
        return
    
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    
    # Get staff's unread notifications
    print("\n[H.1] Get staff's unread notifications")
    try:
        response = requests.get(f"{BASE_URL}/api/notifications?unread=1", headers=staff_headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            unread_count = data.get('unreadCount', 0)
            
            if len(notifications) > 0:
                print(f"✅ Staff has {len(notifications)} unread notifications (unreadCount: {unread_count})")
                
                # Test PATCH to mark one notification as read
                print("\n[H.2] PATCH to mark one notification as read")
                first_notif_id = notifications[0]['id']
                response = requests.patch(
                    f"{BASE_URL}/api/notifications",
                    json={"id": first_notif_id},
                    headers=staff_headers,
                    timeout=10
                )
                
                if response.status_code == 200:
                    updated_notif = response.json()
                    if updated_notif.get('read_at') is not None:
                        print(f"✅ PASS: Notification marked as read (read_at: {updated_notif.get('read_at')})")
                        
                        # Verify unreadCount decreased
                        response = requests.get(f"{BASE_URL}/api/notifications", headers=staff_headers, timeout=10)
                        if response.status_code == 200:
                            data = response.json()
                            new_unread_count = data.get('unreadCount', 0)
                            if new_unread_count == unread_count - 1:
                                print(f"✅ PASS: unreadCount decreased from {unread_count} to {new_unread_count}")
                            else:
                                print(f"⚠️  WARNING: unreadCount is {new_unread_count}, expected {unread_count - 1}")
                    else:
                        print(f"❌ FAIL: Notification not marked as read (read_at is still null)")
                else:
                    print(f"❌ FAIL: Expected 200, got {response.status_code}")
                
                # Test cross-tenant isolation: Operator2 tries to mark Staff's notification
                if len(notifications) > 1:
                    print("\n[H.3] Cross-tenant: Operator2 tries to mark Staff's notification")
                    operator2_token = login(OPERATOR2_EMAIL, OPERATOR2_PASSWORD)
                    if operator2_token:
                        operator2_headers = {"Authorization": f"Bearer {operator2_token}"}
                        staff_notif_id = notifications[1]['id']  # Use second notification
                        
                        response = requests.patch(
                            f"{BASE_URL}/api/notifications",
                            json={"id": staff_notif_id},
                            headers=operator2_headers,
                            timeout=10
                        )
                        
                        if response.status_code == 404:
                            print(f"✅ PASS: Operator2 got 404 when trying to mark Staff's notification")
                            
                            # Verify Staff's notification is still unread
                            response = requests.get(f"{BASE_URL}/api/notifications", headers=staff_headers, timeout=10)
                            if response.status_code == 200:
                                data = response.json()
                                notif = next((n for n in data['notifications'] if n['id'] == staff_notif_id), None)
                                if notif and notif.get('read_at') is None:
                                    print(f"✅ PASS: Staff's notification is still unread (cross-tenant isolation working)")
                                else:
                                    print(f"❌ FAIL: Staff's notification was affected")
                        else:
                            print(f"❌ FAIL: Expected 404, got {response.status_code}")
                    else:
                        print(f"⚠️  SKIP: Cannot login as Operator2")
            else:
                print(f"⚠️  SKIP: No unread notifications found for staff")
        else:
            print(f"❌ FAIL: Cannot fetch staff notifications: {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("NOTIFICATIONS API CANONICAL CONTRACT MIGRATION - BACKEND TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    
    # Test SHAPE / GET
    operator_data = test_shape_get()
    
    # Login as Operator for remaining tests
    operator_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    
    # Test GET filters
    test_get_filters(operator_token)
    
    # Test PATCH (mark one read)
    test_patch_mark_one_read(operator_token, operator_data)
    
    # Test cross-tenant isolation
    test_cross_tenant_isolation()
    
    # Test POST (mark all read)
    test_post_mark_all_read(operator_token)
    
    # Test legacy routes deleted
    test_legacy_routes_deleted()
    
    # Test regression
    test_regression()
    
    # Additional PATCH tests with staff notifications
    test_patch_with_staff_notifications()
    
    print("\n" + "="*80)
    print("ALL TESTS COMPLETED")
    print("="*80)
    print(f"Test completed at: {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
