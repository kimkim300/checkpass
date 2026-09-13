export function createSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let hasInk = false;
  const ratio = window.devicePixelRatio || 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = 140 * ratio;
    canvas.style.height = "140px";
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c2430";
  }
  resize();
  window.addEventListener("resize", () => {
    const data = hasInk ? canvas.toDataURL() : null;
    resize();
    if (data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio);
      img.src = data;
    }
  });

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    hasInk = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() { drawing = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
      hasInk = false;
    },
    isEmpty() { return !hasInk; },
    toDataUrl() { return canvas.toDataURL("image/png"); },
  };
}
