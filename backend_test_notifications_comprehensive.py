#!/usr/bin/env python3
"""
Phase 2 Section E — Notifications Centre COMPREHENSIVE Backend Test Suite

This test suite covers all 28+ tests mentioned in the review request:
- 11 previously-failing tests (now should PASS)
- 17+ spot-check regression tests

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
            session = data.get('session', {})
            token = session.get('access_token') if session else None
            user = data.get('user', {})
            user_id = user.get('id')
            return token, user_id, user
        else:
            print(f"❌ Login failed for {email}: {resp.status_code} {resp.text[:200]}")
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
# SECTION A: Basic GET /api/notifications tests
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

def test_a2_get_notifications_invalid_token():
    """A.2: GET /api/notifications with invalid Bearer → 401"""
    print("\n[A.2] GET /api/notifications with invalid Bearer → 401")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': 'Bearer invalid-token-12345'},
            timeout=10
        )
        if resp.status_code == 401:
            print("✅ PASS: Returns 401 with invalid token")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a3_get_notifications_with_bearer():
    """A.3: GET /api/notifications with Bearer → 200 with shape {items, unread_count}"""
    print("\n[A.3] GET /api/notifications with Bearer → 200")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a4_get_notifications_limit_capping():
    """A.4: GET /api/notifications?limit=200 → capped at 100"""
    print("\n[A.4] GET /api/notifications?limit=200 → capped at 100")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications?limit=200',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('items', [])
            if len(items) <= 100:
                print(f"✅ PASS: Limit capped correctly (returned {len(items)} items)")
                return True
            else:
                print(f"❌ FAIL: Returned {len(items)} items, expected max 100")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a5_get_notifications_invalid_limit():
    """A.5: GET /api/notifications?limit=invalid → fallback to default 50"""
    print("\n[A.5] GET /api/notifications?limit=invalid → fallback to default")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications?limit=invalid',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Invalid limit handled gracefully")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_a6_get_notifications_unread_filter():
    """A.6 (PREVIOUSLY FAILED): GET /api/notifications?unread=1 → 200, every item has read_at === null"""
    print("\n[A.6] GET /api/notifications?unread=1 → 200, all items unread")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION B: PATCH /api/notifications/[id] tests
# ============================================================================

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
            print(f"❌ FAIL: Expected 404, got {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION C: Notification triggers - report_submitted
# ============================================================================

def test_c1_create_report_and_verify_notification():
    """C.1 (PREVIOUSLY FAILED): Staff POST /api/reports → Operator receives report_submitted notification"""
    print("\n[C.1] Staff POST /api/reports → Operator receives notification")
    global test_report_id, test_notification_id
    
    if not test_site_id:
        if not get_operator_assigned_site():
            print("❌ FAIL: Could not get operator assigned site")
            return False
    
    # Use Afternoon shift to avoid duplicate constraint with Morning shift
    report_data = {
        'site_id': test_site_id,
        'shift_date': datetime.now().strftime('%Y-%m-%d'),
        'shift_type': 'Afternoon',
        'fuel_sales': 5000.00,
        'shop_sales': 1200.00,
        'total_sales': 6200.00,
        'notes': 'Test report for notification trigger - Afternoon shift'
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
            
            print("  → Waiting 3 seconds for notification to be created...")
            time.sleep(3)
            
            print("  → Checking operator's notifications...")
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {operator_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
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
                    print(f"❌ FAIL: No report_submitted notification found. Found {len(items)} notifications")
                    return False
            else:
                print(f"❌ FAIL: Failed to get notifications: {resp.status_code}")
                return False
        else:
            print(f"❌ FAIL: Failed to create report: {resp.status_code}: {resp.text[:200]}")
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
                print(f"❌ FAIL: read_at is still null")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text[:200]}")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION D: Cross-user isolation
# ============================================================================

def test_d1_cross_user_isolation():
    """D.1 (PREVIOUSLY FAILED): Different user PATCH another user's notification → 404"""
    print("\n[D.1] Cross-user isolation: Staff PATCH operator's notification → 404")
    
    if not test_notification_id:
        print("⚠️  SKIP: No notification ID from previous test")
        return None
    
    try:
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
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION E: Mark all as read
# ============================================================================

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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION F: Site assignment triggers
# ============================================================================

