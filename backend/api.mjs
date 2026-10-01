import crypto from 'node:crypto';
import express from 'express';
import { setting, allowedOrigins, db, query, withTransaction, withConnection } from './db.mjs';
import { ApiError, fail } from './errors.mjs';
import { currentSession, newSession, localSetup, resolveParents } from './session.mjs';
import { safeEquals, hashPassword, verifyPassword, passwordNeedsRehash } from './crypto-utils.mjs';
import { validateFacility, validatePlot, validateInfrastructure } from './validate.mjs';

const router = express.Router();

function readRawBody(req, cap) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > cap) {
        req.destroy();
        reject(new ApiError('Data terlalu besar.', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const action = req.query.action || 'public';
  const method = req.method;
  try {
    if (action === 'public' && method === 'GET') {
      const pool = db();
      const session = await currentSession(pool, req, res);
      const account = session.admin_id
        ? (await query(pool, 'SELECT email,role FROM admins WHERE id=?', [session.admin_id]))[0]
        : null;
      const rows = await query(pool, "SELECT payload FROM facilities WHERE status='published' ORDER BY id");
      const plotRows = account ? await query(pool, "SELECT payload FROM plots WHERE status NOT IN ('draft','archived') ORDER BY id") : [];
      const infraRows = account ? await query(pool, "SELECT payload FROM infrastructure WHERE status='published' ORDER BY id") : [];
      const categories = await query(pool, 'SELECT id,label,icon FROM categories WHERE enabled=1 ORDER BY id');
      const infraCategories = account
        ? await query(pool, 'SELECT id,label,color FROM infrastructure_categories WHERE enabled=1 ORDER BY label')
        : [];
      res.json({
        schema_version: 1,
        updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        authenticated: !!account,
        account: account || null,
        csrf: session.csrf,
        categories,
        infrastructure_categories: infraCategories,
        plots: plotRows.map((r) => JSON.parse(r.payload)),
        infrastructure: infraRows.map((r) => JSON.parse(r.payload)),
        facilities: resolveParents(rows.map((r) => JSON.parse(r.payload))),
      });
      return;
    }

    const pool = db();
    let session = await currentSession(pool, req, res);
    let input;
    if (method === 'POST') {
      if (!allowedOrigins().includes(req.headers.origin || '')) fail('Asal permintaan tidak diizinkan.', 403);
      if (!safeEquals(session.csrf, req.headers['x-csrf-token'] || '')) fail('Sesi berubah. Muat ulang halaman.', 403);
      if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('Gunakan JSON.', 415);
      const raw = await readRawBody(req, 65536);
      try {
        input = JSON.parse(raw);
      } catch {
        fail('JSON tidak valid.');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) fail('Objek JSON diperlukan.');
    }

    if (action === 'session' && method === 'GET') {
      const account = session.admin_id
        ? (await query(pool, 'SELECT email,role FROM admins WHERE id=?', [session.admin_id]))[0]
        : null;
      const adminCount = Number((await query(pool, 'SELECT COUNT(*) c FROM admins'))[0].c);
      res.json({
        email: account?.email ?? null,
        role: account?.role ?? null,
        csrf: session.csrf,
        setup: localSetup(setting, req.socket.remoteAddress) && adminCount === 0,
      });
      return;
    }

    if ((action === 'login' || action === 'setup') && method === 'POST') {
      const email = String(input.email ?? '').trim().toLowerCase();
      const password = typeof input.password === 'string' ? input.password : '';
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailValid || email.length > 254 || password.length > 72) fail('Email atau password tidak valid.', 422);
      let admin, role;
      if (action === 'setup') {
        if (!localSetup(setting, req.socket.remoteAddress)) fail('Pembuatan admin hanya melalui setup lokal atau CLI server.', 403);
        if (password.length < 12) fail('Password minimal 12 karakter.', 422);
        await withConnection(async (conn) => {
          const locked = Number((await query(conn, "SELECT GET_LOCK('mm2100_admin_setup',5) AS locked"))[0].locked);
          if (!locked) fail('Coba kembali.', 409);
          try {
            const count = Number((await query(conn, 'SELECT COUNT(*) c FROM admins'))[0].c);
            if (count !== 0) fail('Admin sudah dibuat. Silakan login.', 409);
            await query(conn, 'INSERT INTO admins(email,password_hash) VALUES (?,?)', [email, hashPassword(password)]);
            const [idRow] = await query(conn, 'SELECT LAST_INSERT_ID() id');
            admin = Number(idRow.id);
          } finally {
            await query(conn, "SELECT RELEASE_LOCK('mm2100_admin_setup')");
          }
        });
        role = 'admin';
      } else {
        for (const key of ['email:' + email, 'ip:' + (req.socket.remoteAddress || '')]) {
          const bucket = crypto.createHash('sha256').update(key).digest('hex');
          const now = Math.floor(Date.now() / 1000);
          await query(
            pool,
            'INSERT INTO login_limits(bucket,attempts,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<?,1,attempts+1), expires_at=IF(expires_at<?,VALUES(expires_at),expires_at)',
            [bucket, now + 900, now, now],
          );
          const attempts = Number((await query(pool, 'SELECT attempts FROM login_limits WHERE bucket=?', [bucket]))[0]?.attempts ?? 0);
          if (attempts > 10) fail('Terlalu banyak percobaan. Tunggu 15 menit.', 429);
        }
        const row = (await query(pool, 'SELECT id,password_hash,role FROM admins WHERE email=?', [email]))[0];
        const dummy = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        const valid = verifyPassword(password, row?.password_hash ?? dummy);
        if (!row || !valid) fail('Email atau password salah.', 401);
        admin = Number(row.id);
        role = row.role;
        if (passwordNeedsRehash(row.password_hash)) {
          await query(pool, 'UPDATE admins SET password_hash=? WHERE id=?', [hashPassword(password), admin]);
        }
      }
      await query(pool, 'DELETE FROM app_sessions WHERE token_hash=?', [session.token_hash]);
      session = await newSession(pool, admin, res);
      res.json({ email, role: action === 'setup' ? 'admin' : role, csrf: session.csrf });
      return;
    }

    if (action === 'logout' && method === 'POST') {
      await query(pool, 'DELETE FROM app_sessions WHERE token_hash=?', [session.token_hash]);
      session = await newSession(pool, null, res);
      res.json({ csrf: session.csrf });
      return;
    }

    if (!session.admin_id) fail('Silakan login sebagai admin.', 401);
    const role = (await query(pool, 'SELECT role FROM admins WHERE id=?', [session.admin_id]))[0]?.role;
    if (role !== 'admin') fail('Akun ini hanya dapat mengakses halaman internal.', 403);

    if (action === 'account_list' && method === 'GET') {
      res.json({ accounts: await query(pool, 'SELECT id,email,role,created_at FROM admins ORDER BY role,email') });
      return;
    }

    if (action === 'account_save' && method === 'POST') {
      const email = String(input.email ?? '').trim().toLowerCase();
      const password = typeof input.password === 'string' ? input.password : '';
      const id = input.id ?? null;
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailValid || email.length > 254 || password.length < 12 || password.length > 72 || (id !== null && !Number.isInteger(id))) {
        fail('Email atau password akun tidak valid.', 422);
      }
      try {
        if (id === null) {
          await query(pool, "INSERT INTO admins(email,password_hash,role) VALUES (?,?,'internal')", [email, hashPassword(password)]);
        } else {
          if (Number(id) === Number(session.admin_id)) fail('Gunakan prosedur reset admin untuk akun Anda sendiri.', 422);
          const result = await pool.execute("UPDATE admins SET email=?,password_hash=? WHERE id=? AND role='internal'", [email, hashPassword(password), id]);
          if (result[0].affectedRows !== 1) fail('Akun internal tidak ditemukan.', 404);
          await query(pool, 'DELETE FROM app_sessions WHERE admin_id=?', [id]);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (e.code === 'ER_DUP_ENTRY') fail('Email sudah digunakan.', 409);
        throw e;
      }
      await query(pool, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [
        session.admin_id,
        id === null ? 'account_create' : 'account_reset',
        email,
      ]);
      res.json({ saved: true });
      return;
    }

    if (action === 'account_delete' && method === 'POST') {
      const id = input.id ?? null;
      if (!Number.isInteger(id) || Number(id) === Number(session.admin_id)) fail('Akun tidak valid.', 422);
      const email = (await query(pool, "SELECT email FROM admins WHERE id=? AND role='internal'", [id]))[0]?.email;
      if (!email) fail('Akun internal tidak ditemukan.', 404);
      await query(pool, 'DELETE FROM app_sessions WHERE admin_id=?', [id]);
      await query(pool, "DELETE FROM admins WHERE id=? AND role='internal'", [id]);
      await query(pool, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'account_delete', email]);
      res.json({ deleted: true });
      return;
    }

    if (action === 'categories' && method === 'GET') {
      res.json({ categories: await query(pool, 'SELECT * FROM categories ORDER BY label') });
      return;
    }

    if (action === 'category_save' && method === 'POST') {
      const { id, label, icon, enabled, revision } = input;
      const icons = ['resto_cafe', 'cafe', 'hotel', 'food_court', 'atm', 'medical', 'public_facility'];
      if (
        typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(id) ||
        typeof label !== 'string' || !label.trim() || label.length > 80 ||
        !icons.includes(icon) || typeof enabled !== 'boolean' ||
        !Number.isInteger(revision) || revision < 0
      ) fail('Data kategori tidak valid.', 422);
      await withTransaction(async (conn) => {
        await query(conn, 'SELECT id FROM categories ORDER BY id FOR UPDATE');
        const rows = await query(conn, 'SELECT payload FROM facilities ORDER BY id FOR UPDATE');
        if (!enabled) {
          for (const raw of rows) {
            if (JSON.parse(raw.payload).category === id) fail('Kategori masih digunakan fasilitas. Pindahkan fasilitas ke kategori lain terlebih dahulu.', 422);
          }
        }
        try {
          if (revision === 0) {
            await query(conn, 'INSERT INTO categories(id,label,icon,enabled) VALUES (?,?,?,?)', [id, label.trim(), icon, enabled ? 1 : 0]);
          } else {
            const [result] = await conn.execute('UPDATE categories SET label=?,icon=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?', [
              label.trim(),
              icon,
              enabled ? 1 : 0,
              id,
              revision,
            ]);
            if (result.affectedRows !== 1) fail('Kategori sudah berubah. Muat ulang terlebih dahulu.', 409);
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
          if (e.code === 'ER_DUP_ENTRY') fail('Nama atau ID kategori sudah digunakan.', 409);
          throw e;
        }
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'category_save', id]);
      });
      res.json({ saved: true });
      return;
    }

    if (action === 'list' && method === 'GET') {
      const rows = await query(pool, 'SELECT payload,revision FROM facilities ORDER BY updated_at DESC,id');
      res.json({ facilities: rows.map((r) => ({ facility: JSON.parse(r.payload), revision: Number(r.revision) })) });
      return;
    }

    if (action === 'plot_list' && method === 'GET') {
      const rows = await query(pool, 'SELECT payload,revision FROM plots ORDER BY updated_at DESC,id');
      res.json({ plots: rows.map((r) => ({ plot: JSON.parse(r.payload), revision: Number(r.revision) })) });
      return;
    }

    if (action === 'plot_delete' && method === 'POST') {
      const { id, revision } = input;
      if (typeof id !== 'string' || !Number.isInteger(revision) || revision < 1) fail('Data penghapusan bidang tidak valid.', 422);
      await withTransaction(async (conn) => {
        const [result] = await conn.execute('DELETE FROM plots WHERE id=? AND revision=?', [id, revision]);
        if (result.affectedRows !== 1) fail('Bidang sudah berubah atau sudah dihapus. Muat ulang.', 409);
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'plot_delete', id]);
      });
      res.json({ deleted: true });
      return;
    }

    if (action === 'plot_save' && method === 'POST') {
      if (typeof input.plot !== 'object' || input.plot === null || Array.isArray(input.plot)) fail('Data bidang diperlukan.', 422);
      const revision = input.revision;
      if (!Number.isInteger(revision) || revision < 0) fail('Revisi tidak valid.', 422);
      const plot = await validatePlot(pool, input.plot);
      await withTransaction(async (conn) => {
        if (revision === 0) {
          try {
            await query(conn, 'INSERT INTO plots(id,payload,status) VALUES (?,?,?)', [plot.id, JSON.stringify(plot), plot.status]);
          } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') fail('ID bidang sudah ada.', 409);
            throw e;
          }
        } else {
          const [result] = await conn.execute('UPDATE plots SET payload=?,status=?,revision=revision+1 WHERE id=? AND revision=?', [
            JSON.stringify(plot),
            plot.status,
            plot.id,
            revision,
          ]);
          if (result.affectedRows !== 1) fail('Bidang sudah diubah pada sesi lain. Muat ulang.', 409);
        }
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, revision === 0 ? 'plot_create' : 'plot_update', plot.id]);
      });
      res.json({ plot, revision: revision + 1 });
      return;
    }

    if (action === 'infra_list' && method === 'GET') {
      const rows = await query(pool, 'SELECT payload,revision FROM infrastructure ORDER BY updated_at DESC,id');
      res.json({ infrastructure: rows.map((r) => ({ item: JSON.parse(r.payload), revision: Number(r.revision) })) });
      return;
    }

    if (action === 'infra_delete' && method === 'POST') {
      const { id, revision } = input;
      if (typeof id !== 'string' || !Number.isInteger(revision) || revision < 1) fail('Data penghapusan infrastruktur tidak valid.', 422);
      await withTransaction(async (conn) => {
        const [result] = await conn.execute('DELETE FROM infrastructure WHERE id=? AND revision=?', [id, revision]);
        if (result.affectedRows !== 1) fail('Infrastruktur sudah berubah atau sudah dihapus. Muat ulang.', 409);
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'infra_delete', id]);
      });
      res.json({ deleted: true });
      return;
    }

    if (action === 'infra_categories' && method === 'GET') {
      res.json({ categories: await query(pool, 'SELECT * FROM infrastructure_categories ORDER BY label') });
      return;
    }

    if (action === 'infra_category_save' && method === 'POST') {
      const { id, label, color, enabled, revision } = input;
      if (
        typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(id) ||
        typeof label !== 'string' || !label.trim() || label.length > 80 ||
        typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color) ||
        typeof enabled !== 'boolean' || !Number.isInteger(revision) || revision < 0
      ) fail('Jenis aset tidak valid.', 422);
      if (!enabled) {
        const rows = await query(pool, 'SELECT payload FROM infrastructure');
        for (const raw of rows) if (JSON.parse(raw.payload).category === id) fail('Jenis aset masih digunakan oleh data infrastruktur.', 422);
      }
      try {
        if (revision === 0) {
          await query(pool, 'INSERT INTO infrastructure_categories(id,label,color,enabled) VALUES (?,?,?,?)', [id, label.trim(), color.toLowerCase(), enabled ? 1 : 0]);
        } else {
          const [result] = await pool.execute('UPDATE infrastructure_categories SET label=?,color=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?', [
            label.trim(),
            color.toLowerCase(),
            enabled ? 1 : 0,
            id,
            revision,
          ]);
          if (result.affectedRows !== 1) fail('Jenis aset sudah berubah. Muat ulang.', 409);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (e.code === 'ER_DUP_ENTRY') fail('Nama atau ID jenis aset sudah digunakan.', 409);
        throw e;
      }
      await query(pool, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'infra_type_save', id]);
      res.json({ saved: true });
      return;
    }

    if (action === 'infra_save' && method === 'POST') {
      if (typeof input.item !== 'object' || input.item === null || Array.isArray(input.item)) fail('Data infrastruktur diperlukan.', 422);
      const revision = input.revision;
      if (!Number.isInteger(revision) || revision < 0) fail('Revisi tidak valid.', 422);
      const item = await validateInfrastructure(pool, input.item);
      await withTransaction(async (conn) => {
        if (revision === 0) {
          try {
            await query(conn, 'INSERT INTO infrastructure(id,payload,status) VALUES (?,?,?)', [item.id, JSON.stringify(item), item.status]);
          } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') fail('ID infrastruktur sudah ada.', 409);
            throw e;
          }
        } else {
          const [result] = await conn.execute('UPDATE infrastructure SET payload=?,status=?,revision=revision+1 WHERE id=? AND revision=?', [
            JSON.stringify(item),
            item.status,
            item.id,
            revision,
          ]);
          if (result.affectedRows !== 1) fail('Data sudah berubah. Muat ulang.', 409);
        }
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, revision === 0 ? 'infra_create' : 'infra_update', item.id]);
      });
      res.json({ item, revision: revision + 1 });
      return;
    }

    if (action === 'infra_import' && method === 'POST') {
      const items = input.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 1000) fail('Import harus berisi 1 sampai 1.000 data.', 422);
      const validated = [];
      for (let index = 0; index < items.length; index++) {
        const candidate = items[index];
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) fail(`Baris ${index + 1} tidak valid.`, 422);
        try {
          validated.push(await validateInfrastructure(pool, candidate));
        } catch (e) {
          fail(`Baris ${index + 1}: ${e.message}`, 422);
        }
      }
      await withTransaction(async (conn) => {
        for (const item of validated) {
          try {
            await query(conn, 'INSERT INTO infrastructure(id,payload,status) VALUES (?,?,?)', [item.id, JSON.stringify(item), item.status]);
          } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') fail('Ada ID infrastruktur yang sudah digunakan.', 409);
            throw e;
          }
          await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'infra_import', item.id]);
        }
      });
      res.json({ imported: validated.length });
      return;
    }

    if (action === 'save' && method === 'POST') {
      if (typeof input.facility !== 'object' || input.facility === null || Array.isArray(input.facility)) fail('Data fasilitas diperlukan.', 422);
      const revision = input.revision;
      if (!Number.isInteger(revision) || revision < 0) fail('Revisi tidak valid.', 422);
      let savedFacility, savedRevision;
      await withTransaction(async (conn) => {
        await query(conn, 'SELECT id FROM categories ORDER BY id FOR UPDATE');
        const all = (await query(conn, 'SELECT payload FROM facilities ORDER BY id FOR UPDATE')).map((r) => JSON.parse(r.payload));
        let candidate = { ...input.facility };
        const parentId = candidate.parent_id ?? null;
        if (parentId) {
          const parent = all.find((r) => r.id === parentId) ?? null;
          if (!parent || parent.category !== 'food_court' || parent.parent_id || parentId === candidate.id || candidate.category !== 'resto_cafe') {
            fail('Tenant harus berupa resto/kantin dengan induk Food Court yang valid.', 422);
          }
          if (candidate.status === 'published' && parent.status !== 'published') fail('Terbitkan food court induk terlebih dahulu.', 422);
          candidate = { ...candidate, latitude: parent.latitude, longitude: parent.longitude, address: parent.address };
        }
        const f = await validateFacility(conn, candidate);
        for (const child of all) {
          if (child.parent_id === f.id) {
            if (f.category !== 'food_court' || (child.status === 'published' && f.status !== 'published')) {
              fail('Food court masih memiliki tenant. Pertahankan kategori; arsipkan tenant terbit sebelum menonaktifkan induk.', 422);
            }
          }
        }
        if (revision === 0) {
          try {
            await query(conn, 'INSERT INTO facilities(id,payload,status) VALUES (?,?,?)', [f.id, JSON.stringify(f), f.status]);
          } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') fail('ID sudah ada. Muat ulang daftar.', 409);
            throw e;
          }
        } else {
          const [result] = await conn.execute('UPDATE facilities SET payload=?,status=?,revision=revision+1 WHERE id=? AND revision=?', [
            JSON.stringify(f),
            f.status,
            f.id,
            revision,
          ]);
          if (result.affectedRows !== 1) fail('Data sudah diubah pada sesi lain. Muat ulang daftar sebelum menyimpan.', 409);
        }
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, revision === 0 ? 'create' : 'update', f.id]);
        savedFacility = f;
        savedRevision = revision + 1;
      });
      res.json({ facility: savedFacility, revision: savedRevision });
      return;
    }

    if (action === 'delete' && method === 'POST') {
      const { id, revision } = input;
      if (typeof id !== 'string' || !Number.isInteger(revision) || revision < 1) fail('Data penghapusan fasilitas tidak valid.', 422);
      await withTransaction(async (conn) => {
        const rows = await query(conn, 'SELECT payload FROM facilities ORDER BY id FOR UPDATE');
        for (const raw of rows) {
          const row = JSON.parse(raw.payload);
          if (row.parent_id === id) fail('Fasilitas masih memiliki tenant. Hapus atau pindahkan tenant terlebih dahulu.', 422);
        }
        const [result] = await conn.execute('DELETE FROM facilities WHERE id=? AND revision=?', [id, revision]);
        if (result.affectedRows !== 1) fail('Fasilitas sudah berubah atau sudah dihapus. Muat ulang.', 409);
        await query(conn, 'INSERT INTO audit_log(admin_id,action,facility_id) VALUES (?,?,?)', [session.admin_id, 'delete', id]);
      });
      res.json({ deleted: true });
      return;
    }

    fail('Rute atau metode tidak tersedia.', 404);
  } catch (e) {
    if (e instanceof ApiError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error('MM2100 API:', e);
    res.status(503).json({ error: 'Layanan database belum tersedia. Hubungi pengelola.' });
  }
}

router.get('/api/index.php', handleApi);
router.post('/api/index.php', handleApi);
router.get('/facilities.json', (req, res) => {
  req.query.action = 'public';
  handleApi(req, res);
});

export default router;
