// Creates missing .env files from each .env.example, adds keys that were introduced in an
// .env.example after the .env was created, and fills the shared secrets (JWT_SECRET,
// INTERNAL_SERVICE_TOKEN) with one random development value each. Existing values are never
// overwritten and secrets are never printed. For local development only: production values
// are set on the hosting platform (see render.yaml).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { root, allServices } = require('./services');

const dirs = [ ...allServices.map(s => s.name), 'gateway', 'frontend' ];
const SHARED_SECRETS = [ 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN' ];

function readValue(file, key) {
    if (!fs.existsSync(file)) return '';
    const match = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[ 1 ].trim() : '';
}

// Reuse a secret that is already configured somewhere so all services keep agreeing
const secrets = Object.fromEntries(SHARED_SECRETS.map(key => [
    key,
    dirs.map(dir => readValue(path.join(root, dir, '.env'), key)).find(Boolean) || crypto.randomBytes(48).toString('hex'),
]));

for (const dir of dirs) {
    const example = path.join(root, dir, '.env.example');
    const target = path.join(root, dir, '.env');

    if (!fs.existsSync(example)) continue;

    const notes = [];
    if (!fs.existsSync(target)) {
        fs.copyFileSync(example, target);
        notes.push('created');
    }

    let content = fs.readFileSync(target, 'utf8');

    const exampleLines = fs.readFileSync(example, 'utf8').split(/\r?\n/);
    const added = exampleLines.filter(line => /^[A-Z0-9_]+=/.test(line) && !new RegExp(`^${line.split('=')[ 0 ]}=`, 'm').test(content));
    if (added.length) {
        content = `${content.replace(/\s*$/, '\n')}\n# Added by npm run setup from .env.example\n${added.join('\n')}\n`;
        notes.push(`added ${added.map(l => l.split('=')[ 0 ]).join(', ')}`);
    }

    for (const key of SHARED_SECRETS) {
        const empty = new RegExp(`^${key}=\\s*$`, 'm');
        if (empty.test(content)) {
            content = content.replace(empty, `${key}=${secrets[ key ]}`);
            notes.push(`filled ${key}`);
        }
    }

    fs.writeFileSync(target, content);
    console.log(`${dir}/.env: ${notes.length ? notes.join('; ') : 'up to date'}`);
}
