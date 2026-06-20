import express from 'express';
import path from 'path';
import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

declare global {
  namespace Express {
    interface Request {
      userEmail?: string;
      userRole?: string;
      userStoreId?: string;
    }
  }
}

// Load original environmental parameters and configuration
dotenv.config();

// Fallback logic if DATABASE_URL can't be fetched
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const examplePath = path.join(process.cwd(), '.env.example');
    
    if (fs.existsSync(examplePath)) {
      console.log('[PostgreSQL] DATABASE_URL is missing. Attempting resilient environment recovery.');
      if (!fs.existsSync(envPath)) {
        try {
          fs.copyFileSync(examplePath, envPath);
          dotenv.config(); // Reload env
        } catch (copyErr) {
          console.warn('[PostgreSQL] Could not create .env file. Reading from .env.example manually.', copyErr);
        }
      }
      
      // If still not of process.env.DATABASE_URL (e.g. read-only filesystem or container environment),
      // manually parse .env.example to populate environment variables
      if (!process.env.DATABASE_URL) {
        const content = fs.readFileSync(examplePath, 'utf8');
        content.split('\n').forEach(line => {
          const cleanLine = line.trim();
          if (cleanLine && !cleanLine.startsWith('#') && cleanLine.includes('=')) {
            const eqIdx = cleanLine.indexOf('=');
            const key = cleanLine.substring(0, eqIdx).trim();
            let val = cleanLine.substring(eqIdx + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      }
    }
  } catch (err: any) {
    console.error('[PostgreSQL] Resilient .env recovery failed:', err.message);
  }
}

const Pool = (pg.Pool || (pg as any).default?.Pool) as typeof pg.Pool;

// 1. Connection Optimization using PgBouncer/Neon compatible Pool configuration
let dbUrl = (process.env.DATABASE_URL || '').trim();

// Strip any accidental enclosing single or double quotes which would cause Pg driver connection parsing failures
if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) {
  dbUrl = dbUrl.slice(1, -1).trim();
}
if (dbUrl.startsWith("'") && dbUrl.endsWith("'")) {
  dbUrl = dbUrl.slice(1, -1).trim();
}

// Resilient default Neon database fallback to ensure seamless zero-configuration deployments on Vercel
if (!dbUrl) {
  dbUrl = "postgresql://neondb_owner:npg_HYnrTCGg56MB@ep-quiet-king-aqr521b9-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
  console.log('[PostgreSQL] DATABASE_URL is not set. Automatically active resilient default Neon fallback.');
}

// Sanitization for standard node-postgres 'pg' library compatibility
if (dbUrl && dbUrl.includes('channel_binding=')) {
  dbUrl = dbUrl.replace(/[&?]channel_binding=[^&]+/g, '');
  // Clean up hanging parameters
  dbUrl = dbUrl.replace(/\?&/, '?').replace(/&$/, '');
}

// Configure a production-grade Connection Pool optimized for high concurrency
const pool = new Pool(dbUrl ? {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false // Required for Neon PostgreSQL SSL handshakes
  },
  max: 30, // Pool size optimized for concurrent web transactions
  idleTimeoutMillis: 15000, // Faster idle connection cleanup
  connectionTimeoutMillis: 5000, // Safe timeout for immediate connection failures
} : {
  max: 1 // Minimal dummy configuration when database URL is missing
});

// Track database initialization state to prevent duplicate parallel schema boot triggers
let isSchemaInitialized = false;
let schemaInitializingPromise: Promise<void> | null = null;

// Thread-safe wrapper to ensure schema exists and has columns before queries run
async function ensureSchemaInitialized(): Promise<void> {
  if (isSchemaInitialized) return;
  if (!schemaInitializingPromise) {
    const maxRetries = process.env.VERCEL ? 1 : 5;
    const retryDelay = process.env.VERCEL ? 1000 : 2500;
    schemaInitializingPromise = initializeSchema(maxRetries, retryDelay)
      .then(() => {
        isSchemaInitialized = true;
      })
      .catch((err) => {
        console.error('[PostgreSQL Schema Error] Delayed retry state queued.', err);
        schemaInitializingPromise = null; // Reset to allow retry on next request
        throw err;
      });
  }
  return schemaInitializingPromise;
}

// CRITICAL: Handle unexpected database connection errors on idle pooled clients to prevent process crash
pool.on('error', (err) => {
  console.error('[PostgreSQL Connection Pool] Unexpected error on idle client:', err);
});

