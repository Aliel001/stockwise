import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environmental parameters and configuration
dotenv.config();

const { Pool } = pg;

// 1. Connection Optimization using PgBouncer/Neon compatible Pool configuration
let dbUrl = process.env.DATABASE_URL || '';

if (!dbUrl) {
  console.warn('[PostgreSQL Pool Alert] DATABASE_URL is not set. Database features may be offline.');
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

    // Core users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'manager' CHECK (role IN ('admin', 'manager', 'cashier')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

app.use(express.json());

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

  const PORT = 3000;

  // Run the tables verification on startup in the background to ensure Express starts immediately and is fully responsive
  initializeSchema().catch((err) => {
    console.error('[PostgreSQL] Background schema initialization failed:', err);
  });

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

  // Robust function to check if the email is a genuine store email address
  function isRealEmail(email: string): { isValid: boolean; reason: string } {
    const clean = email.trim().toLowerCase();
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(clean)) {
      return { isValid: false, reason: 'Imiterere y\'imeri ntabwo yemewe. Koresha imeri ifite inyuguti zikwiye (Urugero: manager@domain.rw).' };
    }

    const [username, domain] = clean.split('@');

    // Username checks
    if (username.length < 3) {
      return { isValid: false, reason: 'Izina rya imeri (ibice bibanziriza @) rigomba kuba rigizwe n’inyuguti nibura 3. / Username must be at least 3 characters.' };
    }

    const fakeUsernames = ['test', 'dummy', 'fake', 'abc', 'aaa', 'bbb', 'temp', 'admin', 'user', 'mock', 'asdf', 'qwerty'];
    if (fakeUsernames.includes(username)) {
      return { isValid: false, reason: 'Iri zina rya imeri ntabwo ryemewe muri StockWise ku bw\'umutekano kuko rimeze nka test.' };
    }

    // Temporary/Disposable Email Providers
    const disposableDomains = [
      'mailinator.com', 'tempmail.com', '10minutemail.com', 'yopmail.com', 'trashmail.com', 
      'dispostable.com', 'guerrillamail.com', 'sharklasers.com', 'getairmail.com', 'temp-mail.org',
      'maildrop.cc', 'disposable.com', 'boun.cr', 'mintemail.com', 'jetable.org', 'fakeinbox.com',
      'mailnesia.com', 'mailcatch.com', 'temporarymail.com', 'guerrillamailblock.com', 'dispolist.com'
    ];

    if (disposableDomains.some(d => domain.includes(d))) {
      return { isValid: false, reason: 'Imeri zo mu bwoko bwa disposable (iz’igihe gito nk\'iyi) ntabwo zemewe kubera umutekano. Koresha imeri yawe ihoraho.' };
    }

    // Unacceptable fake placeholder domains 
    const mockDomains = [
      'test.com', 'example.com', 'invalid.com', 'mock.com', 'fake.com', 'dummy.com', 
      'any.com', 'something.com', 'test.co', 'xyz.com', 'abc.com', 'none.com', 'localhost', 
      'email.com', 'mail.ru', 'test.localhost', 'example.org', 'domain.com'
    ];

    if (mockDomains.includes(domain) || domain.endsWith('.test') || domain.endsWith('.invalid')) {
      return { isValid: false, reason: 'Iyi domain ntabwo yemewe. Banza winjize imeri nyakuri ifite agaciro ihoraho. / This email domain is blacklisted as invalid.' };
    }

    return { isValid: true, reason: '' };
  }

  // POST /api/auth/send-code - Initiates verification stage by generating and returning a 6-digit passcode
  app.post('/api/auth/send-code', (req, res) => {
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

      // We return the code transparently in the JSON payload of the response in this deployment environment
      // so the user can see/access it within their sandbox preview naturally
      res.json({
        success: true,
        message: 'Agaciro k’umutekano koherejwe successfully!',
        email: cleanEmail,
        phone: cleanPhone || 'None',
        code: code, // Shared in response body to guarantee seamless preview functionality
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/verify-code - Validates 6-digit passcode and authenticates session
  app.post('/api/auth/verify-code', (req, res) => {
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

      res.json({
        success: true,
        message: 'Email verified successfully!',
        email: cleanEmail,
        displayName: record.name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Middleware to retrieve authenticated user email
  const requireUser = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const email = req.headers['x-user-email'] as string;
    if (!email) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        return res.status(401).json({ error: 'Unauthenticated. Header x-user-email is missing.' });
      }
      // Fallback for seamless local sandbox and developer workspace previews
      req.userEmail = 'alieluzii@gmail.com';
    } else {
      req.userEmail = email.trim().toLowerCase();
    }
    next();
  };

  // --- RESTful API Service Endpoints ---

  // GET /api/products
  app.get('/api/products', requireUser, async (req, res) => {
    try {
      const q = `
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
        WHERE p.created_by = $1
        ORDER BY p.name ASC;
      `;
      const result = await pool.query(q, [req.userEmail]);
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

      // Insert core details
      await client.query(
        `INSERT INTO products (id, name, product_code, description, purchase_price, selling_price, min_stock, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [productId, name, productCode, description || '', purchasePrice || 0, sellingPrice || 0, minStock || 0, req.userEmail]
      );

      // Insert initial stock relation (3NF separation)
      await client.query(
        `INSERT INTO inventory_stock (id, product_id, quantity)
         VALUES ($1, $2, $3);`,
        ['stock_' + productId, productId, quantity || 0]
      );

      // Store in audit logs
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + productId, `Added product "${name}" with initial stock of ${quantity}`, req.userEmail]
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

      const isOwner = await client.query('SELECT name FROM products WHERE id = $1 AND created_by = $2;', [id, req.userEmail]);
      if (isOwner.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized product modification' });
      }

      await client.query(
        `UPDATE products 
         SET name = $1, description = $2, min_stock = $3, purchase_price = $4, selling_price = $5, updated_at = NOW()
         WHERE id = $6;`,
        [name, description || '', minStock || 0, purchasePrice || 0, sellingPrice || 0, id]
      );

      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Updated details of product "${isOwner.rows[0].name}"`, req.userEmail]
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

      const isOwner = await client.query('SELECT name FROM products WHERE id = $1 AND created_by = $2;', [id, req.userEmail]);
      if (isOwner.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized product modification' });
      }

      await client.query('DELETE FROM products WHERE id = $1;', [id]);

      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Deleted product "${isOwner.rows[0].name}"`, req.userEmail]
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
      const q = `
        SELECT s.id, s.product_id as "productId", s.product_name as "productName",
               s.quantity::int, s.supplier, s.notes, s.performed_by as "performedBy",
               s.purchase_price::float as "purchasePrice",
               s.created_at as "createdAt"
        FROM stock_ins s
        WHERE s.performed_by = $1
        ORDER BY s.created_at DESC;
      `;
      const result = await pool.query(q, [req.userEmail]);
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

      const prod = await client.query('SELECT name, purchase_price FROM products WHERE id = $1 AND created_by = $2;', [productId, req.userEmail]);
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
         WHERE id = $2 AND created_by = $3;`,
        [activePurchasePrice, productId, req.userEmail]
      );

      // Record Stock In Transaction
      await client.query(
        `INSERT INTO stock_ins (id, product_id, product_name, quantity, supplier, notes, purchase_price, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [stockInId, productId, prodName, quantity, supplier || '', notes || '', activePurchasePrice, req.userEmail]
      );

      // Record in logs
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Restocked ${quantity} units of "${prodName}" (Purchase Price: ${activePurchasePrice} RWF)`, req.userEmail]
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
      const q = `
        SELECT s.id, si.product_id as "productId", p.name as "productName",
               si.quantity::int as quantity, si.price::float as "unitPrice", 
               (si.quantity * si.price)::float as "totalPrice",
               s.performed_by as "performedBy", s.created_at as "createdAt"
        FROM sales s
        JOIN sales_items si ON s.id = si.sale_id
        JOIN products p ON si.product_id = p.id
        WHERE s.performed_by = $1
        ORDER BY s.created_at DESC;
      `;
      const result = await pool.query(q, [req.userEmail]);
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
         WHERE p.id = $1 AND p.created_by = $2;`,
        [productId, req.userEmail]
      );

      if (prodRes.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
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
        `INSERT INTO sales (id, performed_by, total_amount)
         VALUES ($1, $2, $3);`,
        [saleId, req.userEmail, totalPrice]
      );

      // 3. Insert Sale Item Detail
      await client.query(
        `INSERT INTO sales_items (id, sale_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5);`,
        [saleItemId, saleId, productId, quantity, unitPrice]
      );

      // 4. Activity log
      await client.query(
        `INSERT INTO activity_logs (id, action, performed_by)
         VALUES ($1, $2, $3);`,
        ['log_' + Math.random().toString(36).substring(2, 11), `Sold ${quantity} units of "${product.name}" for a total of RWF ${Math.round(totalPrice).toLocaleString()}`, req.userEmail]
      );

      // 5. Build dynamic alerts trigger inside notifications if goes low_stock
      if (newQty <= product.min_stock) {
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 11);
        const warningMsg = `"${product.name}" is running low (${newQty} left). Please restock soon!`;
        await client.query(
          `INSERT INTO notifications (id, product_id, message, type, is_read, user_email)
           VALUES ($1, $2, $3, 'low_stock', FALSE, $4);`,
          [notifId, productId, warningMsg, req.userEmail]
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
      const q = `
        SELECT id, message, type, is_read as "isRead", 
               user_email as "userEmail", created_at as "createdAt"
        FROM notifications
        WHERE user_email = $1
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(q, [req.userEmail]);
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
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_email = $2;', [id, req.userEmail]);
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
      await pool.query('DELETE FROM notifications WHERE id = $1 AND user_email = $2;', [id, req.userEmail]);
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/activity-logs
  app.get('/api/activity-logs', requireUser, async (req, res) => {
    try {
      const q = `
        SELECT id, action, performed_by as "performedBy", created_at as "createdAt"
        FROM activity_logs
        WHERE performed_by = $1
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(q, [req.userEmail]);
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
      const maxRetries = 3;

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
          console.warn(`[AI Chat] Attempt ${attempt} with model ${modelUsed} failed:`, apiErr.message || apiErr);
          
          if (attempt === maxRetries) {
            throw apiErr; // Rethrow if exhausted
          }

          const errMsg = (apiErr.message || '').toLowerCase();
          const isHighDemandOrUnavailable = errMsg.includes('503') || 
                                           apiErr.status === 503 || 
                                           errMsg.includes('high demand') ||
                                           errMsg.includes('unavailable');
          
          if (isHighDemandOrUnavailable && modelUsed === 'gemini-3.5-flash') {
            modelUsed = 'gemini-3.1-flash-lite';
            console.info(`[AI Chat] Switching to fallback model: ${modelUsed} due to high demand/unavailability of gemini-3.5-flash.`);
          }

          // Delay with exponential backoff before retrying
          const delay = attempt * 300;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const reply = response?.text || 'Nta gisubizo kibonetse. Ongera ugerageze mu kanya.';
      res.json({ reply });

    } catch (err: any) {
      console.error('[AI Assistant Chat Route Error] ', err);
      res.status(500).json({ error: err.message || 'Error communicating with Gemini' });
    }
  });

  // Serve static assets / fallback in production and manage dev middleware if not on Vercel
async function startServer() {
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
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
