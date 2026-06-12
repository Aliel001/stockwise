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

// Let the managers login using their standard store email & full name
export async function signInWithEmailAndName(email: string, name: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  if (!cleanEmail || !cleanName) {
    throw new Error('Please fill in both Email and Full Name.');
  }

  // Basic email pattern validate to assist the store personnel
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

  // Dispatch auth state update to all subscribers
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
