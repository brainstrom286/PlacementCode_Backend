const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios   = require('axios');
const db      = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Judge0 CE ─────────────────────────────────────────────────────────────────
const JUDGE0_URL = 'https://ce.judge0.com';

const LANG_ID = {
  python:     71,
  javascript: 93,
  java:       91,
  cpp:        54,
  c:          50
};

const b64   = str => Buffer.from(str || '').toString('base64');
const unb64 = str => str ? Buffer.from(str, 'base64').toString('utf8').trim() : '';

async function executeCode(language, code, stdin) {
  const langId = LANG_ID[language];
  if (!langId) throw new Error('Unsupported language: ' + language);

  const { data } = await axios.post(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true&fields=status,stdout,stderr,compile_output,time,memory`,
    {
      language_id:     langId,
      source_code:     b64(code),
      stdin:           b64(stdin || ''),
      cpu_time_limit:  5,
      wall_time_limit: 10
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 25000
    }
  );

  const stdout      = unb64(data.stdout);
  const stderr      = unb64(data.stderr);
  const compile_err = unb64(data.compile_output);
  const statusId    = data.status?.id;

  return {
    output:      stdout,
    error:       compile_err || stderr || null,
    timed_out:   statusId === 5,
    status_id:   statusId,
    status_desc: data.status?.description || '',
    time:        data.time,
    memory:      data.memory
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// Get available tests
router.get('/tests', wrap((req, res) => {
  const tests = db.all(
    'SELECT id, title, description, duration, total_marks, instructions FROM tests WHERE is_active = 1 ORDER BY created_at DESC'
  );
  for (const t of tests) {
    t.attempt = db.get(
      'SELECT id, status, total_marks_obtained FROM test_attempts WHERE test_id = ? AND student_id = ?',
      [t.id, req.user.id]
    ) || null;
  }
  res.json(tests);
}));

// Start / resume test
router.post('/tests/:id/start', wrap((req, res) => {
  const test = db.get('SELECT * FROM tests WHERE id = ? AND is_active = 1', [req.params.id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const existing = db.get(
    'SELECT * FROM test_attempts WHERE test_id = ? AND student_id = ?',
    [req.params.id, req.user.id]
  );
  if (existing) {
    if (existing.status === 'submitted') return res.status(400).json({ error: 'Already submitted' });
    return res.json({ attemptId: existing.id, test, startedAt: existing.started_at });
  }

  const attemptId = uuidv4();
  const now = new Date().toISOString();
  db.run('INSERT INTO test_attempts (id, test_id, student_id, started_at) VALUES (?, ?, ?, ?)',
    [attemptId, req.params.id, req.user.id, now]);
  res.json({ attemptId, test, startedAt: now });
}));

// Get questions for an attempt
router.get('/attempts/:attemptId/questions', wrap((req, res) => {
  const attempt = db.get(
    'SELECT * FROM test_attempts WHERE id = ? AND student_id = ?',
    [req.params.attemptId, req.user.id]
  );
  if (!attempt) return res.status(403).json({ error: 'Forbidden' });

  const questions = db.all(
    'SELECT id, title, problem_statement, input_format, output_format, constraints, marks, order_index, image_url FROM questions WHERE test_id = ? ORDER BY order_index',
    [attempt.test_id]
  );

  for (const q of questions) {
    q.sample_cases = db.all(
      'SELECT id, input, expected_output, explanation FROM sample_test_cases WHERE question_id = ?',
      [q.id]
    );
    q.boilerplate = db.all(
      'SELECT language, code FROM boilerplate_code WHERE question_id = ?',
      [q.id]
    );
    q.saved = db.get(
      'SELECT language, code FROM question_submissions WHERE attempt_id = ? AND question_id = ?',
      [req.params.attemptId, q.id]
    ) || null;

    const hiddenCount = (db.get(
      'SELECT COUNT(*) as c FROM hidden_test_cases WHERE question_id = ?', [q.id]
    ) || {}).c || 0;
    q.hidden_count   = hiddenCount;
    q.marks_per_case = hiddenCount > 0
      ? Math.round((q.marks / hiddenCount) * 10) / 10
      : q.marks;
  }

  res.json({ attempt, questions, startedAt: attempt.started_at });
}));

// ── Run against sample test cases ──
router.post('/run', wrap(async (req, res) => {
  const { code, language, question_id } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'Missing code or language' });

  const sampleCases = db.all('SELECT * FROM sample_test_cases WHERE question_id = ?', [question_id]);
  if (!sampleCases.length) return res.json({ results: [] });

  const execResults = await Promise.all(
    sampleCases.map(tc =>
      executeCode(language, code, tc.input)
        .catch(e => ({ output: '', error: e.message, timed_out: false, status_desc: 'Error' }))
    )
  );

  const results = sampleCases.map((tc, i) => {
    const exec     = execResults[i];
    const expected = tc.expected_output.trim();
    const passed   = !exec.error && !exec.timed_out && exec.output === expected;
    return {
      input:           tc.input,
      expected_output: expected,
      actual_output:   exec.error
        ? 'Error:\n' + exec.error
        : exec.timed_out ? 'Time Limit Exceeded' : exec.output,
      passed,
      explanation:     tc.explanation,
      time:            exec.time,
      status:          exec.status_desc
    };
  });

  res.json({ results });
}));

// ── Submit question ──
router.post('/attempts/:attemptId/submit-question', wrap(async (req, res) => {
  const { question_id, language, code } = req.body;

  const attempt = db.get(
    'SELECT * FROM test_attempts WHERE id = ? AND student_id = ?',
    [req.params.attemptId, req.user.id]
  );
  if (!attempt || attempt.status === 'submitted')
    return res.status(400).json({ error: 'Invalid attempt' });

  const question = db.get('SELECT marks FROM questions WHERE id = ?', [question_id]);
  const maxMarks = question?.marks || 10;

  let evalCases = db.all('SELECT * FROM hidden_test_cases WHERE question_id = ?', [question_id]);
  if (!evalCases.length) {
    evalCases = db.all('SELECT * FROM sample_test_cases WHERE question_id = ?', [question_id]);
  }
  const evalTotal = evalCases.length || 1;

  let passed = 0;
  try {
    const execResults = await Promise.all(
      evalCases.map(tc =>
        executeCode(language, code, tc.input)
          .catch(e => ({ output: '', error: e.message, timed_out: false }))
      )
    );
    for (let i = 0; i < evalCases.length; i++) {
      const exec     = execResults[i];
      const expected = evalCases[i].expected_output.trim();
      if (!exec.error && !exec.timed_out && exec.output === expected) passed++;
    }
  } catch {
    passed = 0;
  }

  const marksObtained = Math.round(passed * (maxMarks / evalTotal));

  const existing = db.get(
    'SELECT id FROM question_submissions WHERE attempt_id = ? AND question_id = ?',
    [req.params.attemptId, question_id]
  );
  if (existing) {
    db.run(
      'UPDATE question_submissions SET language=?, code=?, marks_obtained=?, test_cases_passed=?, total_test_cases=?, submitted_at=CURRENT_TIMESTAMP WHERE id=?',
      [language, code, marksObtained, passed, evalTotal, existing.id]
    );
  } else {
    db.run(
      'INSERT INTO question_submissions (id, attempt_id, question_id, language, code, marks_obtained, test_cases_passed, total_test_cases) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.params.attemptId, question_id, language, code, marksObtained, passed, evalTotal]
    );
  }

  res.json({ passed, total: evalTotal, marksObtained, maxMarks });
}));

// ── Final submit ──
router.post('/attempts/:attemptId/submit', wrap((req, res) => {
  const { tab_switches, auto_submitted } = req.body;
  const attempt = db.get(
    'SELECT * FROM test_attempts WHERE id = ? AND student_id = ?',
    [req.params.attemptId, req.user.id]
  );
  if (!attempt) return res.status(403).json({ error: 'Forbidden' });
  if (attempt.status === 'submitted')
    return res.json({ message: 'Already submitted', total: attempt.total_marks_obtained });

  const row        = db.get(
    'SELECT COALESCE(SUM(marks_obtained), 0) as total FROM question_submissions WHERE attempt_id = ?',
    [req.params.attemptId]
  );
  const totalMarks = row?.total || 0;

  db.run(
    'UPDATE test_attempts SET status=?, submitted_at=CURRENT_TIMESTAMP, total_marks_obtained=?, tab_switches=?, auto_submitted=? WHERE id=?',
    ['submitted', totalMarks, tab_switches || 0, auto_submitted ? 1 : 0, req.params.attemptId]
  );

  res.json({ message: 'Test submitted', total: totalMarks });
}));

// ── Auto-save (no evaluation, just persist code) ──
router.post('/attempts/:attemptId/autosave', wrap((req, res) => {
  const { question_id, language, code } = req.body;
  const attempt = db.get(
    'SELECT id FROM test_attempts WHERE id = ? AND student_id = ? AND status != ?',
    [req.params.attemptId, req.user.id, 'submitted']
  );
  if (!attempt) return res.status(400).json({ error: 'Invalid attempt' });

  const existing = db.get(
    'SELECT id FROM question_submissions WHERE attempt_id = ? AND question_id = ?',
    [req.params.attemptId, question_id]
  );
  if (existing) {
    db.run(
      'UPDATE question_submissions SET language=?, code=?, submitted_at=CURRENT_TIMESTAMP WHERE id=?',
      [language, code, existing.id]
    );
  } else {
    db.run(
      'INSERT INTO question_submissions (id, attempt_id, question_id, language, code, marks_obtained, test_cases_passed, total_test_cases) VALUES (?, ?, ?, ?, ?, 0, 0, 0)',
      [uuidv4(), req.params.attemptId, question_id, language, code]
    );
  }
  res.json({ ok: true });
}));

// ── Tab switch ──
router.patch('/attempts/:attemptId/tab-switch', wrap((req, res) => {
  db.run(
    'UPDATE test_attempts SET tab_switches = tab_switches + 1 WHERE id = ? AND student_id = ?',
    [req.params.attemptId, req.user.id]
  );
  const attempt = db.get('SELECT tab_switches FROM test_attempts WHERE id = ?', [req.params.attemptId]);
  res.json({ tab_switches: attempt?.tab_switches || 0 });
}));

module.exports = router;
