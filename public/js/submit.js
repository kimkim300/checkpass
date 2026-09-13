import {
  db, storage, doc, getDoc, setDoc, collection, getDocs,
  ref, uploadBytes, getBytes, serverTimestamp,
} from "./firebase-init.js";
import {
  guardConfig, toast, getParam, countWeekdays, formatKoreanDate, todayStr, escapeHtml,
  REASON_SUBTYPES, DOC_TYPES, DIRECT_INPUT,
} from "./utils.js";
import { createSignaturePad } from "./signature-pad.js";
import { fillTemplate } from "./pdf-fill.js";

if (!guardConfig()) init();

async function init() {
  const classId = getParam("class");
  if (!classId) return showError();

  let cls, students;
  const templates = {}; // docType -> template meta (양식이 등록된 것만)
  try {
    const clsSnap = await getDoc(doc(db, "classes", classId));
    if (!clsSnap.exists()) return showError();
    cls = { id: clsSnap.id, ...clsSnap.data() };

    for (const t of DOC_TYPES) {
      const tplSnap = await getDoc(doc(db, "classes", classId, "templates", t.id));
      if (tplSnap.exists() && tplSnap.data().pdfPath) templates[t.id] = tplSnap.data();
    }
    if (Object.keys(templates).length === 0) return showError();

    const stuSnap = await getDocs(collection(db, "classes", classId, "students"));
    students = [];
    stuSnap.forEach((d) => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  } catch (e) {
    console.error(e);
    return showError();
  }

  document.getElementById("class-title").textContent = `${cls.name} 서류 제출`;
  document.getElementById("loading").style.display = "none";
  document.getElementById("submit-form").style.display = "block";

  const studentSel = document.getElementById("f-student");
  studentSel.innerHTML = students.map((s) => `<option value="${s.id}">${escapeHtml(s.number)}번 ${escapeHtml(s.name)}</option>`).join("");

  const DOC_TYPE_ICONS = { absence: "📋", tripApply: "🎒", tripReport: "📝" };
  const doctypeSel = document.getElementById("f-doctype");
  const availableTypes = DOC_TYPES.filter((t) => templates[t.id]);
  doctypeSel.innerHTML = availableTypes.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");

  const picker = document.getElementById("doctype-picker");
  picker.innerHTML = availableTypes.map((t, i) => `
    <button type="button" class="doctype-option${i === 0 ? " active" : ""}" data-type="${t.id}">
      <span class="doctype-icon">${DOC_TYPE_ICONS[t.id] || "📄"}</span>
      <span>${t.label}</span>
    </button>`).join("");
  picker.querySelectorAll(".doctype-option").forEach((btn) => {
    btn.onclick = () => {
      picker.querySelectorAll(".doctype-option").forEach((b) => b.classList.toggle("active", b === btn));
      doctypeSel.value = btn.dataset.type;
      doctypeSel.dispatchEvent(new Event("change"));
    };
  });

  function showSection(type) {
    document.querySelectorAll(".doctype-section").forEach((el) => (el.style.display = "none"));
    const map = { absence: "section-absence", tripApply: "section-tripApply", tripReport: "section-tripReport" };
    document.getElementById(map[type]).style.display = "block";
  }
  doctypeSel.addEventListener("change", () => {
    showSection(doctypeSel.value);
    bindDateRecalc(doctypeSel.value);
  });
  showSection(doctypeSel.value);

  const typeSel = document.getElementById("f-absenceType");
  const subtypeField = document.getElementById("subtype-field");
  const subtypeSel = document.getElementById("f-subtype");
  typeSel.addEventListener("change", () => {
    const subs = REASON_SUBTYPES[typeSel.value] || [];
    if (subs.length) {
      subtypeSel.innerHTML = subs.map((s) => `<option value="${s}">${s}</option>`).join("");
      subtypeField.style.display = "block";
    } else {
      subtypeField.style.display = "none";
    }
  });

  function activeSectionEl(type) {
    const map = { absence: "section-absence", tripApply: "section-tripApply", tripReport: "section-tripReport" };
    return document.getElementById(map[type]);
  }

  function bindDateRecalc(type) {
    const section = activeSectionEl(type);
    const startEl = section.querySelector(".f-start");
    const endEl = section.querySelector(".f-end");
    const daysEl = section.querySelector(".f-days");
    function recalc() {
      if (startEl.value && endEl.value && endEl.value >= startEl.value) {
        daysEl.value = countWeekdays(startEl.value, endEl.value);
      }
    }
    startEl.onchange = recalc;
    endEl.onchange = recalc;
  }
  bindDateRecalc(doctypeSel.value);

  const sigPad = createSignaturePad(document.getElementById("sig-canvas"));
  document.getElementById("btn-clear-sig").onclick = () => sigPad.clear();

  document.getElementById("submit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sigPad.isEmpty()) return toast("서명을 입력해주세요.", true);
    const submitBtn = document.getElementById("btn-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "제출 중...";
    try {
      await submitDoc();
    } catch (err) {
      console.error(err);
      toast(err.message || "제출 중 오류가 발생했습니다.", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "제출하기";
    }
  });

  async function submitDoc() {
    const docType = doctypeSel.value;
    const student = students.find((s) => s.id === studentSel.value);
    const section = activeSectionEl(docType);
    const startDate = section.querySelector(".f-start").value;
    const endDate = section.querySelector(".f-end").value;
    const dayCount = Number(section.querySelector(".f-days").value || 0);
    if (!startDate || !endDate) return toast("날짜를 입력해주세요.", true);

    const periodText = `${formatKoreanDate(startDate)} ~ ${formatKoreanDate(endDate)} (${dayCount}일간)`;
    const writeDate = formatKoreanDate(todayStr());

    let values = { studentName: student.name, studentNumber: student.number, gender: student.gender || "", period: periodText, writeDate };
    let recordExtra = {};

    if (docType === "absence") {
      const absenceType = document.getElementById("f-absenceType").value;
      const subtype = subtypeField.style.display !== "none" ? subtypeSel.value : "";
      const reasonDetailRaw = document.getElementById("f-reasonDetail").value.trim();
      const guardianName = document.getElementById("f-guardianName").value.trim();
      if (!absenceType || !reasonDetailRaw || !guardianName) return toast("필수 항목을 모두 입력해주세요.", true);
      const reasonDetail = (subtype && subtype !== DIRECT_INPUT) ? `[${subtype}] ${reasonDetailRaw}` : reasonDetailRaw;
      values = { ...values, absenceType, reasonDetail, guardianName };
      recordExtra = { absenceType, subtype, reasonDetail, guardianName };
    } else if (docType === "tripApply") {
      const contact = document.getElementById("f-contact").value.trim();
      const purpose = document.getElementById("f-purpose").value.trim();
      const location = document.getElementById("f-location").value.trim();
      const studyPlan = document.getElementById("f-studyPlan").value.trim();
      const accompany = document.getElementById("f-accompany").value;
      const contact5day = document.getElementById("f-contact5day").value;
      if (!contact || !purpose || !location || !studyPlan || !accompany || !contact5day) return toast("필수 항목을 모두 입력해주세요.", true);
      values = { ...values, contact, purpose, location, studyPlan, accompany, contact5day };
      recordExtra = { contact, purpose, location, studyPlan, accompany, contact5day };
    } else if (docType === "tripReport") {
      const reportContent = document.getElementById("f-reportContent").value.trim();
      if (!reportContent) return toast("학습 내용을 입력해주세요.", true);
      values = { ...values, reportContent };
      recordExtra = { reportContent };
    }

    const recRef = doc(collection(db, "classes", classId, "records"));
    const recordId = recRef.id;

    let photoPath = null;
    if (docType === "absence") {
      const photoFile = document.getElementById("f-photo").files[0];
      if (photoFile) {
        photoPath = `photos/${classId}/${recordId}_${photoFile.name}`;
        await uploadBytes(ref(storage, photoPath), photoFile);
      }
    }

    const templateMeta = templates[docType];
    const templateBytes = await getBytes(ref(storage, templateMeta.pdfPath));
    const pdfBytes = await fillTemplate({
      templateBytes,
      fields: templateMeta.fields || {},
      values,
      signatureDataUrl: sigPad.toDataUrl(),
    });
    const pdfPath = `submissions/${classId}/${recordId}.pdf`;
    await uploadBytes(ref(storage, pdfPath), pdfBytes, { contentType: "application/pdf" });

    await setDoc(recRef, {
      docType,
      studentId: student.id,
      studentNumber: student.number,
      studentName: student.name,
      startDate, endDate, dayCount,
      ...recordExtra,
      status: "제출완료",
      pdfPath, photoPath,
      source: "parent",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    document.getElementById("download-link").href = URL.createObjectURL(blob);
    document.getElementById("submit-form").style.display = "none";
    document.getElementById("done-screen").style.display = "block";
  }
}

function showError() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("error-screen").style.display = "block";
}
