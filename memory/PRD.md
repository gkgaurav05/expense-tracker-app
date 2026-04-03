# Expense Tracker MVP - Product Requirements Document

## Original Problem Statement
Create a web-based MVP Expense Tracker supporting expense logging, categorization, budgeting, weekly summaries, and visual insights. Targeted at students and professionals. INR currency, AI insights via Gemini.

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui + Recharts + Framer Motion
- **Backend**: FastAPI (Python) + Motor (async MongoDB driver)
- **Database**: MongoDB (collections: expenses, categories, budgets)
- **AI**: Google Gemini via emergentintegrations library
- **Design**: Hyper-Saturated Fluid (Cyber Yellow #FDE047 + Deep Onyx #0A0A0A)

## User Personas
1. **Student**: Tracks daily spending, limited budget, wants alerts
2. **Young Professional**: Manages monthly budgets, wants insights and reports to share

## What's Been Implemented (April 3, 2026)
### Phase 1 (MVP Core)
- [x] Full CRUD for expenses (add, list, filter, edit, delete)
- [x] 6 default categories + custom category creation
- [x] Budget setting per category with progress tracking
- [x] Dashboard with summary cards, bar chart, pie chart, recent expenses
- [x] AI-powered insights via Gemini
- [x] Glassmorphic UI with Cyber Yellow + Deep Onyx theme
- [x] Sidebar nav (desktop) + bottom bar (mobile)
- [x] Calendar date picker for expenses

### Phase 2 (New Features)
- [x] Expense editing UI (pre-filled modal with update)
- [x] Weekly/Monthly summary view with period navigation
- [x] CSV data export for expenses
- [x] Budget overspend alerts/notifications (80%+ warning, 100%+ exceeded)
- [x] Shareable monthly report with Copy Link, Web Share API, CSV download
- [x] 6-page navigation: Dashboard, Expenses, Budgets, Summary, Reports, Insights

## Backend Endpoints (15 total)
- CRUD: expenses (4), categories (3), budgets (3)
- Analytics: dashboard/summary, report/monthly, alerts
- Export: export/csv
- AI: insights

## Test Results
- Backend: 100% (23/23 tests passed)
- Frontend: 95%

## Prioritized Backlog
### P1 (High)
- User authentication (JWT or Google OAuth)
- Recurring expense support
- Multi-currency support

### P2 (Nice to Have)
- Dark/light theme toggle
- PDF report export with charts
- Budget alerts via email/push notifications
- Monthly trend comparison (month-over-month)
- Category icon picker for custom categories
- Expense attachments (receipts)
