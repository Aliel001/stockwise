// Custom Local Auth State Engine replacing Firebase Authentication completely.
// This allows the app to connect securely directly to the Neon PostgreSQL database using the active user's email.

export interface LocalUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role?: string;
}

// Global subscribers for login state changes
type AuthListener = (user: LocalUser | null) => void;
const authListeners = new Set<AuthListener>();

let currentUser: LocalUser | null = (() => {
  try {
    const saved = localStorage.getItem('stockwise_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
})();

export const auth = {
  get currentUser() {
    return currentUser;
  }
};

export function onAuthStateChanged(authInstance: any, callback: AuthListener) {
  authListeners.add(callback);
  // Emit state to listener immediately on subscription
  callback(currentUser);
  return () => {
    authListeners.delete(callback);
  };
}

// Let the managers trigger verification by requesting a 6-digit passcode
export async function sendVerificationCode(email: string, name: string, phone: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  
  if (!cleanEmail || !cleanName || !cleanPhone) {
    throw new Error('Please fill in all required fields: Full Name, Email, and Phone Contact.');
  }

  if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid store email address.');
  }

  const response = await fetch('/api/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, name: cleanName, phone: cleanPhone })
  });

  if (!response.ok) {
    let errMsg = 'Failed to request verification code';
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return response.json();
}

// Complete verification step and write session properties
export async function verifyCodeAndLogin(email: string, name: string, code: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanCode = code.trim();

  if (!cleanCode) {
    throw new Error('Verification code cannot be empty.');
  }

  const response = await fetch('/api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, code: cleanCode })
  });

  if (!response.ok) {
    let errMsg = 'Failed to verify email code';
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  const newUser: LocalUser = {
    uid: 'user_' + Math.random().toString(36).substring(2, 11),
    email: data.email,
    displayName: data.displayName,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName)}`
  };

  currentUser = newUser;
  localStorage.setItem('stockwise_user', JSON.stringify(newUser));

  // Dispatch auth state update to all subscribers
  for (const listener of authListeners) {
    listener(newUser);
  }
  return newUser;
}

// Keep legacy signInWithEmailAndName (optional bypass or fallback)
export async function signInWithEmailAndName(email: string, name: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  if (!cleanEmail || !cleanName) {
    throw new Error('Please fill in both Email and Full Name.');
  }

  if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid store email address.');
  }

  const newUser: LocalUser = {
    uid: 'user_' + Math.random().toString(36).substring(2, 11),
    email: cleanEmail,
    displayName: cleanName,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}`
  };

  currentUser = newUser;
  localStorage.setItem('stockwise_user', JSON.stringify(newUser));

  for (const listener of authListeners) {
    listener(newUser);
  }
  return newUser;
}

export async function logOut() {
  currentUser = null;
  localStorage.removeItem('stockwise_user');
  for (const listener of authListeners) {
    listener(null);
  }
}

// Minimal placeholder rule handling interface to avoid breaks
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
