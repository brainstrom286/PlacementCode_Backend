const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'placement_secret_2024';

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Student Register
router.post('/register', wrap((req, res) => {
  const { name, enrollment, email, password } = req.body;
  if (!name || !enrollment || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const exists = db.get('SELECT id FROM users WHERE email = ? OR enrollment = ?', [email, enrollment]);
  if (exists) return res.status(409).json({ error: 'Email or enrollment already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  db.run('INSERT INTO users (id, name, enrollment, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, enrollment, email, hash, 'student']);

  res.json({ message: 'Registered successfully' });
}));

// Login
router.post('/login', wrap((req, res) => {
  const { email, password } = req.body;
  const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role, name: user.name, id: user.id });
}));

module.exports = router;
