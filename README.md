# 💰 Personal Finance Smart Budgeter

## ✅ What was fixed
- **Uses Node.js built-in SQLite** (`node:sqlite`) — no MySQL, no XAMPP, no native compilation errors
- Fixed "Add Expense" & "Add Category" form errors
- Fixed `.env` loading
- Server serves the frontend directly — just open your browser!

---

## 🚀 Setup (3 steps)

```bash
# 1. Open Terminal in the budget-fixed folder
cd /Users/tejasbandhekar/Desktop/budget-fixed

# 2. Install only 3 small packages (express, cors, dotenv — pure JS, no compiling)
npm install

# 3. Start
npm start
```

Then open: **http://localhost:5000** 🎉

The `budget_tracker.db` file is created automatically on first run.

---

## Requirements
- **Node.js v22.5 or higher** (you have v25.8.0 ✅)
- No MySQL, no XAMPP, no extra software

---

## 📁 Project Structure

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
