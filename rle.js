// COCO RLE decoder — pre-caches edge pixels at load time for fast per-frame drawing

function decodeRLEString(s) {
  const cnts = [];
  let m = 0,
    p = 0;
  while (p < s.length) {
    let x = 0,
      k = 0,
      more = 1;
    while (more) {
      const c = s.charCodeAt(p) - 48;
      x |= (c & 31) << (5 * k);
      more = c & 32;
      p++;
      k++;
      if (!more && c & 16) x |= -1 << (5 * k);
    }
    if (m > 2) x += cnts[m - 2];
    cnts.push(x);
    m++;
  }
  return cnts;
}

// Returns { edges: Int16Array of [col, row, col, row...], w, h }
// Call once at load time per annotation
function decodeRLEEdges(segmentation) {
  const { counts, size } = segmentation;
  const [h, w] = size;
  const cnts = typeof counts === "string" ? decodeRLEString(counts) : counts;

  // decode into mask
  const mask = new Uint8Array(h * w);
  let idx = 0,
    val = 0;
  for (let i = 0; i < cnts.length; i++) {
    const run = cnts[i];
    const end = Math.min(idx + run, mask.length);
    if (val) mask.fill(1, idx, end);
    idx = end;
    val ^= 1;
  }

  // extract edge pixels (column-major: index = col*h + row)
  const edgeCols = [];
  const edgeRows = [];
  for (let col = 0; col < w; col++) {
    for (let row = 0; row < h; row++) {
      if (mask[col * h + row]) {
        if (
          col === 0 ||
          col === w - 1 ||
          row === 0 ||
          row === h - 1 ||
          !mask[(col - 1) * h + row] ||
          !mask[(col + 1) * h + row] ||
          !mask[col * h + (row - 1)] ||
          !mask[col * h + (row + 1)]
        ) {
          edgeCols.push(col);
          edgeRows.push(row);
        }
      }
    }
  }

  const edges = new Int16Array(edgeCols.length * 2);
  for (let i = 0; i < edgeCols.length; i++) {
    edges[i * 2] = edgeCols[i];
    edges[i * 2 + 1] = edgeRows[i];
  }

  return { edges, w, h };
}

// Draw pre-cached edges onto canvas — called every frame tick
function drawRLEEdges(ctx, cached, color, vidX, vidY, targetW, targetH) {
  const { edges, w, h } = cached;
  const scaleX = targetW / w;
  const scaleY = targetH / h;

  const offscreen = document.createElement("canvas");
  offscreen.width = targetW;
  offscreen.height = targetH;
  const octx = offscreen.getContext("2d");
  const imgData = octx.createImageData(targetW, targetH);

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  for (let i = 0; i < edges.length; i += 2) {
    const px = Math.round(edges[i] * scaleX);
    const py = Math.round(edges[i + 1] * scaleY);
    if (px >= 0 && px < targetW && py >= 0 && py < targetH) {
      const idx = (py * targetW + px) * 4;
      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 220;
    }
  }

  octx.putImageData(imgData, 0, 0);
  ctx.drawImage(offscreen, vidX, vidY);
}
