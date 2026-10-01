// Integration suite uses a disposable database/account, never the application data.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = 'mm2100_test_' + crypto.randomBytes(5).toString('hex');
const dbPassword = crypto.randomBytes(24).toString('hex');
const env = {
  ...process.env,
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: id,
  DB_USER: id,
  DB_PASSWORD: dbPassword,
  APP_ORIGIN: 'http://127.0.0.1:8087',
  ALLOW_LOCAL_SETUP: '1',
  PORT: '8087',
  HOST: '127.0.0.1',
};
if (!/^mm2100_test_[a-f0-9]{10}$/.test(id)) throw Error('unexpected id shape');
let server;
let rootConn;
(async () => {
  try {
    rootConn = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: '', multipleStatements: true });
    await rootConn.query('CREATE DATABASE `' + id + '` CHARACTER SET utf8mb4');
    await rootConn.query("CREATE USER '" + id + "'@'127.0.0.1' IDENTIFIED BY ?", [dbPassword]);
    await rootConn.query('GRANT SELECT,INSERT,UPDATE,DELETE ON `' + id + '`.* TO \'' + id + "'@'127.0.0.1'");
    await rootConn.query('USE `' + id + '`');
    await rootConn.query(await readFile(path.join(root, 'backend/schema.sql'), 'utf8'));
    server = spawn(process.execPath, ['backend/server.mjs'], {
      cwd: root,
      env,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', (code) =>
        reject(Error('Test server exited before it was ready (code ' + code + ')')),
      );
      setTimeout(resolve, 300);
    });
    const origin = env.APP_ORIGIN;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (server.exitCode !== null) throw Error('Test server port unavailable');
      try {
        const r = await fetch(origin + '/api/index.php?action=session');
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready);
    function client() {
      let cookie = '',
        csrf = '';
      return {
        get cookie() {
          return cookie;
        },
        get csrf() {
          return csrf;
        },
        async request(action, body, expected = 200, headers = {}) {
          const r = await fetch(origin + '/api/index.php?action=' + action, {
            method: body ? 'POST' : 'GET',
            headers: {
              Cookie: cookie,
              ...(body
                ? {
                    'Content-Type': 'application/json',
                    Origin: origin,
                    'X-CSRF-Token': csrf,
                  }
                : {}),
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          const set = r.headers.get('set-cookie');
          if (set) cookie = set.split(';')[0];
          const data = await r.json();
          assert.equal(r.status, expected, JSON.stringify(data));
          if (data.csrf) csrf = data.csrf;
          return data;
        },
      };
    }
    const c = client();
    assert.equal((await c.request('session')).setup, true);
    await c.request('list', null, 401);
    const credentials = {
      email: 'admin@example.test',
      password: crypto.randomBytes(16).toString('hex'),
    };
    await c.request('setup', credentials, 403, { 'X-CSRF-Token': 'invalid' });
    await c.request('setup', credentials, 403, {
      Origin: 'https://attacker.invalid',
    });
    await c.request('setup', { ...credentials, password: 'short' }, 422);
    const guest = c.cookie;
    await c.request('setup', credentials);
    assert.notEqual(c.cookie, guest);
    const denied = await fetch(origin + '/api/index.php?action=list', {
      headers: { Cookie: guest },
    });
    assert.equal(denied.status, 401);
    await c.request(
      'setup',
      { ...credentials, email: 'second@example.test' },
      409,
    );
    const facility = {
      id: 'fixture',
      name: 'Uji fasilitas',
      category: 'resto_cafe',
      latitude: -6.297,
      longitude: 107.099,
      address: 'Alamat uji',
      source: 'Verifikasi uji',
      tags: [],
      menu_keywords: [],
      opening_hours: null,
      phone: null,
      website: null,
      verified_at: null,
      status: 'draft',
    };
    await c.request('save', { facility, revision: 0 });
    assert.equal((await c.request('public')).facilities.length, 0);
    await c.request('save', { facility, revision: 0 }, 409);
    await c.request(
      'save',
      { facility: { ...facility, status: 'published' }, revision: 1 },
      422,
    );
    await c.request(
      'save',
      { facility: { ...facility, latitude: 100 }, revision: 1 },
      422,
    );
    await c.request(
      'save',
      {
        facility: { ...facility, website: 'javascript:alert(1)' },
        revision: 1,
      },
      422,
    );
    await c.request(
      'save',
      { facility: { ...facility, verified_at: '2026-02-30' }, revision: 1 },
      422,
    );
    await c.request(
      'save',
      { facility: { ...facility, id: "bad' OR 1=1" }, revision: 1 },
      422,
    );
    const published = {
      ...facility,
      status: 'published',
      verified_at: new Date().toISOString().slice(0, 10),
      internal_secret: 'must not be stored',
    };
    await c.request('save', { facility: published, revision: 1 });
    const data = await c.request('public');
    assert.equal(data.facilities.length, 1);
    assert.equal(data.facilities[0].internal_secret, undefined);
    await c.request('save', { facility, revision: 1 }, 409);
    await c.request('save', {
      facility: { ...facility, status: 'archived' },
      revision: 2,
    });
    assert.equal((await c.request('public')).facilities.length, 0);
    const saved = (await c.request('list')).facilities[0];
    assert.equal(saved.revision, 3);
    assert.equal(saved.facility.status, 'archived');
    const cookie = c.cookie;
    await c.request('logout', { logout: true });
    await c.request('list', null, 401);
    assert.equal(
      (
        await fetch(origin + '/api/index.php?action=list', {
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
    await c.request('login', { ...credentials, password: 'wrong' }, 401);
    await c.request('login', credentials);
    const [[{ password_hash: storedHash }]] = await rootConn.query('SELECT password_hash FROM `' + id + '`.admins');
    const [[{ n: auditCount }]] = await rootConn.query('SELECT COUNT(*) n FROM `' + id + '`.audit_log');
    assert.equal(/^\$2[aby]\$/.test(storedHash), true);
    assert.equal(Number(auditCount), 3);
    const categoryInput = {
      id: 'cat_test',
      label: 'Belanja',
      icon: 'public_facility',
      enabled: true,
      revision: 0,
    };
    const stranger = client();
    await stranger.request('session');
    await stranger.request('categories', null, 401);
    await stranger.request('category_save', categoryInput, 401);
    await c.request('category_save', categoryInput, 403, {
      'X-CSRF-Token': 'wrong',
    });
    await c.request(
      'category_save',
      { ...categoryInput, icon: '<svg onload=alert(1)>' },
      422,
    );
    await c.request('category_save', categoryInput);
    await c.request(
      'category_save',
      { ...categoryInput, id: 'cat_duplicate' },
      409,
    );
    assert.ok(
      (await c.request('public')).categories.some((k) => k.id === 'cat_test'),
    );
    await c.request('save', {
      facility: { ...facility, id: 'shopping', category: 'cat_test' },
      revision: 0,
    });
    await c.request(
      'category_save',
      { ...categoryInput, enabled: false, revision: 1 },
      422,
    );
    await c.request('category_save', {
      ...categoryInput,
      label: 'Minimarket',
      icon: 'atm',
      revision: 1,
    });
    await c.request('category_save', { ...categoryInput, revision: 1 }, 409);
    await c.request('save', {
      facility: { ...facility, id: 'shopping', status: 'archived' },
      revision: 1,
    });
    await c.request('category_save', {
      ...categoryInput,
      label: 'Minimarket',
      enabled: false,
      revision: 2,
    });
    assert.ok(
      !(await c.request('public')).categories.some((k) => k.id === 'cat_test'),
    );
    await c.request(
      'save',
      {
        facility: { ...facility, id: 'new-shopping', category: 'cat_test' },
        revision: 0,
      },
      422,
    );
    console.log(
      'PASS: category CRUD, unique names, icon allowlist, authorization, references, revisions and disabled categories.',
    );
    const court = {
      ...facility,
      id: 'court',
      name: 'Food Court A',
      category: 'food_court',
      status: 'published',
      verified_at: new Date().toISOString().slice(0, 10),
    };
    const tenant = {
      ...court,
      id: 'tenant',
      name: 'Bakso tenant',
      category: 'resto_cafe',
      parent_id: 'court',
      unit_number: 'A-05',
      latitude: 0,
      longitude: 0,
      address: '',
    };
    await c.request(
      'save',
      { facility: { ...tenant, parent_id: 'missing' }, revision: 0 },
      422,
    );
    await c.request(
      'save',
      { facility: { ...tenant, parent_id: 'fixture' }, revision: 0 },
      422,
    );
    await c.request('save', { facility: court, revision: 0 });
    await c.request('save', { facility: tenant, revision: 0 });
    const inherited = (await c.request('public')).facilities.find(
      (f) => f.id === 'tenant',
    );
    assert.equal(inherited.latitude, court.latitude);
    assert.equal(inherited.address, court.address);
    assert.equal(inherited.unit_number, 'A-05');
    await c.request(
      'save',
      { facility: { ...court, status: 'archived' }, revision: 1 },
      422,
    );
    await c.request(
      'save',
      { facility: { ...court, category: 'hotel' }, revision: 1 },
      422,
    );
    await c.request('save', {
      facility: { ...court, latitude: -6.3 },
      revision: 1,
    });
    assert.equal(
      (await c.request('public')).facilities.find((f) => f.id === 'tenant')
        .latitude,
      -6.3,
    );
    await c.request('save', {
      facility: { ...tenant, status: 'archived' },
      revision: 1,
    });
    await c.request('save', {
      facility: { ...court, status: 'archived' },
      revision: 2,
    });
    await c.request('save', { facility: tenant, revision: 2 }, 422);
    assert.equal((await c.request('public')).facilities.length, 0);
    console.log(
      'PASS: tenant parent validation, coordinate/address inheritance, unit number, parent updates and publication lifecycle.',
    );
    if (process.env.PLAYWRIGHT_PATH) {
      const { chromium } = await import(
        pathToFileURL(process.env.PLAYWRIGHT_PATH).href
      );
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      });
      try {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
        });
        await context.addCookies([
          {
            name: 'mm2100_session',
            value: c.cookie.split('=')[1],
            url: origin,
            httpOnly: true,
            sameSite: 'Strict',
          },
        ]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(origin + '/admin/');
        await page
          .getByRole('heading', { name: 'Data fasilitas', exact: true })
          .waitFor();
        await page
          .getByRole('button', { name: 'Kelola kategori', exact: true })
          .click();
        await page
          .getByRole('button', { name: '+ Kategori baru', exact: true })
          .click();
        await page
          .getByLabel('Nama kategori', { exact: true })
          .fill('Belanja UI');
        await page.locator('#category-icon').selectOption('atm');
        await page
          .getByRole('button', { name: 'Simpan kategori', exact: true })
          .click();
        await page
          .locator('#category-list button')
          .filter({ hasText: 'Belanja UI · Aktif' })
          .waitFor();
        assert.equal(
          await page
            .locator('#f-category option')
            .filter({ hasText: 'Belanja UI' })
            .count(),
          1,
        );
        const uiCategory = (await c.request('categories')).categories.find(
          (k) => k.label === 'Belanja UI',
        );
        const customFacility = {
          ...facility,
          id: 'custom_ui',
          category: uiCategory.id,
          name: 'Toko UI',
          status: 'published',
          verified_at: new Date().toISOString().slice(0, 10),
        };
        await c.request('save', { facility: customFacility, revision: 0 });
        const categoryMap = await browser.newPage();
        await categoryMap.goto(origin + '/');
        await categoryMap
          .getByRole('button', { name: 'Jelajahi Belanja UI', exact: true })
          .click();
        await categoryMap.getByRole('button', { name: /Toko UI/ }).click();
        await categoryMap
          .getByRole('dialog')
          .getByRole('heading', { name: 'Toko UI', exact: true })
          .waitFor();
        await categoryMap.close();
        await c.request('save', {
          facility: {
            ...customFacility,
            category: 'resto_cafe',
            status: 'archived',
          },
          revision: 1,
        });
        await page
          .getByLabel('Nama kategori', { exact: true })
          .fill('Belanja baru UI');
        await page
          .getByRole('button', { name: 'Simpan kategori', exact: true })
          .click();
        await page
          .locator('#category-list button')
          .filter({ hasText: 'Belanja baru UI · Aktif' })
          .waitFor();
        await page.locator('#category-enabled').selectOption('0');
        await page
          .getByRole('button', { name: 'Simpan kategori', exact: true })
          .click();
        await page
          .locator('#category-list button')
          .filter({ hasText: 'Belanja baru UI · Nonaktif' })
          .waitFor();
        assert.equal(
          await page
            .locator('#f-category option')
            .filter({ hasText: 'Belanja baru UI' })
            .count(),
          0,
        );
        await page.screenshot({
          path: path.join(root, 'outputs/category-manager.png'),
          fullPage: true,
        });
        await page
          .getByRole('button', { name: 'Kelola kategori', exact: true })
          .click();
        console.log(
          'PASS: category admin add/rename/disable and custom category/facility on public map.',
        );
        await page
          .getByRole('button', { name: '+ Tambah fasilitas', exact: true })
          .click();
        await page
          .getByLabel('Nama fasilitas', { exact: true })
          .fill('Uji browser');
        await page
          .getByLabel('Alamat', { exact: true })
          .fill('Alamat pengujian');
        await page
          .getByLabel('Sumber verifikasi', { exact: true })
          .fill('Fixture');
        await page
          .getByRole('button', { name: 'Simpan ke database', exact: true })
          .click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Tersimpan ke database' })
          .waitFor();
        assert.equal((await c.request('public')).facilities.length, 0);
        await page
          .getByLabel('Tanggal verifikasi', { exact: true })
          .fill(new Date().toISOString().slice(0, 10));
        await page
          .getByLabel('Status', { exact: true })
          .selectOption('published');
        await page
          .getByRole('button', { name: 'Simpan ke database', exact: true })
          .click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Tersimpan dan terbit' })
          .waitFor();
        assert.equal((await c.request('public')).facilities.length, 1);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: path.join(root, 'outputs/admin-mobile.png'),
          fullPage: true,
        });
        await page
          .getByLabel('Status', { exact: true })
          .selectOption('archived');
        await page
          .getByRole('button', { name: 'Simpan ke database', exact: true })
          .click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Status: Arsip' })
          .waitFor();
        assert.equal((await c.request('public')).facilities.length, 0);
        assert.deepEqual(errors, []);
        await page.setViewportSize({ width: 1280, height: 900 });
        for (const isTenant of [false, true]) {
          await page
            .getByRole('button', { name: '+ Tambah fasilitas', exact: true })
            .click();
          await page
            .getByLabel('Nama fasilitas', { exact: true })
            .fill(isTenant ? 'Tenant UI' : 'Food Court UI');
          if (isTenant) {
            await page
              .getByLabel('Food court induk', { exact: true })
              .selectOption({ label: 'Food Court UI · Terbit' });
            await page
              .getByLabel('Nomor kios / unit', { exact: true })
              .fill('12');
            assert.equal(
              await page.getByLabel('Alamat', { exact: true }).inputValue(),
              'Alamat food court',
            );
            assert.equal(
              await page
                .getByLabel('Latitude', { exact: true })
                .getAttribute('readonly'),
              '',
            );
          } else {
            await page
              .getByLabel('Kategori', { exact: true })
              .selectOption('food_court');
            await page
              .getByLabel('Alamat', { exact: true })
              .fill('Alamat food court');
          }
          await page
            .getByLabel('Sumber verifikasi', { exact: true })
            .fill('Pengujian');
          await page
            .getByLabel('Tanggal verifikasi', { exact: true })
            .fill(new Date().toISOString().slice(0, 10));
          await page
            .getByLabel('Status', { exact: true })
            .selectOption('published');
          await page
            .getByRole('button', { name: 'Simpan ke database', exact: true })
            .click();
          await page
            .getByRole('status')
            .filter({ hasText: 'Tersimpan dan terbit' })
            .waitFor();
          await page
            .locator('#list button')
            .filter({ hasText: isTenant ? 'Tenant UI' : 'Food Court UI' })
            .waitFor();
        }
        const mapPage = await browser.newPage();
        await mapPage.goto(origin + '/');
        await mapPage.getByRole('button', { name: '2D', exact: true }).click();
        await mapPage.locator('.category-pin').first().waitFor();
        assert.equal(await mapPage.locator('.category-pin').count(), 1);
        await mapPage
          .getByPlaceholder('Cari tempat, fasilitas, atau menu…')
          .fill('Tenant UI');
        await mapPage.getByRole('button', { name: /Tenant UI/ }).click();
        await mapPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Di dalam Food Court UI' })
          .click();
        await mapPage
          .getByRole('dialog')
          .getByRole('heading', { name: 'Kantin & resto (1)' })
          .waitFor();
        await mapPage
          .getByRole('dialog')
          .getByRole('button', { name: /Tenant UI/ })
          .click();
        await mapPage
          .getByRole('dialog')
          .getByText(/Kios \/ unit 12/)
          .waitFor();
        await mapPage.screenshot({
          path: path.join(root, 'outputs/tenant-detail.png'),
        });
        console.log(
          'PASS: admin food court/tenant forms, inherited location, one map marker, tenant search and parent/detail navigation.',
        );
        const loginPage = await browser.newPage();
        await loginPage.goto(origin + '/admin/');
        await loginPage
          .getByRole('heading', { name: 'Masuk ke pengelola' })
          .waitFor();
        await loginPage.screenshot({
          path: path.join(root, 'outputs/admin-login.png'),
        });
        console.log(
          'PASS: browser admin draft/publish/archive flow, login form, responsive layout, no page errors.',
        );
      } finally {
        await browser.close();
      }
    }
    await c.request('logout', { logout: true });
    for (let i = 0; i < 8; i++)
      await c.request('login', { ...credentials, password: 'wrong' }, 401);
    await c.request('login', credentials, 429);
    for (const route of [
      '/backend/config.local.json',
      '/backend/server.mjs',
      '/.git/config',
      '/admin/../../backend/config.local.json',
    ])
      assert.equal((await fetch(origin + route)).status, 404);
    console.log(
      'PASS: setup, login, hashed password, session rotation/revocation, CSRF/origin, permissions, validation, publish/archive, conflict detection, audit, throttling, secret-path isolation.',
    );
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((r) => server.once('exit', r));
    }
    if (rootConn) {
      await rootConn.query('DROP DATABASE IF EXISTS `' + id + '`');
      await rootConn.query("DROP USER IF EXISTS '" + id + "'@'127.0.0.1'");
      await rootConn.end();
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
