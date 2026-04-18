#!/usr/bin/env python3
"""
Debug RLS Assignment Issues - Detailed investigation
"""

import requests
import json
import sys
from datetime import datetime

# Test configuration
BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com/api"

def make_request(method, endpoint, data=None, headers=None):
    """Make HTTP request"""
    url = f"{BASE_URL}/{endpoint.lstrip('/')}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def debug_authentication():
    """Debug authentication responses"""
    print("=== DEBUGGING AUTHENTICATION ===")
    
    credentials = [
        {"email": "owner@workflowlite.com", "password": "WorkflowDemo2026!", "role": "owner"},
        {"email": "operator@workflowlite.com", "password": "WorkflowDemo2026!", "role": "operator"},
        {"email": "staff@workflowlite.com", "password": "WorkflowDemo2026!", "role": "staff"}
    ]
    
    for cred in credentials:
        print(f"\n--- Testing {cred['role']} login ---")
        response = make_request("POST", "/auth/login", {
            "email": cred["email"],
            "password": cred["password"]
        })
        
        if response:
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"User: {data.get('user', {})}")
                print(f"Sites count: {len(data.get('sites', []))}")
                print(f"Sites: {data.get('sites', [])}")
                if data.get('session'):
                    print(f"Session token: {data['session']['access_token'][:50]}...")
            else:
                print(f"Error: {response.text}")
        else:
            print("No response received")

def debug_seed_data():
    """Debug seed data"""
    print("\n=== DEBUGGING SEED DATA ===")
    
    response = make_request("POST", "/seed")
    
    if response:
        print(f"Seed Status Code: {response.status_code}")
        print(f"Seed Response: {response.text}")
    else:
        print("No seed response received")

def debug_direct_api_calls():
    """Debug direct API calls without auth"""
    print("\n=== DEBUGGING DIRECT API CALLS ===")
    
    # Test health check
    response = make_request("GET", "/health")
    if response:
        print(f"Health Check: {response.status_code} - {response.text}")
    
    # Test sites without auth
    response = make_request("GET", "/sites")
    if response:
        print(f"Sites (no auth): {response.status_code} - {response.text}")
    
    # Test operator assignments without auth
    response = make_request("GET", "/operator-assignments")
    if response:
        print(f"Operator assignments (no auth): {response.status_code} - {response.text}")
    
    # Test staff assignments without auth
    response = make_request("GET", "/staff-assignments")
    if response:
        print(f"Staff assignments (no auth): {response.status_code} - {response.text}")

def main():
    """Main debug execution"""
    print("RLS ASSIGNMENT DEBUG INVESTIGATION")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print(f"Debug started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        debug_direct_api_calls()
        debug_seed_data()
        debug_authentication()
        
    except Exception as e:
        print(f"\n\nUnexpected error during debugging: {e}")

if __name__ == "__main__":
    main()