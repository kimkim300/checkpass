import { db, storage, doc, getDoc, setDoc, ref, uploadBytes, getBytes, serverTimestamp } from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast } from "./utils.js";
import { fillTemplate, SAMPLE_VALUES } from "./pdf-fill.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const FIELD_TARGETS = [
  { id: "text:studentName", label: "학생 이름", type: "text", size: 11 },
  { id: "text:studentNumber", label: "번호", type: "text", size: 11 },
  { id: "mark:gender:남", label: "성별 - 남", type: "mark" },
  { id: "mark:gender:여", label: "성별 - 여", type: "mark" },
  { id: "text:period", label: "결석 기간 문구", type: "text", size: 10, width: 260 },
  { id: "mark:absenceType:출석인정결석", label: "결석유형 - 출석인정결석", type: "mark" },
  { id: "mark:absenceType:질병결석", label: "결석유형 - 질병결석", type: "mark" },
  { id: "mark:absenceType:기타결석", label: "결석유형 - 기타결석", type: "mark" },
  { id: "text:reasonDetail", label: "결석 사유 (상세)", type: "text", size: 10, width: 420 },
  { id: "text:guardianName", label: "보호자 성명", type: "text", size: 11 },
  { id: "text:writeDate", label: "신고일자", type: "text", size: 10 },
  { id: "sig", label: "서명란 (이미지)", type: "sig", width: 110, height: 45 },
];

if (!guardConfig()) {
  requireTeacherPage("template").then(({ cls }) => init(cls.id));
}

