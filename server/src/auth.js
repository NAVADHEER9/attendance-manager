export const USERS = {
  'admin@college.edu': { password: 'admin123', role: 'Administrator', name: 'Administrator' },
  'faculty@college.edu': { password: 'faculty123', role: 'Faculty', name: 'Faculty Member' }
};

export const TEACHER_EMAIL_DOMAIN = '@anurag.edu.in';
export const DEFAULT_INVITE_CODES = ['ANURAG2026', 'FACULTY-ANURAG'];

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function getInviteCodes() {
  const configured = process.env.TEACHER_INVITE_CODES ?? DEFAULT_INVITE_CODES.join(',');
  return configured
    .split(',')
    .map((code) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

export function validateTeacherRegistration({ name, email, password, inviteCode } = {}) {
  const cleanName = String(name ?? '').trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password ?? '').trim();
  const normalizedInviteCode = String(inviteCode ?? '').trim().toUpperCase();

  if (!cleanName) {
    throw new Error('Teacher name is required.');
  }

  if (!normalizedEmail || !normalizedEmail.endsWith(TEACHER_EMAIL_DOMAIN)) {
    throw new Error('Teacher email must use the @anurag.edu.in domain.');
  }

  if (normalizedPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  if (!normalizedInviteCode || !getInviteCodes().includes(normalizedInviteCode)) {
    throw new Error('Invalid invite code. Please use a valid faculty invite code.');
  }

  return {
    name: cleanName,
    email: normalizedEmail,
    password: normalizedPassword,
    inviteCode: normalizedInviteCode
  };
}

export function authenticateUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password ?? '').trim();
  const user = USERS[normalizedEmail];

  if (!user || user.password !== normalizedPassword) {
    return null;
  }

  return {
    token: `demo-${user.role.toLowerCase()}`,
    user: {
      email: normalizedEmail,
      role: user.role,
      name: user.name
    }
  };
}
