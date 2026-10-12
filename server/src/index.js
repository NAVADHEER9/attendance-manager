import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { authenticateUser, normalizeEmail, validateTeacherRegistration } from './auth.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlJsDist = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDist, file) });
const dbPath = path.join(__dirname, '..', 'attendance.db');
const db = fs.existsSync(dbPath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  : new SQL.Database();

const saveDb = () => {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
};

const hashPassword = (password) => crypto.createHash('sha256').update(String(password)).digest('hex');

const selectRows = (sql, params = []) => {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
};

const runSql = (sql, params = []) => {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  stmt.step();
  stmt.free();
  saveDb();
  const lastId = db.exec('SELECT last_insert_rowid() AS id');
  return lastId.length ? Number(lastId[0].values[0][0]) : null;
};

async function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Teacher',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'IT',
      year_no INTEGER NOT NULL DEFAULT 2,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      faculty TEXT NOT NULL DEFAULT 'Faculty'
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      att_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent')),
      UNIQUE(student_id, subject_id, att_date)
    );
  `);
  saveDb();

  const existing = selectRows('SELECT COUNT(*) AS count FROM students')[0]?.count ?? 0;
  if (Number(existing) !== 0) return;

  const students = [
    ['IT2301', 'Aarav Sharma', 'IT', 2],
    ['IT2302', 'Diya Reddy', 'IT', 2],
    ['IT2303', 'Rahul Kumar', 'IT', 2],
    ['IT2304', 'Meera Nair', 'IT', 2],
    ['IT2305', 'Arjun Rao', 'IT', 2],
    ['IT2306', 'Sana Khan', 'IT', 2]
  ];

  const subjects = [
    ['CS201', 'Data Structures', 'Prof. Sharma'],
    ['CS202', 'Database Systems', 'Prof. Reddy'],
    ['CS203', 'Java Programming', 'Prof. Kumar'],
    ['CS204', 'Computer Networks', 'Prof. Nair']
  ];

  for (const student of students) {
    runSql('INSERT INTO students(roll_no, name, department, year_no) VALUES (?, ?, ?, ?)', student);
  }

  for (const subject of subjects) {
    runSql('INSERT INTO subjects(code, name, faculty) VALUES (?, ?, ?)', subject);
  }

  const studentRows = selectRows('SELECT id FROM students ORDER BY id');
  const subjectRows = selectRows('SELECT id FROM subjects ORDER BY id');

  for (let d = 1; d <= 20; d++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - (20 - d));
    const attDate = targetDate.toISOString().slice(0, 10);

    for (const st of studentRows) {
      for (const sub of subjectRows) {
        const absent = (st.id === 3 && d % 3 === 0) || (st.id === 5 && d % 4 === 0) || (st.id === 2 && sub.id === 2 && d % 5 === 0);
        runSql('INSERT INTO attendance(student_id, subject_id, att_date, status) VALUES (?, ?, ?, ?)', [st.id, sub.id, attDate, absent ? 'Absent' : 'Present']);
      }
    }
  }

  saveDb();
}

const javaUrl = () => process.env.JAVA_SERVICE_URL || 'http://localhost:8080';

async function calculate(records) {
  try {
    const r = await fetch(`${javaUrl()}/api/calculate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(records) });
    if (r.ok) return await r.json();
  } catch {}
  return records.map((x) => ({ ...x, total: Number(x.total), present: Number(x.present), percentage: Number(x.total) ? Math.round((Number(x.present) / Number(x.total)) * 1000) / 10 : 0 }));
}

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'Attendance Manager API' }));

