require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-budget-tracker';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// --- Crypto Utils ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, hashStr) {
  const [salt, key] = hashStr.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return key === derivedKey;
}

function generateJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify({...payload, exp: Date.now() + 86400000})).toString('base64url'); // 1 day
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payloadStr}`).digest('base64url');
  return `${header}.${payloadStr}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (signature !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// --- Auth Middleware ---
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyJWT(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = payload;
  next();
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/test-db', (req, res) => {
  try {
    const row = db.prepare('SELECT 1+1 AS v').get();
    res.json({ ok: true, v: row.v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/register', (req, res) => {
  const { fullname, email, password, role } = req.body;
  if (!fullname || !email || !password) return res.status(400).json({ error: 'Full name, email, and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  
  try {
    const userRole = role === 'admin' ? 'admin' : 'user';
    const hashed = hashPassword(password);
    const r = db.prepare('INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)').run(
      fullname.trim(), email.trim().toLowerCase(), hashed, userRole
    );
    const newUserId = r.lastInsertRowid;

    // Automatically seed default categories for the new user
    const ins = db.prepare('INSERT INTO categories (user_id, name, budget, color_theme, icon) VALUES (?, ?, ?, ?, ?)');
    [
      ['Food & Dining',     500, 'green',  'fork-knife'],
      ['Transportation',    300, 'blue',   'car'],
      ['Shopping',          400, 'purple', 'bag'],
      ['Entertainment',     200, 'orange', 'television'],
      ['Bills & Utilities', 600, 'red',    'receipt'],
      ['Health',            250, 'pink',   'heart'],
      ['Rent',              800, 'blue',   'house'],
      ['Travel',            300, 'orange', 'airplane'],
      ['Others',            150, 'green',  'folder'],
    ].forEach(row => ins.run(newUserId, ...row));

    res.status(201).json({ message: 'Registration successful', id: newUserId });
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateJWT({ id: user.id, email: user.email, role: user.role, fullname: user.fullname });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, fullname: user.fullname } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api', requireAuth); // Apply auth middleware to all routes below this line!

// ══════════════════════════════════════════════════════════════════════════════
//  CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/categories', (req, res) => {
  try {
    let rows = db.prepare(`
      SELECT c.id, c.name, c.budget, c.color_theme, c.icon,
             COALESCE(SUM(e.amount),0) AS spent
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = ?
      WHERE c.user_id = ?
      GROUP BY c.id ORDER BY c.id
    `).all(req.user.id, req.user.id);
    
    // Auto-seed if empty (handles pre-existing users without default categories)
    if (rows.length === 0) {
      const ins = db.prepare('INSERT INTO categories (user_id, name, budget, color_theme, icon) VALUES (?, ?, ?, ?, ?)');
      [
        ['Food & Dining',     500, 'green',  'fork-knife'],
        ['Transportation',    300, 'blue',   'car'],
        ['Shopping',          400, 'purple', 'bag'],
        ['Entertainment',     200, 'orange', 'television'],
        ['Bills & Utilities', 600, 'red',    'receipt'],
        ['Health',            250, 'pink',   'heart'],
        ['Rent',              800, 'blue',   'house'],
        ['Travel',            300, 'orange', 'airplane'],
        ['Others',            150, 'green',  'folder'],
      ].forEach(row => ins.run(req.user.id, ...row));
      
      // Re-fetch after seeding
      rows = db.prepare(`
        SELECT c.id, c.name, c.budget, c.color_theme, c.icon,
               COALESCE(SUM(e.amount),0) AS spent
        FROM categories c
        LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = ?
        WHERE c.user_id = ?
        GROUP BY c.id ORDER BY c.id
      `).all(req.user.id, req.user.id);
    }

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', (req, res) => {
  const { name, budget, color_theme, icon } = req.body;
  if (!name || budget == null) return res.status(400).json({ error: 'name and budget required' });
  try {
    const r = db.prepare('INSERT INTO categories (user_id,name,budget,color_theme,icon) VALUES(?,?,?,?,?)').run(
      req.user.id, name.trim(), parseFloat(budget), color_theme||'blue', icon||'folder'
    );
    const cat = db.prepare('SELECT * FROM categories WHERE id=? AND user_id=?').get(r.lastInsertRowid, req.user.id);
    cat.spent = 0;
    res.status(201).json(cat);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categories/:id', (req, res) => {
  const { name, budget, color_theme, icon } = req.body;
  try {
    const r = db.prepare('UPDATE categories SET name=?,budget=?,color_theme=?,icon=? WHERE id=? AND user_id=?').run(
      name, parseFloat(budget), color_theme||'blue', icon||'folder', req.params.id, req.user.id
    );
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM categories WHERE id=? AND user_id=?').get(req.params.id, req.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM categories WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  EXPENSES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/expenses', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT e.id, e.amount, e.description, e.date, e.category_id,
             c.name AS category_name, c.color_theme AS category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
      ORDER BY e.date DESC, e.id DESC
    `).all(req.user.id);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/expenses', (req, res) => {
  const { category_id, amount, description, date } = req.body;
  if (!category_id || !amount || !date) return res.status(400).json({ error: 'category_id, amount, date required' });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const r = db.prepare('INSERT INTO expenses (user_id,category_id,amount,description,date) VALUES(?,?,?,?,?)').run(
      req.user.id, parseInt(category_id), amt, description||'', date
    );
    const row = db.prepare(`
      SELECT e.id, e.amount, e.description, e.date, e.category_id,
             c.name AS category_name, c.color_theme AS category_color
      FROM expenses e LEFT JOIN categories c ON e.category_id=c.id WHERE e.id=? AND e.user_id=?
    `).get(r.lastInsertRowid, req.user.id);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/expenses/:id', (req, res) => {
  const { category_id, amount, description, date } = req.body;
  if (!category_id || !amount || !date) return res.status(400).json({ error: 'category_id, amount, date required' });
  try {
    const r = db.prepare('UPDATE expenses SET category_id=?,amount=?,description=?,date=? WHERE id=? AND user_id=?').run(
      parseInt(category_id), parseFloat(amount), description||'', date, req.params.id, req.user.id
    );
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    const row = db.prepare(`
      SELECT e.id, e.amount, e.description, e.date, e.category_id,
             c.name AS category_name, c.color_theme AS category_color
      FROM expenses e LEFT JOIN categories c ON e.category_id=c.id WHERE e.id=? AND e.user_id=?
    `).get(req.params.id, req.user.id);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM expenses WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  INCOME
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/income', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM income WHERE user_id=? ORDER BY date DESC, id DESC').all(req.user.id);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/income', (req, res) => {
  const { source_name, source_type, amount, description, date } = req.body;
  if (!source_name || !amount || !date) return res.status(400).json({ error: 'source_name, amount, date required' });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const r = db.prepare('INSERT INTO income (user_id,source_name,source_type,amount,description,date) VALUES(?,?,?,?,?,?)').run(
      req.user.id, source_name.trim(), source_type||'salary', amt, description||'', date
    );
    res.status(201).json(db.prepare('SELECT * FROM income WHERE id=? AND user_id=?').get(r.lastInsertRowid, req.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/income/:id', (req, res) => {
  const { source_name, source_type, amount, description, date } = req.body;
  if (!source_name || !amount || !date) return res.status(400).json({ error: 'source_name, amount, date required' });
  try {
    const r = db.prepare('UPDATE income SET source_name=?,source_type=?,amount=?,description=?,date=? WHERE id=? AND user_id=?').run(
      source_name.trim(), source_type||'salary', parseFloat(amount), description||'', date, req.params.id, req.user.id
    );
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM income WHERE id=? AND user_id=?').get(req.params.id, req.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/income/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM income WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  MONTHLY BUDGET
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/monthly-budget', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM monthly_budget WHERE user_id=? ORDER BY year_month DESC').all(req.user.id);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monthly-budget/:ym', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM monthly_budget WHERE year_month=? AND user_id=?').get(req.params.ym, req.user.id);
    res.json(row || { year_month: req.params.ym, budget_limit: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/monthly-budget', (req, res) => {
  const { year_month, budget_limit } = req.body;
  if (!year_month || budget_limit == null) return res.status(400).json({ error: 'year_month and budget_limit required' });
  try {
    db.prepare('INSERT INTO monthly_budget (user_id,year_month,budget_limit) VALUES(?,?,?) ON CONFLICT(user_id, year_month) DO UPDATE SET budget_limit=excluded.budget_limit').run(
      req.user.id, year_month, parseFloat(budget_limit)
    );
    res.json(db.prepare('SELECT * FROM monthly_budget WHERE year_month=? AND user_id=?').get(year_month, req.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYSIS  GET /api/analysis/:YYYY-MM
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/analysis/:ym', (req, res) => {
  try {
    const ym = req.params.ym; // e.g. "2026-04"

    // Total income this month
    const incomeRow = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM income WHERE strftime('%Y-%m',date)=? AND user_id=?`).get(ym, req.user.id);

    // Total expenses this month
    const expRow = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE strftime('%Y-%m',date)=? AND user_id=?`).get(ym, req.user.id);

    // Category breakdown this month
    const catBreakdown = db.prepare(`
      SELECT c.name, c.color_theme, COALESCE(SUM(e.amount),0) AS total
      FROM categories c
      LEFT JOIN expenses e ON c.id=e.category_id AND strftime('%Y-%m',e.date)=? AND e.user_id=?
      WHERE c.user_id=?
      GROUP BY c.id HAVING total > 0
      ORDER BY total DESC
    `).all(ym, req.user.id, req.user.id);

    // Monthly trend: last 6 months expenses
    const trend = db.prepare(`
      SELECT strftime('%Y-%m',date) AS month, SUM(amount) AS total
      FROM expenses
      WHERE date >= date('now','-5 months','start of month') AND user_id=?
      GROUP BY month ORDER BY month
    `).all(req.user.id);

    // Monthly trend income: last 6 months
    const incomeTrend = db.prepare(`
      SELECT strftime('%Y-%m',date) AS month, SUM(amount) AS total
      FROM income
      WHERE date >= date('now','-5 months','start of month') AND user_id=?
      GROUP BY month ORDER BY month
    `).all(req.user.id);

    // Budget for this month
    const budget = db.prepare('SELECT budget_limit FROM monthly_budget WHERE year_month=? AND user_id=?').get(ym, req.user.id);

    // Days elapsed in the month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const daysPassed  = now.getMonth()+1 === parseInt(ym.split('-')[1]) && now.getFullYear() === parseInt(ym.split('-')[0])
      ? now.getDate()
      : daysInMonth;

    const totalExpenses = expRow.total;
    const totalIncome   = incomeRow.total;
    const netBalance    = totalIncome - totalExpenses;
    const budgetLimit   = budget ? budget.budget_limit : 0;

    // Predicted end-of-month spending
    const dailyAvg     = daysPassed > 0 ? totalExpenses / daysPassed : 0;
    const predicted     = dailyAvg * daysInMonth;

    // Top category
    const topCategory   = catBreakdown.length > 0 ? catBreakdown[0] : null;

    // Savings potential (categories with most spending)
    const suggestions = catBreakdown.slice(0, 3).map(c => ({
      name: c.name,
      total: c.total,
      saveEstimate: +(c.total * 0.2).toFixed(2),
    }));

    res.json({
      month: ym,
      totalIncome,
      totalExpenses,
      netBalance,
      budgetLimit,
      budgetUsedPct: budgetLimit > 0 ? +((totalExpenses / budgetLimit) * 100).toFixed(1) : null,
      overBudget: budgetLimit > 0 && totalExpenses > budgetLimit,
      overIncome: totalIncome > 0 && totalExpenses > totalIncome,
      additionalNeeded: totalExpenses > totalIncome ? +(totalExpenses - totalIncome).toFixed(2) : 0,
      predictedMonthEnd: +predicted.toFixed(2),
      dailyAvg: +dailyAvg.toFixed(2),
      catBreakdown,
      topCategory,
      suggestions,
      trend,
      incomeTrend,
      daysInMonth,
      daysPassed,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀  Budget Tracker running at http://localhost:${PORT}\n`);
});
