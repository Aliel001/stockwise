// Custom Local Auth State Engine replacing Firebase Authentication completely.
// This allows the app to connect securely directly to the Neon PostgreSQL database using the active user's email.

export interface LocalUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role?: string;
  status?: string;
}

// Global subscribers for login state changes
type AuthListener = (user: LocalUser | null) => void;
const authListeners = new Set<AuthListener>();

let currentUser: LocalUser | null = null;
let isMeLoaded = false;
let mePromise: Promise<LocalUser | null> | null = null;

async function getMe(): Promise<LocalUser | null> {
  if (isMeLoaded) return currentUser;
  if (!mePromise) {
    mePromise = fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : { authenticated: false })
      .then(data => {
        isMeLoaded = true;
        if (data.authenticated && data.user) {
          currentUser = {
            uid: data.user.id || 'user_g_' + Math.random().toString(36).substring(2, 11),
            email: data.user.email,
            displayName: data.user.displayName,
            photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.user.displayName || '')}`,
            role: data.user.role,
            status: data.user.status,
          };
        } else {
          currentUser = null;
        }
        return currentUser;
      })
      .catch((err) => {
        console.error('[auth/me check failed]', err);
        isMeLoaded = true;
        currentUser = null;
        return null;
      });
  }
  return mePromise;
}

export const auth = {
  get currentUser() {
    return currentUser;
  }
};

export function onAuthStateChanged(authInstance: any, callback: AuthListener) {
  authListeners.add(callback);
  // Fetch from session cookie on initialization
  getMe().then(user => {
    callback(user);
  });
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

  if (data.isPending) {
    throw new Error(data.message || 'Account awaiting Super Admin approval.');
  }

  const newUser: LocalUser = {
    uid: 'user_' + Math.random().toString(36).substring(2, 11),
    email: data.email,
    displayName: data.displayName,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName)}`,
    role: data.role,
    status: data.status
  };

  currentUser = newUser;
  isMeLoaded = true;
  mePromise = Promise.resolve(newUser);

  // Dispatch auth state update to all subscribers
  for (const listener of authListeners) {
    listener(newUser);
  }
  return newUser;
}

// Keep legacy signInWithEmailAndName (optional bypass or fallback) with backend state checks
export async function signInWithEmailAndName(email: string, name: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  if (!cleanEmail || !cleanName) {
    throw new Error('Please fill in both Email and Full Name.');
  }

  if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid store email address.');
  }

  // Check status with server
  const response = await fetch('/api/auth/login-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, name: cleanName })
  });

  if (!response.ok) {
    let errMsg = 'Failed to check account state';
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  if (data.requirePassword) {
    return { requirePassword: true };
  }

  if (data.allowed === false) {
    throw new Error(data.error || 'Awaiting Super Admin approval.');
  }

  const newUser: LocalUser = {
    uid: 'user_' + Math.random().toString(36).substring(2, 11),
    email: data.email || cleanEmail,
    displayName: data.displayName || cleanName,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName || cleanName)}`,
    role: data.role || 'USER',
    status: data.status || 'ACTIVE'
  };

  currentUser = newUser;
  isMeLoaded = true;
  mePromise = Promise.resolve(newUser);

  for (const listener of authListeners) {
    listener(newUser);
  }
  return newUser;
}

export async function signInWithPassword(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  
  const response = await fetch('/api/auth/login-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, password })
  });

  if (!response.ok) {
    let errMsg = 'Incorrect password or authentication failed';
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  if (data.allowed === false) {
    throw new Error(data.error || 'Awaiting Super Admin approval.');
  }

  const newUser: LocalUser = {
    uid: 'user_super_admin',
    email: data.email || cleanEmail,
    displayName: data.displayName || 'Super Admin',
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName || 'Super Admin')}`,
    role: data.role || 'SUPER_ADMIN',
    status: data.status || 'ACTIVE'
  };

  currentUser = newUser;
  isMeLoaded = true;
  mePromise = Promise.resolve(newUser);

  for (const listener of authListeners) {
    listener(newUser);
  }
  return newUser;
}

export async function logOut() {
  currentUser = null;
  isMeLoaded = true;
  mePromise = Promise.resolve(null);

  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Backend logout request failed', err);
  }

  for (const listener of authListeners) {
    listener(null);
  }
}

export async function signInWithGoogle(email: string, name: string): Promise<LocalUser> {
  return new Promise((resolve, reject) => {
    const popupWidth = 460;
    const popupHeight = 600;
    const left = window.screen.width / 2 - popupWidth / 2;
    const top = window.screen.height / 2 - popupHeight / 2;
    
    const params = new URLSearchParams({ email, name });
    const targetUrl = `/api/auth/google?${params.toString()}`;
    const popup = window.open(
      targetUrl, 
      'google_login_sso', 
      `width=${popupWidth},height=${popupHeight},top=${top},left=${left},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      reject(new Error('Kwinjira byafunzwe na Browser! Banza wemerere Pop-ups kuri uru rubuga ukomeze na Google.'));
      return;
    }

    const messageHandler = (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowed = 
        origin.endsWith('.run.app') || 
        origin.includes('localhost') || 
        origin.includes('europe-west3') || 
        origin.includes('vercel.app');

      if (!isAllowed) {
         return;
      }

      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', messageHandler);
        
        const googleUser: LocalUser = event.data.user;
        currentUser = googleUser;
        isMeLoaded = true;
        mePromise = Promise.resolve(googleUser);
        
        for (const listener of authListeners) {
          listener(googleUser);
        }
        resolve(googleUser);
      }
    };

    window.addEventListener('message', messageHandler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Google Sign-In canceled.'));
      }
    }, 1000);
  });
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
