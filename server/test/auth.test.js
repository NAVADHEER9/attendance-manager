import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, authenticateUser, validateTeacherRegistration } from '../src/auth.js';

test('normalizeEmail trims and lowercases the address', () => {
  assert.equal(normalizeEmail('  Admin@College.edu  '), 'admin@college.edu');
});

test('authenticateUser accepts mixed-case credentials', () => {
  const user = authenticateUser('  Admin@College.edu  ', 'admin123');
  assert.deepEqual(user, {
    token: 'demo-administrator',
    user: {
      email: 'admin@college.edu',
      role: 'Administrator',
      name: 'Administrator'
    }
  });
});

test('authenticateUser rejects invalid credentials', () => {
  assert.equal(authenticateUser('admin@college.edu', 'wrongpass'), null);
});

test('validateTeacherRegistration accepts a valid Anurag teacher invite', () => {
  const result = validateTeacherRegistration({
    name: 'Asha Mehta',
    email: '  asha.mehta@anurag.edu.in  ',
    password: 'TeacherPass123',
    inviteCode: 'ANURAG2026'
  });

  assert.deepEqual(result, {
    name: 'Asha Mehta',
    email: 'asha.mehta@anurag.edu.in',
    password: 'TeacherPass123',
    inviteCode: 'ANURAG2026'
  });
});

test('validateTeacherRegistration rejects non-Anurag emails and invalid invite codes', () => {
  assert.throws(() => validateTeacherRegistration({
    name: 'Guest',
    email: 'guest@example.com',
    password: 'TeacherPass123',
    inviteCode: 'ANURAG2026'
  }), /@anurag.edu.in/);

  assert.throws(() => validateTeacherRegistration({
    name: 'Asha Mehta',
    email: 'asha.mehta@anurag.edu.in',
    password: 'TeacherPass123',
    inviteCode: 'WRONGCODE'
  }), /invite code/i);
});
