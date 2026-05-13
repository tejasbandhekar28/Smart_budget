# Personal Finance Smart Budgeter

Personal Finance Smart Budgeter is a web-based finance management system that helps users track income, expenses, and monthly budgets efficiently. It provides financial insights, spending analysis, savings suggestions, and visual reports to improve personal money management and decision-making.

## What was fixed
- **Uses Node.js built-in SQLite** (`node:sqlite`) — no MySQL, no XAMPP, no native compilation errors
- Fixed "Add Expense" & "Add Category" form errors
- Fixed `.env` loading
- Server serves the frontend directly — just open your browser!


---
## Features
- User Registration & Secure Login
- Dashboard for Financial Overview
- Income Tracking System
- Expense Management
- Monthly Budget Planning
- Spending Categories Management
- Financial Analysis & Reports
- Savings Suggestions
- Income vs Expense Trends
- Smart Insights & Predictions

---

## Project Objectives
- Track daily income and expenses
- Manage monthly budgets efficiently
- Improve financial awareness
- Provide analytical insights through charts and reports
- Support better financial decision-making
---

## Project Structure

```
budget-fixed/
├── backend/
│   ├── server.js       ← Express API
│   └── database.js     ← Uses node:sqlite (built into Node!)
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── budget_tracker.db   ← Auto-created on first run
├── .env                ← PORT=5000
└── package.json
```
