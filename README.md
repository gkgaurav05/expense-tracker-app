# Spendrax

**Smart Expense Tracker with AI-Powered Insights**

A modern, full-stack expense tracking application built for students and professionals who want to quickly log, categorize, and understand their spending. Features a striking Hyper-Saturated Fluid UI with glassmorphic design elements, real-time budget alerts, and AI-driven spending analysis powered by Google Gemini.

---

## Features

- **Bank Statement Import** -- Upload bank statements (CSV, PDF, HTML) to bulk import transactions
  - **Local parsing** -- All files processed locally, no data sent externally
  - **Multi-page PDF support** -- Extracts transactions across all pages with column structure preservation
  - **GPay/PhonePe support** -- Handles UPI statement PDFs with garbled text extraction
  - **Traditional bank PDFs** -- Axis, HDFC, SBI, etc. with proper Withdrawal/Deposit column detection
  - **Password-protected PDFs** -- Enter password to decrypt encrypted bank statements
  - **Duplicate detection** -- Hash-based detection prevents re-importing same transactions; shown at preview stage
  - **Reversal detection** -- Auto-detects same-day matching debit/credit pairs (cancelled/reversed transactions)
  - **Auto-categorization** -- Keyword matching against 10 categories with 300+ merchant patterns
  - **Income detection** -- Automatically identifies credits/deposits as income
  - **Payee learning** -- Remembers your category choices for recurring payees
  - **AI fallback** -- Optional OpenAI extraction when local parsing fails (with consent)
- **Expense Management** -- Add, edit, delete expenses with category, description, and date picker (future dates blocked). Month navigator to browse expenses by month with inline summary stats (total spent, count). Category filter works within the selected month.
- **Smart Categories** -- 10 pre-built categories (Food & Dining, Groceries, Transport, Travel, Shopping, Entertainment, Subscriptions, Health, Education, Bills & Utilities) + custom categories
- **Month-wise Budget Tracking** -- Set budgets per category per month with visual progress bars, month navigation, and month summary card showing total budget/spent/remaining with days tracker for current month
- **Budget History** -- Navigate to any previous month to view or set budgets; each month maintains its own budget configuration
- **Budget Alerts** -- Real-time warnings when spending reaches 80% (Near Limit) or exceeds 100% (Over Budget) of category budgets, scoped to the selected month across Dashboard and Budgets pages
- **Dashboard** -- Month-navigable overview with total monthly spend, weekly spend (current month) or avg/day (past months), budget remaining, daily spending bar chart, category pie chart, budget alerts, and recent expenses -- all scoped to the selected month
- **Weekly/Monthly Summary** -- Period navigation with trend charts and category breakdown with percentage bars
- **Savings Tracker** -- Dedicated page analyzing budget performance over 3/6/12 months with monthly breakdown, cumulative category savings, savings rate percentage, and motivational feedback
- **AI Insights** -- Month-navigable OpenAI-powered spending analysis with pace projections, budget exceed warnings, previous month comparison, and personalized savings tips
- **Shareable Reports** -- Monthly report cards with share via Web Share API, copy link, or CSV download
- **CSV Export** -- Download all expense data as CSV
- **INR Currency** -- Formatted in Indian Rupees throughout
- **User Authentication** -- JWT-based auth with login/register, user-scoped data (each user sees only their own expenses/budgets)

---

## Tech Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19, Tailwind CSS, shadcn/ui, Recharts, Framer Motion       |
| Backend    | FastAPI (Python), Motor (async MongoDB driver)                    |
| Database   | MongoDB 7                                                         |
| Auth       | JWT (python-jose), bcrypt password hashing, OAuth2PasswordBearer  |
| AI         | OpenAI GPT-4o-mini                                                |
| Deployment | Docker, Docker Compose, Nginx (production reverse proxy)          |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- An **OpenAI API Key** for AI insights (optional -- app works without it, AI insights will be unavailable)

---

## Quick Start (Docker)

### 1. Clone the repository

```bash
git clone <your-repo-url> spendrax
cd spendrax
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your OpenAI API key (optional):

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=spendrax_db
CORS_ORIGINS=*
OPENAI_API_KEY=your_key_here
JWT_SECRET_KEY=your-secret-key-change-in-production
```

> **Note:** `MONGO_URL` is automatically overridden by Docker Compose to `mongodb://mongo:27017`. The `.env` value is a fallback for non-Docker environments.

### 3. Build and run (Production)

```bash
docker compose up --build -d
```

This starts 3 containers:

| Service      | Container             | Port  | Description                          |
| ------------ | --------------------- | ----- | ------------------------------------ |
| `mongo`      | spendrax-mongo        | 27017 | MongoDB database                     |
| `backend`    | spendrax-backend      | 8001  | FastAPI REST API                     |
| `frontend`   | spendrax-frontend     | 3000  | React app served via Nginx           |

