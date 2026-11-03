/**
 * Cloudflare Worker + D1 Database for FMCU Visit Report
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

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!env.DB) {
      return jsonResponse({
        status: 'ERROR',
        message: 'D1 Binding tidak ditemukan! Pastikan Variable Name di Cloudflare Worker diatur ke "DB".'
      }, 500);
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 2. Health Check & Root
      if (pathname === '/' && request.method === 'GET') {
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

      const action = payload.action || '';

      // ========================================================================
      // 1. SYNC ALL (Mengambil Jadwal, User, Toko, dan Live GPS seketika)
      // ========================================================================
      if (pathname === '/api/sync-all' || action === 'db_sync_all') {
        const [schRes, userRes, storeRes, locRes, repRes] = await Promise.all([
          env.DB.prepare('SELECT rawJson FROM schedules ORDER BY scheduledDate ASC').all(),
          env.DB.prepare('SELECT rawJson FROM users').all(),
          env.DB.prepare('SELECT rawJson FROM stores').all(),
          env.DB.prepare('SELECT userId, rawJson FROM locations').all(),
          env.DB.prepare('SELECT rawJson FROM reports ORDER BY updatedAt DESC LIMIT 100').all()
        ]);

        const schedules = (schRes.results || []).map((r) => JSON.parse(r.rawJson || '{}')).filter((s) => s && s.id);
        const users = (userRes.results || []).map((r) => JSON.parse(r.rawJson || '{}')).filter((u) => u && (u.id || u.username));
        const stores = (storeRes.results || []).map((r) => JSON.parse(r.rawJson || '{}')).filter((st) => st && st.code);
        const locations = {};
        (locRes.results || []).forEach((r) => {
          if (r.userId && r.rawJson) {
            try {
              locations[r.userId] = JSON.parse(r.rawJson);
            } catch (e) {}
          }
        });
        const reports = (repRes.results || []).map((r) => JSON.parse(r.rawJson || '{}')).filter((rp) => rp && rp.id);

        return jsonResponse({
          status: 'SUCCESS',
          source: 'cloudflare_d1',
          schedules,
          users,
          stores,
          locations,
          reports,
          timestamp: new Date().toISOString()
        });
      }

      // ========================================================================
      // 2. SAVE SINGLE SCHEDULE (Upsert Jadwal Tunggal)
      // ========================================================================
      if (pathname === '/api/save-schedule' || action === 'db_save_schedule') {
        const sch = payload.schedule;
        if (!sch || !sch.id) {
          return jsonResponse({ status: 'ERROR', message: 'Data jadwal tidak valid' }, 400);
        }
        const sId = String(sch.id);
        const nowIso = sch.updatedAt || new Date().toISOString();
        const rawJson = JSON.stringify(sch);

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
          sId,
          String(sch.storeCode || ''),
          String(sch.storeName || ''),
          String(sch.auditorId || ''),
          String(sch.auditorName || ''),
          String(sch.scheduledDate || ''),
          String(sch.status || 'PENDING'),
          rawJson,
          nowIso
        ).run();

        return jsonResponse({
          status: 'SUCCESS',
          action: 'db_save_schedule',
          scheduleId: sId,
          timestamp: new Date().toISOString()
        });
      }

      // ========================================================================
      // 3. DELETE SCHEDULE
      // ========================================================================
      if (pathname === '/api/delete-schedule' || action === 'db_delete_schedule') {
        const sId = String(payload.scheduleId || '');
        if (!sId) {
          return jsonResponse({ status: 'ERROR', message: 'ID Jadwal tidak valid' }, 400);
        }
        await env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(sId).run();
        return jsonResponse({
          status: 'SUCCESS',
          action: 'db_delete_schedule',
          deletedId: sId,
          timestamp: new Date().toISOString()
        });
      }

      // ========================================================================
      // 4. SAVE COLLECTION (Schedules, Users, Stores, Locations, Reports)
      // ========================================================================
      if (pathname === '/api/save-collection' || action === 'db_save_collection') {
        const coll = payload.collection || 'schedules';
        const data = payload.data;

        if (coll === 'schedules' && Array.isArray(data)) {
          const stmts = [env.DB.prepare('DELETE FROM schedules')];
          data.forEach((s) => {
            if (s && s.id) {
              stmts.push(
                env.DB.prepare(`
                  INSERT INTO schedules (id, storeCode, storeName, auditorId, auditorName, scheduledDate, status, rawJson, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                  String(s.id),
                  String(s.storeCode || ''),
                  String(s.storeName || ''),
                  String(s.auditorId || ''),
                  String(s.auditorName || ''),
                  String(s.scheduledDate || ''),
                  String(s.status || 'PENDING'),
                  JSON.stringify(s),
                  s.updatedAt || new Date().toISOString()
                )
              );
            }
          });
          // Eksekusi atomic batch
          await env.DB.batch(stmts);
          return jsonResponse({ status: 'SUCCESS', collection: 'schedules', count: data.length });
        }

        if (coll === 'users' && Array.isArray(data)) {
          const stmts = [env.DB.prepare('DELETE FROM users')];
          data.forEach((u) => {
            const uId = String(u.id || u.username);
            if (uId) {
              stmts.push(
                env.DB.prepare(`
                  INSERT INTO users (id, username, name, nik, role, rawJson, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(
                  uId,
                  String(u.username || ''),
                  String(u.name || ''),
                  String(u.nik || ''),
                  String(u.role || 'AUDITOR'),
                  JSON.stringify(u),
                  new Date().toISOString()
                )
              );
            }
          });
          await env.DB.batch(stmts);
          return jsonResponse({ status: 'SUCCESS', collection: 'users', count: data.length });
        }

        if (coll === 'stores' && Array.isArray(data)) {
          const stmts = [env.DB.prepare('DELETE FROM stores')];
          data.forEach((st) => {
            if (st && st.code) {
              stmts.push(
                env.DB.prepare(`
                  INSERT INTO stores (code, name, type, city, rawJson, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).bind(
                  String(st.code),
                  String(st.name || ''),
                  String(st.type || 'CVS'),
                  String(st.city || ''),
                  JSON.stringify(st),
                  new Date().toISOString()
                )
              );
            }
          });
          await env.DB.batch(stmts);
          return jsonResponse({ status: 'SUCCESS', collection: 'stores', count: data.length });
        }

        if (coll === 'locations') {
          if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            const keys = Object.keys(data);
            if (keys.length === 0) {
              await env.DB.prepare('DELETE FROM locations').run();
            } else {
              const stmts = [];
              keys.forEach((k) => {
                const loc = data[k];
                stmts.push(
                  env.DB.prepare(`
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
                    String(k),
                    Number(loc.lat || 0),
                    Number(loc.lng || 0),
                    String(loc.status || 'LIVE_GPS'),
                    String(loc.storeVisit || ''),
                    JSON.stringify(loc),
                    loc.updatedAt || new Date().toISOString()
                  )
                );
              });
              await env.DB.batch(stmts);
            }
            return jsonResponse({ status: 'SUCCESS', collection: 'locations', count: keys.length });
          }
        }

        return jsonResponse({ status: 'ERROR', message: `Collection ${coll} tidak dikenali` }, 400);
      }

      // ========================================================================
      // 5. UPDATE LIVE GPS LOCATION
      // ========================================================================
      if (pathname === '/api/update-location' || action === 'db_update_location') {
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
};