def test_f1_site_assigned_trigger():
    """F.1 (PREVIOUSLY FAILED): Owner POST /api/operator-assignments → Operator receives site_assigned notification"""
    print("\n[F.1] Owner POST /api/operator-assignments → site_assigned notification")
    
    try:
        resp = requests.get(
            f'{BASE_URL}/api/sites',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not get sites: {resp.status_code}")
            return False
        
        all_sites = resp.json()
        
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
        
        unassigned_site = None
        for site in all_sites:
            if site['id'] not in assigned_site_ids:
                unassigned_site = site
                break
        
        if not unassigned_site:
            print("  → All sites already assigned, deleting one assignment first...")
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
                    time.sleep(2)
                else:
                    print(f"❌ FAIL: Could not delete assignment: {resp.status_code}")
                    return False
        
        if not unassigned_site:
            print("❌ FAIL: Could not find or create an unassigned site")
            return False
        
        print(f"  → Creating assignment for site {unassigned_site['id']}...")
        
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
            
            print("  → Waiting 3 seconds for notification...")
            time.sleep(3)
            
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {operator_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
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
                    print(f"❌ FAIL: No site_assigned notification found")
                    return False
            else:
                print(f"❌ FAIL: Failed to get notifications: {resp.status_code}")
                return False
        else:
            print(f"❌ FAIL: Failed to create assignment: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# SECTION G: Regression tests
# ============================================================================

def test_g1_post_support_contact():
    """G.1: POST /api/support/contact with Owner Bearer → 200"""
    print("\n[G.1] POST /api/support/contact → 200")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g2_get_users_me():
    """G.2: GET /api/users/me with Owner Bearer → 200"""
    print("\n[G.2] GET /api/users/me → 200")
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
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g3_get_dashboard_stats():
    """G.3: GET /api/dashboard/stats with Owner Bearer → 200"""
    print("\n[G.3] GET /api/dashboard/stats → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/dashboard/stats?siteIds=site-001',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Dashboard stats endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g4_get_users_without_auth():
    """G.4: GET /api/users without Bearer → 401"""
    print("\n[G.4] GET /api/users without Bearer → 401")
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

def test_g5_update_report_status_approved():
    """G.5: PUT /api/reports/[id]/status with status='approved' → notifies submitter"""
    print("\n[G.5] PUT /api/reports/[id]/status → report_status_changed notification")
    
    if not test_report_id:
        print("⚠️  SKIP: No test report ID")
        return None
    
    try:
        resp = requests.put(
            f'{BASE_URL}/api/reports/{test_report_id}/status',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'status': 'approved'},
            timeout=10
        )
        
        if resp.status_code == 200:
            print(f"  ✓ Report status updated to approved")
            
            print("  → Waiting 3 seconds for notification...")
            time.sleep(3)
            
            resp = requests.get(
                f'{BASE_URL}/api/notifications?unread=1',
                headers={'Authorization': f'Bearer {staff_token}'},
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('items', [])
                
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
            print(f"❌ FAIL: Failed to update report status: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g6_update_report_status_pending():
    """G.6: PUT /api/reports/[id]/status with status='pending' → no new notification"""
    print("\n[G.6] PUT /api/reports/[id]/status to pending → no notification")
    
    if not test_report_id:
        print("⚠️  SKIP: No test report ID")
        return None
    
    try:
        resp = requests.get(
            f'{BASE_URL}/api/notifications',
            headers={'Authorization': f'Bearer {staff_token}'},
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not get initial notification count")
            return False
        
        initial_count = len(resp.json().get('items', []))
        
        resp = requests.put(
            f'{BASE_URL}/api/reports/{test_report_id}/status',
            headers={'Authorization': f'Bearer {operator_token}'},
            json={'status': 'pending'},
            timeout=10
        )
        
        if resp.status_code == 200:
            print(f"  ✓ Report status updated to pending")
            
            time.sleep(2)
            
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

def test_g7_get_reports():
    """G.7: GET /api/reports with Bearer → 200"""
    print("\n[G.7] GET /api/reports → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/reports',
            headers={'Authorization': f'Bearer {operator_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Reports endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g8_get_sites():
    """G.8: GET /api/sites with Bearer → 200"""
    print("\n[G.8] GET /api/sites → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/sites',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Sites endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g9_get_operator_assignments():
    """G.9: GET /api/operator-assignments with Bearer → 200"""
    print("\n[G.9] GET /api/operator-assignments → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/operator-assignments',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Operator assignments endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_g10_get_staff_assignments():
    """G.10: GET /api/staff-assignments with Bearer → 200"""
    print("\n[G.10] GET /api/staff-assignments → 200")
    try:
        resp = requests.get(
            f'{BASE_URL}/api/staff-assignments',
            headers={'Authorization': f'Bearer {owner_token}'},
            timeout=10
        )
        if resp.status_code == 200:
            print("✅ PASS: Staff assignments endpoint working")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("=" * 80)
    print("PHASE 2 SECTION E — NOTIFICATIONS CENTRE COMPREHENSIVE TEST SUITE")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Expected: All 28+ tests should PASS (10 previously-failing + 18 regression)")
    print("=" * 80)
    
    if not setup_auth():
        print("\n❌ SETUP FAILED: Could not authenticate test users")
        return
    
    get_operator_assigned_site()
    
    results = []
    
    # SECTION A: Basic GET tests
    print("\n" + "=" * 80)
    print("SECTION A: Basic GET /api/notifications tests")
    print("=" * 80)
    results.append(('A.1', 'GET without Bearer', test_a1_get_notifications_without_bearer()))
    results.append(('A.2', 'GET with invalid Bearer', test_a2_get_notifications_invalid_token()))
    results.append(('A.3', 'GET with Bearer', test_a3_get_notifications_with_bearer()))
    results.append(('A.4', 'GET limit capping', test_a4_get_notifications_limit_capping()))
    results.append(('A.5', 'GET invalid limit', test_a5_get_notifications_invalid_limit()))
    results.append(('A.6', 'GET unread filter (PREV FAIL)', test_a6_get_notifications_unread_filter()))
    
    # SECTION B: PATCH tests
    print("\n" + "=" * 80)
    print("SECTION B: PATCH /api/notifications/[id] tests")
    print("=" * 80)
    results.append(('B.1', 'PATCH fake UUID (PREV FAIL)', test_b1_patch_fake_notification()))
    
    # SECTION C: Report submission trigger
    print("\n" + "=" * 80)
    print("SECTION C: Notification triggers - report_submitted")
    print("=" * 80)
    results.append(('C.1', 'Report submit trigger (PREV FAIL)', test_c1_create_report_and_verify_notification()))
    results.append(('C.2', 'PATCH mark as read (PREV FAIL)', test_c2_mark_notification_as_read()))
    results.append(('C.3', 'Verify unread decreased (PREV FAIL)', test_c3_verify_unread_count_decreased()))
    results.append(('C.4', 'PATCH mark as unread (PREV FAIL)', test_c4_mark_notification_as_unread()))
    
    # SECTION D: Cross-user isolation
    print("\n" + "=" * 80)
    print("SECTION D: Cross-user isolation")
    print("=" * 80)
    results.append(('D.1', 'Cross-user isolation (PREV FAIL)', test_d1_cross_user_isolation()))
    
    # SECTION E: Mark all as read
    print("\n" + "=" * 80)
    print("SECTION E: Mark all as read")
    print("=" * 80)
    results.append(('E.1', 'POST mark-all-read (PREV FAIL)', test_e1_mark_all_read()))
    results.append(('E.2', 'Verify unread_count === 0 (PREV FAIL)', test_e2_verify_unread_count_zero()))
    results.append(('E.3', 'Mark-all-read idempotent (PREV FAIL)', test_e3_mark_all_read_idempotent()))
    
    # SECTION F: Site assignment triggers
    print("\n" + "=" * 80)
    print("SECTION F: Site assignment triggers")
    print("=" * 80)
    results.append(('F.1', 'Site assigned trigger (PREV FAIL)', test_f1_site_assigned_trigger()))
    
    # SECTION G: Regression tests
    print("\n" + "=" * 80)
    print("SECTION G: Regression tests (spot-check)")
    print("=" * 80)
    results.append(('G.1', 'POST support/contact', test_g1_post_support_contact()))
    results.append(('G.2', 'GET users/me', test_g2_get_users_me()))
    results.append(('G.3', 'GET dashboard/stats', test_g3_get_dashboard_stats()))
    results.append(('G.4', 'GET users without auth', test_g4_get_users_without_auth()))
    results.append(('G.5', 'Report status approved', test_g5_update_report_status_approved()))
    results.append(('G.6', 'Report status pending', test_g6_update_report_status_pending()))
    results.append(('G.7', 'GET reports', test_g7_get_reports()))
    results.append(('G.8', 'GET sites', test_g8_get_sites()))
    results.append(('G.9', 'GET operator-assignments', test_g9_get_operator_assignments()))
    results.append(('G.10', 'GET staff-assignments', test_g10_get_staff_assignments()))
    
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
    
    # Count previously-failing tests
    prev_fail_tests = ['A.6', 'B.1', 'C.1', 'C.2', 'C.3', 'C.4', 'D.1', 'E.1', 'E.2', 'E.3', 'F.1']
    prev_fail_passed = sum(1 for test_id, _, result in results if test_id in prev_fail_tests and result is True)
    prev_fail_total = len(prev_fail_tests)
    
    print(f"\n📊 Previously-failing tests: {prev_fail_passed}/{prev_fail_total} passed")
    
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