async function init(classId) {
  const metaRef = doc(db, "classes", classId, "meta", "template");
  let fields = {};
  let pageWidth = 595, pageHeight = 841;
  let pdfBytes = null;
  let scale = 1;
  let armedId = null;

  const existing = await getDoc(metaRef);
  let pdfPath = null, pdfName = null;
  if (existing.exists()) {
    const data = existing.data();
    fields = data.fields || {};
    pageWidth = data.pageWidth || 595;
    pageHeight = data.pageHeight || 841;
    pdfPath = data.pdfPath;
    pdfName = data.pdfName;
    document.getElementById("current-pdf-name").textContent = pdfName ? `현재 등록된 양식: ${pdfName}` : "";
    if (pdfPath) {
      try {
        pdfBytes = await getBytes(ref(storage, pdfPath));
        await renderPdf(pdfBytes);
      } catch (e) {
        toast("기존 양식 파일을 불러오지 못했습니다. 다시 업로드해주세요.", true);
      }
    }
  }

  document.getElementById("pdf-upload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pdfBytes = new Uint8Array(await file.arrayBuffer());
    pdfPath = `templates/${classId}/template.pdf`;
    pdfName = file.name;
    document.getElementById("current-pdf-name").textContent = `업로드됨: ${pdfName} (저장을 눌러야 반영됩니다)`;
    await renderPdf(pdfBytes);
    toast("양식을 불러왔습니다. 항목 배치 후 저장하세요.");
  });

  async function renderPdf(bytes) {
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const native = page.getViewport({ scale: 1 });
    pageWidth = native.width;
    pageHeight = native.height;
    const displayWidth = Math.min(720, document.getElementById("canvas-wrap").clientWidth || 720);
    scale = displayWidth / pageWidth;
    const viewport = page.getViewport({ scale });
    const canvas = document.getElementById("pdf-canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    document.getElementById("marker-layer").style.width = viewport.width + "px";
    document.getElementById("marker-layer").style.height = viewport.height + "px";
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    document.getElementById("designer").style.display = "block";
    renderFieldList();
    renderMarkers();
  }

  function renderFieldList() {
    const wrap = document.getElementById("field-list");
    wrap.innerHTML = "";
    for (const target of FIELD_TARGETS) {
      const placed = fields[target.id];
      const row = document.createElement("div");
      row.className = "field-list-item" + (placed ? " placed" : "") + (armedId === target.id ? " armed" : "");
      let tuneHtml = "";
      if (placed) {
        tuneHtml = `<div class="coord-tune">
          <input type="number" data-tune="x" value="${Math.round(placed.x)}" title="X" />
          <input type="number" data-tune="y" value="${Math.round(placed.y)}" title="Y" />
          ${target.type === "text" ? `<input type="number" data-tune="size" value="${placed.size || 11}" title="글자크기" />` : ""}
          ${target.type === "sig" ? `<input type="number" data-tune="width" value="${placed.width}" title="너비" /><input type="number" data-tune="height" value="${placed.height}" title="높이" />` : ""}
        </div>`;
      }
      row.innerHTML = `
        <div style="flex:1">
          <div class="name"><span class="dot"></span>${target.label}</div>
          ${tuneHtml}
        </div>`;
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-tune]")) return;
        armedId = target.id;
        renderFieldList();
      });
      row.querySelectorAll("[data-tune]").forEach((inp) => {
        inp.addEventListener("click", (e) => e.stopPropagation());
        inp.addEventListener("input", () => {
          const f = fields[target.id];
          f[inp.dataset.tune] = Number(inp.value);
          renderMarkers();
        });
      });
      wrap.appendChild(row);
    }
  }

  function nextUnplacedTarget() {
    return FIELD_TARGETS.find((t) => !fields[t.id]);
  }

  document.getElementById("pdf-canvas").addEventListener("click", (e) => {
    if (!armedId) return;
    const target = FIELD_TARGETS.find((t) => t.id === armedId);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const pdfX = clickX / scale;
    const pdfYTop = pageHeight - clickY / scale;

    if (target.type === "sig") {
      const w = target.width, h = target.height;
      fields[target.id] = { x: pdfX, y: pdfYTop - h, width: w, height: h, label: target.label };
    } else if (target.type === "text") {
      fields[target.id] = { x: pdfX, y: pdfYTop, size: target.size, width: target.width || null, label: target.label };
    } else {
      fields[target.id] = { x: pdfX, y: pdfYTop, label: target.label };
    }
    const next = nextUnplacedTarget();
    armedId = next ? next.id : null;
    renderFieldList();
    renderMarkers();
  });

  function renderMarkers() {
    const layer = document.getElementById("marker-layer");
    layer.innerHTML = "";
    for (const target of FIELD_TARGETS) {
      const f = fields[target.id];
      if (!f) continue;
      const el = document.createElement("div");
      el.style.pointerEvents = "auto";
      if (target.type === "sig") {
        el.className = "field-marker sig-marker";
        el.style.position = "absolute";
        el.style.left = f.x * scale + "px";
        el.style.top = (pageHeight - f.y - f.height) * scale + "px";
        el.style.width = f.width * scale + "px";
        el.style.height = f.height * scale + "px";
        el.innerHTML = `<span class="tag">${target.label}</span>`;
      } else {
        el.className = "field-marker";
        el.style.left = f.x * scale + "px";
        el.style.top = (pageHeight - f.y) * scale + "px";
        el.innerHTML = `<span class="tag">${target.label}</span>`;
      }
      makeDraggable(el, target, f);
      layer.appendChild(el);
    }
  }

  function makeDraggable(el, target, f) {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startFx = f.x, startFy = f.y;
      function onMove(ev) {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        f.x = startFx + dx;
        f.y = startFy - dy;
        renderMarkers();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        renderFieldList();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  document.getElementById("btn-preview").addEventListener("click", async () => {
    if (!pdfBytes) return toast("먼저 양식 PDF를 업로드하세요.", true);
    try {
      const sampleSig = makeSampleSignatureDataUrl();
      const bytes = await fillTemplate({ templateBytes: pdfBytes, fields, values: SAMPLE_VALUES, signatureDataUrl: sampleSig });
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      console.error(err);
      toast("미리보기 생성 중 오류: " + err.message, true);
    }
  });

  document.getElementById("btn-save").addEventListener("click", async () => {
    if (!pdfPath) {
      pdfPath = `templates/${classId}/template.pdf`;
    }
    if (pdfBytes) {
      await uploadBytes(ref(storage, pdfPath), pdfBytes, { contentType: "application/pdf" });
    }
    await setDoc(metaRef, {
      pdfPath, pdfName: pdfName || "결석계 양식.pdf", pageWidth, pageHeight, fields, updatedAt: serverTimestamp(),
    });
    toast("양식이 저장되었습니다.");
  });
}

function makeSampleSignatureDataUrl() {
  const c = document.createElement("canvas");
  c.width = 220; c.height = 90;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.font = "italic 32px serif";
  ctx.fillText("홍길동", 20, 55);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, 65);
  ctx.bezierCurveTo(60, 80, 140, 40, 200, 65);
  ctx.stroke();
  return c.toDataURL("image/png");
}