app.post('/api/auth/login', (req, res) => {
  const email = req.body?.email;
  const password = req.body?.password;
  const user = authenticateUser(email, password);
  if (user) return res.json(user);

  const storedUser = selectRows('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)])[0];
  if (!storedUser || storedUser.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({
    token: `teacher-${storedUser.role.toLowerCase()}`,
    user: {
      email: storedUser.email,
      role: storedUser.role,
      name: storedUser.name
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const payload = validateTeacherRegistration(req.body);
    const email = normalizeEmail(payload.email);

    const existing = selectRows('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'A teacher account with this email already exists.' });
    }

    runSql(
      'INSERT INTO users(email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [email, hashPassword(payload.password), payload.name, 'Teacher']
    );

    const user = selectRows('SELECT * FROM users WHERE email = ?', [email])[0];
    if (!user) {
      return res.status(500).json({ error: 'Teacher account could not be created.' });
    }

    res.status(201).json({
      token: `teacher-${user.role.toLowerCase()}`,
      user: {
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/students', async (_, res) => {
  try {
    const rows = selectRows(`
      SELECT s.*, COALESCE(a.total, 0) AS total, COALESCE(a.present, 0) AS present
      FROM students s
      LEFT JOIN (
        SELECT student_id, COUNT(*) AS total, SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present
        FROM attendance
        GROUP BY student_id
      ) a ON a.student_id = s.id
      WHERE s.active = 1
      ORDER BY s.roll_no
    `);
    res.json(await calculate(rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { roll_no, name, department = 'IT', year_no = 2 } = req.body;
    const existing = selectRows('SELECT id FROM students WHERE roll_no = ?', [roll_no]);
    if (existing.length) return res.status(400).json({ error: 'Roll number already exists' });
    const id = runSql('INSERT INTO students(roll_no, name, department, year_no) VALUES (?, ?, ?, ?)', [roll_no, name, department, year_no]);
    const row = selectRows('SELECT * FROM students WHERE id = ?', [id])[0];
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    const { name, department, year_no } = req.body;
    const row = selectRows('SELECT * FROM students WHERE id = ?', [req.params.id])[0];
    if (!row) return res.status(404).json({ error: 'Student not found' });
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (year_no !== undefined) { updates.push('year_no = ?'); values.push(year_no); }
    if (updates.length) {
      values.push(req.params.id);
      runSql(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json(selectRows('SELECT * FROM students WHERE id = ?', [req.params.id])[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    runSql('UPDATE students SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/subjects', async (_, res) => {
  try {
    res.json(selectRows('SELECT * FROM subjects ORDER BY code'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/subjects', async (req, res) => {
  try {
    const { code, name, faculty = 'Faculty' } = req.body;
    const existing = selectRows('SELECT id FROM subjects WHERE code = ?', [code]);
    if (existing.length) return res.status(400).json({ error: 'Could not add subject. Check that its code is unique.' });
    const id = runSql('INSERT INTO subjects(code, name, faculty) VALUES (?, ?, ?)', [code, name, faculty]);
    const row = selectRows('SELECT * FROM subjects WHERE id = ?', [id])[0];
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: 'Could not add subject. Check that its code is unique.' });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const { date, subjectId } = req.query;
    const params = [];
    const where = [];
    if (date) {
      params.push(date);
      where.push('a.att_date = ?');
    }
    if (subjectId) {
      params.push(subjectId);
      where.push('a.subject_id = ?');
    }

    const rows = selectRows(`
      SELECT a.*, s.roll_no, s.name AS student_name, sub.code AS subject_code, sub.name AS subject_name
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      JOIN subjects sub ON sub.id = a.subject_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.att_date DESC, s.roll_no
      LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/attendance/bulk', async (req, res) => {
  const { date, subjectId, records } = req.body || {};
  if (!date || !subjectId || !Array.isArray(records)) {
    return res.status(400).json({ error: 'date, subjectId and records are required' });
  }

  try {
    for (const rec of records) {
      const status = rec.status === 'Absent' ? 'Absent' : 'Present';
      const exists = selectRows('SELECT 1 FROM attendance WHERE student_id = ? AND subject_id = ? AND att_date = ?', [rec.studentId, subjectId, date]);
      if (exists.length) {
        runSql('UPDATE attendance SET status = ? WHERE student_id = ? AND subject_id = ? AND att_date = ?', [status, rec.studentId, subjectId, date]);
      } else {
        runSql('INSERT INTO attendance(student_id, subject_id, att_date, status) VALUES (?, ?, ?, ?)', [rec.studentId, subjectId, date, status]);
      }
    }
    res.json({ ok: true, saved: records.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/reports', async (_, res) => {
  try {
    const raw = selectRows(`
      SELECT
        s.id,
        s.roll_no,
        s.name,
        s.department,
        COUNT(a.id) AS total,
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id
      WHERE s.active = 1
      GROUP BY s.id, s.roll_no, s.name, s.department
      ORDER BY s.roll_no
    `);
    res.json(await calculate(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 4000;
init().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`API listening on ${port}`));
}).catch((e) => {
  console.error('Database initialization failed', e);
  process.exit(1);
});
