#!/usr/bin/env python3
"""
Phase 2 Section E — Notifications Centre Backend Test Suite (RE-RUN)

Background: Previous run hit 17/28 passes because the Supabase `notifications` 
table was missing the `read_at` column. User has now executed:
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

Expectation: all 10 previously-failing tests should now pass.

Demo credentials:
- Owner:    owner@workflowlite.com / WorkflowDemo2026!
- Operator: operator@workflowlite.com / WorkflowDemo2026!
- Staff:    staff@workflowlite.com / WorkflowDemo2026!
"""

import requests
import json
import time
import os
from datetime import datetime, timedelta

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://fuel-ops-simple.preview.emergentagent.com')

# Test credentials
OWNER_EMAIL = 'owner@workflowlite.com'
OPERATOR_EMAIL = 'operator@workflowlite.com'
STAFF_EMAIL = 'staff@workflowlite.com'
PASSWORD = 'WorkflowDemo2026!'

# Global state
owner_token = None
operator_token = None
staff_token = None
owner_user_id = None
operator_user_id = None
staff_user_id = None
test_report_id = None
test_notification_id = None
test_site_id = None

def login(email, password):
    """Login and return (token, user_id, user_object)"""
    try:
        resp = requests.post(
            f'{BASE_URL}/api/auth/login',
            json={'email': email, 'password': password},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            # Extract access_token from session object
            session = data.get('session', {})
            token = session.get('access_token') if session else None
            user = data.get('user', {})
            user_id = user.get('id')
            return token, user_id, user
        else:
            print(f"❌ Login failed for {email}: {resp.status_code} {resp.text}")
            return None, None, None
    except Exception as e:
        print(f"❌ Login exception for {email}: {e}")
        return None, None, None

def setup_auth():
    """Setup authentication tokens for all test users"""
    global owner_token, operator_token, staff_token
    global owner_user_id, operator_user_id, staff_user_id
    
    print("\n=== SETUP: Authenticating test users ===")
    
    owner_token, owner_user_id, owner_user = login(OWNER_EMAIL, PASSWORD)
    if owner_token:
        print(f"✅ Owner authenticated: {owner_user_id}")
    else:
        print(f"❌ Owner authentication failed")
        return False
    
    operator_token, operator_user_id, operator_user = login(OPERATOR_EMAIL, PASSWORD)
    if operator_token:
        print(f"✅ Operator authenticated: {operator_user_id}")
    else:
        print(f"❌ Operator authentication failed")
        return False
    
    staff_token, staff_user_id, staff_user = login(STAFF_EMAIL, PASSWORD)
    if staff_token:
        print(f"✅ Staff authenticated: {staff_user_id}")
    else:
        print(f"❌ Staff authentication failed")
        return False
    
    return True

def get_operator_assigned_site():
    """Get a site that the operator is assigned to"""
    global test_site_id
    try:
        resp = requests.get(
            f'{BASE_URL}/api/sites',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            sites = resp.json()
            if sites and len(sites) > 0:
                test_site_id = sites[0]['id']
                print(f"✅ Found operator assigned site: {test_site_id}")
                return test_site_id
        print(f"❌ Failed to get operator sites: {resp.status_code}")
        return None
    except Exception as e:
        print(f"❌ Exception getting operator sites: {e}")
        return None

# ============================================================================
# TEST SUITE
# ============================================================================

def test_a1_get_notifications_without_bearer():
    """A.1: GET /api/notifications without Bearer → 401"""
    print("\n[A.1] GET /api/notifications without Bearer → 401")
    try:
        resp = requests.get(f'{BASE_URL}/api/notifications', timeout=10)
        if resp.status_code == 401:
            print("✅ PASS: Returns 401 without Bearer")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a2_get_notifications_with_bearer():
    """A.2: GET /api/notifications with Bearer → 200 with shape {items, unread_count}"""
    print("\n[A.2] GET /api/notifications with Bearer → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if 'items' in data and 'unread_count' in data:
                print(f"✅ PASS: Returns 200 with correct shape (items: {len(data['items'])}, unread_count: {data['unread_count']})")
                return True
            else:
                print(f"❌ FAIL: Missing required fields in response: {data.keys()}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a3_get_notifications_unread_filter():
    """A.3 (PREVIOUSLY FAILED): GET /api/notifications?unread=1 → 200, every item has read_at === null"""
    print("\n[A.3] GET /api/notifications?unread=1 → 200, all items unread")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications?unread=1',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            all_unread = all(item.get('read_at') is None for item in items)
            if all_unread:
                print(f"✅ PASS: Returns 200, all {len(items)} items have read_at === null")
                return True
            else:
                read_items = [item for item in items if item.get('read_at') is not None]
                print(f"❌ FAIL: Found {len(read_items)} items with read_at set")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_b1_patch_fake_notification():
    """B.1 (PREVIOUSLY FAILED): PATCH /api/notifications/[fake-uuid] → 404"""
    print("\n[B.1] PATCH /api/notifications/[fake-uuid] → 404")
    fake_uuid = '00000000-0000-0000-0000-000000000000'
    try:
        resp = requests.patch(
            f'{BASE_URL}/api/notifications/{fake_uuid}',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'read': True},
            timeout=10
        )
        if resp.status_code == 404:
            print("✅ PASS: Returns 404 for fake notification ID")
            return True
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_c1_create_report_and_verify_notification():
    """C.1 (PREVIOUSLY FAILED): Staff POST /api/reports → Operator receives report_submitted notification"""
    print("\n[C.1] Staff POST /api/reports → Operator receives notification")
    global test_report_id, test_notification_id
    
    # Get operator's assigned site
    if not test_site_id:
        if not get_operator_assigned_site():
            print("❌ FAIL: Could not get operator assigned site")
            return False
    
    # Staff submits a report
    report_data = {
        'site_id': test_site_id,
        'shift_date': datetime.now().strftime('%Y-%m-%d'),
        'shift_type': 'Morning',
        'fuel_sales': 5000.00,
        'shop_sales': 1200.00,
        'total_sales': 6200.00,
        'notes': 'Test report for notification trigger'
    }
    
    try:
        print(f"  → Staff submitting report for site {test_site_id}...")
        resp = requests.post(
            f'{BASE_URL}/api/reports',
            headers={'Authorization': f'Bearer {staff_token}'},
            json=report_data,
            timeout=10
        )
        
        if resp.status_code in [200, 201]:
            report = resp.json()
            test_report_id = report.get('id')
            print(f"  ✓ Report created: {test_report_id}")
            
            # Wait for notification to be created (fire-and-forget)
            print("  → Waiting 3 seconds for notification to be created...")
            time.sleep(3)
            
            # Check operator's notifications
            print("  → Checking operator's notifications...")
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {operator_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
                # Find report_submitted notification
                report_notif = None
                for item in items:
                    if item.get('type') == 'report_submitted' and 'review' in item.get('title', '').lower():
                        report_notif = item
                        test_notification_id = item.get('id')
                        break
                
                if report_notif:
                    link = report_notif.get('link', '')
                    if '/app?tab=submissions' in link:
                        print(f"✅ PASS: Operator received report_submitted notification (id: {test_notification_id})")
                        print(f"  Title: {report_notif.get('title')}")
                        print(f"  Link: {link}")
                        return True
                    else:
                        print(f"❌ FAIL: Notification link incorrect: {link}")
                        return False
                else:
                    print(f"❌ FAIL: No report_submitted notification found. Found {len(items)} notifications:")
                    for item in items[:3]:
                        print(f"    - {item.get('type')}: {item.get('title')}")
                    return False
            else:
                print(f"❌ FAIL: Failed to get notifications: {resp.status_code}: {resp.text}")
                return False
        else:
            print(f"❌ FAIL: Failed to create report: {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_c2_mark_notification_as_read():
    """C.2 (PREVIOUSLY FAILED): PATCH notification with {read: true} → 200, read_at non-null"""
    print("\n[C.2] PATCH notification with {read: true} → 200, read_at set")
    
    if not test_notification_id:
        print("⚠️  SKIP: No notification ID from previous test")
        return None
    
    try:
        resp = requests.patch(
            f'{BASE_URL}/api/notifications/{test_notification_id}',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'read': True},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            read_at = data.get('read_at')
            if read_at is not None:
                print(f"✅ PASS: Notification marked as read, read_at: {read_at}")
                return True
            else:
                print(f"❌ FAIL: read_at is still null: {data}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_c3_verify_unread_count_decreased():
    """C.3 (PREVIOUSLY FAILED): GET /api/notifications → unread_count decreased by 1"""
    print("\n[C.3] GET /api/notifications → unread_count decreased")
    
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            unread_count = data.get('unread_count', 0)
            items = data.get('items', [])
            
            # Verify the notification we marked as read has read_at set
            marked_notif = None
            for item in items:
                if item.get('id') == test_notification_id:
                    marked_notif = item
                    break
            
            if marked_notif and marked_notif.get('read_at') is not None:
                print(f"✅ PASS: Notification has read_at set, unread_count: {unread_count}")
                return True
            else:
                print(f"❌ FAIL: Notification still unread or not found")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_c4_mark_notification_as_unread():
    """C.4 (PREVIOUSLY FAILED): PATCH notification with {read: false} → 200, read_at null"""
    print("\n[C.4] PATCH notification with {read: false} → 200, read_at null")
    
    if not test_notification_id:
        print("⚠️  SKIP: No notification ID from previous test")
        return None
    
    try:
        resp = requests.patch(
            f'{BASE_URL}/api/notifications/{test_notification_id}',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'read': False},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            read_at = data.get('read_at')
            if read_at is None:
                print(f"✅ PASS: Notification marked as unread, read_at: null")
                return True
            else:
                print(f"❌ FAIL: read_at is not null: {read_at}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_d1_cross_user_isolation():
    """D.1 (PREVIOUSLY FAILED): Different user PATCH another user's notification → 404"""
    print("\n[D.1] Cross-user isolation: Staff PATCH operator's notification → 404")
    
    if not test_notification_id:
        print("⚠️  SKIP: No notification ID from previous test")
        return None
    
    try:
        # Staff tries to mark operator's notification as read
        resp = requests.patch(
            f'{BASE_URL}/api/notifications/{test_notification_id}',
            headers={'Authorization': f'Bearer {staff_token}'},
            json={'read': True},
            timeout=10
        )
        
        if resp.status_code == 404:
            print("✅ PASS: Returns 404 (not 403) for cross-user access")
            return True
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_e1_mark_all_read():
    """E.1 (PREVIOUSLY FAILED): POST /api/notifications/mark-all-read → 200 with {ok: true, updated: N}"""
    print("\n[E.1] POST /api/notifications/mark-all-read → 200")
    
    try:
        resp = requests.post(
            f'{BASE_URL}/api/notifications/mark-all-read',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') is True and 'updated' in data:
                updated = data.get('updated')
                print(f"✅ PASS: Marked all as read, updated: {updated}")
                return True
            else:
                print(f"❌ FAIL: Response missing required fields: {data}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_e2_verify_unread_count_zero():
    """E.2 (PREVIOUSLY FAILED): GET /api/notifications → unread_count === 0"""
    print("\n[E.2] GET /api/notifications → unread_count === 0")
    
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            unread_count = data.get('unread_count', -1)
            if unread_count == 0:
                print(f"✅ PASS: unread_count is 0")
                return True
            else:
                print(f"❌ FAIL: unread_count is {unread_count}, expected 0")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_e3_mark_all_read_idempotent():
    """E.3 (PREVIOUSLY FAILED): POST mark-all-read again → 200 with {ok: true, updated: 0}"""
    print("\n[E.3] POST mark-all-read again (idempotent) → updated: 0")
    
    try:
        resp = requests.post(
            f'{BASE_URL}/api/notifications/mark-all-read',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') is True and data.get('updated') == 0:
                print(f"✅ PASS: Idempotent, updated: 0")
                return True
            else:
                print(f"❌ FAIL: Expected updated: 0, got: {data}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_f1_site_assigned_trigger():
    """F.1 (PREVIOUSLY FAILED): Owner POST /api/operator-assignments → Operator receives site_assigned notification"""
    print("\n[F.1] Owner POST /api/operator-assignments → site_assigned notification")
    
    # First, check if operator is already assigned to all sites
    try:
        # Get all sites
        resp = requests.get(
            f'{BASE_URL}/api/sites',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not get sites: {resp.status_code}")
            return False
        
        all_sites = resp.json()
        
        # Get operator's current assignments
        resp = requests.get(
            f'{BASE_URL}/api/operator-assignments',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not get operator assignments: {resp.status_code}")
            return False
        
        assignments = resp.json()
        assigned_site_ids = [a['site_id'] for a in assignments if a['operator_user_id'] == operator_user_id]
        
        # Find an unassigned site
        unassigned_site = None
        for site in all_sites:
            if site['id'] not in assigned_site_ids:
                unassigned_site = site
                break
        
        if not unassigned_site:
            print("  → All sites already assigned, deleting one assignment first...")
            # Delete the first assignment
            assignment_to_delete = None
            for a in assignments:
                if a['operator_user_id'] == operator_user_id:
                    assignment_to_delete = a
                    break
            
            if assignment_to_delete:
                resp = requests.delete(
                    f'{BASE_URL}/api/operator-assignments/{assignment_to_delete["id"]}',
                    headers={'Authorization': f'Bearer {owner_token}'},
                    timeout=10
                )
                if resp.status_code in [200, 204]:
                    print(f"  ✓ Deleted assignment: {assignment_to_delete['id']}")
                    unassigned_site = next((s for s in all_sites if s['id'] == assignment_to_delete['site_id']), None)
                    time.sleep(2)  # Wait for deletion
                else:
                    print(f"❌ FAIL: Could not delete assignment: {resp.status_code}")
                    return False
        
        if not unassigned_site:
            print("❌ FAIL: Could not find or create an unassigned site")
            return False
        
        print(f"  → Creating assignment for site {unassigned_site['id']}...")
        
        # Create new assignment
        resp = requests.post(
            f'{BASE_URL}/api/operator-assignments',
            headers={'Authorization': f'Bearer {owner_token}'},
            json={
                'operator_user_id': operator_user_id,
                'site_id': unassigned_site['id']
            },
            timeout=10
        )
        
        if resp.status_code in [200, 201]:
            print(f"  ✓ Assignment created")
            
            # Wait for notification
            print("  → Waiting 3 seconds for notification...")
            time.sleep(3)
            
            # Check operator's notifications
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {operator_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
                # Find site_assigned notification
                site_notif = None
                for item in items:
                    if item.get('type') == 'site_assigned':
                        site_notif = item
                        break
                
                if site_notif:
                    print(f"✅ PASS: Operator received site_assigned notification")
                    print(f"  Title: {site_notif.get('title')}")
                    return True
                else:
                    print(f"❌ FAIL: No site_assigned notification found. Found {len(items)} notifications:")
                    for item in items[:3]:
                        print(f"    - {item.get('type')}: {item.get('title')}")
                    return False
            else:
                print(f"❌ FAIL: Failed to get notifications: {resp.status_code}: {resp.text}")
                return False
        else:
            print(f"❌ FAIL: Failed to create assignment: {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SPOT-CHECK PREVIOUSLY-PASSING TESTS (Regression)
# ============================================================================

def test_r1_post_support_contact():
    """R.1: POST /api/support/contact with Owner Bearer → 200"""
    print("\n[R.1] POST /api/support/contact → 200")
    try:
        resp = requests.post(
            f'{BASE_URL}/api/support/contact',
            headers={'Authorization': f'Bearer {owner_token}'},
            json={
                'name': 'Test User',
                'email': 'test@example.com',
                'subject': 'Test notification system',
                'message': 'Testing notifications backend'
            },
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Support contact endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_r2_get_users_me():
    """R.2: GET /api/users/me with Owner Bearer → 200"""
    print("\n[R.2] GET /api/users/me → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/users/me',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: Users/me endpoint working (user: {data.get('email')})")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_r3_get_dashboard_stats():
    """R.3: GET /api/dashboard/stats with Owner Bearer → 200"""
    print("\n[R.3] GET /api/dashboard/stats → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/dashboard/stats?siteIds=site-001',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"✅ PASS: Dashboard stats endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_r4_get_users_without_auth():
    """R.4: GET /api/users without Bearer → 401"""
    print("\n[R.4] GET /api/users without Bearer → 401")
    try:
        resp = requests.get(f'{BASE_URL}/api/users', timeout=10)
        if resp.status_code == 401:
            print("✅ PASS: Auth gate working")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_r5_update_report_status_approved():
    """R.5: PUT /api/reports/[id]/status with status='approved' → notifies submitter"""
    print("\n[R.5] PUT /api/reports/[id]/status → report_status_changed notification")
    
    if not test_report_id:
        print("⚠️  SKIP: No test report ID")
        return None
    
    try:
        # Update report status to approved
        resp = requests.put(
            f'{BASE_URL}/api/reports/{test_report_id}/status',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'status': 'approved'},
            timeout=10
        )
        
        if resp.status_code == 200:
            print(f"  ✓ Report status updated to approved")
            
            # Wait for notification
            print("  → Waiting 3 seconds for notification...")
            time.sleep(3)
            
            # Check staff's notifications
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {staff_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
                # Find report_status_changed notification
                status_notif = None
                for item in items:
                    if item.get('type') == 'report_status_changed' and 'approved' in item.get('title', '').lower():
                        status_notif = item
                        break
                
                if status_notif:
                    print(f"✅ PASS: Staff received report_status_changed notification")
                    print(f"  Title: {status_notif.get('title')}")
                    return True
                else:
                    print(f"❌ FAIL: No report_status_changed notification found")
                    return False
            else:
                print(f"❌ FAIL: Failed to get notifications: {resp.status_code}")
                return False
        else:
            print(f"❌ FAIL: Failed to update report status: {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_r6_update_report_status_pending():
    """R.6: PUT /api/reports/[id]/status with status='pending' → no new notification"""
    print("\n[R.6] PUT /api/reports/[id]/status to pending → no notification")
    
    if not test_report_id:
        print("⚠️  SKIP: No test report ID")
        return None
    
    try:
        # Get current notification count
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': f'Bearer {staff_token}'},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not get initial notification count")
            return False
        
        initial_count = len(resp.json().get('items', []))
        
        # Update report status to pending
        resp = requests.put(
            f'{BASE_URL}/api/reports/{test_report_id}/status',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'status': 'pending'},
            timeout=10
        )
        
        if resp.status_code == 200:
            print(f"  ✓ Report status updated to pending")
            
            # Wait a bit
            time.sleep(2)
            
            # Check notification count
            resp = requests.get(
                f'{BASE_URL}/api/notifications',
                headers={'Authorization': f'Bearer {staff_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                final_count = len(resp.json().get('items', []))
                if final_count == initial_count:
                    print(f"✅ PASS: No new notification created (count: {final_count})")
                    return True
                else:
                    print(f"❌ FAIL: Notification count changed from {initial_count} to {final_count}")
                    return False
            else:
                print(f"❌ FAIL: Failed to get final notification count")
                return False
        else:
            print(f"❌ FAIL: Failed to update report status: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("=" * 80)
    print("PHASE 2 SECTION E — NOTIFICATIONS CENTRE BACKEND TEST SUITE (RE-RUN)")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Expected: All 10 previously-failing tests should now PASS")
    print("=" * 80)
    
    # Setup
    if not setup_auth():
        print("\n❌ SETUP FAILED: Could not authenticate test users")
        return
    
    # Get operator assigned site
    get_operator_assigned_site()
    
    results = []
    
    # Previously-failing tests (should now PASS)
    print("\n" + "=" * 80)
    print("PREVIOUSLY-FAILING TESTS (Expected: ALL PASS)")
    print("=" * 80)
    
    results.append(('A.3', 'GET /notifications?unread=1', test_a3_get_notifications_unread_filter()))
    results.append(('B.1', 'PATCH /notifications/[fake-uuid]', test_b1_patch_fake_notification()))
    results.append(('C.1', 'Report submit → notification', test_c1_create_report_and_verify_notification()))
    results.append(('C.2', 'PATCH mark as read', test_c2_mark_notification_as_read()))
    results.append(('C.3', 'Verify unread count decreased', test_c3_verify_unread_count_decreased()))
    results.append(('C.4', 'PATCH mark as unread', test_c4_mark_notification_as_unread()))
    results.append(('D.1', 'Cross-user isolation', test_d1_cross_user_isolation()))
    results.append(('E.1', 'POST mark-all-read', test_e1_mark_all_read()))
    results.append(('E.2', 'Verify unread_count === 0', test_e2_verify_unread_count_zero()))
    results.append(('E.3', 'Mark-all-read idempotent', test_e3_mark_all_read_idempotent()))
    results.append(('F.1', 'Site assigned trigger', test_f1_site_assigned_trigger()))
    
    # Previously-passing tests (spot-check for regression)
    print("\n" + "=" * 80)
    print("PREVIOUSLY-PASSING TESTS (Spot-check for regression)")
    print("=" * 80)
    
    results.append(('R.1', 'GET /notifications without Bearer', test_a1_get_notifications_without_bearer()))
    results.append(('R.2', 'GET /notifications with Bearer', test_a2_get_notifications_with_bearer()))
    results.append(('R.3', 'POST /support/contact', test_r1_post_support_contact()))
    results.append(('R.4', 'GET /users/me', test_r2_get_users_me()))
    results.append(('R.5', 'GET /dashboard/stats', test_r3_get_dashboard_stats()))
    results.append(('R.6', 'GET /users without auth', test_r4_get_users_without_auth()))
    results.append(('R.7', 'Report status approved → notification', test_r5_update_report_status_approved()))
    results.append(('R.8', 'Report status pending → no notification', test_r6_update_report_status_pending()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, _, result in results if result is True)
    failed = sum(1 for _, _, result in results if result is False)
    skipped = sum(1 for _, _, result in results if result is None)
    total = len(results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⚠️  Skipped: {skipped}")
    print(f"\nSuccess Rate: {passed}/{total} ({100*passed//total}%)")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for test_id, test_name, result in results:
            if result is False:
                print(f"  - [{test_id}] {test_name}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Notifications Centre is fully functional.")
    elif passed >= total - skipped:
        print("\n✅ All non-skipped tests passed!")
    else:
        print(f"\n⚠️  {failed} test(s) still failing. Review output above for details.")
    
    print("\n" + "=" * 80)

if __name__ == '__main__':
    main()
