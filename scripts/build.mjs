import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      const data = await readFile(srcPath);
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, data);
    }
  }
}

async function buildAssets() {
  const outDir = 'web/dist';
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: ['web/app.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2018'],
    minify: true,
    outfile: join(outDir, 'app.min.js')
  });

  await build({
    entryPoints: ['web/styles.css'],
    bundle: true,
    minify: true,
    outfile: join(outDir, 'styles.min.css')
  });

  const srcIndex = await readFile('web/index.html', 'utf8');
  const outIndex = srcIndex
    .replace('href="styles.css"', 'href="styles.min.css"')
    .replace(/<script\s+src="app\.js"[^>]*><\/script>/, '<script src="app.min.js"></script>');
  await writeFile(join(outDir, 'index.html'), outIndex);

  if (existsSync('web/assets')) {
    await copyDir('web/assets', join(outDir, 'assets'));
  }
}

buildAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
