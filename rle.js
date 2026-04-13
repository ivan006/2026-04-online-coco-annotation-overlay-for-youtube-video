// COCO RLE decoder with contour tracing (like cv2.findContours CHAIN_APPROX_SIMPLE)
// Decode once at load, draw as canvas paths every frame — very fast

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

function decodeRLEMask(segmentation) {
  const { counts, size } = segmentation;
  const [h, w] = size;
  const cnts = typeof counts === "string" ? decodeRLEString(counts) : counts;
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
  return { mask, h, w };
}

// Simple contour tracer — returns array of contours, each contour is [x0,y0, x1,y1, ...]
// Uses square-tracing algorithm on the column-major mask
function traceContours(mask, h, w) {
  // convert to row-major for easier neighbour access
  const rm = new Uint8Array(h * w);
  for (let col = 0; col < w; col++)
    for (let row = 0; row < h; row++) rm[row * w + col] = mask[col * h + row];

  const visited = new Uint8Array(h * w);
  const contours = [];

  // 8-directional neighbour offsets [dx, dy]
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!rm[row * w + col] || visited[row * w + col]) continue;
      // check if edge pixel
      const isEdge =
        col === 0 ||
        col === w - 1 ||
        row === 0 ||
        row === h - 1 ||
        !rm[row * w + (col - 1)] ||
        !rm[row * w + (col + 1)] ||
        !rm[(row - 1) * w + col] ||
        !rm[(row + 1) * w + col];
      if (!isEdge) continue;

      // trace contour from this start pixel
      const contour = [col, row];
      visited[row * w + col] = 1;
      let cx = col,
        cy = row,
        startDir = 0;

      for (let step = 0; step < 10000; step++) {
        let found = false;
        for (let d = 0; d < 8; d++) {
          const nd = (startDir + d) % 8;
          const nx = cx + dirs[nd][0];
          const ny = cy + dirs[nd][1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!rm[ny * w + nx] || visited[ny * w + nx]) continue;
          const nEdge =
            nx === 0 ||
            nx === w - 1 ||
            ny === 0 ||
            ny === h - 1 ||
            !rm[ny * w + (nx - 1)] ||
            !rm[ny * w + (nx + 1)] ||
            !rm[(ny - 1) * w + nx] ||
            !rm[(ny + 1) * w + nx];
          if (!nEdge) continue;
          visited[ny * w + nx] = 1;
          contour.push(nx, ny);
          cx = nx;
          cy = ny;
          startDir = (nd + 6) % 8;
          found = true;
          break;
        }
        if (!found) break;
      }

      if (contour.length > 4) contours.push(new Int16Array(contour));
    }
  }
  return contours;
}

// Call once at load time — returns { contours, w, h }
function decodeRLEEdges(segmentation) {
  const { mask, h, w } = decodeRLEMask(segmentation);
  const contours = traceContours(mask, h, w);
  return { contours, w, h };
}

// Draw pre-cached contours as canvas paths — called every frame tick
function drawRLEEdges(ctx, cached, color, vidX, vidY, targetW, targetH) {
  const { contours, w, h } = cached;
  const scaleX = targetW / w;
  const scaleY = targetH / h;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  for (let c = 0; c < contours.length; c++) {
    const pts = contours[c];
    if (pts.length < 4) continue;
    ctx.beginPath();
    ctx.moveTo(vidX + pts[0] * scaleX, vidY + pts[1] * scaleY);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(vidX + pts[i] * scaleX, vidY + pts[i + 1] * scaleY);
    }
    ctx.closePath();
    ctx.stroke();
  }
}
