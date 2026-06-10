#!/usr/bin/env python3
"""Quick diagnostic to see actual response data"""

import requests
import json

BASE_URL = "https://fuel-ops-simple.preview.emergentagent.com"
OWNER_EMAIL = "owner@workflowlite.com"
PASSWORD = "WorkflowDemo2026!"
PARKRIDGE_SITE_ID = "88d9d2f8-fd66-4c1d-85c5-3cd21de7c4b0"

# Login
response = requests.post(
    f"{BASE_URL}/api/auth/login",
    json={"email": OWNER_EMAIL, "password": PASSWORD},
    timeout=10
)
token = response.json()["session"]["access_token"]

# Query PARKRIDGE
response = requests.get(
    f"{BASE_URL}/api/wetstock/reconciliation?siteIds={PARKRIDGE_SITE_ID}&startDate=2026-06-01&endDate=2026-06-04",
    headers={"Authorization": f"Bearer {token}"},
    timeout=10
)

data = response.json()
print(json.dumps(data, indent=2))

# Also test dashboard stats with siteIds
print("\n\n=== Dashboard Stats Test ===")
response = requests.get(
    f"{BASE_URL}/api/dashboard/stats?siteIds={PARKRIDGE_SITE_ID}",
    headers={"Authorization": f"Bearer {token}"},
    timeout=10
)
print(f"Status: {response.status_code}")
print(response.text)
