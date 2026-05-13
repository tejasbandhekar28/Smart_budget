// --- Auth Check ---
const token = localStorage.getItem('budget_token');
const userStr = localStorage.getItem('budget_user');

if (!token || !userStr) {
  window.location.href = 'login.html';
}

const currentUser = userStr ? JSON.parse(userStr) : null;

// --- Global Fetch Interceptor ---
const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  if (!config) config = {};
  if (!config.headers) config.headers = {};
  
  if (typeof resource === 'string' && (resource.startsWith('/api') || resource.startsWith(window.location.origin) || resource.startsWith('http://localhost'))) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await originalFetch(resource, config);
  
  if (res.status === 401) {
    localStorage.removeItem('budget_token');
    localStorage.removeItem('budget_user');
    window.location.href = 'login.html';
  }
  return res;
};

const API = 'http://localhost:3001/api';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  categories: [], expenses: [], income: [],
  monthlyBudgets: [], analysis: null,
  currentView: 'dashboard',
  currentMonth: todayYM(),
};

let pieChartInst = null, barChartInst = null,
    analysisPieInst = null, trendChartInst = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmt(n) {
  return '$' + (isNaN(n)||n==null?0:n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB');
}
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}
function incomeTypeLabel(t) {
  return {salary:'💼 Salary',business:'🏢 Business',freelance:'💻 Freelance',
          investment:'📈 Investment',rental:'🏠 Rental',other:'📦 Other'}[t] || t;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initApp() {
  if (currentUser) {
    document.getElementById('user-greeting').textContent = `Hi, ${currentUser.fullname.split(' ')[0]}!`;
    const adminNav = document.getElementById('nav-admin');
    if (currentUser.role === 'admin' && adminNav) {
      adminNav.style.display = 'flex';
      if (window.location.search.includes('role=admin')) {
        state.currentView = 'admin';
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('budget_token');
    localStorage.removeItem('budget_user');
    window.location.href = 'login.html';
  });

  setupNav();
  setupModalClose();
  setupAddButtons();
  setupFilters();

  // Set month pickers to current month
  ['budget-month-picker','analysis-month-picker'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = state.currentMonth;
  });

  await fetchAll();
  renderCurrentView();
}

// ─── Data ─────────────────────────────────────────────────────────────────────
async function fetchAll() {
  try {
    const [cr, er, ir, mbr] = await Promise.all([
      fetch(`${API}/categories`), fetch(`${API}/expenses`),
      fetch(`${API}/income`),    fetch(`${API}/monthly-budget`),
    ]);
    if (cr.ok) state.categories    = await cr.json();
    if (er.ok) state.expenses      = await er.json();
    if (ir.ok) state.income        = await ir.json();
    if (mbr.ok) state.monthlyBudgets = await mbr.json();
  } catch (e) { console.error('fetchAll error:', e); }
}

async function fetchAnalysis(ym) {
  try {
    const r = await fetch(`${API}/analysis/${ym}`);
    if (r.ok) state.analysis = await r.json();
  } catch(e) { console.error(e); }
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  );
}

function switchView(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`${name}-view`);
  if (el) el.classList.add('active');
  state.currentView = name;
  renderCurrentView();
}

async function renderCurrentView() {
  const v = state.currentView;
  if (v === 'dashboard') await renderDashboard();
  else if (v === 'income') renderIncomeView();
  else if (v === 'expenses') renderExpensesView();
  else if (v === 'budget') await renderBudgetView();
  else if (v === 'analysis') await renderAnalysisView();
  else if (v === 'categories') renderCategoriesView();
  else if (v === 'admin') renderAdminView();
}

function renderAdminView() {
  // Simple stub for admin view rendering
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
const overlay = document.getElementById('modal-overlay');

function setupModalClose() {
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.close-modal')) closeAllModals();
  });
}

function openModal(id) {
  closeAllModals();
  overlay.classList.add('active');
  document.getElementById(id).classList.add('active');
}

