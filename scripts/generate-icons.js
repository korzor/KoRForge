let sharp;
try {
  sharp = require(process.env.SHARP_PATH || 'sharp');
} catch (err) {
  console.error('El módulo "sharp" no está instalado. Ejecuta: npm install --save-dev sharp');
  process.exit(1);
}
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const inputJpg = path.join(projectDir, 'assets', 'korforge-icon-source.jpg');

/**
 * Genera un archivo .ico estándar compatible 100% con Windows Explorer y GDI.
 * Tamaños estándar (< 256): BITMAPINFOHEADER (DIB) sin comprimir + BGRA bottom-up + AND mask.
 * Tamaño 256x256: PNG embebido (estándar Windows Vista/7/10/11).
 */
async function createWindowsIco(masterPngBuffer) {
  const sizes = [16, 32, 48, 64, 128, 256];
  const entries = [];

  for (const s of sizes) {
    if (s === 256) {
      // 256x256: PNG directo
      const pngBuf = await sharp(masterPngBuffer).resize(256, 256).png().toBuffer();
      entries.push({
        width: 256,
        height: 256,
        data: pngBuf,
        bpp: 32
      });
    } else {
      // DIB format: BITMAPINFOHEADER (40 bytes) + BGRA bottom-up + 1-bit AND mask
      const { data } = await sharp(masterPngBuffer).resize(s, s).raw().toBuffer({ resolveWithObject: true });
      const bih = Buffer.alloc(40);
      bih.writeUInt32LE(40, 0); // biSize
      bih.writeInt32LE(s, 4);   // biWidth
      bih.writeInt32LE(s * 2, 8); // biHeight * 2 requerido por formato ICO
      bih.writeUInt16LE(1, 12); // biPlanes
      bih.writeUInt16LE(32, 14); // biBitCount (32 bpp con canal Alpha)
      bih.writeUInt32LE(0, 16); // BI_RGB (sin compresión)
      bih.writeUInt32LE(s * s * 4, 20); // biSizeImage

      // Formato BGRA invertido verticalmente (bottom-up requerido por DIB)
      const xorMask = Buffer.alloc(s * s * 4);
      for (let y = 0; y < s; y++) {
        const srcY = y;
        const dstY = s - 1 - y;
        for (let x = 0; x < s; x++) {
          const srcIdx = (srcY * s + x) * 4;
          const dstIdx = (dstY * s + x) * 4;
          xorMask[dstIdx] = data[srcIdx + 2];     // Blue
          xorMask[dstIdx + 1] = data[srcIdx + 1]; // Green
          xorMask[dstIdx + 2] = data[srcIdx];     // Red
          xorMask[dstIdx + 3] = data[srcIdx + 3]; // Alpha
        }
      }

      // AND mask: 1 bit por pixel, alineado a múltiplos de 32 bits (4 bytes)
      const andRowBytes = Math.ceil(s / 32) * 4;
      const andMask = Buffer.alloc(andRowBytes * s, 0);

      const dib = Buffer.concat([bih, xorMask, andMask]);
      entries.push({
        width: s,
        height: s,
        data: dib,
        bpp: 32
      });
    }
  }

  // Header ICO: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirEntries = [];
  for (const item of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(item.bpp, 6); // bpp
    entry.writeUInt32LE(item.data.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    offset += item.data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map(e => e.data)]);
}