### 4. Open the app

```
http://localhost:3000
```

The Nginx reverse proxy handles routing:
- `/api/*` requests are proxied to the backend on port 8001
- All other requests serve the React SPA

---

## Development Mode (with Hot Reload)

For active development with live code reloading:

```bash
docker compose -f docker-compose.dev.yml up --build
```

| Feature          | Production (`docker-compose.yml`)  | Development (`docker-compose.dev.yml`)     |
| ---------------- | ---------------------------------- | ------------------------------------------ |
| Frontend         | Nginx + static build               | React dev server with hot reload           |
| Backend          | Uvicorn (standard)                 | Uvicorn with `--reload`                    |
| Source mounting   | No                                 | Yes (edit files, see changes instantly)    |
| API URL          | Same origin (Nginx proxy)          | `http://localhost:8001` (direct)           |

In development mode, edit files in `backend/` and `frontend/src/` -- changes reflect immediately.

---

## Stopping the App

```bash
# Production
docker compose down

# Development
docker compose -f docker-compose.dev.yml down

# Remove volumes (deletes all data)
docker compose down -v
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable           | Required | Description                                    |
| ------------------ | -------- | ---------------------------------------------- |
| `MONGO_URL`        | Yes      | MongoDB connection string                      |
| `DB_NAME`          | Yes      | Database name (default: `spendrax_db`)         |
| `CORS_ORIGINS`     | Yes      | Allowed CORS origins (`*` for all)             |
| `OPENAI_API_KEY`   | No       | OpenAI API key for AI-powered insights         |
| `JWT_SECRET_KEY`   | Yes      | Secret key for JWT token signing               |

### Frontend (`frontend/.env`)

| Variable                  | Required | Description                                      |
| ------------------------- | -------- | ------------------------------------------------ |
| `REACT_APP_BACKEND_URL`   | No       | Backend URL. Empty for Docker (Nginx proxies).   |

---

## Project Structure

```
spendrax/
+-- docker-compose.yml          # Production orchestration
+-- docker-compose.dev.yml      # Development orchestration
+-- .dockerignore
|
+-- backend/
|   +-- Dockerfile              # Python 3.11 slim image
|   +-- .dockerignore
|   +-- .env                    # Environment variables (git-ignored)
|   +-- .env.example            # Template for .env
|   +-- server.py               # App setup, startup events, CORS, router wiring
|   +-- database.py             # MongoDB client & db instance
|   +-- models.py               # Pydantic request models
|   +-- auth.py                 # JWT utilities, password hashing, get_current_user
|   +-- requirements.txt        # Python dependencies
|   +-- parsers/                # Bank statement parsing module
|   |   +-- __init__.py         # Module exports
|   |   +-- csv_parser.py       # CSV statement parser
|   |   +-- html_parser.py      # HTML statement parser
|   |   +-- pdf_parser.py       # PDF parser (multi-page, GPay/PhonePe, traditional banks)
|   |   +-- utils.py            # Categorization keywords, duplicate/reversal detection
|   +-- routes/
|       +-- auth.py             # /api/auth (register, login, me)
|       +-- categories.py       # /api/categories CRUD
|       +-- expenses.py         # /api/expenses CRUD + upload/bulk import
|       +-- budgets.py          # /api/budgets CRUD
|       +-- dashboard.py        # /api/dashboard/summary
|       +-- alerts.py           # /api/alerts
|       +-- reports.py          # /api/report/monthly + /api/export/csv
|       +-- insights.py         # /api/insights (OpenAI)
|
+-- frontend/
    +-- Dockerfile              # Multi-stage: Node build + Nginx serve
    +-- Dockerfile.dev          # Development: Node + yarn start
    +-- .dockerignore
    +-- .env.example            # Template for .env
    +-- nginx.conf              # Nginx config (reverse proxy + SPA)
    +-- package.json
    +-- yarn.lock
    +-- public/
    +-- src/
        +-- App.js              # Root component with routing
        +-- App.css             # Glassmorphic styles & animations
        +-- index.css           # Design system CSS variables
        +-- lib/
        |   +-- api.js          # API client + INR formatter
        |   +-- utils.js        # shadcn utility
        +-- context/
        |   +-- AuthContext.js  # Auth state management (user, token, login/logout)
        +-- pages/
        |   +-- Login.js        # Login page
        |   +-- Register.js     # Registration page
        |   +-- Dashboard.js    # Overview with charts & stats
        |   +-- Expenses.js     # Expense CRUD + filtering
        |   +-- Budgets.js      # Budget management per category
        |   +-- Summary.js      # Weekly/monthly analysis
        |   +-- Reports.js      # Shareable monthly report
        |   +-- Insights.js     # AI-powered spending analysis
        +-- components/
            +-- Sidebar.js              # Navigation (desktop + mobile) + logout
            +-- ProtectedRoute.js       # Route guard for authenticated users
            +-- AddExpenseModal.js      # Add/edit expense dialog
            +-- UploadStatementModal.js # Bank statement upload with preview
            +-- SpendingCharts.js       # Recharts bar & pie charts
            +-- BudgetAlerts.js         # Overspend alert banners
            +-- ui/                     # shadcn/ui components