function closeAllModals() {
  overlay.classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ─── Add buttons ──────────────────────────────────────────────────────────────
function setupAddButtons() {
  document.addEventListener('click', e => {
    if (e.target.closest('.btn-add-expense')) openExpenseModal();
    if (e.target.closest('.btn-add-income'))  openIncomeModal();
  });
  document.getElementById('btn-add-category')?.addEventListener('click', () => openModal('add-category-modal'));
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function setupFilters() {
  document.getElementById('expense-search')?.addEventListener('input', renderExpensesView);
  document.getElementById('expense-filter-cat')?.addEventListener('change', renderExpensesView);
  document.getElementById('expense-filter-month')?.addEventListener('change', renderExpensesView);
  document.getElementById('budget-month-picker')?.addEventListener('change', e => {
    state.currentMonth = e.target.value;
    renderBudgetView();
  });
  document.getElementById('analysis-month-picker')?.addEventListener('change', e => {
    state.currentMonth = e.target.value;
    renderAnalysisView();
  });
  document.getElementById('etb-new-amount')?.addEventListener('input', e => {
    showBudgetPreview(parseFloat(e.target.value)||0);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function renderDashboard() {
  const ym = todayYM();
  await fetchAnalysis(ym);
  const an = state.analysis || {};

  const income   = an.totalIncome   || 0;
  const expenses = an.totalExpenses || 0;
  const balance  = income - expenses;

  setText('dash-total-income', fmt(income));
  setText('dash-total-spent', fmt(expenses));

  const balEl = document.getElementById('dash-net-balance');
  balEl.textContent = fmt(Math.abs(balance));
  balEl.style.color = balance >= 0 ? 'var(--color-green)' : 'var(--color-red)';
  setText('dash-balance-label', balance >= 0 ? '🟢 Saving this month' : '🔴 Deficit this month');

  // Budget status
  const bl  = an.budgetLimit || 0;
  const pct = an.budgetUsedPct;
  if (bl > 0 && pct != null) {
    setText('dash-budget-pct', pct + '%');
    document.getElementById('dash-budget-bar-wrap').style.display = 'block';
    const bar = document.getElementById('dash-budget-bar');
    bar.style.width = Math.min(pct, 100) + '%';
    bar.style.background = pct >= 100 ? 'var(--color-red)' : pct >= 80 ? 'var(--color-orange)' : 'var(--color-green)';
    setText('dash-budget-label', pct >= 100 ? '🚨 Over budget!' : `${fmt(bl - expenses)} remaining of ${fmt(bl)}`);
  } else {
    setText('dash-budget-pct', '—');
    setText('dash-budget-label', 'No budget set for this month');
    document.getElementById('dash-budget-bar-wrap').style.display = 'none';
  }

  // Warning banner
  const banner = document.getElementById('budget-warning-banner');
  if (an.overBudget) {
    banner.style.display = 'flex';
    setText('budget-warning-text', `⚠️ You've exceeded your budget by ${fmt(expenses - bl)} this month!`);
  } else if (an.overIncome) {
    banner.style.display = 'flex';
    setText('budget-warning-text', `⚠️ Expenses (${fmt(expenses)}) exceed income (${fmt(income)}) by ${fmt(expenses - income)} this month.`);
  } else {
    banner.style.display = 'none';
  }

  renderRecentExpenses();
  renderRecentIncome();
  renderCategoryGrid();
  renderDashCharts(an);
}

function renderRecentExpenses() {
  const c = document.getElementById('dashboard-recent-expenses');
  c.innerHTML = '';
  const recent = state.expenses.slice(0,5);
  if (!recent.length) { c.innerHTML = '<div class="empty-state">No expenses yet</div>'; return; }
  recent.forEach(e => {
    const d = document.createElement('div');
    d.className = 'recent-item';
    d.innerHTML = `<div class="recent-info">
      <p>${esc(e.description||'—')}</p>
      <span><span class="cat-badge" style="background:var(--color-${e.category_color||'blue'}-light);color:var(--color-${e.category_color||'blue'});font-size:10px;padding:2px 6px;">${esc(e.category_name)}</span> · ${fmtDate(e.date)}</span>
    </div>
    <div class="recent-amount" style="color:var(--color-red)">${fmt(e.amount)}</div>`;
    c.appendChild(d);
  });
}

function renderRecentIncome() {
  const c = document.getElementById('dashboard-recent-income');
  c.innerHTML = '';
  const recent = state.income.slice(0,5);
  if (!recent.length) { c.innerHTML = '<div class="empty-state">No income recorded yet</div>'; return; }
  recent.forEach(i => {
    const d = document.createElement('div');
    d.className = 'recent-item';
    d.innerHTML = `<div class="recent-info">
      <p>${esc(i.source_name)}</p>
      <span>${incomeTypeLabel(i.source_type)} · ${fmtDate(i.date)}</span>
    </div>
    <div class="recent-amount" style="color:var(--color-green)">${fmt(i.amount)}</div>`;
    c.appendChild(d);
  });
}

function renderCategoryGrid() {
  const c = document.getElementById('dashboard-category-grid');
  if (!c) return;
  c.innerHTML = '';
  state.categories.forEach(cat => {
    const spent = parseFloat(cat.spent||0), budget = parseFloat(cat.budget);
    const rem = budget - spent, pct = budget > 0 ? Math.min(100,(spent/budget)*100) : 0;
    const icon = 'ph-'+(cat.icon||'folder');
    const d = document.createElement('div');
    d.className = 'category-budget-card';
    d.innerHTML = `
      <div class="cat-card-header">
        <div class="cat-icon" style="background:var(--color-${cat.color_theme}-light);color:var(--color-${cat.color_theme});"><i class="ph ${icon}"></i></div>
        <div class="cat-title"><p>${esc(cat.name)}</p><span>${fmt(budget)} budget</span></div>
      </div>
      <div class="cat-progress">
        <div class="cat-progress-info"><span>Spent</span><span class="cat-progress-amount">${fmt(spent)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--color-${cat.color_theme});"></div></div>
        <div class="cat-remaining" style="color:${rem<0?'var(--color-red)':''}">
          <span>${pct.toFixed(0)}% used</span><span>${fmt(Math.max(0,rem))} remaining</span>
        </div>
      </div>`;
    c.appendChild(d);
  });
}

function renderDashCharts(an) {
  // Pie chart
  const pieEl = document.getElementById('pieChart');
  const cats  = (an.catBreakdown||[]).filter(c => c.total > 0);
  document.getElementById('pie-empty').style.display = cats.length ? 'none' : 'flex';
  if (cats.length) {
    if (pieChartInst) pieChartInst.destroy();
    pieChartInst = new Chart(pieEl, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.name),
        datasets: [{ data: cats.map(c => c.total), backgroundColor: cats.map(c => colorHex(c.color_theme)), borderWidth: 2, borderColor: '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'Inter', size: 12 }, padding: 12 } } } }
    });
  }

  // Bar chart (monthly income vs expenses)
  const months = last6Months();
  const expMap = {}; (an.trend||[]).forEach(r => { expMap[r.month] = r.total; });
  const incMap = {}; (an.incomeTrend||[]).forEach(r => { incMap[r.month] = r.total; });

  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: months.map(m => monthLabel(m)),
      datasets: [
        { label: 'Income',   data: months.map(m => incMap[m]||0), backgroundColor: '#10B98133', borderColor: '#10B981', borderWidth: 2 },
        { label: 'Expenses', data: months.map(m => expMap[m]||0), backgroundColor: '#EF444433', borderColor: '#EF4444', borderWidth: 2 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$'+v } } }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  INCOME VIEW
// ══════════════════════════════════════════════════════════════════════════════
function renderIncomeView() {
  const ym = todayYM();
  const thisMonth = state.income.filter(i => i.date.startsWith(ym));
  const thisTotal = thisMonth.reduce((s,i) => s+i.amount, 0);
  const allTotal  = state.income.reduce((s,i) => s+i.amount, 0);
  const sources   = new Set(state.income.map(i => i.source_name)).size;

  setText('inc-this-month', fmt(thisTotal));
  setText('inc-all-time', fmt(allTotal));
  setText('inc-sources-count', sources);

  const tbody = document.getElementById('income-table-body');
  tbody.innerHTML = '';
  if (!state.income.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No income recorded yet. Add your first income entry!</td></tr>';
    return;
  }
  state.income.forEach(i => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(i.date)}</td>
      <td style="font-weight:500;">${esc(i.source_name)}</td>
      <td><span class="type-badge income-badge">${incomeTypeLabel(i.source_type)}</span></td>
      <td style="color:var(--text-muted)">${esc(i.description||'—')}</td>
      <td style="text-align:right;font-weight:600;color:var(--color-green);">${fmt(i.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit" onclick="openIncomeModal(${i.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
          <button class="btn-icon delete" onclick="deleteIncome(${i.id})" title="Delete"><i class="ph ph-trash"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPENSES VIEW
// ══════════════════════════════════════════════════════════════════════════════
function renderExpensesView() {
  // Populate category filter
  const catFilter = document.getElementById('expense-filter-cat');
  if (catFilter && catFilter.options.length <= 1) {
    state.categories.forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
      catFilter.appendChild(o);
    });
  }

  const search    = document.getElementById('expense-search')?.value.toLowerCase() || '';
  const filterCat = document.getElementById('expense-filter-cat')?.value || 'all';
  const filterMon = document.getElementById('expense-filter-month')?.value || '';

  const filtered = state.expenses.filter(e => {
    const s = (e.description||'').toLowerCase().includes(search) || (e.category_name||'').toLowerCase().includes(search);
    const c = filterCat === 'all' || String(e.category_id) === String(filterCat);
    const m = !filterMon || e.date.startsWith(filterMon);
    return s && c && m;
  });

  const tbody = document.getElementById('expenses-table-body');
  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No expenses found</td></tr>';
    return;
  }
  filtered.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td style="font-weight:500;">${esc(e.description||'—')}</td>
      <td><span class="cat-badge" style="background:var(--color-${e.category_color||'blue'}-light);color:var(--color-${e.category_color||'blue'});">${esc(e.category_name)}</span></td>
      <td style="text-align:right;font-weight:600;">${fmt(e.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit" onclick="openExpenseModal(${e.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
          <button class="btn-icon delete" onclick="deleteExpense(${e.id})" title="Delete"><i class="ph ph-trash"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  BUDGET VIEW
// ══════════════════════════════════════════════════════════════════════════════
async function renderBudgetView() {
  const ym = state.currentMonth;
  document.getElementById('budget-month-picker').value = ym;
  setText('budget-month-label', monthLabel(ym));

  // Load stored limit
  try {
    const r = await fetch(`${API}/monthly-budget/${ym}`);
    const data = await r.json();
    document.getElementById('budget-limit-input').value = data.budget_limit > 0 ? data.budget_limit : '';
  } catch(e) {}

  await fetchAnalysis(ym);
  const an = state.analysis || {};
  const limit = an.budgetLimit || 0;
  const spent = an.totalExpenses || 0;
  const rem   = limit - spent;
  const pct   = limit > 0 ? Math.min(100,(spent/limit)*100) : 0;

  setText('bud-limit',    fmt(limit));
  setText('bud-spent',    fmt(spent));
  setText('bud-remaining', fmt(rem));
  setText('bud-pct-label', limit > 0 ? pct.toFixed(1)+'%' : '—');

  const bar = document.getElementById('bud-progress');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 100 ? 'var(--color-red)' : pct >= 80 ? 'var(--color-orange)' : 'var(--color-green)';

  const warn = document.getElementById('bud-warning');
  if (limit > 0 && spent > limit) {
    warn.style.display = 'flex';
    setText('bud-warning-text', `🚨 You've exceeded your budget by ${fmt(spent - limit)}! Consider cutting back.`);
    warn.style.background = '#FEE2E2';
  } else if (limit > 0 && pct >= 80) {
    warn.style.display = 'flex';
    setText('bud-warning-text', `⚠️ You've used ${pct.toFixed(0)}% of your budget. Only ${fmt(rem)} remaining.`);
    warn.style.background = '#FEF3C7';
  } else {
    warn.style.display = 'none';
  }

  // Category breakdown
  const bc = document.getElementById('budget-cat-breakdown');
  bc.innerHTML = '';
  if (!an.catBreakdown?.length) {
    bc.innerHTML = '<div class="empty-state">No expenses this month</div>';
  } else {
    an.catBreakdown.forEach(c => {
      const catBudget = state.categories.find(x => x.name === c.name)?.budget || 0;
      const catPct = catBudget > 0 ? Math.min(100, (c.total/catBudget)*100) : 100;
      const d = document.createElement('div');
      d.style.cssText = 'margin-bottom:16px;';
      d.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-weight:500;">${esc(c.name)}</span>
          <span style="font-weight:600;color:var(--color-${c.color_theme})">${fmt(c.total)} ${catBudget > 0 ? '/ '+fmt(catBudget) : ''}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${catPct}%;background:var(--color-${c.color_theme});"></div>
        </div>`;
      bc.appendChild(d);
    });
  }
}

async function saveBudgetLimit() {
  const ym  = document.getElementById('budget-month-picker').value;
  const val = parseFloat(document.getElementById('budget-limit-input').value);
  if (!ym || isNaN(val) || val <= 0) { alert('Enter a valid month and budget amount.'); return; }
  try {
    const r = await fetch(`${API}/monthly-budget`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year_month: ym, budget_limit: val }),
    });
    if (r.ok) { await fetchAll(); await renderBudgetView(); showToast('Budget saved!'); }
    else { const e = await r.json(); alert('Error: '+e.error); }
  } catch(e) { alert('Server error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYSIS VIEW
// ══════════════════════════════════════════════════════════════════════════════
async function renderAnalysisView() {
  const ym = state.currentMonth;
  document.getElementById('analysis-month-picker').value = ym;
  await fetchAnalysis(ym);
  const an = state.analysis;
  if (!an) return;

  setText('an-income',   fmt(an.totalIncome));
  setText('an-expenses', fmt(an.totalExpenses));

  const balEl = document.getElementById('an-balance');
  balEl.textContent = fmt(Math.abs(an.netBalance));
  balEl.style.color = an.netBalance >= 0 ? 'var(--color-green)' : 'var(--color-red)';
  setText('an-balance-label', an.netBalance >= 0 ? '🟢 Saving' : '🔴 Deficit');

  setText('an-predicted', fmt(an.predictedMonthEnd));
  const predLabel = an.budgetLimit > 0
    ? (an.predictedMonthEnd > an.budgetLimit ? `🚨 Will exceed budget by ${fmt(an.predictedMonthEnd-an.budgetLimit)}` : `✅ Within budget`)
    : `~${fmt(an.dailyAvg)}/day`;
  setText('an-predicted-label', predLabel);

  renderInsights(an);
  renderSuggestions(an);
  renderAnalysisPie(an);
  renderTrendChart(an);
}

function renderInsights(an) {
  const c = document.getElementById('insights-container');
  const insights = [];

  if (an.overIncome) {
    insights.push({ icon:'🚨', color:'#FEE2E2', text:`You're spending <strong>${fmt(an.totalExpenses - an.totalIncome)} more</strong> than you earn. You need <strong>${fmt(an.additionalNeeded)}</strong> extra to cover expenses.` });
  } else if (an.totalIncome > 0) {
    const savePct = ((an.netBalance/an.totalIncome)*100).toFixed(1);
    insights.push({ icon:'💚', color:'#D1FAE5', text:`Great! You're saving <strong>${savePct}%</strong> of your income (${fmt(an.netBalance)}) this month.` });
  }

  if (an.overBudget) {
    insights.push({ icon:'⛔', color:'#FEE2E2', text:`You've <strong>exceeded your budget</strong> by ${fmt(an.totalExpenses - an.budgetLimit)}.` });
  } else if (an.budgetLimit > 0 && an.budgetUsedPct >= 80) {
    insights.push({ icon:'⚠️', color:'#FEF3C7', text:`You've used <strong>${an.budgetUsedPct}%</strong> of your monthly budget. Slow down!` });
  }

  if (an.topCategory) {
    insights.push({ icon:'📊', color:'#DBEAFE', text:`Highest spending: <strong>${an.topCategory.name}</strong> at ${fmt(an.topCategory.total)} this month.` });
  }

  if (an.predictedMonthEnd > 0 && an.daysPassed < an.daysInMonth) {
    insights.push({ icon:'🔮', color:'#EDE9FE', text:`At current pace, you'll spend <strong>${fmt(an.predictedMonthEnd)}</strong> by end of month (${fmt(an.dailyAvg)}/day average).` });
  }

  if (!insights.length) {
    insights.push({ icon:'💡', color:'#F3F4F6', text:'Add income and expense data to see personalized insights.' });
  }

  c.innerHTML = insights.map(i => `
    <div style="background:${i.color};border-radius:10px;padding:14px 16px;margin-bottom:12px;display:flex;gap:12px;align-items:flex-start;">
      <span style="font-size:20px;">${i.icon}</span>
      <span style="font-size:14px;line-height:1.5;">${i.text}</span>
    </div>`).join('');
}

function renderSuggestions(an) {
  const c = document.getElementById('suggestions-container');
  if (!an.suggestions?.length) {
    c.innerHTML = '<div class="empty-state">Add expenses to get savings suggestions.</div>';
    return;
  }
  c.innerHTML = an.suggestions.map(s => `
    <div class="suggestion-card">
      <div>
        <strong>${esc(s.name)}</strong>
        <span style="color:var(--text-muted);font-size:13px;margin-left:8px;">You spent ${fmt(s.total)} this month</span>
      </div>
      <div style="color:var(--color-green);font-weight:600;">
        💰 Save ~${fmt(s.saveEstimate)} by cutting 20%
      </div>
    </div>`).join('');
}

function renderAnalysisPie(an) {
  const cats = (an.catBreakdown||[]).filter(c => c.total > 0);
  const el = document.getElementById('analysisPieChart');
  document.getElementById('analysis-pie-empty').style.display = cats.length ? 'none' : 'flex';
  if (!cats.length) return;
  if (analysisPieInst) analysisPieInst.destroy();
  analysisPieInst = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: cats.map(c => c.name),
      datasets: [{ data: cats.map(c => c.total), backgroundColor: cats.map(c => colorHex(c.color_theme)), borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: {family:'Inter',size:12}, padding:12 } } } }
  });
}

function renderTrendChart(an) {
  const months  = last6Months();
  const expMap  = {}; (an.trend||[]).forEach(r => { expMap[r.month] = r.total; });
  const incMap  = {}; (an.incomeTrend||[]).forEach(r => { incMap[r.month] = r.total; });
  if (trendChartInst) trendChartInst.destroy();
  trendChartInst = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: months.map(m => monthLabel(m)),
      datasets: [
        { label: 'Income',   data: months.map(m => incMap[m]||0),  borderColor:'#10B981', backgroundColor:'#10B98122', tension:0.4, fill:true, pointRadius:5 },
        { label: 'Expenses', data: months.map(m => expMap[m]||0), borderColor:'#EF4444', backgroundColor:'#EF444422', tension:0.4, fill:true, pointRadius:5 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$'+v } } }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATEGORIES VIEW
// ══════════════════════════════════════════════════════════════════════════════
function renderCategoriesView() {
  const c = document.getElementById('categories-grid-view');
  if (!c) return;
  c.innerHTML = '';
  state.categories.forEach(cat => {
    const spent = parseFloat(cat.spent||0), budget = parseFloat(cat.budget);
    const rem = budget-spent, pct = budget > 0 ? Math.min(100,(spent/budget)*100) : 0;
    const icon = 'ph-'+(cat.icon||'folder');
    const d = document.createElement('div');
    d.className = 'category-budget-card';
    d.innerHTML = `
      <div class="cat-card-header" style="justify-content:space-between;">
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="cat-icon" style="background:var(--color-${cat.color_theme}-light);color:var(--color-${cat.color_theme});"><i class="ph ${icon}"></i></div>
          <div class="cat-title"><p style="font-size:16px;">${esc(cat.name)}</p><span>${fmt(budget)} budget</span></div>
        </div>
        <div class="action-btns">
          <button class="btn-icon delete" onclick="deleteCategory(${cat.id})" title="Delete"><i class="ph ph-trash"></i></button>
        </div>
      </div>
      <div class="cat-progress" style="margin-top:16px;">
        <div class="cat-progress-info"><span>Spent</span><span class="cat-progress-amount">${fmt(spent)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--color-${cat.color_theme});"></div></div>
        <div class="cat-remaining" style="color:${rem<0?'var(--color-red)':''}">
          <span>${pct.toFixed(0)}% used</span><span style="font-weight:500;">${fmt(rem)} remaining</span>
        </div>
      </div>`;
    c.appendChild(d);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  INCOME CRUD
// ══════════════════════════════════════════════════════════════════════════════
function openIncomeModal(editId = null) {
  document.getElementById('income-edit-id').value = editId || '';
  document.getElementById('income-modal-title').textContent = editId ? 'Edit Income' : 'Add Income';
  document.getElementById('income-submit-btn').textContent  = editId ? 'Update Income' : 'Add Income';

  if (editId) {
    const inc = state.income.find(i => i.id === editId);
    if (inc) {
      document.getElementById('income-source').value = inc.source_name;
      document.getElementById('income-type').value   = inc.source_type;
      document.getElementById('income-amount').value = inc.amount;
      document.getElementById('income-desc').value   = inc.description || '';
      document.getElementById('income-date').value   = inc.date;
    }
  } else {
    document.getElementById('income-source').value = '';
    document.getElementById('income-type').value   = 'salary';
    document.getElementById('income-amount').value = '';
    document.getElementById('income-desc').value   = '';
    document.getElementById('income-date').valueAsDate = new Date();
  }
  openModal('income-modal');
}

async function submitIncome() {
  const editId = document.getElementById('income-edit-id').value;
  const data = {
    source_name: document.getElementById('income-source').value.trim(),
    source_type: document.getElementById('income-type').value,
    amount:      parseFloat(document.getElementById('income-amount').value),
    description: document.getElementById('income-desc').value.trim(),
    date:        document.getElementById('income-date').value,
  };
  if (!data.source_name || !data.amount || !data.date) { alert('Please fill all required fields.'); return; }
  try {
    const url = editId ? `${API}/income/${editId}` : `${API}/income`;
    const r   = await fetch(url, { method: editId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (r.ok) { closeAllModals(); await fetchAll(); renderCurrentView(); showToast(editId?'Income updated!':'Income added!'); }
    else { const e = await r.json(); alert('Error: '+e.error); }
  } catch(e) { alert('Server error'); }
}

async function deleteIncome(id) {
  if (!confirm('Delete this income record?')) return;
  try {
    const r = await fetch(`${API}/income/${id}`, { method:'DELETE' });
    if (r.ok) { await fetchAll(); renderCurrentView(); showToast('Income deleted'); }
    else alert('Failed to delete');
  } catch(e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPENSE CRUD
// ══════════════════════════════════════════════════════════════════════════════
function openExpenseModal(editId = null) {
  document.getElementById('expense-edit-id').value = editId || '';
  document.getElementById('expense-modal-title').textContent = editId ? 'Edit Expense' : 'Add Expense';
  document.getElementById('expense-submit-btn').textContent  = editId ? 'Update Expense' : 'Add Expense';

  const sel = document.getElementById('expense-category');
  sel.innerHTML = '';
  state.categories.forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });

  if (editId) {
    const exp = state.expenses.find(e => e.id === editId);
    if (exp) {
      sel.value = exp.category_id;
      document.getElementById('expense-amount').value = exp.amount;
      document.getElementById('expense-desc').value   = exp.description || '';
      document.getElementById('expense-date').value   = exp.date;
    }
  } else {
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-desc').value   = '';
    document.getElementById('expense-date').valueAsDate = new Date();
  }
  openModal('expense-modal');
}

async function submitExpense() {
  const editId = document.getElementById('expense-edit-id').value;
  const data = {
    category_id: document.getElementById('expense-category').value,
    amount:      parseFloat(document.getElementById('expense-amount').value),
    description: document.getElementById('expense-desc').value.trim(),
    date:        document.getElementById('expense-date').value,
  };
  if (!data.category_id || !data.amount || !data.date) { alert('Please fill all required fields.'); return; }
  try {
    const url = editId ? `${API}/expenses/${editId}` : `${API}/expenses`;
    const r   = await fetch(url, { method:editId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (r.ok) { closeAllModals(); await fetchAll(); renderCurrentView(); showToast(editId?'Expense updated!':'Expense added!'); }
    else { const e = await r.json(); alert('Error: '+e.error); }
  } catch(e) { alert('Server error'); }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    const r = await fetch(`${API}/expenses/${id}`, { method:'DELETE' });
    if (r.ok) { await fetchAll(); renderCurrentView(); showToast('Expense deleted'); }
  } catch(e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CATEGORY CRUD
// ══════════════════════════════════════════════════════════════════════════════
async function submitCategory() {
  const data = {
    name:        document.getElementById('cat-name').value.trim(),
    budget:      parseFloat(document.getElementById('cat-budget').value),
    color_theme: document.getElementById('cat-color').value,
    icon:        'folder',
  };
  if (!data.name || !data.budget) { alert('Name and budget are required.'); return; }
  try {
    const r = await fetch(`${API}/categories`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (r.ok) { closeAllModals(); await fetchAll(); renderCurrentView(); showToast('Category added!'); }
    else { const e = await r.json(); alert('Error: '+e.error); }
  } catch(e) { alert('Server error'); }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Expenses will be unlinked.')) return;
  try {
    const r = await fetch(`${API}/categories/${id}`, { method:'DELETE' });
    if (r.ok) { await fetchAll(); renderCurrentView(); showToast('Category deleted'); }
  } catch(e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EDIT TOTAL BUDGET
// ══════════════════════════════════════════════════════════════════════════════
function openEditTotalBudget() {
  const total = state.categories.reduce((s,c) => s+parseFloat(c.budget), 0);
  document.getElementById('etb-current').textContent = fmt(total);
  document.getElementById('etb-new-amount').value = total.toFixed(2);
  document.getElementById('etb-preview').style.display = 'none';
  openModal('edit-total-budget-modal');
  setTimeout(() => { document.getElementById('etb-new-amount').focus(); }, 50);
}

function showBudgetPreview(newTotal) {
  const preview = document.getElementById('etb-preview');
  const list    = document.getElementById('etb-preview-list');
  const cur = state.categories.reduce((s,c) => s+parseFloat(c.budget), 0);
  if (!newTotal || newTotal <= 0) { preview.style.display='none'; return; }
  preview.style.display = 'block';
  list.innerHTML = state.categories.map(c => {
    const nb = cur > 0 ? (parseFloat(c.budget)/cur)*newTotal : newTotal/state.categories.length;
    return `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #eee;">
      <span>${esc(c.name)}</span><strong>${fmt(nb)}</strong></div>`;
  }).join('');
}

async function confirmEditTotalBudget() {
  const newTotal = parseFloat(document.getElementById('etb-new-amount').value);
  if (!newTotal || newTotal <= 0) { alert('Enter a valid amount.'); return; }
  const cur = state.categories.reduce((s,c) => s+parseFloat(c.budget), 0);
  if (Math.abs(newTotal-cur) < 0.01) { closeAllModals(); return; }
  try {
    await Promise.all(state.categories.map(c => {
      const nb = cur > 0 ? Math.round(((parseFloat(c.budget)/cur)*newTotal)*100)/100 : Math.round((newTotal/state.categories.length)*100)/100;
      return fetch(`${API}/categories/${c.id}`, { method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:c.name, budget:nb, color_theme:c.color_theme, icon:c.icon||'folder' }) });
    }));
    closeAllModals(); await fetchAll(); renderCurrentView(); showToast('Total budget updated!');
  } catch(e) { alert('Failed to update budgets.'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════════════════
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function last6Months() {
  const months = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth()-i, 1);
    months.push(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

function monthLabel(ym) {
  const [y,m] = ym.split('-');
  return new Date(y, m-1).toLocaleString('default', { month:'short', year:'2-digit' });
}

function colorHex(name) {
  return {green:'#10B981',blue:'#3B82F6',purple:'#8B5CF6',orange:'#F59E0B',red:'#EF4444',pink:'#EC4899'}[name] || '#6B7280';
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', initApp);