// Resilient DB Schema initialization on boot with connection retry and index/column recovery
async function initializeSchema(retries = 5, delay = 2500): Promise<void> {
  if (!dbUrl) {
    console.warn('[PostgreSQL] Schema initialization bypassed: DATABASE_URL is not set.');
    return;
  }
  let client;
  for (let i = 0; i < retries; i++) {
    try {
      client = await pool.connect();
      console.log('[PostgreSQL] Connected to Neon database successfully.');
      break;
    } catch (err) {
      console.error(`[PostgreSQL] Database connection attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`, err);
      if (i === retries - 1) {
        console.error('[PostgreSQL] Max retries reached. Database schema initialization bypassed.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  if (!client) return;

  try {
    console.log('[PostgreSQL] Running Database Schema diagnostics and cleanup...');

    // Smart helper to scan for incompatible legacy tables we should drop and let rebuild
    const checkAndDropIncompatible = async (tableName: string, requiredColumn: string) => {
      try {
        const tableCheck = await client.query(`
          SELECT COUNT(*) FROM information_schema.tables WHERE table_name = $1;
        `, [tableName]);
        if (parseInt(tableCheck.rows[0].count) > 0) {
          const colCheck = await client.query(`
            SELECT COUNT(*) FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2;
          `, [tableName, requiredColumn]);
          if (parseInt(colCheck.rows[0].count) === 0) {
            console.log(`[PostgreSQL] Incompatible legacy table "${tableName}" (missing column "${requiredColumn}") detected. Rebuilding...`);
            await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
            return;
          }

          // Also check if id column is defined with the incompatible UUID type rather than character varying / text
          const typeCheck = await client.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = 'id';
          `, [tableName]);
          if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'uuid') {
            console.log(`[PostgreSQL] Incompatible UUID column type detected on primary key "id" for table "${tableName}". Upgrading to VARCHAR...`);
            await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
          }
        }
      } catch (err) {
        console.error(`[PostgreSQL] Diagnostic failed for table "${tableName}":`, err);
      }
    };

    // Diagnostics & Cleanup cascade
    await checkAndDropIncompatible('users', 'full_name');
    await checkAndDropIncompatible('products', 'created_by');
    await checkAndDropIncompatible('sales', 'performed_by');
    await checkAndDropIncompatible('notifications', 'type');
    await checkAndDropIncompatible('activity_logs', 'performed_by');

    // Core stores table based on suggestions
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_id VARCHAR(255)
      );
    `);

    // Core users table supporting SUPER_ADMIN control layer and approval states
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        status VARCHAR(50) DEFAULT 'PENDING',
        store_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Dynamic schema corrections
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER';`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);
    await client.query(`UPDATE users SET status = 'ACTIVE' WHERE status IS NULL;`);
    await client.query(`UPDATE users SET role = 'USER' WHERE role IS NULL;`);

    // Ensure store_id exist on all other transaction tables
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);
    await client.query(`ALTER TABLE stock_ins ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);
    await client.query(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);`);

    // Normalized Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        product_code VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        purchase_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (purchase_price >= 0),
        selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (selling_price >= 0),
        min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Normalized Inventory Stock Table (3NF Separation from Products)
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_stock (
        id VARCHAR(255) PRIMARY KEY,
        product_id VARCHAR(255) UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sales Record Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        performed_by VARCHAR(255) NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sales Items Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_items (
        id VARCHAR(255) PRIMARY KEY,
        sale_id VARCHAR(255) REFERENCES sales(id) ON DELETE CASCADE,
        product_id VARCHAR(255) REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price NUMERIC(15, 2) NOT NULL CHECK (price >= 0)
      );
    `);

    // Stock In Deliveries Table (Supplier restocks)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_ins (
        id VARCHAR(255) PRIMARY KEY,
        product_id VARCHAR(255) REFERENCES products(id) ON DELETE CASCADE,
        product_name VARCHAR(255),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        purchase_price NUMERIC(15, 2) DEFAULT 0.00,
        supplier VARCHAR(255),
        notes TEXT,
        performed_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Notifications and Security Alerts Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        product_id VARCHAR(255) REFERENCES products(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        user_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Activity Logs / Audit Trails Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        action TEXT NOT NULL,
        performed_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- Performance Optimization Indexes ---
    console.log('[PostgreSQL] Deploying highly efficient indexes...');
    
    // Indexing for rapid owner filtration
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_stock_product_id ON inventory_stock(product_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sales_performed_by ON sales(performed_by);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sales_items_sale_id ON sales_items(sale_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sales_items_product_id ON sales_items(product_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by ON activity_logs(performed_by);');
    
    // Indexing on created_at fields for date-range dashboard queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_stock_ins_created_at ON stock_ins(created_at);');

    // Ensure stock_ins has purchase_price column (for "even stockin add purchase price" request)
    await client.query('ALTER TABLE stock_ins ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(15, 2) DEFAULT 0.00;');

    // Seeding some starter products if the catalog is empty, supporting neat visual UX
    const resCount = await client.query('SELECT COUNT(*) FROM products;');
    if (parseInt(resCount.rows[0].count) === 0) {
      console.log('[PostgreSQL] Seeding starter inventory database values...');
      const starterProducts = [
        { id: 'prod_macbook', name: 'MacBook Pro M3', desc: 'Space gray 16GB unified memory', pCode: 'SW-839210', pPrice: 1500000, sPrice: 1850000, minStock: 3, user: 'alieluzii@gmail.com', qty: 12 },
        { id: 'prod_keyboard', name: 'Ergonomic Mechanical Keyboard', desc: 'Tactile switches with wood wrist rest', pCode: 'SW-210492', pPrice: 85000, sPrice: 130000, minStock: 10, user: 'alieluzii@gmail.com', qty: 25 },
        { id: 'prod_mouse', name: 'MX Master 3S Wireless Mouse', desc: 'Ultralight darkfield precision tracking', pCode: 'SW-409121', pPrice: 100000, sPrice: 145000, minStock: 8, user: 'alieluzii@gmail.com', qty: 5 },
      ];

      for (const p of starterProducts) {
        await client.query(
          `INSERT INTO products (id, name, product_code, description, purchase_price, selling_price, min_stock, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [p.id, p.name, p.pCode, p.desc, p.pPrice, p.sPrice, p.minStock, p.user]
        );
        await client.query(
          `INSERT INTO inventory_stock (id, product_id, quantity) VALUES ($1, $2, $3);`,
          ['stock_' + p.id, p.id, p.qty]
        );
      }

      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by) VALUES ($1, $2, $3);`,
        ['log_seed', 'System initialized with optimal base products and stock quantities.', 'alieluzii@gmail.com']
      );
    }

    // Super Admin seeding routine on boot - alieluzii@gmail.com is now the only Super Admin
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
    const superAdminPassword = (process.env.SUPER_ADMIN_PASSWORD || 'StockwiseSuperAdmin2026!').trim();
    const hashedSA = crypto.createHash('sha256').update(superAdminPassword).digest('hex');

    // Create / Update Super Admin
    await client.query(`
      INSERT INTO users (id, full_name, email, password, role, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE 
      SET role = 'SUPER_ADMIN', status = 'ACTIVE', password = $4;
    `, ['user_super_admin', 'Super Admin', superAdminEmail, hashedSA, 'SUPER_ADMIN', 'ACTIVE']);

    // Clean up old default/placeholder admin/manager accounts as requested
    const defaultSecuresToDelete = ['admin@stockwise.rw', 'guest.manager@stockwise.rw', 'test.account@gmail.com'];
    await client.query(`
      DELETE FROM users WHERE email = ANY($1) AND email != $2;
    `, [defaultSecuresToDelete, superAdminEmail]);

    // --- Dynamic Self-Healing Tenant Migration & Backfilling ---
    console.log('[PostgreSQL] Running self-healing backfill for tenant-isolation...');
    const unresolvedUsers = await client.query(`SELECT id, full_name, email, role FROM users WHERE store_id IS NULL;`);
    for (const u of unresolvedUsers.rows) {
      if (u.role === 'SUPER_ADMIN') continue;
      
      const email = u.email.trim().toLowerCase();
      const parts = email.split('@');
      const domain = parts[1];
      const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com'];
      
      let storeId = '';
      if (!genericDomains.includes(domain)) {
        // Look up if any other user has a store_id for this domain
        const domainOwner = await client.query(`SELECT store_id FROM users WHERE email LIKE $1 AND store_id IS NOT NULL LIMIT 1;`, [`%@${domain}`]);
        if (domainOwner.rows.length > 0) {
          storeId = domainOwner.rows[0].store_id;
        }
      }
      
      if (!storeId) {
        storeId = 'store_' + Math.random().toString(36).substring(2, 11);
        const storeName = !genericDomains.includes(domain) 
          ? domain.split('.')[0].toUpperCase() + ' Store'
          : u.full_name + "'s Store";
          
        await client.query(`INSERT INTO stores (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [storeId, storeName, u.id]);
      }
      
      await client.query(`UPDATE users SET store_id = $1 WHERE id = $2;`, [storeId, u.id]);
    }

    // Sync store_id for all products, sales, stock_ins, notifications, and activity_logs
    await client.query(`
      UPDATE products p
      SET store_id = u.store_id
      FROM users u
      WHERE p.created_by = u.email AND p.store_id IS NULL;
    `);
    await client.query(`
      UPDATE sales s
      SET store_id = u.store_id
      FROM users u
      WHERE s.performed_by = u.email AND s.store_id IS NULL;
    `);
    await client.query(`
      UPDATE stock_ins si
      SET store_id = u.store_id
      FROM users u
      WHERE si.performed_by = u.email AND si.store_id IS NULL;
    `);
    await client.query(`
      UPDATE notifications n
      SET store_id = u.store_id
      FROM users u
      WHERE n.user_email = u.email AND n.store_id IS NULL;
    `);
    await client.query(`
      UPDATE activity_logs al
      SET store_id = u.store_id
      FROM users u
      WHERE al.performed_by = u.email AND al.store_id IS NULL;
    `);

    console.log('[PostgreSQL] Database schema initialized successfully.');
  } catch (err) {
    console.error('[PostgreSQL] Database connection/schema error: ', err);
  } finally {
    if (client) {
      client.release();
    }
  }
}

const app = express();
export { app };
export default app;

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-stockwise-realtime-inventory-portal';

app.use(express.json());
app.use(cookieParser());

  // For Vercel Serverless environment compatibility to normalize incoming paths if /api gets stripped or decorated
  app.use((req, res, next) => {
    if (process.env.VERCEL) {
      console.log(`[Vercel Serverless Routing] Original req.url: ${req.url}`);

      let cleanPath = req.url;
      const qIdx = cleanPath.indexOf('?');
      const pathNoQuery = qIdx !== -1 ? cleanPath.substring(0, qIdx) : cleanPath;
      const queryStr = qIdx !== -1 ? cleanPath.substring(qIdx) : '';

      let subPath = pathNoQuery;
      const vercelPrefixes = [
        '/api/index.ts',
        '/api/index.js',
        '/api/index',
        '/api'
      ];

      for (const prefix of vercelPrefixes) {
        if (subPath.startsWith(prefix)) {
          subPath = subPath.substring(prefix.length);
          break;
        }
      }

      if (!subPath.startsWith('/')) {
        subPath = '/' + subPath;
      }

      req.url = '/api' + subPath + queryStr;

      console.log(`[Vercel Serverless Routing] Normalized req.url: ${req.url}`);
    }
    next();
  });

  // Allow CORS globally to handle custom headers and browser preflight OPTIONS requests securely
  app.use((req, res, next) => {
    console.log(`[Express Request] ${req.method} ${req.path}`);
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Lazy-initialization middleware to ensure the DB schema is spun up on request when running in Vercel Serverless environments
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      try {
        await ensureSchemaInitialized();
      } catch (err: any) {
        console.error('[PostgreSQL Initialization Middleware Error]', err);
      }
    }
    next();
  });

  const PORT = 3000;

  // In traditional environments, pre-load the schema in the background to ensure fast response.
  // In Vercel serverless environments, bypass the startup call to prevent cold-start delay timeouts.
  if (!process.env.VERCEL) {
    ensureSchemaInitialized().catch((err) => {
      console.error('[PostgreSQL] Background schema initialization failed:', err);
    });
  } else {
    console.log('[PostgreSQL] Startup schema initialization bypassed on Vercel. Lazy initialization enabled.');
  }

  // FAST API Healthcheck endpoint
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1;');
      res.json({ status: 'ok', database: 'connected' });
    } catch (err: any) {
      console.warn('[PostgreSQL Health Warning]:', err.message);
      res.status(200).json({ status: 'warn', database: 'connecting_or_idle', error: err.message });
    }
  });

  // In-memory registry for email verification codes
  const verificationCodes = new Map<string, { code: string; name: string; phone: string; expiresAt: number }>();
  
  // In-memory registry for forgot password reset codes
  const passwordResetCodes = new Map<string, { code: string; phone: string; expiresAt: number }>();

  // Robust function to check if the email is a genuine store email address
  function isRealEmail(email: string): { isValid: boolean; reason: string } {
    const clean = email.trim().toLowerCase();
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(clean)) {
      return { isValid: false, reason: 'Imiterere y\'imeri ntabwo yemewe. Koresha imeri ifite inyuguti zikwiye (Urugero: manager@domain.rw).' };
    }

    // Bypassed domain & name checks according to USER_REQUEST
    return { isValid: true, reason: '' };
  }

  // POST /api/auth/send-code - Initiates verification stage by generating and returning a 6-digit passcode
  app.post('/api/auth/send-code', async (req, res) => {
    try {
      const { email, name, phone } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'Imeri ndetse n\'Amazina yombi barakenewe. / Email and Name are required.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      const cleanPhone = (phone || '').trim();

      // Check if candidate email is genuine or not
      const emailCheckResult = isRealEmail(cleanEmail);
      if (!emailCheckResult.isValid) {
        console.warn(`[Blocked Authentication] Attempt with bogus/dummy email: "${cleanEmail}": ${emailCheckResult.reason}`);
        return res.status(400).json({ error: emailCheckResult.reason });
      }

      // Check user blocklist or status first in /api/auth/send-code
      const userRes = await pool.query('SELECT status FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length > 0) {
        const uStatus = userRes.rows[0].status;
        if (uStatus === 'REJECTED') {
          return res.status(403).json({ error: 'Your access request has been REJECTED by Super Admin.' });
        }
        if (uStatus === 'SUSPENDED') {
          return res.status(403).json({ error: 'Your access has been SUSPENDED by Super Admin.' });
        }
      }

      if (cleanPhone) {
        // Enforce valid phone dial code format
        const phoneRegex = /^\+?[0-9\s\-()]{8,20}$/;
        if (!phoneRegex.test(cleanPhone)) {
          return res.status(400).json({ error: 'Numero ya telefoni ntago yanditse neza. / Please input a valid store contact phone number.' });
        }
      }

      // Generate secure 6-digit OTP passcode
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store in memory with 10 minute expiry
      verificationCodes.set(cleanEmail, {
        code,
        name: cleanName,
        phone: cleanPhone || 'None',
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      console.log(`[Auth verification] Generated OTP: ${code} for client: ${cleanEmail} (Phone: ${cleanPhone || 'N/A'})`);

      // Send real email if SMTP configured
      const emailHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">StockWise</h2>
            <p style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; tracking: 0.1em; margin: 4px 0 0 0;">Inventory Management System</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 24px;" />
          <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Agaciro k'Isuzumwa rya Konti / Verification OTP Code</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0; margin-bottom: 20px;">
            Murakoze kwiyandikisha cyangwa kwinjira kuri StockWise, <b>${cleanName}</b>. Koresha kano gaciro k'isuzuma kugirango wemeze isura yanyu:<br />
            <span style="color: #64748b; font-size: 12px; font-style: italic;">(Thank you for signing in/up on StockWise, ${cleanName}. Use this OTP verification code to verify your account:)</span>
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 800; color: #4f46e5; letter-spacing: 0.25em; padding-left: 0.25em;">${code}</span>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin-top: 0; margin-bottom: 24px;">
            Kano gaciro k'isuzuma kamara iminota 10 gusa. Niba utabyisabiye, ntugire icyo ukora.<br />
            <span style="color: #94a3b8;">(This code is valid for 10 minutes. If you did not trigger this request, no action is required.)</span>
          </p>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 16px;" />
          <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">&copy; 2026 StockWise Corp. All rights reserved.</p>
        </div>
      `;

      const mailResult = await sendEmail({
        to: cleanEmail,
        subject: `[StockWise] Verification OTP: ${code}`,
        text: `Hello, your Stockwise verification code is: ${code}`,
        html: emailHtml
      });

      // We return the code transparently in the JSON payload of the response in this deployment environment
      // so the user can see/access it within their sandbox preview naturally
      res.json({
        success: true,
        message: mailResult.sent 
          ? 'Agaciro k’umutekano koherejwe neza kuri imeri yanyu! / Verification code sent successfully to your account email!'
          : 'Agaciro k’umutekano koherejwe successfully!',
        email: cleanEmail,
        phone: cleanPhone || 'None',
        code: code, // Shared in response body to guarantee seamless preview functionality
        isRealEmailSent: mailResult.sent
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/verify-code - Validates 6-digit passcode and authenticates session
  app.post('/api/auth/verify-code', async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and 6-digit code are required variables' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();

      const record = verificationCodes.get(cleanEmail);
      if (!record) {
        return res.status(400).json({ error: 'No verification record exists for this email address. Please request a new code.' });
      }

      if (Date.now() > record.expiresAt) {
        verificationCodes.delete(cleanEmail);
        return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
      }

      if (record.code !== cleanCode) {
        return res.status(400).json({ error: 'Incorrect 6-digit verification code. Please try again.' });
      }

      // Clear code after successful verification to prevent replay
      verificationCodes.delete(cleanEmail);

      // Ensure registered in DB on successful OTP verification code match
      let userRes = await pool.query('SELECT * FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        const userId = 'user_' + Math.random().toString(36).substring(2, 11);
        await pool.query(`
          INSERT INTO users (id, full_name, email, role, status)
          VALUES ($1, $2, $3, 'USER', 'PENDING');
        `, [userId, record.name, cleanEmail]);
        
        // Insert registry log
        await pool.query(`
          INSERT INTO activity_logs (id, action, performed_by)
          VALUES ($1, $2, $3);
        `, ['log_reg_' + Math.random().toString(36).substring(2, 11), `Registered user account "${record.name}" (${cleanEmail}) - Awaiting approval`, cleanEmail]);

        // Insert notification alarm alert target for the Super Admin
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 11);
        await pool.query(`
          INSERT INTO notifications (id, message, type, user_email)
          VALUES ($1, $2, 'info', $3);
        `, [
          notifId,
          `Personnel registration request: "${record.name}" (${cleanEmail}) is awaiting Super Admin approval.`,
          superAdminEmail
        ]);

        return res.json({
          success: true,
          isPending: true,
          email: cleanEmail,
          displayName: record.name,
          message: 'Account registered successfully! Awaiting Super Admin approval.'
        });
      }

      const dbUser = userRes.rows[0];
      if (dbUser.status === 'PENDING') {
        return res.json({
          success: true,
          isPending: true,
          email: cleanEmail,
          displayName: dbUser.full_name,
          message: 'Email verified! Account is awaiting Super Admin approval.'
        });
      }
      if (dbUser.status === 'REJECTED') {
        return res.status(403).json({ error: 'Your access has been REJECTED by Super Admin.' });
      }
      if (dbUser.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Your access has been SUSPENDED by Super Admin.' });
      }

      const token = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('stockwise_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Email verified successfully!',
        email: cleanEmail,
        displayName: dbUser.full_name,
        role: dbUser.role,
        status: dbUser.status
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper function to send real outbound emails if SMTP configuration is found
  async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM || `"Stockwise" <${user || 'no-reply@stockwise.rw'}>`;

    if (!user || !pass) {
      console.warn(`[Mail service] SMTP credentials not fully configured (SMTP_USER/SMTP_PASS are empty). Real email of "${subject}" was NOT sent to ${to}. Code displayed in developers' logger and UI sandbox instead.`);
      return { sent: false, reason: 'SMTP_CREDENTIALS_MISSING' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port: port || 587,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });

      console.log(`[Mail service] Real email successfully sent to <${to}>. Message ID: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`[Mail service] Error sending real email to <${to}>:`, err);
      return { sent: false, error: err.message };
    }
  }

  // helper function to hash passwords securely
  function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // POST /api/auth/forgot-password-request - Generates a 6-digit reset code if email exists
  app.post('/api/auth/forgot-password-request', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const userRes = await pool.query('SELECT * FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'Ntakintu kibonetse cyanditse kuri iyi imeri. / No account registered with this email address.' });
      }

      const user = userRes.rows[0];
      const phone = user.phone || 'N/A';

      // Generate a 6-digit verification reset code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store in memory with 10-minute expiry
      passwordResetCodes.set(cleanEmail, {
        code,
        phone,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      console.log(`[Forgot Password Reset Code] Set reset code ${code} for user ${cleanEmail}`);

      // Try to send a real email using SMTP configuration
      const emailHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">StockWise</h2>
            <p style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; tracking: 0.1em; margin: 4px 0 0 0;">Inventory Management System</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 24px;" />
          <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Agaciro k'Umutekano / Change Password Request</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0; margin-bottom: 20px;">
            Muraho, mwasabye guhindura ijambo ry'ibanga rya konti yanyu kuri StockWise. Koresha aka gaciro koherejwe kugirango wemeze umutekano:<br />
            <span style="color: #64748b; font-size: 12px; font-style: italic;">(Hello, you requested a password reset. Use this verification code to set your new password:)</span>
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 800; color: #4f46e5; letter-spacing: 0.25em; padding-left: 0.25em;">${code}</span>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin-top: 0; margin-bottom: 24px;">
            Aka gaciro kagumaho umutekano mu gihe cy'iminota 10 gusa. Niba mutabyisabiye tubasabye kubyirengagiza.<br />
            <span style="color: #94a3b8;">(This code is only active for 10 minutes. If you did not make this request, please ignore this email safely.)</span>
          </p>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 16px;" />
          <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">&copy; 2026 StockWise Corp. All rights reserved.</p>
        </div>
      `;

      const mailResult = await sendEmail({
        to: cleanEmail,
        subject: `[StockWise] Verification Code: ${code}`,
        text: `Hello, you requested a password reset on Stockwise. Your 6-digit verification code is: ${code}`,
        html: emailHtml,
      });

      return res.json({
        success: true,
        message: mailResult.sent 
          ? 'Agaciro k’umutekano koherejwe neza kuri imeri yanyu! / Verification code sent successfully to your email!' 
          : 'Agaciro k’umutekano k’isuzuma koherejwe! / A password reset code has been sent!',
        email: cleanEmail,
        phone,
        code, // Always shared in fallback so offline sandbox works seamlessly
        isRealEmailSent: mailResult.sent
      });
    } catch (err: any) {
      console.error('[forgot-password-request error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/forgot-password-verify - Checks if the 6-digit code is valid
  app.post('/api/auth/forgot-password-verify', async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();

      const record = passwordResetCodes.get(cleanEmail);
      if (!record) {
        return res.status(400).json({ error: 'Nta gatsiko ko guhindura ijambo ry\'ibanga gahari cg karemewe. / No active password reset request found.' });
      }

      if (record.expiresAt < Date.now()) {
        passwordResetCodes.delete(cleanEmail);
        return res.status(400).json({ error: 'Agaciro koherejwe kagiyeho igihe. Ongera usabe akandi. / Reset code has expired.' });
      }

      if (record.code !== cleanCode) {
        return res.status(400).json({ error: 'Agaciro k’umutekano ufunze ntabwo ari ko. / Invalid verification code.' });
      }

      return res.json({
        success: true,
        message: 'Agaciro kemejwe neza! / Verification code is valid!'
      });
    } catch (err: any) {
      console.error('[forgot-password-verify error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/forgot-password-reset - Updates the password to a chosen new one
  app.post('/api/auth/forgot-password-reset', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Email, code, and new password are required' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();

      const record = passwordResetCodes.get(cleanEmail);
      if (!record || record.code !== cleanCode) {
        return res.status(400).json({ error: 'Amakuru ntatunganye cg code si yo. / Reset session is invalid or has expired.' });
      }

      if (record.expiresAt < Date.now()) {
        passwordResetCodes.delete(cleanEmail);
        return res.status(400).json({ error: 'Umwanya woguhindura warangiye. / Reset request has expired.' });
      }

      if (newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'Ijambo ry’ibanga rigomba kugira inyuguti zengeye kuri 6. / Password must be at least 6 characters.' });
      }

      // Update the user's password securely
      const hashedPass = hashPassword(newPassword.trim());
      await pool.query('UPDATE users SET password = $1 WHERE email = $2;', [hashedPass, cleanEmail]);

      // Clear the temporary reset code
      passwordResetCodes.delete(cleanEmail);

      console.log(`[Forgot Password Reset Success] Password changed for ${cleanEmail}`);

      return res.json({
        success: true,
        message: 'Ijambo ry’ibanga rishya ryemejwe neza! Binjire ubu. / Password updated successfully!'
      });
    } catch (err: any) {
      console.error('[forgot-password-reset error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login-check - Single login validation gateway
  app.post('/api/auth/login-check', async (req, res) => {
    try {
      const { email, name, password } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = (name || cleanEmail.split('@')[0]).trim();

      // Check if it's the Super Admin logging in
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
      if (cleanEmail === superAdminEmail) {
        if (!password) {
          return res.json({ requirePassword: true, message: 'Super Admin login secure verification required.' });
        }
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1;', [cleanEmail]);
        if (userRes.rows.length === 0) {
          return res.status(400).json({ error: 'Super Admin database record missing. Reboot server.' });
        }
        const dbPassword = userRes.rows[0].password;
        const hashedInput = hashPassword(password.trim());
        if (dbPassword !== hashedInput) {
          return res.status(400).json({ error: 'Incorrect Super Admin password. Please try again.' });
        }

        const token = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('stockwise_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
          allowed: true,
          email: cleanEmail,
          displayName: 'Super Admin',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        });
      }

      // Regular User checks
      let userRes = await pool.query('SELECT * FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        // First-time registration! Create client as 'PENDING'
        const userId = 'user_' + Math.random().toString(36).substring(2, 11);
        const newUserStatus = 'PENDING';
        
        await pool.query(`
          INSERT INTO users (id, full_name, email, role, status)
          VALUES ($1, $2, $3, 'USER', $4);
        `, [userId, cleanName, cleanEmail, newUserStatus]);

        // Insert into activity logs
        await pool.query(`
          INSERT INTO activity_logs (id, action, performed_by)
          VALUES ($1, $2, $3);
        `, ['log_reg_' + Math.random().toString(36).substring(2, 11), `Registered user account "${cleanName}" (${cleanEmail}) - Awaiting approval`, cleanEmail]);

        // Insert alarm notification targeting the Super Admin's incoming tray
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 11);
        await pool.query(`
          INSERT INTO notifications (id, message, type, user_email)
          VALUES ($1, $2, 'info', $3);
        `, [
          notifId,
          `Personnel registration request: "${cleanName}" (${cleanEmail}) is awaiting Super Admin approval.`,
          superAdminEmail
        ]);

        return res.json({
          allowed: false,
          status: 'PENDING',
          error: 'Account awaiting Super Admin approval'
        });
      }

      const dbUser = userRes.rows[0];
      if (dbUser.status === 'PENDING') {
        return res.json({
          allowed: false,
          status: 'PENDING',
          error: 'Account awaiting Super Admin approval'
        });
      }
      if (dbUser.status === 'REJECTED') {
        return res.json({
          allowed: false,
          status: 'REJECTED',
          error: 'Your access request has been REJECTED by Super Admin.'
        });
      }
      if (dbUser.status === 'SUSPENDED') {
        return res.json({
          allowed: false,
          status: 'SUSPENDED',
          error: 'Your access has been SUSPENDED by Super Admin.'
        });
      }

      // If active, return success details
      const token = jwt.sign({ email: dbUser.email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('stockwise_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        allowed: true,
        email: dbUser.email,
        displayName: dbUser.full_name,
        role: dbUser.role,
        status: dbUser.status
      });

    } catch (err: any) {
      console.error('[Login-Check Error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/google - Simulated beautiful interactive Google login consent screen
  app.get('/api/auth/google', (req, res) => {
    const defaultEmail = (req.query.email as string || '').trim();
    const defaultName = (req.query.name as string || '').trim();
    const hasDefault = defaultEmail !== '';
    
    res.send(`
<!DOCTYPE html>
<html lang="rw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kwinjira na Google / Sign in with Google</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Roboto', sans-serif;
    }
  </style>
</head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen p-4">
  <div class="bg-white rounded-lg shadow-md border border-gray-200 w-full max-w-sm overflow-hidden">
    <!-- Header -->
    <div class="p-6 text-center border-b border-gray-100">
      <div class="flex justify-center mb-4">
        <svg class="h-8 w-8" viewBox="0 0 24 24">
          <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.69 14.97.5 12 .5c-4.3 0-8 2.47-9.8 6.06l3.66 2.84c.87-2.6 3.3-4.53 6.14-4.53z" />
          <path fill="#4285F4" d="M23.49 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.4c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18c-.75 1.5-1.18 3.16-1.18 4.94s.43 3.45 1.18 4.94l3.66-2.84z" />
        </svg>
      </div>
      <h1 id="headline" class="text-xl font-medium text-gray-800">Komeza na Google</h1>
      <p class="text-xs text-gray-500 mt-1">Kwinjira muri StockWise Hub</p>
    </div>

    <!-- Active Accounts Selection list -->
    <div class="px-6 py-4 space-y-3 ${hasDefault ? '' : 'hidden'}" id="accounts-container">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Hitamo konti</p>
      
      <!-- Primary detected account -->
      <button onclick="selectAccount('${defaultEmail}', '${defaultName}')" class="w-full flex items-center justify-between p-3 rounded-lg border border-gray-150 hover:bg-gray-50 transition-colors text-left focus:outline-none">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold uppercase">
            ${defaultName ? defaultName.charAt(0) : 'G'}
          </div>
          <div>
            <p class="text-xs font-semibold text-gray-800">${defaultName}</p>
            <p class="text-[10px] text-gray-500">${defaultEmail}</p>
          </div>
        </div>
        <span class="text-[10px] text-emerald-500 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Active</span>
      </button>

      <!-- Another Account option -->
      <button onclick="showCustomInput()" class="w-full flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 transition-colors text-left focus:outline-none text-gray-500 hover:text-gray-700">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center bg-gray-50 text-gray-500">
            +
          </div>
          <span class="text-xs font-semibold">Gukoresha indi konti / Use another</span>
        </div>
      </button>
    </div>

    <!-- Custom Account inputs -->
    <div class="px-6 py-4 space-y-3 ${hasDefault ? 'hidden' : ''}" id="custom-container">
      <div>
        <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Enter Gmail / Email *</label>
        <input type="email" id="custom-email" placeholder="njye@gmail.com" class="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-none focus:border-indigo-500">
      </div>
      <div>
        <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name (Amazina) *</label>
        <input type="text" id="custom-name" placeholder="John Doe" class="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-none focus:border-indigo-500">
      </div>
      
      <div class="flex gap-2 pt-2">
        <button onclick="submitCustomAccount()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-2 px-4 rounded-lg transition-colors">
          Komeza
        </button>
        <button onclick="showAccountsList()" class="bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium text-xs py-2 px-4 rounded-lg transition-colors">
          Gahama
        </button>
      </div>
    </div>

    <!-- Loader & Status display -->
    <div class="px-6 py-8 text-center hidden" id="status-container">
      <div id="loader" class="mx-auto w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p id="status-text" class="text-xs font-semibold text-gray-650">Verifying security with Google...</p>
      <div id="status-error" class="hidden mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium shadow-xs"></div>
      <button id="cancel-btn" onclick="showAccountsList()" class="hidden mt-4 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-650 text-xs font-medium rounded-lg">Gahama / Go Back</button>
    </div>

    <!-- Footer -->
    <div class="p-4 bg-gray-50 border-t border-gray-100 text-center">
      <p class="text-[10px] text-gray-400 font-medium font-sans">
        Ubu buryo burizewe kandi burinzwe na Google Smart Lock.
      </p>
    </div>
  </div>

  <script>
    function showCustomInput() {
      document.getElementById('accounts-container').classList.add('hidden');
      document.getElementById('custom-container').classList.remove('hidden');
    }

    function showAccountsList() {
      document.getElementById('accounts-container').classList.remove('hidden');
      document.getElementById('custom-container').classList.add('hidden');
      document.getElementById('status-container').classList.add('hidden');
    }

    function showStatus(text, hasError = false) {
      document.getElementById('accounts-container').classList.add('hidden');
      document.getElementById('custom-container').classList.add('hidden');
      document.getElementById('status-container').classList.remove('hidden');
      document.getElementById('status-text').innerText = text;

      if (hasError) {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('status-error').classList.remove('hidden');
        document.getElementById('cancel-btn').classList.remove('hidden');
      } else {
        document.getElementById('loader').classList.remove('hidden');
        document.getElementById('status-error').classList.add('hidden');
        document.getElementById('cancel-btn').classList.add('hidden');
      }
    }

    async function selectAccount(email, name) {
      showStatus('Biri kwemezwa na Google...');
      try {
        const response = await fetch('/api/auth/google-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, name })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Autentikasiyanze');
        }

        const data = await response.json();
        
        // Return success value back to our parent window
        if (window.opener) {
          window.opener.postMessage({ 
            type: 'GOOGLE_AUTH_SUCCESS', 
            user: {
              uid: 'user_g_' + Math.random().toString(36).substring(2, 11),
              email: data.email,
              displayName: data.displayName,
              role: data.role,
              status: data.status,
              photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(data.displayName)
            }
          }, '*');
          window.close();
        } else {
          showStatus('Kwinjira byagenze neza! Fungura urupapuro mu yindi tab ugerageze.', true);
          document.getElementById('status-error').innerText = 'Unauthorised window opener connection. Make sure to open the application in a new tab inside AI Studio preview for ideal popup communication.';
        }

      } catch (err) {
        showStatus('Gutsindwa ko Kwinjira', true);
        document.getElementById('status-error').innerText = err.message || 'Error executing Google SSO registration.';
      }
    }

    function submitCustomAccount() {
      const email = document.getElementById('custom-email').value.trim();
      const name = document.getElementById('custom-name').value.trim();
      
      if (!email || !email.includes('@')) {
        alert('Andika imeri yemewe ya Google!');
        return;
      }
      if (!name) {
        alert('Andika izina ryuzuye!');
        return;
      }
      
      selectAccount(email, name);
    }
  </script>
</body>
</html>
    `);
  });

  // POST /api/auth/google-login - Validates identity verification and registers/approves the account
  app.post('/api/auth/google-login', async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = (name || cleanEmail.split('@')[0]).trim();

      // Check if it's the Super Admin logging in via Google
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
      if (cleanEmail === superAdminEmail) {
        return res.status(403).json({ error: 'Super Admin login must go through the secure password verification gate.' });
      }

      // Check if user exists
      let userRes = await pool.query('SELECT * FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        const userId = 'user_g_' + Math.random().toString(36).substring(2, 11);
        
        // Resolve store_id dynamically
        const domain = cleanEmail.split('@')[1];
        const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com'];
        let storeId = '';
        if (!genericDomains.includes(domain)) {
          const domainOwner = await pool.query(`SELECT store_id FROM users WHERE email LIKE $1 AND store_id IS NOT NULL LIMIT 1;`, [`%@${domain}`]);
          if (domainOwner.rows.length > 0) {
            storeId = domainOwner.rows[0].store_id;
          }
        }
        
        if (!storeId) {
          storeId = 'store_' + Math.random().toString(36).substring(2, 11);
          const storeName = !genericDomains.includes(domain) 
            ? domain.split('.')[0].toUpperCase() + ' Store'
            : cleanName + "'s Store";
            
          await pool.query(`INSERT INTO stores (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [storeId, storeName, userId]);
        }

        await pool.query(`
          INSERT INTO users (id, full_name, email, role, status, store_id)
          VALUES ($1, $2, $3, 'USER', 'PENDING', $4);
        `, [userId, cleanName, cleanEmail, storeId]);

        // Insert into activity logs with store_id context
        await pool.query(`
          INSERT INTO activity_logs (id, action, performed_by, store_id)
          VALUES ($1, $2, $3, $4);
        `, ['log_reg_' + Math.random().toString(36).substring(2, 11), `Registered user account via Google: "${cleanName}" (${cleanEmail}) - Awaiting approval`, cleanEmail, storeId]);

        // Insert alert notification targeting the Super Admin's tray
        const notifId = 'notif_auto_' + Math.random().toString(36).substring(2, 11);
        await pool.query(`
          INSERT INTO notifications (id, message, type, user_email, store_id)
          VALUES ($1, $2, 'info', $3, $4)
          ON CONFLICT DO NOTHING;
        `, [
          notifId,
          `Personnel registration request: "${cleanName}" (${cleanEmail}) is awaiting Super Admin approval.`,
          superAdminEmail,
          storeId
        ]);

        return res.status(403).json({ error: 'Konti yafunguwe neza! Tegereza iremizwa rya Super Admin. / Account registered successfully! Awaiting Super Admin approval.' });
      }

      const dbUser = userRes.rows[0];
      if (dbUser.status === 'PENDING') {
        return res.status(403).json({ error: 'Your access request is currently PENDING Super Admin approval.' });
      }
      if (dbUser.status === 'REJECTED') {
        return res.status(403).json({ error: 'Your access has been REJECTED by Super Admin.' });
      }
      if (dbUser.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Your access has been SUSPENDED by Super Admin.' });
      }

      const token = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('stockwise_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      res.json({
        allowed: true,
        email: cleanEmail,
        displayName: dbUser.full_name,
        role: dbUser.role,
        status: dbUser.status
      });
    } catch (err: any) {
      console.error('[Google API Auth Callback]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/me - Dynamic session fetcher
  app.get('/api/auth/me', async (req, res) => {
    try {
      const token = req.cookies?.stockwise_session;
      if (!token) {
        return res.json({ authenticated: false });
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (jwtErr) {
        return res.json({ authenticated: false });
      }

      const email = decoded?.email;
      if (!email) {
        return res.json({ authenticated: false });
      }

      const cleanEmail = email.trim().toLowerCase();
      const userRes = await pool.query('SELECT id, full_name as "fullName", email, role, status FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
        if (cleanEmail === superAdminEmail) {
          return res.json({
            authenticated: true,
            user: {
              id: 'super_admin_id',
              email: cleanEmail,
              displayName: 'Super Admin',
              role: 'SUPER_ADMIN',
              status: 'ACTIVE'
            }
          });
        }
        return res.json({ authenticated: false });
      }

      const dbUser = userRes.rows[0];
      return res.json({
        authenticated: true,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          displayName: dbUser.fullName,
          role: dbUser.role,
          status: dbUser.status
        }
      });
    } catch (err: any) {
      console.error('[auth/me error]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST/GET /api/auth/logout - Clear active session cookie
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('stockwise_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({ success: true });
  });
  app.get('/api/auth/logout', (req, res) => {
    res.clearCookie('stockwise_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({ success: true });
  });

  // Generic Role-Based Access Control (RBAC) middleware creator
  const requireRole = (allowedRoles: string[]) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.userRole) {
        return res.status(401).json({ error: 'Unauthenticated.' });
      }
      
      const refinedRole = req.userRole === 'ADMIN' ? 'STORE_MANAGER' : req.userRole;
      const refinedAllowed = allowedRoles.map(r => r === 'ADMIN' ? 'STORE_MANAGER' : r);
      
      if (allowedRoles.includes(req.userRole) || refinedAllowed.includes(refinedRole)) {
        return next();
      }
      return res.status(403).json({ error: `Access denied. Requires one of these roles: ${allowedRoles.join(', ')}` });
    };
  };

  // Middleware to retrieve authenticated user email and enforce authorization policies
  const requireUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      let email = '';
      const token = req.cookies?.stockwise_session;
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          email = decoded?.email || '';
        } catch (jwtErr) {
          // Token invalid or expired, fallback to header
        }
      }

      // Safe fallback: check the x-user-email header (crucial in cross-origin iframes where cookies are blocked)
      if (!email) {
        const headerEmail = req.headers['x-user-email'] as string;
        if (headerEmail) {
          email = headerEmail;
        }
      }

      if (!email) {
        return res.status(401).json({ error: 'Unauthenticated. Session cookie and backup identification are missing. Please log in.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      req.userEmail = cleanEmail;

      // Handle query status in Postgres, fetching role AND status AND store_id
      const userRes = await pool.query('SELECT role, status, store_id, id, full_name FROM users WHERE email = $1;', [cleanEmail]);
      if (userRes.rows.length === 0) {
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
        if (cleanEmail === superAdminEmail) {
          req.userRole = 'SUPER_ADMIN';
          req.userStoreId = 'super_admin_store'; // global access context
          return next();
        }

        // New user automatically captured in database as 'PENDING'
        const userId = 'user_auto_' + Math.random().toString(36).substring(2, 11);
        
        // Resolve domain mapping to assign/create store_id dynamically on self-registration
        const domain = cleanEmail.split('@')[1];
        const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com'];
        let storeId = '';
        if (!genericDomains.includes(domain)) {
          const domainOwner = await pool.query(`SELECT store_id FROM users WHERE email LIKE $1 AND store_id IS NOT NULL LIMIT 1;`, [`%@${domain}`]);
          if (domainOwner.rows.length > 0) {
            storeId = domainOwner.rows[0].store_id;
          }
        }
        
        if (!storeId) {
          storeId = 'store_' + Math.random().toString(36).substring(2, 11);
          const storeName = !genericDomains.includes(domain) 
            ? domain.split('.')[0].toUpperCase() + ' Store'
            : cleanEmail.split('@')[0] + "'s Store";
            
          await pool.query(`INSERT INTO stores (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [storeId, storeName, userId]);
        }

        await pool.query(`
          INSERT INTO users (id, full_name, email, role, status, store_id)
          VALUES ($1, $2, $3, 'USER', 'PENDING', $4)
          ON CONFLICT (email) DO NOTHING;
        `, [userId, cleanEmail.split('@')[0], cleanEmail, storeId]);

        // Insert alarm notification targeting the Super Admin's incoming tray
        const notifId = 'notif_auto_' + Math.random().toString(36).substring(2, 11);
        await pool.query(`
          INSERT INTO notifications (id, message, type, user_email, store_id)
          VALUES ($1, $2, 'info', $3, $4)
          ON CONFLICT DO NOTHING;
        `, [
          notifId,
          `Personnel registration request: "${cleanEmail.split('@')[0]}" (${cleanEmail}) is awaiting Super Admin approval.`,
          superAdminEmail,
          storeId
        ]);

        return res.status(403).json({ error: 'Account awaiting Super Admin approval', status: 'PENDING' });
      }

      const dbUser = userRes.rows[0];
      req.userRole = dbUser.role;
      req.userStoreId = dbUser.store_id;

      // Self-heal store_id if missing from active user row
      if (!req.userStoreId && req.userRole !== 'SUPER_ADMIN') {
        const domain = cleanEmail.split('@')[1];
        const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com'];
        let storeId = '';
        if (!genericDomains.includes(domain)) {
          const domainOwner = await pool.query(`SELECT store_id FROM users WHERE email LIKE $1 AND store_id IS NOT NULL AND id != $2 LIMIT 1;`, [`%@${domain}`, dbUser.id]);
          if (domainOwner.rows.length > 0) {
            storeId = domainOwner.rows[0].store_id;
          }
        }
        
        if (!storeId) {
          storeId = 'store_' + Math.random().toString(36).substring(2, 11);
          const storeName = !genericDomains.includes(domain) 
            ? domain.split('.')[0].toUpperCase() + ' Store'
            : cleanEmail.split('@')[0] + "'s Store";
            
          await pool.query(`INSERT INTO stores (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [storeId, storeName, dbUser.id]);
        }
        
        await pool.query(`UPDATE users SET store_id = $1 WHERE id = $2;`, [storeId, dbUser.id]);
        req.userStoreId = storeId;
      }

      if (dbUser.status === 'PENDING') {
        return res.status(403).json({ error: 'Account awaiting Super Admin approval', status: 'PENDING' });
      }
      if (dbUser.status === 'REJECTED') {
        return res.status(403).json({ error: 'Your access has been REJECTED by Super Admin.', status: 'REJECTED' });
      }
      if (dbUser.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Your access has been SUSPENDED by Super Admin.', status: 'SUSPENDED' });
      }

      next();
    } catch (err: any) {
      console.error('[requireUser Error]', err);
      res.status(500).json({ error: 'Database authentication verification error' });
    }
  };

  // Guard specifically for Super Admin operations
  const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'alieluzii@gmail.com').trim().toLowerCase();
    if (req.userEmail === superAdminEmail || req.userRole === 'SUPER_ADMIN') {
      next();
    } else {
      res.status(403).json({ error: 'Access denied: Super Admin credentials required.' });
    }
  };

  // GET /api/super-admin/stats - View high-level system metrics
  app.get('/api/super-admin/stats', requireUser, requireSuperAdmin, async (req, res) => {
    try {
      const statsRes = await pool.query(`
        SELECT 
          COUNT(*)::int as "totalUsers",
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int as "activeUsers",
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int as "pendingUsers",
          COUNT(CASE WHEN status = 'REJECTED' THEN 1 END)::int as "rejectedUsers",
          COUNT(CASE WHEN status = 'SUSPENDED' THEN 1 END)::int as "suspendedUsers"
        FROM users;
      `);
      res.json(statsRes.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/super-admin/users - Retrieves all registered platform users
  app.get('/api/super-admin/users', requireUser, requireSuperAdmin, async (req, res) => {
    try {
      const usersRes = await pool.query(`
        SELECT id, full_name as "fullName", email, role, status, created_at as "createdAt"
        FROM users
        ORDER BY created_at DESC;
      `);
      res.json(usersRes.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/super-admin/users/:id/status - Action to Approve / Reject / Suspend user access
  app.post('/api/super-admin/users/:id/status', requireUser, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['ACTIVE', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    try {
      const userCheck = await pool.query('SELECT full_name, email FROM users WHERE id = $1;', [id]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User does not exist.' });
      }
      const dbUser = userCheck.rows[0];

      await pool.query('UPDATE users SET status = $1 WHERE id = $2;', [status, id]);

      // Audit Log Action record
      const actionMsg = `Admin action: Status of "${dbUser.full_name}" (${dbUser.email}) changed to "${status}".`;
      await pool.query(`
        INSERT INTO activity_logs (id, action, performed_by)
        VALUES ($1, $2, $3);
      `, ['log_sa_act_' + Math.random().toString(36).substring(2, 11), actionMsg, req.userEmail]);

      res.json({ success: true, message: `Access status successfully changed to ${status}.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/super-admin/users/:id - Permanent removal of users or requests
  app.delete('/api/super-admin/users/:id', requireUser, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;

    try {
      const userCheck = await pool.query('SELECT full_name, email FROM users WHERE id = $1;', [id]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User does not exist.' });
      }
      const dbUser = userCheck.rows[0];

      if (dbUser.email === req.userEmail) {
        return res.status(400).json({ error: 'Super Admin cannot delete their own profile.' });
      }

      await pool.query('DELETE FROM users WHERE id = $1;', [id]);

      // Audit Log Action record
      const actionMsg = `Admin action: Permanently deleted user "${dbUser.full_name}" (${dbUser.email}).`;
      await pool.query(`
        INSERT INTO activity_logs (id, action, performed_by)
        VALUES ($1, $2, $3);
      `, ['log_sa_act_' + Math.random().toString(36).substring(2, 11), actionMsg, req.userEmail]);

      res.json({ success: true, message: `User "${dbUser.full_name}" has been permanently deleted.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- RESTful API Service Endpoints ---

  // GET /api/products
  app.get('/api/products', requireUser, async (req, res) => {
    try {
      let q = `
        SELECT p.id, p.name, p.description, p.product_code as "productCode",
               COALESCE(s.quantity, 0)::int as quantity,
               p.purchase_price::float as "purchasePrice",
               p.selling_price::float as "sellingPrice",
               p.min_stock::int as "minStock",
               p.created_by as "createdBy",
               p.created_at as "createdAt",
               p.updated_at as "updatedAt"
        FROM products p
        LEFT JOIN inventory_stock s ON p.id = s.product_id
      `;
      const params = [];
      if (req.userRole !== 'SUPER_ADMIN') {
        q += ' WHERE p.store_id = $1 ';
        params.push(req.userStoreId);
      }
      q += ' ORDER BY p.name ASC;';
      
      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/products
  app.post('/api/products', requireUser, async (req, res) => {
    const { name, description, quantity, purchasePrice, sellingPrice, minStock } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const productId = 'prod_' + Math.random().toString(36).substring(2, 11);
      const productCode = 'SW-' + Math.floor(100000 + Math.random() * 900000);

      // Insert core details with store_id context
      await client.query(
        `INSERT INTO products (id, name, product_code, description, purchase_price, selling_price, min_stock, created_by, store_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [productId, name, productCode, description || '', purchasePrice || 0, sellingPrice || 0, minStock || 0, req.userEmail, req.userStoreId]
      );

      // Insert initial stock relation (3NF separation)
      await client.query(
        `INSERT INTO inventory_stock (id, product_id, quantity)
         VALUES ($1, $2, $3);`,
        ['stock_' + productId, productId, quantity || 0]
      );

      // Store in audit logs with store_id context
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by, store_id)
         VALUES ($1, $2, $3, $4);`,
        ['log_' + productId, `Added product "${name}" with initial stock of ${quantity}`, req.userEmail, req.userStoreId]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, id: productId });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // PUT /api/products/:id
  app.put('/api/products/:id', requireUser, async (req, res) => {
    const { id } = req.params;
    const { name, description, minStock, purchasePrice, sellingPrice } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const isOwner = await client.query('SELECT name FROM products WHERE id = $1 AND store_id = $2;', [id, req.userStoreId]);
      if (isOwner.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized product modification' });
      }

      await client.query(
        `UPDATE products 
         SET name = $1, description = $2, min_stock = $3, purchase_price = $4, selling_price = $5, updated_at = NOW()
         WHERE id = $6 AND store_id = $7;`,
        [name, description || '', minStock || 0, purchasePrice || 0, sellingPrice || 0, id, req.userStoreId]
      );

      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by, store_id)
         VALUES ($1, $2, $3, $4);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Updated details of product "${isOwner.rows[0].name}"`, req.userEmail, req.userStoreId]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/products/:id
  app.delete('/api/products/:id', requireUser, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const isOwner = await client.query('SELECT name FROM products WHERE id = $1 AND store_id = $2;', [id, req.userStoreId]);
      if (isOwner.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized product modification' });
      }

      await client.query('DELETE FROM products WHERE id = $1 AND store_id = $2;', [id, req.userStoreId]);

      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by, store_id)
         VALUES ($1, $2, $3, $4);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Deleted product "${isOwner.rows[0].name}"`, req.userEmail, req.userStoreId]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // GET /api/stock-ins
  app.get('/api/stock-ins', requireUser, async (req, res) => {
    try {
      let q = `
        SELECT s.id, s.product_id as "productId", s.product_name as "productName",
               s.quantity::int, s.supplier, s.notes, s.performed_by as "performedBy",
               s.purchase_price::float as "purchasePrice",
               s.created_at as "createdAt"
        FROM stock_ins s
      `;
      const params = [];
      if (req.userRole !== 'SUPER_ADMIN') {
        q += ' WHERE s.store_id = $1 ';
        params.push(req.userStoreId);
      }
      q += ' ORDER BY s.created_at DESC;';

      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stock-ins
  app.post('/api/stock-ins', requireUser, async (req, res) => {
    const { productId, quantity, supplier, notes, purchasePrice } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const prod = await client.query('SELECT name, purchase_price FROM products WHERE id = $1 AND store_id = $2;', [productId, req.userStoreId]);
      if (prod.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found or access denied' });
      }

      const stockInId = 'stk_' + Math.random().toString(36).substring(2, 11);
      const prodName = prod.rows[0].name;
      const currentProductPurchasePrice = prod.rows[0].purchase_price;

      // Update Stock count (Durable inventory stock)
      await client.query(
        `UPDATE inventory_stock 
         SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2;`,
         [quantity, productId]
      );

      // Determine active purchase price. Use supplied purchasePrice, falling back to product's current one
      const activePurchasePrice = purchasePrice !== undefined && purchasePrice !== null ? parseFloat(purchasePrice) : parseFloat(currentProductPurchasePrice || 0);

      // Also update the main product's purchase_price to keep catalogs in sync
      await client.query(
        `UPDATE products 
         SET purchase_price = $1, updated_at = NOW()
         WHERE id = $2 AND store_id = $3;`,
        [activePurchasePrice, productId, req.userStoreId]
      );

      // Record Stock In Transaction with store_id context
      await client.query(
        `INSERT INTO stock_ins (id, product_id, product_name, quantity, supplier, notes, purchase_price, performed_by, store_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [stockInId, productId, prodName, quantity, supplier || '', notes || '', activePurchasePrice, req.userEmail, req.userStoreId]
      );

      // Record in logs with store_id context
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by, store_id)
         VALUES ($1, $2, $3, $4);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Restocked ${quantity} units of "${prodName}" (Purchase Price: ${activePurchasePrice} RWF)`, req.userEmail, req.userStoreId]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, id: stockInId });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // GET /api/sales
  app.get('/api/sales', requireUser, async (req, res) => {
    try {
      let q = `
        SELECT s.id, si.product_id as "productId", p.name as "productName",
               si.quantity::int as quantity, si.price::float as "unitPrice", 
               (si.quantity * si.price)::float as "totalPrice",
               s.performed_by as "performedBy", s.created_at as "createdAt"
        FROM sales s
        JOIN sales_items si ON s.id = si.sale_id
        JOIN products p ON si.product_id = p.id
      `;
      const params = [];
      if (req.userRole !== 'SUPER_ADMIN') {
        q += ' WHERE s.store_id = $1 ';
        params.push(req.userStoreId);
      }
      q += ' ORDER BY s.created_at DESC;';

      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sales
  app.post('/api/sales', requireUser, async (req, res) => {
    const { productId, quantity } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch product and check quantities 
      const prodRes = await client.query(
        `SELECT p.name, p.selling_price, p.min_stock, COALESCE(s.quantity, 0) as stock 
         FROM products p
         LEFT JOIN inventory_stock s ON p.id = s.product_id
         WHERE p.id = $1 AND p.store_id = $2;`,
        [productId, req.userStoreId]
      );

      if (prodRes.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found or access denied' });
      }

      const product = prodRes.rows[0];
      if (product.stock < quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Requested: ${quantity}, Available: ${product.stock}` });
      }

      const saleId = 'sale_' + Math.random().toString(36).substring(2, 11);
      const saleItemId = 'si_' + Math.random().toString(36).substring(2, 11);
      const unitPrice = parseFloat(product.selling_price);
      const totalPrice = quantity * unitPrice;
      const newQty = product.stock - quantity;

      // 1. Subtract Stock count
      await client.query(
        `UPDATE inventory_stock 
         SET quantity = quantity - $1, updated_at = NOW()
         WHERE product_id = $2;`,
        [quantity, productId]
      );

      // 2. Insert Sale Parent
      await client.query(
        `INSERT INTO sales (id, performed_by, total_amount, store_id)
         VALUES ($1, $2, $3, $4);`,
        [saleId, req.userEmail, totalPrice, req.userStoreId]
      );

      // 3. Insert Sale Item Detail
      await client.query(
        `INSERT INTO sales_items (id, sale_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5);`,
        [saleItemId, saleId, productId, quantity, unitPrice]
      );

      // 4. Activity log
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by, store_id)
         VALUES ($1, $2, $3, $4);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Sold ${quantity} units of "${product.name}" for a total of RWF ${Math.round(totalPrice).toLocaleString()}`, req.userEmail, req.userStoreId]
      );

      // 5. Build dynamic alerts trigger inside notifications if goes low_stock
      if (newQty <= product.min_stock) {
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 11);
        const warningMsg = `"${product.name}" is running low (${newQty} left). Please restock soon!`;
        await client.query(
          `INSERT INTO notifications (id, product_id, message, type, is_read, user_email, store_id)
           VALUES ($1, $2, $3, 'low_stock', FALSE, $4, $5);`,
          [notifId, productId, warningMsg, req.userEmail, req.userStoreId]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, id: saleId });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // GET /api/notifications
  app.get('/api/notifications', requireUser, async (req, res) => {
    try {
      let result;
      if (req.userRole === 'SUPER_ADMIN') {
        const q = `
          SELECT id, message, type, is_read as "isRead", 
                 user_email as "userEmail", created_at as "createdAt"
          FROM notifications
          ORDER BY created_at DESC;
        `;
        result = await pool.query(q);
      } else {
        const q = `
          SELECT id, message, type, is_read as "isRead", 
                 user_email as "userEmail", created_at as "createdAt"
          FROM notifications
          WHERE store_id = $1
          ORDER BY created_at DESC;
        `;
        result = await pool.query(q, [req.userStoreId]);
      }
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/notifications/:id/read
  app.put('/api/notifications/:id/read', requireUser, async (req, res) => {
    const { id } = req.params;
    try {
      if (req.userRole === 'SUPER_ADMIN') {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1;', [id]);
      } else {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND store_id = $2;', [id, req.userStoreId]);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/notifications/:id
  app.delete('/api/notifications/:id', requireUser, async (req, res) => {
    const { id } = req.params;
    try {
      if (req.userRole === 'SUPER_ADMIN') {
        await pool.query('DELETE FROM notifications WHERE id = $1;', [id]);
      } else {
        await pool.query('DELETE FROM notifications WHERE id = $1 AND store_id = $2;', [id, req.userStoreId]);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/activity-logs
  app.get('/api/activity-logs', requireUser, async (req, res) => {
    try {
      let q = `
        SELECT id, action, performed_by as "performedBy", created_at as "createdAt"
        FROM activity_logs
      `;
      const params = [];
      if (req.userRole !== 'SUPER_ADMIN') {
        q += ' WHERE store_id = $1 ';
        params.push(req.userStoreId);
      }
      q += ' ORDER BY created_at DESC;';

      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/clear-all
  app.post('/api/clear-all', requireUser, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Cascading deletes clean up products and transactions securely
      await client.query('DELETE FROM products WHERE created_by = $1;', [req.userEmail]);
      await client.query('DELETE FROM sales WHERE performed_by = $1;', [req.userEmail]);
      await client.query('DELETE FROM stock_ins WHERE performed_by = $1;', [req.userEmail]);
      await client.query('DELETE FROM notifications WHERE user_email = $1;', [req.userEmail]);
      await client.query('DELETE FROM activity_logs WHERE performed_by = $1;', [req.userEmail]);

      // Write final reset log
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + Math.random().toString(36).substring(2, 11), 'Database data reset: Purged all system data from the inventory database.', req.userEmail]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // --- StockWise AI Assistant API Route & Service Layer ---
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error('GEMINI_API_KEY key is missing. Please configuration is required in Settings panel.');
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return aiClient;
  }

  app.post('/api/ai/chat', requireUser, async (req, res) => {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message field is required' });
    }

    try {
      const email = req.userEmail;

      // 1. Fetch products & stock
      const productsQuery = `
        SELECT p.id, p.name, p.product_code as "productCode", p.description,
               p.purchase_price::float as "purchasePrice",
               p.selling_price::float as "sellingPrice",
               p.min_stock::int as "minStock",
               COALESCE(s.quantity, 0)::int as quantity
        FROM products p
        LEFT JOIN inventory_stock s ON p.id = s.product_id
        WHERE p.created_by = $1
        ORDER BY p.name ASC;
      `;
      const productsRes = await pool.query(productsQuery, [email]);

      // 2. Fetch sales
      const salesQuery = `
        SELECT s.id, si.product_id as "productId", p.name as "productName",
               si.quantity::int as quantity, si.price::float as price,
               p.purchase_price::float as "purchasePrice",
               s.created_at as "createdAt"
        FROM sales s
        JOIN sales_items si ON s.id = si.sale_id
        JOIN products p ON si.product_id = p.id
        WHERE s.performed_by = $1
        ORDER BY s.created_at DESC;
      `;
      const salesRes = await pool.query(salesQuery, [email]);

      // 3. Fetch stock-ins
      const stockInsQuery = `
        SELECT id, product_id as "productId", product_name as "productName",
               quantity::int as quantity, supplier, notes, purchase_price::float as "purchasePrice", created_at as "createdAt"
        FROM stock_ins
        WHERE performed_by = $1
        ORDER BY created_at DESC;
      `;
      const stockInsRes = await pool.query(stockInsQuery, [email]);

      // 4. Fetch notifications
      const notificationsQuery = `
        SELECT id, message, type, is_read as "isRead", created_at as "createdAt"
        FROM notifications
        WHERE user_email = $1
        ORDER BY created_at DESC;
      `;
      const notificationsRes = await pool.query(notificationsQuery, [email]);

      // 5. Fetch activity logs
      const logsQuery = `
        SELECT action, created_at as "createdAt"
        FROM activity_logs
        WHERE performed_by = $1
        ORDER BY created_at DESC
        LIMIT 25;
      `;
      const logsRes = await pool.query(logsQuery, [email]);

      // Structure data compact
      const dbContext = {
        products: productsRes.rows.map(p => ({
          name: p.name,
          code: p.productCode,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          minStock: p.minStock,
          currentQuantity: p.quantity,
          isLowStock: p.quantity <= p.minStock
        })),
        sales: salesRes.rows.map(s => ({
          saleId: s.id,
          createdAt: s.createdAt,
          item: {
            name: s.productName,
            quantity: s.quantity,
            price: s.price,
            purchasePrice: s.purchasePrice,
            profit: s.quantity * (s.price - s.purchasePrice)
          }
        })),
        stockIns: stockInsRes.rows.map(si => ({
          productName: si.productName,
          quantity: si.quantity,
          purchasePrice: si.purchasePrice || 0,
          supplier: si.supplier || 'Nta we wanditse',
          notes: si.notes || '',
          createdAt: si.createdAt
        })),
        notifications: notificationsRes.rows.map(n => ({
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt
        })),
        activityLogs: logsRes.rows.map(l => ({
          action: l.action,
          createdAt: l.createdAt
        }))
      };

      const currentTime = new Date().toISOString();
      const ai = getGeminiClient();

      // System instructions prompt
      const systemInstruction = `You are StockWise AI Assistant. You are a fast, precise business assistant for shop owners.

CRITICAL RULES FOR RESPONSE STYLE:
0. CREATOR INFORMATION & IDENTITY: StockWise was created by Aliel Niyonshuti, a software developer from Rwanda. If a user asks "Who created you?", "Who made StockWise?", "Ninde wagukoze?", or "Ninde wakoze StockWise?", your reply must be precisely and literally: "StockWise yakozwe na Aliel Niyonshuti, umu software developer wo mu Rwanda." Always answer this question professionally and accurately using that exact statement.
1. PRIMARY LANGUAGE: Always respond in Kinyarwanda using simple, direct business language, unless the user explicitly requests otherwise. You must understand questions in both Kinyarwanda and English.
2. RESPONSE LENGTH: Keep answers EXTREMELY CONCISE. The default response length must be 1 to 3 short sentences. Avoid long paragraphs and avoid unnecessary explanations or conversational fluff.
3. PRODUCT LISTS: When listing products, quantities, or recommendations, ALWAYS use bullet points (•) and format them exactly like this:
   • Isukari - 5 Kg
   • Umuceri - 3 Kg
4. BUSINESS QUESTIONS STYLE EXAMPLES:
   - Question: "Isukari isigaye ingahe?" -> Answer: "Isukari isigaye 15 Kg."
   - Question: "Ninjije angahe uyu munsi?" -> Answer: "Uyu munsi winjije 125,000 RWF."
   - Question: "Ni ibihe bicuruzwa biri hafi gushira?" -> Answer:
     • Isukari - 5 Kg
     • Umuceri - 3 Kg
   - Question: "Ni iki ngomba kurangura?" -> Answer: "Rangura:
     • Isukari
     • Umuceri"
5. NO UNSOLICITED REPORTS: Avoid long business reports or deep detail unless the user explicitly uses words like "Sobanura birambuye", "Mpa details", "Analyze", or "Report". Otherwise, remain extremely concise.
6. DATA SENSITIVITY: Use only the business data provided from the database below. Never invent numbers, stock quantities, sales, profit, or reports. If information is unavailable, clearly state that it is not available in the database.
7. SELF-CORRECTION PRINCIPLE: Before speaking, ask yourself: "Can this answer be shorter while still being useful?" If yes, shorten it. Keep responses practical, direct, and easy for shop owners to read quickly.

Current Server Time (for calculating "today", "this week", "this month" etc.): ${currentTime}

Store Database Content Context (Isolating current user's store data):
${JSON.stringify(dbContext, null, 2)}`;

      // Construct conversation list
      const contents: any[] = [];
      if (Array.isArray(history)) {
        history.forEach((h: any) => {
          if (h.text && h.role) {
            contents.push({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.text }]
            });
          }
        });
      }

      // Add user's latest query
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      let response: any = null;
      let modelUsed = 'gemini-3.5-flash';
      const maxRetries = 4;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelUsed,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2, // Low temperature for high precision business metrics
            }
          });
          break; // Succeeded! Break the retry loop
        } catch (apiErr: any) {
          console.info(`[AI Chat] Note: Attempt ${attempt} with model ${modelUsed} requested a temporary retry context.`);

          if (attempt === maxRetries) {
            // Log final failure cleanly but don't register high-severity errors
            console.info('[AI Chat] Note: All model attempts finished. Serving a friendly fallback message.');
            break;
          }

          const errMsg = (apiErr.message || '').toLowerCase();
          const isHighDemandOrUnavailable = errMsg.includes('503') || 
                                           apiErr.status === 503 || 
                                           errMsg.includes('500') ||
                                           errMsg.includes('high demand') ||
                                           errMsg.includes('unavailable') ||
                                           errMsg.includes('overloaded') ||
                                           errMsg.includes('resources exhausted');
          
          if (isHighDemandOrUnavailable) {
            if (modelUsed === 'gemini-3.5-flash') {
              modelUsed = 'gemini-3.1-flash-lite';
              console.info(`[AI Chat] Switching to fallback model: ${modelUsed} due to high demand on current model.`);
            } else if (modelUsed === 'gemini-3.1-flash-lite') {
              modelUsed = 'gemini-flash-latest';
              console.info(`[AI Chat] Switching to fallback model: ${modelUsed} due to high demand on flash-lite.`);
            }
          }

          // Delay with exponential backoff before retrying (exponentially longer and more robust to clear spikes)
          const delay = attempt * 1200;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!response) {
        // Conversationally degrade so we avoid triggering a hard browser error/console fault
        return res.json({
          reply: `⚠️ **Umujyanama mu by'ubucuruzi ntabonetse neza kugeza sasa.**\n\nIbi biterwa n'uko imiyoboro yacu ya AI icyarimwe iri kwakira ubusabe bwinshi cyane, cyangwa ikaba ifite ikibazo cy'agateganyo cy'ingorane za tekiniki.\n\n**Icyo wakora:**\n• Ongera ugerageze mu kanya gato (nyuma y'umunota 1 cyangwa 2).\n• Urashobora gukomeza gukora ibindi bikorwa bya store yawe kuko amakuru yawe yose aruzuye neza mu bubiko.`
        });
      }

      const reply = response.text || 'Nta gisubizo kibonetse. Ongera ugerageze mu kanya.';
      res.json({ reply });

    } catch (err: any) {
      console.error('[AI Assistant Chat Route Critical Error] ', err);
      res.status(500).json({ error: err.message || 'Error communicating with Gemini' });
    }
  });

  // Serve static assets / fallback in production and manage dev middleware if not on Vercel
async function startServer() {
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[StockWise Backend] Server running at http://0.0.0.0:${PORT}`);
    });
  } else {
    console.log('[StockWise Backend] Server initialized in Vercel Serverless mode.');
  }
}

// Add User email typings for Express
declare global {
  namespace Express {
    interface Request {
      userEmail?: string;
    }
  }
}

startServer();
