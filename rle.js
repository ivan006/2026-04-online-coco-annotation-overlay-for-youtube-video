// COCO RLE decoder — matches pycocotools algorithm exactly

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

function decodeRLE(segmentation) {
  const { counts, size } = segmentation;
  const [h, w] = size;
  const mask = new Uint8Array(h * w);
  const cnts = typeof counts === "string" ? decodeRLEString(counts) : counts;
  let idx = 0,
    val = 0;
  for (let i = 0; i < cnts.length; i++) {
    const run = cnts[i];
    for (let j = 0; j < run; j++) {
      if (idx < mask.length) mask[idx++] = val;
    }
    val ^= 1;
  }
  return { mask, h, w };
}

function drawRLEMask(
  ctx,
  segmentation,
  color,
  vidX,
  vidY,
  canvasW,
  canvasH,
  targetW,
  targetH,
) {
  if (!segmentation || !segmentation.counts || !segmentation.size) return;

  const { mask, h, w } = decodeRLE(segmentation);

  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const octx = offscreen.getContext("2d");
  const imgData = octx.createImageData(w, h);

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // COCO mask is column-major (col * h + row), imageData is row-major (row * w + col)
  // draw outline only: only paint pixels that are on the edge (have a background neighbour)
  for (let col = 0; col < w; col++) {
    for (let row = 0; row < h; row++) {
      if (mask[col * h + row]) {
        const isEdge =
          col === 0 ||
          col === w - 1 ||
          row === 0 ||
          row === h - 1 ||
          !mask[(col - 1) * h + row] ||
          !mask[(col + 1) * h + row] ||
          !mask[col * h + (row - 1)] ||
          !mask[col * h + (row + 1)];
        if (isEdge) {
          const px = (row * w + col) * 4;
          imgData.data[px] = r;
          imgData.data[px + 1] = g;
          imgData.data[px + 2] = b;
          imgData.data[px + 3] = 220;
        }
      }
    }
  }

  octx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.translate(vidX, vidY);
  ctx.scale(targetW / w, targetH / h);
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}
