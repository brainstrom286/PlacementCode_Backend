/**
 * Run this once to seed a demo test with questions:
 *   node seed-demo.js
 */
const { initDB, run, get } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  await initDB();

  const existing = get("SELECT id FROM tests WHERE title = 'Campus Placement - Round 1'");
  if (existing) { console.log('Demo test already exists.'); return; }

  const testId = uuidv4();
  // Q1: 2 hidden cases × 5 marks = 10, Q2: 2 hidden × 5 = 10, Q3: 2 hidden × 5 = 10 → total 30
  run(`INSERT INTO tests (id, title, description, duration, total_marks, instructions, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    testId,
    'Campus Placement - Round 1',
    'Aptitude and coding round for campus placements. Solve all questions within the time limit.',
    60,
    30,
    'Read each problem carefully. You may use any supported language. Partial marks are awarded based on hidden test cases passed.',
    1
  ]);

  // Q1
  const q1 = uuidv4();
  run(`INSERT INTO questions (id, test_id, title, problem_statement, input_format, output_format, constraints, marks, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    q1, testId,
    'Sum of Two Numbers',
    'Given two integers A and B, print their sum.',
    'Two space-separated integers A and B on a single line.',
    'Print a single integer — the sum of A and B.',
    '1 ≤ A, B ≤ 10^9',
    10, 0
  ]);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q1, '3 5', '8', 'Sum of 3 and 5 is 8']);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q1, '100 200', '300', '']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q1, '1000000000 1000000000', '2000000000']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q1, '0 0', '0']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q1, 'python', '# Read input\na, b = map(int, input().split())\n# Write your solution\nprint(a + b)']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q1, 'javascript', 'const [a, b] = require("fs").readFileSync("/dev/stdin","utf8").trim().split(" ").map(Number);\nconsole.log(a + b);']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q1, 'cpp', '#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n    long long a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}']);

  // Q2
  const q2 = uuidv4();
  run(`INSERT INTO questions (id, test_id, title, problem_statement, input_format, output_format, constraints, marks, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    q2, testId,
    'Reverse a String',
    'Given a string S, print the reverse of the string.',
    'A single line containing the string S (no spaces).',
    'Print the reversed string on a single line.',
    '1 ≤ |S| ≤ 10^5',
    10, 1
  ]);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q2, 'hello', 'olleh', 'Reverse of "hello" is "olleh"']);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q2, 'abcde', 'edcba', '']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q2, 'placement', 'tnemecalp']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q2, 'a', 'a']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q2, 'python', 's = input()\n# Write your solution\nprint(s[::-1])']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q2, 'cpp', '#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n    string s;\n    cin >> s;\n    reverse(s.begin(), s.end());\n    cout << s << endl;\n    return 0;\n}']);

  // Q3
  const q3 = uuidv4();
  run(`INSERT INTO questions (id, test_id, title, problem_statement, input_format, output_format, constraints, marks, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    q3, testId,
    'Check Prime Number',
    'Given an integer N, determine whether it is a prime number. Print "YES" if it is prime, otherwise print "NO".',
    'A single integer N.',
    'Print "YES" if N is prime, else print "NO".',
    '1 ≤ N ≤ 10^6',
    10, 2
  ]);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q3, '7', 'YES', '7 is a prime number']);
  run(`INSERT INTO sample_test_cases (id, question_id, input, expected_output, explanation) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), q3, '10', 'NO', '10 = 2 × 5, not prime']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q3, '1', 'NO']);
  run(`INSERT INTO hidden_test_cases (id, question_id, input, expected_output) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q3, '999983', 'YES']);
  run(`INSERT INTO boilerplate_code (id, question_id, language, code) VALUES (?, ?, ?, ?)`,
    [uuidv4(), q3, 'python', 'n = int(input())\nif n < 2:\n    print("NO")\nelse:\n    prime = True\n    for i in range(2, int(n**0.5)+1):\n        if n % i == 0:\n            prime = False\n            break\n    print("YES" if prime else "NO")']);

  console.log('✅ Demo test seeded successfully!');
  console.log('   Test: "Campus Placement - Round 1" with 3 questions (30 marks, 60 min)');
}

seed().catch(console.error);
