// Runs `npm install` in every service and in the frontend.
// MONGOMS_DISABLE_POSTINSTALL stops each service from downloading its own MongoDB copy;
// mock mode downloads it once into .mongodb-binaries on first start instead.
const { spawnSync } = require('child_process');
const path = require('path');
const { root, allServices, gateway } = require('./services');

const dirs = [ ...allServices.map(s => s.name), gateway.name, 'frontend' ];
const failed = [];

for (const dir of dirs) {
    console.log(`\n=== npm install (${dir}) ===`);
    const result = spawnSync('npm install', {
        cwd: path.join(root, dir),
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, MONGOMS_DISABLE_POSTINSTALL: '1' },
    });
    if (result.status !== 0) failed.push(dir);
}

if (failed.length) {
    console.error(`\nnpm install failed in: ${failed.join(', ')}`);
    process.exit(1);
}
console.log('\nAll dependencies installed.');