```

---

## API Endpoints

All endpoints are prefixed with `/api`. Endpoints marked with 🔒 require authentication (JWT token in `Authorization: Bearer <token>` header).

### Authentication

| Method   | Endpoint                | Description              |
| -------- | ----------------------- | ------------------------ |
| `POST`   | `/api/auth/register`    | Register new user        |
| `POST`   | `/api/auth/login`       | Login (returns JWT token)|
| `GET`    | `/api/auth/me`          | Get current user 🔒      |

### Expenses 🔒

| Method   | Endpoint                    | Description              |
| -------- | --------------------------- | ------------------------ |
| `GET`    | `/api/expenses`             | List user's expenses (filterable by `category`, `start_date`, `end_date`) |
| `POST`   | `/api/expenses`             | Create expense           |
| `PUT`    | `/api/expenses/{id}`        | Update expense           |
| `DELETE` | `/api/expenses/{id}`        | Delete expense           |
| `POST`   | `/api/expenses/upload`      | Upload bank statement (CSV/PDF/HTML). Query params: `use_ai=false`, `password=<pdf_password>` |
| `POST`   | `/api/expenses/bulk`        | Bulk create expenses from uploaded statement |
| `GET`    | `/api/expenses/payee-mappings` | Get saved payee-to-category mappings |
| `POST`   | `/api/expenses/apply-mappings` | Apply saved mappings to transactions |

### Categories 🔒

| Method   | Endpoint                  | Description                     |
| -------- | ------------------------- | ------------------------------- |
| `GET`    | `/api/categories`         | List default + user's custom categories |
| `POST`   | `/api/categories`         | Create custom category          |
| `DELETE` | `/api/categories/{id}`    | Delete custom category (not default) |

### Budgets 🔒

| Method   | Endpoint                | Description                                          |
| -------- | ----------------------- | ---------------------------------------------------- |
| `GET`    | `/api/budgets`          | List user's budgets (filterable by `?month=YYYY-MM`) |
| `POST`   | `/api/budgets`          | Create or update budget (with `month` field)         |
| `DELETE` | `/api/budgets/{id}`     | Delete budget                                        |

### Analytics & Reports 🔒

| Method   | Endpoint                  | Description                                |
| -------- | ------------------------- | ------------------------------------------ |
| `GET`    | `/api/dashboard/summary`  | Dashboard stats (`?month=YYYY-MM`)         |
| `GET`    | `/api/report/monthly`     | Monthly report (`?month=YYYY-MM`)          |
| `GET`    | `/api/alerts`             | Budget overspend alerts (`?month=YYYY-MM`) |
| `GET`    | `/api/export/csv`         | Download user's expenses as CSV            |
| `POST`   | `/api/insights`           | Generate AI spending insights (`?month=YYYY-MM`) |

---

## Useful Docker Commands

```bash
# View logs
docker compose logs -f                  # All services
docker compose logs -f backend          # Backend only
docker compose logs -f frontend         # Frontend only

# Rebuild a single service
docker compose up --build backend -d

# Access MongoDB shell
docker exec -it spendrax-mongo mongosh

# Check running containers
docker compose ps

# Restart a service
docker compose restart backend
```

---

## Running Without Docker

If you prefer running locally without Docker:

### Prerequisites
- Python 3.11+
- Node.js 20+
- Yarn
- MongoDB 7 (running on localhost:27017)

### Backend
```bash
cd backend
cp .env.example .env        # Edit with your values
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn install
yarn start
```

Open `http://localhost:3000`.

---

## Database

MongoDB collections are auto-created on first use:

- **users** -- User accounts (email, hashed password, name)
- **categories** -- 10 default categories seeded on startup + user custom categories
- **expenses** -- User expense records (scoped by `user_id`)
- **budgets** -- Month-wise budget limits per category (scoped by `user_id` + category + YYYY-MM month)
- **payee_mappings** -- Learned payee-to-category mappings for statement imports (scoped by `user_id`)

Data persists in a Docker volume (`mongo_data`). To reset:
```bash
docker compose down -v
docker compose up --build -d
```

---

## License

MIT
