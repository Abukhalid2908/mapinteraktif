import { cp, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['dist/client/index.html', 'admin-dist/index.html'])
  await access(path.join(root, file));

const output = path.join(root, 'outputs', 'azure-' + new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
await cp(path.join(root, 'dist/client'), path.join(output, 'dist/client'), { recursive: true });
await cp(path.join(root, 'admin-dist'), path.join(output, 'admin-dist'), { recursive: true });

await mkdir(path.join(output, 'backend'));
for (const file of ['api.mjs', 'crypto-utils.mjs', 'db.mjs', 'errors.mjs', 'server.mjs', 'session.mjs', 'validate.mjs', 'schema.sql', 'categories.sql', 'access-roles.sql']) {
  await cp(path.join(root, 'backend', file), path.join(output, 'backend', file));
}

await mkdir(path.join(output, 'tools'));
await cp(path.join(root, 'tools/admin-account.mjs'), path.join(output, 'tools/admin-account.mjs'));
await cp(path.join(root, 'tools/migrate-schema.mjs'), path.join(output, 'tools/migrate-schema.mjs'));

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(output, 'package.json'),
  JSON.stringify(
    {
      name: 'mm2100-map-backend',
      private: true,
      type: 'module',
      engines: pkg.engines,
      scripts: { start: 'node backend/server.mjs' },
      dependencies: {
        express: pkg.dependencies.express,
        mysql2: pkg.dependencies.mysql2,
        bcryptjs: pkg.dependencies.bcryptjs,
      },
    },
    null,
    2,
  ) + '\n',
);

console.log(output);
