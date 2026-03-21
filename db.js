const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const DB_PATH = path.join(__dirname, 'platform.db');
const db = new Database(DB_PATH);

// WAL mode = much better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enrollment TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 0,
    instructions TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    title TEXT NOT NULL,
    problem_statement TEXT NOT NULL,
    input_format TEXT,
    output_format TEXT,
    constraints TEXT,
    marks INTEGER NOT NULL DEFAULT 10,
    order_index INTEGER DEFAULT 0,
    image_url TEXT,
    FOREIGN KEY (test_id) REFERENCES tests(id)
  );

  CREATE TABLE IF NOT EXISTS sample_test_cases (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    input TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    explanation TEXT,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS hidden_test_cases (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    input TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS boilerplate_code (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS test_attempts (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    status TEXT DEFAULT 'in_progress',
    total_marks_obtained INTEGER DEFAULT 0,
    tab_switches INTEGER DEFAULT 0,
    auto_submitted INTEGER DEFAULT 0,
    FOREIGN KEY (test_id) REFERENCES tests(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS question_submissions (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    marks_obtained INTEGER DEFAULT 0,
    test_cases_passed INTEGER DEFAULT 0,
    total_test_cases INTEGER DEFAULT 0,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES test_attempts(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );
`);

// Migrations
try { db.exec('ALTER TABLE questions ADD COLUMN image_url TEXT'); } catch(e) {}

// Seed admin
const ADMIN_EMAIL = 'tnpcell@gmail.com';
const ADMIN_PASS  = 'svittnp@1234';
const existing = db.prepare("SELECT id, email FROM users WHERE role='admin'").get();
if (!existing) {
  db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), 'TNP Cell', ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASS, 10), 'admin');
  console.log(`Admin created: ${ADMIN_EMAIL}`);
} else if (existing.email !== ADMIN_EMAIL) {
  db.prepare("UPDATE users SET email=?, password=?, name='TNP Cell' WHERE role='admin'")
    .run(ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASS, 10));
  console.log(`Admin updated: ${ADMIN_EMAIL}`);
}

// Helpers
function all(sql, params = []) {
  try { return db.prepare(sql).all(params); }
  catch(e) { console.error('DB all error:', e.message); return []; }
}

function get(sql, params = []) {
  try { return db.prepare(sql).get(params) || null; }
  catch(e) { console.error('DB get error:', e.message); return null; }
}

function run(sql, params = []) {
  try { return db.prepare(sql).run(params); }
  catch(e) { console.error('DB run error:', e.message); throw e; }
}

async function initDB() { return db; }

module.exports = { initDB, all, get, run };
