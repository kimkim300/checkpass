import { db, storage, doc, getDoc, setDoc, deleteDoc, ref, uploadBytes, getBytes, deleteObject, serverTimestamp } from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast, DOC_TYPES, FIELD_TARGETS_BY_TYPE } from "./utils.js";
import { fillTemplate, SAMPLE_VALUES } from "./pdf-fill.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

if (!guardConfig()) {
  requireTeacherPage("template").then(({ cls }) => init(cls.id));
}

async function init(classId) {
  let currentType = DOC_TYPES[0].id;
  let armedId = null;
  // 서류 종류별 상태를 각각 보관해서 탭을 오갈 때 다시 불러오지 않아도 되게 한다.
  const state = {}; // { [docType]: { fields, pageWidth, pageHeight, pdfBytes, pdfPath, pdfName, loaded } }

  function getState(type) {
    if (!state[type]) state[type] = { fields: {}, pageWidth: 595, pageHeight: 841, pdfBytes: null, pdfPath: null, pdfName: null, loaded: false };
    return state[type];
  }

  renderTabbar();
  await selectType(DOC_TYPES[0].id);

  function renderTabbar() {
    const wrap = document.getElementById("doctype-tabbar");
    wrap.innerHTML = DOC_TYPES.map((t) => `<button data-type="${t.id}" class="${t.id === currentType ? "active" : ""}">${t.label}</button>`).join("");
    wrap.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => selectType(btn.dataset.type);
    });
  }

  async function selectType(type) {
    currentType = type;
    armedId = null;
    renderTabbar();
    document.getElementById("designer").style.display = "none";
    document.getElementById("current-pdf-name").textContent = "";
    document.getElementById("btn-delete-template").style.display = "none";
    document.getElementById("pdf-upload").value = "";

    const s = getState(type);
    if (!s.loaded) {
      const metaRef = doc(db, "classes", classId, "templates", type);
      const snap = await getDoc(metaRef);
      if (snap.exists()) {
        const data = snap.data();
        s.fields = data.fields || {};
        s.pageWidth = data.pageWidth || 595;
        s.pageHeight = data.pageHeight || 841;
        s.pdfPath = data.pdfPath;
        s.pdfName = data.pdfName;
      }
      s.loaded = true;
    }

    if (s.pdfPath) {
      document.getElementById("current-pdf-name").textContent = `현재 등록된 양식: ${s.pdfName || ""}`;
      document.getElementById("btn-delete-template").style.display = "inline-flex";
      try {
        if (!s.pdfBytes) s.pdfBytes = await getBytes(ref(storage, s.pdfPath));
        await renderPdf(s);
      } catch (e) {
        console.error(e);
        toast("기존 양식 파일을 불러오지 못했습니다. 다시 업로드해주세요.", true);
      }
    }
  }

  document.getElementById("pdf-upload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const s = getState(currentType);
    s.pdfBytes = new Uint8Array(await file.arrayBuffer());
    const typeInfo = DOC_TYPES.find((t) => t.id === currentType);
    s.pdfPath = `templates/${classId}/${typeInfo.pdfFile}`;
    s.pdfName = file.name;
    document.getElementById("current-pdf-name").textContent = `업로드됨: ${s.pdfName} (저장을 눌러야 반영됩니다)`;
    document.getElementById("btn-delete-template").style.display = "inline-flex";
    await renderPdf(s);
    toast("양식을 불러왔습니다. 항목 배치 후 저장하세요.");
  });

  document.getElementById("btn-delete-template").addEventListener("click", async () => {
    const s = getState(currentType);
    if (!s.pdfPath) return;
    if (!confirm("이 양식과 배치된 입력란 위치가 모두 삭제됩니다. 계속할까요?")) return;
    try {
      await deleteObject(ref(storage, s.pdfPath));
    } catch (e) {
      console.warn("스토리지 파일 삭제 실패(이미 없을 수 있음):", e);
    }
    await deleteDoc(doc(db, "classes", classId, "templates", currentType));
    state[currentType] = { fields: {}, pageWidth: 595, pageHeight: 841, pdfBytes: null, pdfPath: null, pdfName: null, loaded: true };
    document.getElementById("designer").style.display = "none";
    document.getElementById("current-pdf-name").textContent = "";
    document.getElementById("btn-delete-template").style.display = "none";
    toast("양식이 삭제되었습니다.");
  });

  let scale = 1;

  async function renderPdf(s) {
    const loadingTask = pdfjsLib.getDocument({ data: s.pdfBytes.slice() });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const native = page.getViewport({ scale: 1 });
    s.pageWidth = native.width;
    s.pageHeight = native.height;
    const displayWidth = Math.min(720, document.getElementById("canvas-wrap").clientWidth || 720);
    scale = displayWidth / s.pageWidth;
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

  function fieldTargets() {
    return FIELD_TARGETS_BY_TYPE[currentType];
  }

  function renderFieldList() {
    const s = getState(currentType);
    const wrap = document.getElementById("field-list");
    wrap.innerHTML = "";
    for (const target of fieldTargets()) {
      const placed = s.fields[target.id];
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
          const f = s.fields[target.id];
          f[inp.dataset.tune] = Number(inp.value);
          renderMarkers();
        });
      });
      wrap.appendChild(row);
    }
  }

  function nextUnplacedTarget(s) {
    return fieldTargets().find((t) => !s.fields[t.id]);
  }

  document.getElementById("pdf-canvas").addEventListener("click", (e) => {
    if (!armedId) return;
    const s = getState(currentType);
    const target = fieldTargets().find((t) => t.id === armedId);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const pdfX = clickX / scale;
    const pdfYTop = s.pageHeight - clickY / scale;

    if (target.type === "sig") {
      const w = target.width, h = target.height;
      s.fields[target.id] = { x: pdfX, y: pdfYTop - h, width: w, height: h, label: target.label };
    } else if (target.type === "text") {
      s.fields[target.id] = { x: pdfX, y: pdfYTop, size: target.size, width: target.width || null, label: target.label };
    } else {
      s.fields[target.id] = { x: pdfX, y: pdfYTop, label: target.label };
    }
    const next = nextUnplacedTarget(s);
    armedId = next ? next.id : null;
    renderFieldList();
    renderMarkers();
  });

  function renderMarkers() {
    const s = getState(currentType);
    const layer = document.getElementById("marker-layer");
    layer.innerHTML = "";
    for (const target of fieldTargets()) {
      const f = s.fields[target.id];
      if (!f) continue;
      const el = document.createElement("div");
      el.style.pointerEvents = "auto";
      if (target.type === "sig") {
        el.className = "field-marker sig-marker";
        el.style.position = "absolute";
        el.style.left = f.x * scale + "px";
        el.style.top = (s.pageHeight - f.y - f.height) * scale + "px";
        el.style.width = f.width * scale + "px";
        el.style.height = f.height * scale + "px";
        el.innerHTML = `<span class="tag">${target.label}</span>`;
      } else {
        el.className = "field-marker";
        el.style.left = f.x * scale + "px";
        el.style.top = (s.pageHeight - f.y) * scale + "px";
        el.innerHTML = `<span class="tag">${target.label}</span>`;
      }
      makeDraggable(el, f);
      layer.appendChild(el);
    }
  }

  function makeDraggable(el, f) {
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
    const s = getState(currentType);
    if (!s.pdfBytes) return toast("먼저 양식 PDF를 업로드하세요.", true);
    try {
      const sampleSig = makeSampleSignatureDataUrl();
      const bytes = await fillTemplate({ templateBytes: s.pdfBytes, fields: s.fields, values: SAMPLE_VALUES, signatureDataUrl: sampleSig });
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      console.error(err);
      toast("미리보기 생성 중 오류: " + err.message, true);
    }
  });

  document.getElementById("btn-save").addEventListener("click", async () => {
    const s = getState(currentType);
    const typeInfo = DOC_TYPES.find((t) => t.id === currentType);
    if (!s.pdfPath) s.pdfPath = `templates/${classId}/${typeInfo.pdfFile}`;
    if (s.pdfBytes) {
      await uploadBytes(ref(storage, s.pdfPath), s.pdfBytes, { contentType: "application/pdf" });
    }
    await setDoc(doc(db, "classes", classId, "templates", currentType), {
      pdfPath: s.pdfPath, pdfName: s.pdfName || `${typeInfo.label}.pdf`,
      pageWidth: s.pageWidth, pageHeight: s.pageHeight, fields: s.fields, updatedAt: serverTimestamp(),
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
