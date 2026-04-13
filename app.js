const COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
  "#e91e63",
  "#00bcd4",
];
let player,
  cocoData,
  annsByFrame = {},
  catMap = {},
  colorMap = {},
  fps = 30;
let ytReady = false,
  seeking = false,
  rafId = null;

function setStatus(msg) {
  $("#status").text(msg);
}

window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
};
$("<script>")
  .attr("src", "https://www.youtube.com/iframe_api")
  .appendTo("head");

// slider <-> number input sync
$("#fps-slider").on("input", function () {
  $("#fps").val($(this).val());
  fps = parseFloat($(this).val());
});
$("#fps").on("input", function () {
  $("#fps-slider").val($(this).val());
  fps = parseFloat($(this).val());
});
$("#ref-w-slider").on("input", function () {
  $("#ref-w").val($(this).val());
  syncPlayerSize();
});
$("#ref-w").on("input", function () {
  $("#ref-w-slider").val($(this).val());
  syncPlayerSize();
});
$("#ref-h-slider").on("input", function () {
  $("#ref-h").val($(this).val());
  syncPlayerSize();
});
$("#ref-h").on("input", function () {
  $("#ref-h-slider").val($(this).val());
  syncPlayerSize();
});

function syncPlayerSize() {
  const w = parseFloat($("#ref-w").val()) || 1280;
  const h = parseFloat($("#ref-h").val()) || 590;
  $("#player").width(w).height(h);
  $("#player iframe").width(w).height(h);
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function parseFrameFromFilename(filename) {
  const roboflow = filename.match(/mp4-(\d+)/i);
  if (roboflow) return parseInt(roboflow[1], 10);
  const generic = filename.match(/(\d+)(?:\.[^.]+)?$/);
  if (generic) return parseInt(generic[1], 10);
  return 0;
}

function buildFrameMap(data) {
  annsByFrame = {};
  catMap = {};
  colorMap = {};
  fps = parseFloat($("#fps").val()) || 30;
  $.each(data.categories || [], (_, c) => {
    catMap[c.id] = c.name;
  });
  $.each(Object.values(catMap), (i, c) => {
    colorMap[c] = COLORS[i % COLORS.length];
  });
  const imgMap = {};
  $.each(data.images || [], (_, img) => {
    const fname = img.extra?.name || img.file_name || "";
    imgMap[img.id] = parseFrameFromFilename(fname);
  });
  $.each(data.annotations || [], (_, a) => {
    const f = imgMap[a.image_id] != null ? imgMap[a.image_id] : a.image_id;
    if (!annsByFrame[f]) annsByFrame[f] = [];
    annsByFrame[f].push(a);
  });
  buildLegend();
}

function buildLegend() {
  const $leg = $("#legend").empty();
  $.each(colorMap, (name, col) => {
    $leg.append(
      $("<span>")
        .addClass("small text-secondary d-flex align-items-center gap-1")
        .append(
          $("<span>").css({
            width: "10px",
            height: "10px",
            background: col,
            borderRadius: "2px",
            display: "inline-block",
          }),
          document.createTextNode(name),
        ),
    );
  });
}

function drawFrame(frameIdx) {
  const canvas = document.getElementById("overlay");
  const wrap = document.getElementById("video-wrap");
  canvas.width = wrap.offsetWidth;
  canvas.height = wrap.offsetHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let anns = annsByFrame[frameIdx];
  if (!anns) {
    for (let d = 1; d <= 2; d++) {
      if (annsByFrame[frameIdx - d]) {
        anns = annsByFrame[frameIdx - d];
        break;
      }
      if (annsByFrame[frameIdx + d]) {
        anns = annsByFrame[frameIdx + d];
        break;
      }
    }
  }

  const annW = cocoData.images?.[0]?.width || 512;
  const annH = cocoData.images?.[0]?.height || 512;
  const targetW = parseFloat($("#ref-w").val()) || 1280;
  const targetH = parseFloat($("#ref-h").val()) || 590;
  const scaleX = targetW / annW;
  const scaleY = targetH / annH;
  const vidX = (canvas.width - targetW) / 2;
  const vidY = (canvas.height - targetH) / 2;

  // frame border
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(vidX, vidY, targetW, targetH);
  ctx.setLineDash([]);

  if (!anns || !anns.length) {
    $("#frame-info").text(`frame ${frameIdx}`);
    return;
  }

  const showLabels = $("#show-labels").is(":checked");

  $.each(anns, (_, a) => {
    const cat = catMap[a.category_id] || String(a.category_id);
    const col = colorMap[cat] || "#fff";
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    if (a.bbox) {
      const [x, y, w, h] = a.bbox;
      const dx = vidX + x * scaleX;
      const dy = vidY + y * scaleY;
      ctx.fillStyle = col + "28";
      ctx.fillRect(dx, dy, w * scaleX, h * scaleY);
      ctx.strokeRect(dx, dy, w * scaleX, h * scaleY);
      if (showLabels) {
        const fs = Math.max(11, Math.round(12 * Math.min(scaleX, scaleY)));
        ctx.font = `bold ${fs}px monospace`;
        ctx.fillStyle = col;
        const ty = dy > 14 ? dy - 4 : dy + fs + 2;
        ctx.fillText(cat, dx + 3, ty);
      }
    }
    if (Array.isArray(a.segmentation) && a.segmentation.length) {
      const segs = Array.isArray(a.segmentation[0])
        ? a.segmentation
        : [a.segmentation];
      $.each(segs, (_, seg) => {
        if (!Array.isArray(seg) || seg.length < 6) return;
        ctx.beginPath();
        ctx.moveTo(vidX + seg[0] * scaleX, vidY + seg[1] * scaleY);
        for (let i = 2; i < seg.length; i += 2)
          ctx.lineTo(vidX + seg[i] * scaleX, vidY + seg[i + 1] * scaleY);
        ctx.closePath();
        ctx.fillStyle = col + "44";
        ctx.fill();
        ctx.stroke();
      });
    }
  });

  $("#frame-info").text(`frame ${frameIdx} · ${anns.length} ann`);
}

function tick() {
  if (!player || typeof player.getCurrentTime !== "function") {
    rafId = requestAnimationFrame(tick);
    return;
  }
  const t = player.getCurrentTime();
  drawFrame(Math.round(t * fps));
  if (!seeking) $("#seek").val((t / (player.getDuration() || 1)) * 100);
  rafId = requestAnimationFrame(tick);
}

$("#load-btn").on("click", function () {
  const ytUrl = $("#yt-url").val().trim();
  const jsonUrl = $("#json-url").val().trim();
  if (!ytUrl || !jsonUrl) {
    setStatus("Please fill in both URLs.");
    return;
  }
  const vid = extractVideoId(ytUrl);
  if (!vid) {
    setStatus("Could not parse YouTube video ID.");
    return;
  }
  setStatus("Fetching COCO JSON...");
  $.getJSON(jsonUrl)
    .done((data) => {
      cocoData = data;
      buildFrameMap(data);
      const frameNums = Object.keys(annsByFrame)
        .map(Number)
        .sort((a, b) => a - b);
      setStatus(
        `Loaded ${(data.annotations || []).length} annotations · ${frameNums.length} frames · range ${frameNums[0]}–${frameNums[frameNums.length - 1]}`,
      );
      $("#ctrl-bar").removeClass("d-none");
      $("#video-wrap").removeClass("d-none");
      fps = parseFloat($("#fps").val()) || 30;
      const tryInit = () => {
        if (!ytReady || typeof YT === "undefined") {
          setTimeout(tryInit, 200);
          return;
        }
        if (player) player.destroy();
        player = new YT.Player("player", {
          videoId: vid,
          playerVars: { controls: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              syncPlayerSize();
              const frameNums = Object.keys(annsByFrame).map(Number);
              const maxFrame = Math.max(...frameNums);
              const dur = player.getDuration();
              if (dur > 0) {
                const inferredFps = Math.round(maxFrame / dur);
                fps = inferredFps;
                $("#fps").val(inferredFps);
                $("#fps-slider").val(inferredFps);
              }
              if (rafId) cancelAnimationFrame(rafId);
              tick();
            },
          },
        });
      };
      tryInit();
    })
    .fail((_, __, err) => setStatus("Failed to load JSON: " + err));
});

$("#play-btn").on("click", () => player && player.playVideo());
$("#pause-btn").on("click", () => player && player.pauseVideo());
$("#seek")
  .on("mousedown", () => {
    seeking = true;
  })
  .on("input", function () {
    if (!player || typeof player.getDuration !== "function") return;
    const t = ($(this).val() / 100) * player.getDuration();
    player.seekTo(t, true);
    drawFrame(Math.round(t * fps));
  })
  .on("mouseup", () => {
    seeking = false;
  });
