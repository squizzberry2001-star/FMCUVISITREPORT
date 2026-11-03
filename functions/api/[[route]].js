/**
 * Cloudflare Pages Function + D1 Database for FMCU Visit Report
 * Serverless Edge SQLite Database (Super Cepat ~20-50ms Latensi di Indonesia)
 * Kuota Free Tier: 5.000.000 Read/hari, 100.000 Write/hari, 5 GB Storage.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

// Inisialisasi Tabel SQLite jika belum ada di D1
async function initTables(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        storeCode TEXT,
        storeName TEXT,
        auditorId TEXT,
        auditorName TEXT,
        scheduledDate TEXT,
        status TEXT,
        rawJson TEXT,
        updatedAt TEXT
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sch_date ON schedules(scheduledDate)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sch_auditor ON schedules(auditorId)`),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        name TEXT,
        nik TEXT,
        role TEXT,
        rawJson TEXT,
        updatedAt TEXT
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS stores (
        code TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        city TEXT,
        rawJson TEXT,
        updatedAt TEXT
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS locations (
        userId TEXT PRIMARY KEY,
        lat REAL,
        lng REAL,
        status TEXT,
        storeVisit TEXT,
        rawJson TEXT,
        updatedAt TEXT
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        storeCode TEXT,
        storeName TEXT,
        visitDate TEXT,
        rawJson TEXT,
        updatedAt TEXT
      )
    `)
  ]);
}

async function handleRequest(request, env) {
  // 1. Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!env.DB) {
    return jsonResponse({
      status: 'ERROR',
      message: 'D1 Binding tidak ditemukan! Pastikan Variable Name di Cloudflare Pages/Worker diatur ke "DB".'
    }, 500);
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // 2. Health Check & Root
    if ((pathname === '/' || pathname === '/api' || pathname === '/api/') && request.method === 'GET' && !url.searchParams.get('action')) {
      return jsonResponse({
        status: 'ONLINE',
        engine: 'Cloudflare D1 Edge SQLite',
        app: 'FMCU Visit Report Edge Database',
        timestamp: new Date().toISOString()
      });
    }

    // Pastikan tabel selalu siap
    await initTables(env.DB);

    // Parse payload jika POST
    let payload = {};
    if (request.method === 'POST') {
      try {
        payload = await request.json();
      } catch (e) {
        payload = {};
      }
    }

    const action = payload.action || url.searchParams.get('action') || '';

    // ========================================================================
    // 1. SYNC ALL (Mengambil Jadwal, User, Toko, dan Live GPS seketika)
    // ========================================================================
    if (pathname.endsWith('/sync-all') || action === 'db_sync_all') {
      const [schRes, userRes, storeRes, locRes, repRes] = await Promise.all([
        env.DB.prepare('SELECT rawJson FROM schedules ORDER BY scheduledDate ASC').all(),
        env.DB.prepare('SELECT rawJson FROM users').all(),
        env.DB.prepare('SELECT rawJson FROM stores').all(),
        env.DB.prepare('SELECT rawJson FROM locations').all(),
        env.DB.prepare('SELECT rawJson FROM reports ORDER BY visitDate DESC LIMIT 200').all()
      ]);

      const parseRows = (rows) => (rows?.results || []).map((r) => {
        try {
          return JSON.parse(r.rawJson);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      return jsonResponse({
        status: 'SUCCESS',
        source: 'cloudflare_d1',
        timestamp: new Date().toISOString(),
        schedules: parseRows(schRes),
        users: parseRows(userRes),
        stores: parseRows(storeRes),
        locations: parseRows(locRes),
        reports: parseRows(repRes)
      });
    }

    // ========================================================================
    // 2. GET COLLECTION
    // ========================================================================
    if (pathname.endsWith('/get-collection') || action === 'db_get_collection') {
      const coll = payload.collection || url.searchParams.get('collection') || '';
      let query = '';
      if (coll === 'schedules') query = 'SELECT rawJson FROM schedules ORDER BY scheduledDate ASC';
      else if (coll === 'users') query = 'SELECT rawJson FROM users';
      else if (coll === 'stores') query = 'SELECT rawJson FROM stores';
      else if (coll === 'locations') query = 'SELECT rawJson FROM locations';
      else if (coll === 'reports') query = 'SELECT rawJson FROM reports ORDER BY visitDate DESC LIMIT 300';
      else {
        return jsonResponse({ status: 'ERROR', message: `Collection ${coll} tidak valid` }, 400);
      }

      const res = await env.DB.prepare(query).all();
      const items = (res?.results || []).map((r) => {
        try {
          return JSON.parse(r.rawJson);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      return jsonResponse({
        status: 'SUCCESS',
        collection: coll,
        data: items
      });
    }

    // ========================================================================
    // 3. SAVE ITEM TUNGGAL
    // ========================================================================
    if (pathname.endsWith('/save-item') || action === 'db_save_item') {
      const coll = payload.collection || '';
      const item = payload.item || {};
      const nowIso = new Date().toISOString();

      if (coll === 'schedules') {
        const id = String(item.id || '');
        if (!id) return jsonResponse({ status: 'ERROR', message: 'Schedule id wajib ada' }, 400);
        await env.DB.prepare(`
          INSERT INTO schedules (id, storeCode, storeName, auditorId, auditorName, scheduledDate, status, rawJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            storeCode = excluded.storeCode,
            storeName = excluded.storeName,
            auditorId = excluded.auditorId,
            auditorName = excluded.auditorName,
            scheduledDate = excluded.scheduledDate,
            status = excluded.status,
            rawJson = excluded.rawJson,
            updatedAt = excluded.updatedAt
        `).bind(
          id,
          String(item.storeCode || ''),
          String(item.storeName || ''),
          String(item.auditorId || ''),
          String(item.auditorName || ''),
          String(item.scheduledDate || ''),
          String(item.status || 'SCHEDULED'),
          JSON.stringify(item),
          nowIso
        ).run();

        return jsonResponse({ status: 'SUCCESS', action: 'db_save_item', collection: coll, id });
      }

      if (coll === 'users') {
        const id = String(item.id || '');
        if (!id) return jsonResponse({ status: 'ERROR', message: 'User id wajib ada' }, 400);
        await env.DB.prepare(`
          INSERT INTO users (id, username, name, nik, role, rawJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            name = excluded.name,
            nik = excluded.nik,
            role = excluded.role,
            rawJson = excluded.rawJson,
            updatedAt = excluded.updatedAt
        `).bind(
          id,
          String(item.username || ''),
          String(item.name || ''),
          String(item.nik || ''),
          String(item.role || ''),
          JSON.stringify(item),
          nowIso
        ).run();

        return jsonResponse({ status: 'SUCCESS', action: 'db_save_item', collection: coll, id });
      }

      if (coll === 'stores') {
        const code = String(item.code || '');
        if (!code) return jsonResponse({ status: 'ERROR', message: 'Store code wajib ada' }, 400);
        await env.DB.prepare(`
          INSERT INTO stores (code, name, type, city, rawJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            city = excluded.city,
            rawJson = excluded.rawJson,
            updatedAt = excluded.updatedAt
        `).bind(
          code,
          String(item.name || ''),
          String(item.type || 'CVS'),
          String(item.city || ''),
          JSON.stringify(item),
          nowIso
        ).run();

        return jsonResponse({ status: 'SUCCESS', action: 'db_save_item', collection: coll, code });
      }

      if (coll === 'reports') {
        const id = String(item.id || '');
        if (!id) return jsonResponse({ status: 'ERROR', message: 'Report id wajib ada' }, 400);
        await env.DB.prepare(`
          INSERT INTO reports (id, storeCode, storeName, visitDate, rawJson, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            storeCode = excluded.storeCode,
            storeName = excluded.storeName,
            visitDate = excluded.visitDate,
            rawJson = excluded.rawJson,
            updatedAt = excluded.updatedAt
        `).bind(
          id,
          String(item.storeCode || ''),
          String(item.storeName || ''),
          String(item.visitDate || ''),
          JSON.stringify(item),
          nowIso
        ).run();

        return jsonResponse({ status: 'SUCCESS', action: 'db_save_item', collection: coll, id });
      }

      return jsonResponse({ status: 'ERROR', message: `Collection ${coll} tidak dikenali` }, 400);
    }

    // ========================================================================
    // 4. SAVE COLLECTION UTUH (Batch Replacement)
    // ========================================================================
    if (pathname.endsWith('/save-collection') || action === 'db_save_collection') {
      const coll = payload.collection || '';
      const items = Array.isArray(payload.data) ? payload.data : [];
      const nowIso = new Date().toISOString();

      if (coll === 'schedules') {
        const stmts = [env.DB.prepare('DELETE FROM schedules')];
        items.forEach((s) => {
          if (!s || !s.id) return;
          stmts.push(env.DB.prepare(`
            INSERT INTO schedules (id, storeCode, storeName, auditorId, auditorName, scheduledDate, status, rawJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            String(s.id),
            String(s.storeCode || ''),
            String(s.storeName || ''),
            String(s.auditorId || ''),
            String(s.auditorName || ''),
            String(s.scheduledDate || ''),
            String(s.status || 'SCHEDULED'),
            JSON.stringify(s),
            nowIso
          ));
        });
        await env.DB.batch(stmts);
        return jsonResponse({ status: 'SUCCESS', action: 'db_save_collection', collection: coll, count: items.length });
      }

      if (coll === 'users') {
        const stmts = [env.DB.prepare('DELETE FROM users')];
        items.forEach((u) => {
          if (!u || !u.id) return;
          stmts.push(env.DB.prepare(`
            INSERT INTO users (id, username, name, nik, role, rawJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            String(u.id),
            String(u.username || ''),
            String(u.name || ''),
            String(u.nik || ''),
            String(u.role || ''),
            JSON.stringify(u),
            nowIso
          ));
        });
        await env.DB.batch(stmts);
        return jsonResponse({ status: 'SUCCESS', action: 'db_save_collection', collection: coll, count: items.length });
      }

      if (coll === 'stores') {
        const stmts = [env.DB.prepare('DELETE FROM stores')];
        items.forEach((st) => {
          if (!st || !st.code) return;
          stmts.push(env.DB.prepare(`
            INSERT INTO stores (code, name, type, city, rawJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            String(st.code),
            String(st.name || ''),
            String(st.type || 'CVS'),
            String(st.city || ''),
            JSON.stringify(st),
            nowIso
          ));
        });
        await env.DB.batch(stmts);
        return jsonResponse({ status: 'SUCCESS', action: 'db_save_collection', collection: coll, count: items.length });
      }

      return jsonResponse({ status: 'ERROR', message: `Collection ${coll} tidak dikenali` }, 400);
    }

    // ========================================================================
    // 5. UPDATE LIVE GPS LOCATION
    // ========================================================================
    if (pathname.endsWith('/update-location') || action === 'db_update_location') {
      const uId = String(payload.userId || '');
      const loc = payload.location;
      if (!uId || !loc) {
        return jsonResponse({ status: 'ERROR', message: 'Data lokasi tidak valid' }, 400);
      }
      const nowIso = new Date().toISOString();
      const enrichedLoc = { ...loc, updatedAt: nowIso };

      await env.DB.prepare(`
        INSERT INTO locations (userId, lat, lng, status, storeVisit, rawJson, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
          lat = excluded.lat,
          lng = excluded.lng,
          status = excluded.status,
          storeVisit = excluded.storeVisit,
          rawJson = excluded.rawJson,
          updatedAt = excluded.updatedAt
      `).bind(
        uId,
        Number(loc.lat || 0),
        Number(loc.lng || 0),
        String(loc.status || 'LIVE_GPS'),
        String(loc.storeVisit || ''),
        JSON.stringify(enrichedLoc),
        nowIso
      ).run();

      return jsonResponse({
        status: 'SUCCESS',
        action: 'db_update_location',
        userId: uId,
        timestamp: nowIso
      });
    }

    return jsonResponse({ status: 'ERROR', message: 'Endpoint atau action tidak ditemukan' }, 404);
  } catch (err) {
    return jsonResponse({
      status: 'ERROR',
      message: err.message || String(err),
      stack: err.stack
    }, 500);
  }
}

// Export untuk Cloudflare Pages Functions
export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

// Export untuk Standalone Cloudflare Worker
export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
