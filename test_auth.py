#!/usr/bin/env python3
"""
Quick test to check if authentication tokens work with Supabase API
"""

import requests
import json

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

# Login as owner
login_response = requests.post(f"{BASE_URL}/auth/login", 
                              json={"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!"})

if login_response.status_code == 200:
    login_data = login_response.json()
    access_token = login_data['session']['access_token']
    print(f"✅ Login successful, got token: {access_token[:50]}...")
    
    # Try to access sites with the token
    headers = {"Authorization": f"Bearer {access_token}"}
    sites_response = requests.get(f"{BASE_URL}/sites", headers=headers)
    
    print(f"Sites API response status: {sites_response.status_code}")
    print(f"Sites API response: {sites_response.text[:200]}...")
    
    # Try operator assignments
    assignments_response = requests.get(f"{BASE_URL}/operator-assignments", headers=headers)
    print(f"Operator assignments response status: {assignments_response.status_code}")
    print(f"Operator assignments response: {assignments_response.text[:200]}...")
    
else:
    print(f"❌ Login failed: {login_response.status_code} - {login_response.text}")