#!/usr/bin/env python3
"""
Section 4 Regression: Focused test on the 4 endpoints returning 502
"""

import requests
import json

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"

CREDENTIALS = {
    "owner": {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"}
}

def login(role):
    """Login and return Bearer token"""
    try:
        creds = CREDENTIALS[role]
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=creds,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("session", {}).get("access_token")
            return token
        return None
    except Exception as e:
        print(f"Login error: {str(e)}")
        return None

def test_auth_gates():
    """Test the 4 endpoints that returned 502"""
    print("="*80)
    print("FOCUSED TEST: Auth Gates for 4 Endpoints")
    print("="*80)
    
    # Login as owner
    owner_token = login("owner")
    if not owner_token:
        print("❌ Owner login failed")
        return
    
    print(f"✅ Owner login successful\n")
    
    endpoints = [
        ("GET /sites", f"{BASE_URL}/api/sites"),
        ("GET /users", f"{BASE_URL}/api/users"),
        ("GET /reports", f"{BASE_URL}/api/reports"),
        ("GET /dips", f"{BASE_URL}/api/dips")
    ]
    
    for name, url in endpoints:
        print(f"\nTesting {name}:")
        
        # Test 1: Without Bearer token
        try:
            response = requests.get(url, timeout=10)
            print(f"  Without Bearer: {response.status_code}")
            if response.status_code not in [200, 401]:
                print(f"    Response body: {response.text[:200]}")
        except Exception as e:
            print(f"  Without Bearer: Error - {str(e)}")
        
        # Test 2: With Owner Bearer token
        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {owner_token}"},
                timeout=10
            )
            print(f"  With Owner Bearer: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    print(f"    Response: Array with {len(data)} items")
                else:
                    print(f"    Response: Object with keys: {list(data.keys())[:3]}")
        except Exception as e:
            print(f"  With Owner Bearer: Error - {str(e)}")

if __name__ == "__main__":
    test_auth_gates()
