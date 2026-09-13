import {
  db, storage, doc, getDoc, setDoc, collection, getDocs,
  ref, uploadBytes, getBytes, serverTimestamp,
} from "./firebase-init.js";
import { guardConfig, toast, getParam, countWeekdays, formatKoreanDate, todayStr, escapeHtml, REASON_SUBTYPES } from "./utils.js";
import { createSignaturePad } from "./signature-pad.js";
import { fillTemplate } from "./pdf-fill.js";

if (!guardConfig()) init();

async function init() {
  const classId = getParam("class");
  if (!classId) return showError();

  let cls, students, templateMeta;
  try {
    const clsSnap = await getDoc(doc(db, "classes", classId));
    if (!clsSnap.exists()) return showError();
    cls = { id: clsSnap.id, ...clsSnap.data() };

    const tplSnap = await getDoc(doc(db, "classes", classId, "meta", "template"));
    if (!tplSnap.exists() || !tplSnap.data().pdfPath) return showError();
    templateMeta = tplSnap.data();

    const stuSnap = await getDocs(collection(db, "classes", classId, "students"));
    students = [];
    stuSnap.forEach((d) => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  } catch (e) {
    console.error(e);
    return showError();
  }

  document.getElementById("class-title").textContent = `${cls.name} 결석계 제출`;
  document.getElementById("loading").style.display = "none";
  document.getElementById("submit-form").style.display = "block";

  const studentSel = document.getElementById("f-student");
  studentSel.innerHTML = students.map((s) => `<option value="${s.id}">${escapeHtml(s.number)}번 ${escapeHtml(s.name)}</option>`).join("");

  const typeSel = document.getElementById("f-type");
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

  const startEl = document.getElementById("f-start");
  const endEl = document.getElementById("f-end");
  const daysEl = document.getElementById("f-days");
  function recalcDays() {
    if (startEl.value && endEl.value && endEl.value >= startEl.value) {
      daysEl.value = countWeekdays(startEl.value, endEl.value);
    }
  }
  startEl.addEventListener("change", recalcDays);
  endEl.addEventListener("change", recalcDays);

  const sigPad = createSignaturePad(document.getElementById("sig-canvas"));
  document.getElementById("btn-clear-sig").onclick = () => sigPad.clear();

  document.getElementById("submit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sigPad.isEmpty()) return toast("서명을 입력해주세요.", true);
    const submitBtn = document.getElementById("btn-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "제출 중...";
    try {
      await submitAbsence();
    } catch (err) {
      console.error(err);
      toast("제출 중 오류가 발생했습니다: " + err.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = "결석계 제출하기";
    }
  });

  async function submitAbsence() {
    const student = students.find((s) => s.id === studentSel.value);
    const startDate = startEl.value, endDate = endEl.value;
    const absenceType = typeSel.value;
    const subtype = subtypeField.style.display !== "none" ? subtypeSel.value : "";
    const reasonDetailRaw = document.getElementById("f-reason").value.trim();
    const guardianName = document.getElementById("f-guardian").value.trim();
    const reasonDetail = subtype ? `[${subtype}] ${reasonDetailRaw}` : reasonDetailRaw;

    // 학부모는 다른 학생의 결석 기록을 읽을 권한이 없으므로(개인정보 보호),
    // 기존 기록을 조회해 이어쓰지 않고 항상 새 기록을 생성한다.
    // 담임이 미리 등록해둔 "서류대기" 기록이 있었다면 대시보드에서 중복 확인 후 삭제하면 된다.
    const absRef = doc(collection(db, "classes", classId, "absences"));
    const absenceId = absRef.id;

    const periodText = `${formatKoreanDate(startDate)} ~ ${formatKoreanDate(endDate)} (${daysEl.value}일간)`;
    const writeDate = formatKoreanDate(todayStr());

    let photoPath = null;
    const photoFile = document.getElementById("f-photo").files[0];
    if (photoFile) {
      photoPath = `photos/${classId}/${absenceId}_${photoFile.name}`;
      await uploadBytes(ref(storage, photoPath), photoFile);
    }

    const templateBytes = await getBytes(ref(storage, templateMeta.pdfPath));
    const pdfBytes = await fillTemplate({
      templateBytes,
      fields: templateMeta.fields || {},
      values: {
        studentName: student.name,
        studentNumber: student.number,
        period: periodText,
        reasonDetail,
        guardianName,
        writeDate,
        gender: student.gender || "",
        absenceType,
      },
      signatureDataUrl: sigPad.toDataUrl(),
    });
    const pdfPath = `submissions/${classId}/${absenceId}.pdf`;
    await uploadBytes(ref(storage, pdfPath), pdfBytes, { contentType: "application/pdf" });

    await setDoc(absRef, {
      studentId: student.id,
      studentNumber: student.number,
      studentName: student.name,
      startDate, endDate,
      dayCount: Number(daysEl.value),
      absenceType, subtype, reasonDetail, guardianName,
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
