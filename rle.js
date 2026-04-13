// COCO RLE decoder
// segmentation = { counts: "...", size: [h, w] }

function decodeRLE(segmentation) {
  const { counts, size } = segmentation;
  const [h, w] = size;
  const mask = new Uint8Array(h * w);

  // counts can be a string (compressed) or array of numbers (uncompressed)
  let cnts;
  if (typeof counts === "string") {
    cnts = decodeRLEString(counts);
  } else {
    cnts = counts;
  }

  let idx = 0;
  let val = 0; // starts at 0 (background)
  for (let i = 0; i < cnts.length; i++) {
    const run = cnts[i];
    for (let j = 0; j < run; j++) {
      if (idx < mask.length) mask[idx++] = val;
    }
    val = val ^ 1; // toggle between 0 and 1
  }

  return { mask, h, w };
}

// Decode COCO's LEB128-like string encoding into array of run lengths
function decodeRLEString(str) {
  const cnts = [];
  let i = 0;
  while (i < str.length) {
    let x = 0,
      k = 0,
      more = true;
    while (more) {
      const c = str.charCodeAt(i) - 48;
      more = (c & 32) > 0;
      x |= (c & 31) << (5 * k);
      k++;
      i++;
    }
    if (cnts.length > 2 && x <= cnts[cnts.length - 2]) {
      x += cnts[cnts.length - 2];
    }
    cnts.push(x);
  }
  return cnts;
}

// Draw a decoded RLE mask onto a canvas context
// mask is column-major (COCO default), so we transpose
function drawRLEMask(
  ctx,
  segmentation,
  color,
  vidX,
  vidY,
  canvasW,
  canvasH,
  refW,
  refH,
) {
  if (!segmentation || !segmentation.counts || !segmentation.size) return;

  const { mask, h, w } = decodeRLE(segmentation);

  // create an offscreen canvas at the annotation resolution
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const octx = offscreen.getContext("2d");
  const imgData = octx.createImageData(w, h);

  // parse color hex to rgb
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // mask is column-major: index = col * h + row
  for (let col = 0; col < w; col++) {
    for (let row = 0; row < h; row++) {
      if (mask[col * h + row]) {
        const px = (row * w + col) * 4;
        imgData.data[px] = r;
        imgData.data[px + 1] = g;
        imgData.data[px + 2] = b;
        imgData.data[px + 3] = 120; // semi-transparent
      }
    }
  }

  octx.putImageData(imgData, 0, 0);

  // scale and draw onto main canvas
  const scaleX = refW / w;
  const scaleY = refH / h;
  ctx.save();
  ctx.translate(vidX, vidY);
  ctx.scale(refW / w, refH / h);
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}
