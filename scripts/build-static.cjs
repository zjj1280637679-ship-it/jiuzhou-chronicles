// Assemble only public game assets. No bundler, API functions or credentials.
const fs = require('node:fs/promises');
const path = require('node:path');
const { PUBLIC_ROOT_FILES, publicPathAllowed } = require('../server.js');

async function buildStatic({ root = path.resolve(__dirname, '..') } = {}) {
  const sourceRoot = await fs.realpath(root);
  const output = path.resolve(sourceRoot, 'dist');
  // The only directory this build may replace is this checkout's own dist/.
  if (path.dirname(output) !== sourceRoot || path.basename(output) !== 'dist') {
    throw new Error('Invalid static output directory.');
  }
  try {
    if ((await fs.lstat(output)).isSymbolicLink()) throw new Error('Static output cannot be a symbolic link.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  const copied = [];

  async function copyAsset(relativePath) {
    if (!publicPathAllowed(relativePath)) return;
    const source = path.join(sourceRoot, relativePath);
    let stats;
    try { stats = await fs.lstat(source); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (!stats.isFile() || stats.isSymbolicLink()) return;
    const destination = path.join(output, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    copied.push(relativePath);
  }

  async function copyDirectory(relativePath) {
    if (!publicPathAllowed(relativePath + '/__asset__.js')) return;
    let entries;
    try {
      const source = path.join(sourceRoot, relativePath);
      const stats = await fs.lstat(source);
      if (!stats.isDirectory() || stats.isSymbolicLink()) return;
      entries = await fs.readdir(source, { withFileTypes: true });
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const relative = relativePath + '/' + entry.name;
      if (entry.isDirectory()) await copyDirectory(relative);
      else if (entry.isFile()) await copyAsset(relative);
    }
  }

  for (const filename of PUBLIC_ROOT_FILES) await copyAsset(filename);
  for (const directory of ['data', 'harness', 'assets']) await copyDirectory(directory);
  if (!copied.includes('index.html')) throw new Error('Missing public index.html.');
  return { output, files: copied.sort() };
}

if (require.main === module) {
  buildStatic().then(result => {
    console.log('Static game ready in dist/: ' + result.files.length + ' public assets.');
  }).catch(error => {
    console.error('Static build failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildStatic };
