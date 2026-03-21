const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Create test
router.post('/tests', wrap((req, res) => {
  const { title, description, duration, total_marks, instructions } = req.body;
  if (!title || !duration) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  db.run('INSERT INTO tests (id, title, description, duration, total_marks, instructions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, title, description || '', duration, total_marks || 0, instructions || '', req.user.id]);
  res.json({ id, message: 'Test created' });
}));

// Get all tests
router.get('/tests', wrap((req, res) => {
  const tests = db.all('SELECT * FROM tests ORDER BY created_at DESC');
  res.json(tests);
}));

// Get single test with questions
router.get('/tests/:id', wrap((req, res) => {
  const test = db.get('SELECT * FROM tests WHERE id = ?', [req.params.id]);
  if (!test) return res.status(404).json({ error: 'Not found' });
  const questions = db.all('SELECT * FROM questions WHERE test_id = ? ORDER BY order_index', [req.params.id]);
  for (const q of questions) {
    q.sample_cases = db.all('SELECT * FROM sample_test_cases WHERE question_id = ?', [q.id]);
    q.hidden_cases = db.all('SELECT * FROM hidden_test_cases WHERE question_id = ?', [q.id]);
    q.boilerplate  = db.all('SELECT * FROM boilerplate_code WHERE question_id = ?', [q.id]);
  }
  res.json({ ...test, questions });
}));

// Update test
router.put('/tests/:id', wrap((req, res) => {
  const { title, description, duration, total_marks, instructions, is_active } = req.body;
  db.run('UPDATE tests SET title=?, description=?, duration=?, total_marks=?, instructions=?, is_active=? WHERE id=?',
    [title, description, duration, total_marks, instructions, is_active, req.params.id]);
  res.json({ message: 'Updated' });
}));

// Delete test
router.delete('/tests/:id', wrap((req, res) => {
  db.run('DELETE FROM tests WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// Add question
router.post('/tests/:testId/questions', wrap((req, res) => {
  const { title, problem_statement, input_format, output_format, constraints, marks, order_index, sample_cases, hidden_cases, boilerplate, image_url } = req.body;
  const id = uuidv4();
  db.run(
    'INSERT INTO questions (id, test_id, title, problem_statement, input_format, output_format, constraints, marks, order_index, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.params.testId, title, problem_statement, input_format || '', output_format || '', constraints || '', marks || 10, order_index || 0, image_url || null]
  );

  if (sample_cases) {
    for (const tc of sample_cases) {
      db.run('INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), id, tc.input, tc.expected_output, tc.explanation || '']);
    }
  }
  if (hidden_cases) {
    for (const tc of hidden_cases) {
      db.run('INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)',
        [uuidv4(), id, tc.input, tc.expected_output]);
    }
  }
  if (boilerplate) {
    for (const bp of boilerplate) {
      db.run('INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)',
        [uuidv4(), id, bp.language, bp.code]);
    }
  }

  const totalRow = db.get('SELECT COALESCE(SUM(marks),0) as t FROM questions WHERE test_id = ?', [req.params.testId]);
  db.run('UPDATE tests SET total_marks = ? WHERE id = ?', [totalRow.t, req.params.testId]);

  res.json({ id, message: 'Question added' });
}));

// Update question
router.put('/questions/:id', wrap((req, res) => {
  const { title, problem_statement, input_format, output_format, constraints, marks, order_index, sample_cases, hidden_cases, boilerplate, image_url } = req.body;

  db.run(
    'UPDATE questions SET title=?, problem_statement=?, input_format=?, output_format=?, constraints=?, marks=?, order_index=?, image_url=? WHERE id=?',
    [title, problem_statement, input_format || '', output_format || '', constraints || '', marks, order_index || 0, image_url || null, req.params.id]
  );

  db.run('DELETE FROM sample_test_cases WHERE question_id = ?', [req.params.id]);
  if (sample_cases) {
    for (const tc of sample_cases) {
      db.run('INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), req.params.id, tc.input, tc.expected_output, tc.explanation || '']);
    }
  }

  db.run('DELETE FROM hidden_test_cases WHERE question_id = ?', [req.params.id]);
  if (hidden_cases) {
    for (const tc of hidden_cases) {
      db.run('INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)',
        [uuidv4(), req.params.id, tc.input, tc.expected_output]);
    }
  }

  db.run('DELETE FROM boilerplate_code WHERE question_id = ?', [req.params.id]);
  if (boilerplate) {
    for (const bp of boilerplate) {
      db.run('INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)',
        [uuidv4(), req.params.id, bp.language, bp.code]);
    }
  }

  const q = db.get('SELECT test_id FROM questions WHERE id = ?', [req.params.id]);
  if (q) {
    const totalRow = db.get('SELECT COALESCE(SUM(marks),0) as t FROM questions WHERE test_id = ?', [q.test_id]);
    db.run('UPDATE tests SET total_marks = ? WHERE id = ?', [totalRow.t, q.test_id]);
  }

  res.json({ message: 'Updated' });
}));

// Delete question
router.delete('/questions/:id', wrap((req, res) => {
  const q = db.get('SELECT test_id FROM questions WHERE id = ?', [req.params.id]);
  db.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
  if (q) {
    const totalRow = db.get('SELECT COALESCE(SUM(marks),0) as t FROM questions WHERE test_id = ?', [q.test_id]);
    db.run('UPDATE tests SET total_marks = ? WHERE id = ?', [totalRow.t, q.test_id]);
  }
  res.json({ message: 'Deleted' });
}));

// Get test results
router.get('/tests/:id/results', wrap((req, res) => {
  const attempts = db.all(`
    SELECT ta.id, ta.status, ta.total_marks_obtained, ta.tab_switches, ta.auto_submitted,
           ta.started_at, ta.submitted_at,
           u.name, u.enrollment, u.email
    FROM test_attempts ta
    JOIN users u ON ta.student_id = u.id
    WHERE ta.test_id = ?
    ORDER BY ta.submitted_at DESC
  `, [req.params.id]);
  res.json(attempts);
}));

// Get student submission detail
router.get('/attempts/:attemptId', wrap((req, res) => {
  const attempt = db.get(`
    SELECT ta.id, ta.status, ta.total_marks_obtained, ta.tab_switches, ta.auto_submitted,
           u.name, u.enrollment, u.email
    FROM test_attempts ta JOIN users u ON ta.student_id = u.id
    WHERE ta.id = ?
  `, [req.params.attemptId]);
  if (!attempt) return res.status(404).json({ error: 'Not found' });
  const submissions = db.all(`
    SELECT qs.language, qs.code, qs.marks_obtained, qs.test_cases_passed, qs.total_test_cases,
           q.title as question_title
    FROM question_submissions qs
    JOIN questions q ON qs.question_id = q.id
    WHERE qs.attempt_id = ?
  `, [req.params.attemptId]);
  res.json({ ...attempt, submissions });
}));

// Dashboard stats
router.get('/dashboard', wrap((req, res) => {
  const totalStudents = (db.get("SELECT COUNT(*) as c FROM users WHERE role='student'") || {}).c || 0;
  const totalTests    = (db.get('SELECT COUNT(*) as c FROM tests') || {}).c || 0;
  const totalAttempts = (db.get('SELECT COUNT(*) as c FROM test_attempts') || {}).c || 0;
  const recentAttempts = db.all(`
    SELECT ta.id, ta.status, ta.total_marks_obtained, ta.submitted_at,
           u.name, u.enrollment, t.title as test_title
    FROM test_attempts ta
    JOIN users u ON ta.student_id = u.id
    JOIN tests t ON ta.test_id = t.id
    ORDER BY ta.started_at DESC LIMIT 10
  `);
  res.json({ totalStudents, totalTests, totalAttempts, recentAttempts });
}));

// Reset all student data
router.delete('/reset/all', wrap((req, res) => {
  db.run('DELETE FROM question_submissions');
  db.run('DELETE FROM test_attempts');
  db.run("DELETE FROM users WHERE role = 'student'");
  res.json({ message: 'All student data reset' });
}));

// Reset only attempts
router.delete('/reset/attempts', wrap((req, res) => {
  db.run('DELETE FROM question_submissions');
  db.run('DELETE FROM test_attempts');
  res.json({ message: 'All attempts reset' });
}));

// Delete single student
router.delete('/students/:id', wrap((req, res) => {
  db.run('DELETE FROM question_submissions WHERE attempt_id IN (SELECT id FROM test_attempts WHERE student_id = ?)', [req.params.id]);
  db.run('DELETE FROM test_attempts WHERE student_id = ?', [req.params.id]);
  db.run("DELETE FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  res.json({ message: 'Student deleted' });
}));

// Get all students
router.get('/students', wrap((req, res) => {
  const students = db.all(`
    SELECT u.id, u.name, u.enrollment, u.email, u.created_at,
           COUNT(DISTINCT ta.id) as attempt_count,
           COALESCE(SUM(ta.total_marks_obtained), 0) as total_marks
    FROM users u
    LEFT JOIN test_attempts ta ON ta.student_id = u.id
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  res.json(students);
}));

module.exports = router;
