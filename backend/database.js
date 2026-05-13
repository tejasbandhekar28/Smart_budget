const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'budget_tracker.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER DEFAULT 1,
    name        TEXT    NOT NULL,
    budget      REAL    NOT NULL DEFAULT 0,
    color_theme TEXT    DEFAULT 'blue',
    icon        TEXT    DEFAULT 'folder'
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER DEFAULT 1,
    category_id INTEGER,
    amount      REAL    NOT NULL,
    description TEXT    DEFAULT '',
    date        TEXT    NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS income (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER DEFAULT 1,
    source_name TEXT    NOT NULL,
    source_type TEXT    NOT NULL DEFAULT 'salary',
    amount      REAL    NOT NULL,
    description TEXT    DEFAULT '',
    date        TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monthly_budget (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER DEFAULT 1,
    year_month   TEXT    NOT NULL,
    budget_limit REAL    NOT NULL DEFAULT 0,
    UNIQUE(user_id, year_month)
  );

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname    TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'user'
  );
`);

// Simple schema migration for existing DB
['categories', 'expenses', 'income', 'monthly_budget'].forEach(table => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER DEFAULT 1;`);
  } catch(e) {
    // Column already exists
  }
});



console.log(`✅ SQLite database ready: ${DB_PATH}`);
module.exports = db;
