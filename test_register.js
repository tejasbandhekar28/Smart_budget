const db = require('./backend/database.js');
const ins = db.prepare('INSERT INTO categories (user_id, name, budget, color_theme, icon) VALUES (?, ?, ?, ?, ?)');
try {
  ins.run(4, 'Food & Dining', 500, 'green', 'fork-knife');
  console.log("Success insert!");
  console.log(db.prepare('SELECT * FROM categories WHERE user_id = 4').all());
} catch (e) {
  console.log("Error inserting:", e);
}
