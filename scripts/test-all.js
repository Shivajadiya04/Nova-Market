// Runs the existing Jest suites of the services that have them.
const { spawnSync } = require('child_process');
const path = require('path');
const { root, mongoBinaryDir } = require('./services');

const results = [];

for (const dir of [ 'auth', 'product', 'cart', 'order' ]) {
    console.log(`\n=== npm test (${dir}) ===`);
    const result = spawnSync('npm test', {
        cwd: path.join(root, dir),
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, MONGOMS_DOWNLOAD_DIR: mongoBinaryDir },
    });
    results.push([ dir, result.status === 0 ? 'passed' : 'FAILED' ]);
}

console.log('\nSummary:');
results.forEach(([ dir, status ]) => console.log(`  ${dir.padEnd(10)} ${status}`));
process.exit(results.some(([ , status ]) => status !== 'passed') ? 1 : 0);
