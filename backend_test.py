#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta

class ExpenseTrackerAPITester:
    def __init__(self, base_url="https://money-dash-26.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    print(f"   Response: {response.text[:100]}...")
            else:
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            return success, response.json() if response.text else {}

        except Exception as e:
            self.failed_tests.append(f"{name}: Error - {str(e)}")
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_categories(self):
        """Test category endpoints"""
        print("\n" + "="*50)
        print("TESTING CATEGORIES")
        print("="*50)
        
        # Get categories (should have 6 default)
        success, categories = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200
        )
        
        if success:
            print(f"   Found {len(categories)} categories")
            default_cats = [c for c in categories if c.get('is_default')]
            print(f"   Default categories: {len(default_cats)}")
            
        # Create custom category
        success, new_cat = self.run_test(
            "Create Custom Category",
            "POST",
            "categories",
            200,
            data={"name": "Test Category", "icon": "test", "color": "#FF0000"}
        )
        
        custom_cat_id = None
        if success and new_cat:
            custom_cat_id = new_cat.get('id')
            
        # Try to create duplicate category (should fail)
        self.run_test(
            "Create Duplicate Category (should fail)",
            "POST",
            "categories",
            400,
            data={"name": "Test Category", "icon": "test", "color": "#FF0000"}
        )
        
        # Delete custom category
        if custom_cat_id:
            self.run_test(
                "Delete Custom Category",
                "DELETE",
                f"categories/{custom_cat_id}",
                200
            )
            
        return categories

    def test_expenses(self, categories):
        """Test expense endpoints"""
        print("\n" + "="*50)
        print("TESTING EXPENSES")
        print("="*50)
        
        # Get expenses (initially empty)
        success, expenses = self.run_test(
            "Get Expenses (empty)",
            "GET",
            "expenses",
            200
        )
        
        # Create expense
        today = datetime.now().strftime("%Y-%m-%d")
        category_name = categories[0]['name'] if categories else "Food & Dining"
        
        success, new_expense = self.run_test(
            "Create Expense",
            "POST",
            "expenses",
            200,
            data={
                "amount": 500.0,
                "category": category_name,
                "description": "Test expense",
                "date": today
            }
        )
        
        expense_id = None
        if success and new_expense:
            expense_id = new_expense.get('id')
            
        # Get expenses (should have 1)
        success, expenses = self.run_test(
            "Get Expenses (with data)",
            "GET",
            "expenses",
            200
        )
        
        # Get expenses with category filter
        self.run_test(
            "Get Expenses with Category Filter",
            "GET",
            "expenses",
            200,
            params={"category": category_name}
        )
        
        # Update expense
        if expense_id:
            self.run_test(
                "Update Expense",
                "PUT",
                f"expenses/{expense_id}",
                200,
                data={
                    "amount": 600.0,
                    "category": category_name,
                    "description": "Updated test expense",
                    "date": today
                }
            )
            
        # Delete expense
        if expense_id:
            self.run_test(
                "Delete Expense",
                "DELETE",
                f"expenses/{expense_id}",
                200
            )
            
        return expense_id

    def test_budgets(self, categories):
        """Test budget endpoints"""
        print("\n" + "="*50)
        print("TESTING BUDGETS")
        print("="*50)
        
        # Get budgets (initially empty)
        success, budgets = self.run_test(
            "Get Budgets (empty)",
            "GET",
            "budgets",
            200
        )
        
        # Create budget
        category_name = categories[0]['name'] if categories else "Food & Dining"
        
        success, new_budget = self.run_test(
            "Create Budget",
            "POST",
            "budgets",
            200,
            data={
                "category": category_name,
                "amount": 5000.0
            }
        )
        
        budget_id = None
        if success and new_budget:
            budget_id = new_budget.get('id')
            
        # Update budget (same endpoint)
        self.run_test(
            "Update Budget",
            "POST",
            "budgets",
            200,
            data={
                "category": category_name,
                "amount": 6000.0
            }
        )
        
        # Get budgets (should have 1)
        success, budgets = self.run_test(
            "Get Budgets (with data)",
            "GET",
            "budgets",
            200
        )
        
        # Delete budget
        if budget_id:
            self.run_test(
                "Delete Budget",
                "DELETE",
                f"budgets/{budget_id}",
                200
            )
            
        return budget_id

    def test_dashboard_summary(self):
        """Test dashboard summary endpoint"""
        print("\n" + "="*50)
        print("TESTING DASHBOARD SUMMARY")
        print("="*50)
        
        success, summary = self.run_test(
            "Get Dashboard Summary",
            "GET",
            "dashboard/summary",
            200
        )
        
        if success:
            expected_fields = [
                'total_month', 'total_week', 'total_budget', 'budget_remaining',
                'category_breakdown', 'daily_spending', 'recent_expenses', 'expense_count'
            ]
            for field in expected_fields:
                if field in summary:
                    print(f"   ✅ {field}: {summary[field]}")
                else:
                    print(f"   ❌ Missing field: {field}")
                    
        return summary

    def test_insights(self):
        """Test AI insights endpoint"""
        print("\n" + "="*50)
        print("TESTING AI INSIGHTS")
        print("="*50)
        
        success, insights = self.run_test(
            "Get AI Insights",
            "POST",
            "insights",
            200
        )
        
        if success and insights:
            print(f"   Insights: {insights.get('insights', 'No insights')[:100]}...")
            
        return insights

    def test_root_endpoint(self):
        """Test root API endpoint"""
        print("\n" + "="*50)
        print("TESTING ROOT ENDPOINT")
        print("="*50)
        
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )
        
        return response

def main():
    print("🚀 Starting Expense Tracker API Tests")
    print(f"Testing against: https://money-dash-26.preview.emergentagent.com")
    
    tester = ExpenseTrackerAPITester()
    
    # Test all endpoints
    tester.test_root_endpoint()
    categories = tester.test_categories()
    tester.test_expenses(categories)
    tester.test_budgets(categories)
    tester.test_dashboard_summary()
    tester.test_insights()
    
    # Print final results
    print("\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    if tester.failed_tests:
        print("\n❌ Failed tests:")
        for failure in tester.failed_tests:
            print(f"   - {failure}")
    else:
        print("\n✅ All tests passed!")
        
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"\n📈 Success rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())