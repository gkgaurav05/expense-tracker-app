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
1. **Student**: Tracks daily spending (food, transport, entertainment), limited budget
2. **Young Professional**: Manages monthly budgets across categories, wants insights

## Core Requirements (Static)
- No authentication (MVP scope)
- INR (₹) currency
- 6 default categories + custom categories
- Monthly budgets per category
- AI-powered spending insights
- Mobile responsive

## What's Been Implemented (April 3, 2026)
- [x] Full CRUD for expenses (add, list, filter, delete, update)
- [x] 6 default categories with color coding + custom category creation
- [x] Budget setting per category with progress tracking
- [x] Dashboard with summary cards (total spent, weekly, budget remaining)
- [x] Daily spending bar chart (Recharts)
- [x] Category breakdown pie chart (Recharts)
- [x] Recent expenses list on dashboard
- [x] AI-powered insights via Gemini (emergentintegrations)
- [x] Glassmorphic UI with Cyber Yellow + Deep Onyx theme
- [x] Sidebar navigation (desktop) + bottom bar (mobile)
- [x] Add Expense dialog with calendar date picker
- [x] Category filter on expenses page
- [x] Framer Motion entrance animations

## Backend Tests: 100% passed (18/18)
## Frontend Tests: 95% passed

## Prioritized Backlog
### P0 (Critical)
- None remaining

### P1 (High)
- Expense editing (PUT endpoint exists, UI not implemented)
- Monthly/weekly summary email or report export

### P2 (Nice to Have)
- User authentication
- Recurring expense support
- Multi-currency support
- Dark/light theme toggle
- Data export (CSV/PDF)
- Budget alerts/notifications
- Charts: monthly trend view
- Category icon picker for custom categories

## Next Tasks
1. Add expense editing UI
2. Build weekly/monthly summary view with date range picker
3. Implement data export (CSV)
4. Add budget overspend warnings