async function main() {
  console.log('✨ [Icon Generator] Procesando imagen fuente oficial:', inputJpg);
  if (!fs.existsSync(inputJpg)) {
    throw new Error('No se encontró el archivo de imagen fuente en: ' + inputJpg);
  }

  const { data, info } = await sharp(inputJpg).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // Convert to RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i*4] = data[i*3];
    rgba[i*4+1] = data[i*3+1];
    rgba[i*4+2] = data[i*3+2];
    rgba[i*4+3] = 255;
  }

  // 1. Limpieza de artefactos de compresión JPG en el marco perimetral (3px)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < 3 || x >= w - 3 || y < 3 || y >= h - 3) {
        const idx = (y * w + x) * 4;
        const r = rgba[idx], g = rgba[idx+1], b = rgba[idx+2];
        const isGold = (r > 120 && g > 80 && b < r * 0.7);
        if (!isGold) {
          rgba[idx] = 0; rgba[idx+1] = 0; rgba[idx+2] = 0;
        }
      }
    }
  }

  // 2. BFS Flood fill desde los bordes para hacer transparente el fondo exterior
  const visited = new Uint8Array(w * h);
  const queue = [];

  function isBackground(x, y) {
    const idx = (y * w + x) * 4;
    const r = rgba[idx], g = rgba[idx+1], b = rgba[idx+2];
    return (r < 40 && g < 40 && b < 40) || (r > 180 && g > 180 && b > 180 && Math.abs(r-g) < 15 && Math.abs(r-b) < 15);
  }

  for (let x = 0; x < w; x++) {
    if (isBackground(x, 0)) { queue.push(x, 0); visited[x] = 1; }
    if (isBackground(x, h - 1)) { queue.push(x, h - 1); visited[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    if (isBackground(0, y)) { queue.push(0, y); visited[y * w] = 1; }
    if (isBackground(w - 1, y)) { queue.push(w - 1, y); visited[y * w + (w - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    rgba[(cy * w + cx) * 4 + 3] = 0; // Transparente

    const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!visited[nidx] && isBackground(nx, ny)) {
          visited[nidx] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  // 3. Suavizado y antialiasing en el contorno del marco dorado
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (rgba[idx+3] === 0) continue;
      const neighbors = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      let transparentNeighbors = 0;
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || rgba[(ny * w + nx) * 4 + 3] === 0) {
          transparentNeighbors++;
        }
      }
      if (transparentNeighbors > 0) {
        const r = rgba[idx], g = rgba[idx+1], b = rgba[idx+2];
        const lum = (r + g + b) / 3;
        if (lum < 60) {
          rgba[idx+3] = Math.round((lum / 60) * 255);
        }
      }
    }
  }

  console.log('🎨 Generando PNG maestro transparente de 512x512...');
  const masterBuffer = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const korforgePngPath = path.join(projectDir, 'korforge.png');
  const publicKorforgePngPath = path.join(projectDir, 'public', 'korforge.png');
  const faviconPngPath = path.join(projectDir, 'public', 'favicon.png');
  const korforgeLogoPngPath = path.join(projectDir, 'public', 'korforge-logo.png');

  fs.writeFileSync(korforgePngPath, masterBuffer);
  fs.writeFileSync(publicKorforgePngPath, masterBuffer);
  fs.writeFileSync(faviconPngPath, masterBuffer);
  fs.writeFileSync(korforgeLogoPngPath, masterBuffer);
  console.log(`  ✔ Guardado: ${korforgePngPath}`);
  console.log(`  ✔ Guardado: ${publicKorforgePngPath}`);
  console.log(`  ✔ Guardado: ${faviconPngPath}`);
  console.log(`  ✔ Guardado: ${korforgeLogoPngPath}`);

  // 4. Generar archivo .ico multi-resolución DIB compatible 100% con Windows Explorer
  console.log('🔨 Empaquetando resoluciones para korforge.ico con DIB nativo...');
  const icoBuffer = await createWindowsIco(masterBuffer);
  const korforgeIcoPath = path.join(projectDir, 'korforge.ico');
  const korforgeGoldIcoPath = path.join(projectDir, 'korforge-gold.ico');
  const publicFaviconIcoPath = path.join(projectDir, 'public', 'favicon.ico');

  fs.writeFileSync(korforgeIcoPath, icoBuffer);
  fs.writeFileSync(korforgeGoldIcoPath, icoBuffer);
  fs.writeFileSync(publicFaviconIcoPath, icoBuffer);
  console.log(`  ✔ Guardado icono Windows nativo multi-resolución: ${korforgeIcoPath} (${icoBuffer.length} bytes)`);

  // Limpiar temporales
  const temps = ['test-trans.png', 'test-clean.png', 'proper-test.ico', 'extracted-proper-32.png', 'extracted-proper-48.png', 'extracted-ico-0.png', 'extracted-from-dotnet.png', 'exe-icon-1.png', 'exe-icon-2.png', 'exe-icon-3.png', 'exe-icon-embedded.png'];
  for (const t of temps) {
    try { fs.unlinkSync(path.join(projectDir, t)); } catch (_) {}
  }

  console.log('🎉 ¡Generación de iconos completada con éxito!');
}

main().catch(err => {
  console.error('Error generando iconos:', err);
  process.exit(1);
});
