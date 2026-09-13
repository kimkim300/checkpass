import { db, collection, doc, addDoc, getDocs, updateDoc, deleteDoc, serverTimestamp } from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast, escapeHtml } from "./utils.js";

if (!guardConfig()) {
  requireTeacherPage("roster").then(({ cls }) => init(cls.id));
}

async function init(classId) {
  const studentsCol = collection(db, "classes", classId, "students");
  const recordsCol = collection(db, "classes", classId, "records");
  let students = [];
  let records = [];

  async function refresh() {
    const snap = await getDocs(studentsCol);
    students = [];
    snap.forEach((d) => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

    const recSnap = await getDocs(recordsCol);
    records = [];
    recSnap.forEach((d) => records.push({ id: d.id, ...d.data() }));

    render();
  }

  function render() {
    const tbody = document.getElementById("student-tbody");
    tbody.innerHTML = "";
    document.getElementById("student-count").textContent = students.length;
    document.getElementById("student-empty").style.display = students.length ? "none" : "block";
    for (const s of students) {
      let absenceDays = 0;
      let tripDays = 0;
      for (const r of records) {
        if (r.studentId !== s.id) continue;
        const dayCount = Number(r.dayCount || 0);
        if (r.docType === "absence") {
          absenceDays += dayCount;
        } else if (r.docType === "tripApply" || r.docType === "tripReport") {
          tripDays += dayCount;
        }
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.number ?? "")}</td>
        <td>${escapeHtml(s.name ?? "")}</td>
        <td>${escapeHtml(s.gender ?? "")}</td>
        <td style="text-align:center"><strong>${absenceDays}</strong>일</td>
        <td style="text-align:center"><strong>${tripDays}</strong>일</td>
        <td><button class="btn btn-ghost btn-sm" data-del="${s.id}">삭제</button></td>`;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("이 학생을 삭제할까요?")) return;
        await deleteDoc(doc(studentsCol, btn.dataset.del));
        toast("삭제되었습니다.");
        refresh();
      };
    });
  }

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const number = document.getElementById("add-number").value.trim();
    const name = document.getElementById("add-name").value.trim();
    const gender = document.getElementById("add-gender").value;
    if (!name) return;
    await addDoc(studentsCol, { number, name, gender, createdAt: serverTimestamp() });
    document.getElementById("add-form").reset();
    toast("학생이 추가되었습니다.");
    refresh();
  });

  document.getElementById("bulk-add-btn").onclick = async () => {
    const text = document.getElementById("bulk-text").value;
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    let auto = 1;
    let added = 0;
    for (const line of lines) {
      const m = line.match(/^(\d+)\s+(.+)$/);
      let number, name;
      if (m) {
        number = m[1];
        name = m[2].trim();
      } else {
        number = String(auto);
        name = line;
      }
      auto = Math.max(auto, Number(number) || 0) + 1;
      if (!name) continue;
      await addDoc(studentsCol, { number, name, createdAt: serverTimestamp() });
      added++;
    }
    document.getElementById("bulk-text").value = "";
    toast(`${added}명 추가되었습니다.`);
    refresh();
  };

  document.getElementById("btn-seed-demo").onclick = async () => {
    if (!confirm("예시 학생 8명과 예시 결석 기록을 추가할까요? (기존 데이터는 그대로 유지되고 예시가 덧붙여집니다)")) return;
    const sample = [
      { number: "1", name: "김민준", gender: "남" },
      { number: "2", name: "이서연", gender: "여" },
      { number: "3", name: "박도윤", gender: "남" },
      { number: "4", name: "최지우", gender: "여" },
      { number: "5", name: "정하윤", gender: "여" },
      { number: "6", name: "강시우", gender: "남" },
      { number: "7", name: "윤서아", gender: "여" },
      { number: "8", name: "임예준", gender: "남" },
    ];
    const created = [];
    for (const s of sample) {
      const ref = await addDoc(studentsCol, { ...s, createdAt: serverTimestamp() });
      created.push({ id: ref.id, ...s });
    }

    function dateDaysAgo(n) {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const sampleRecords = [
      { s: created[0], docType: "absence", date: dateDaysAgo(1), status: "확인완료", absenceType: "질병결석", reasonDetail: "감기 몸살로 인한 통원 치료", guardianName: "김민준 부" },
      { s: created[1], docType: "absence", date: dateDaysAgo(2), status: "제출완료", absenceType: "질병결석", reasonDetail: "장염으로 인한 안정 필요", guardianName: "이서연 모" },
      { s: created[2], docType: "absence", date: dateDaysAgo(5), status: "확인완료", absenceType: "출석인정결석", reasonDetail: "가족 경조사 참석", guardianName: "박도윤 부" },
      { s: created[3], docType: "absence", date: dateDaysAgo(0), status: "서류대기", absenceType: "", reasonDetail: "" },
      { s: created[4], docType: "absence", date: dateDaysAgo(8), status: "반려", absenceType: "기타결석", reasonDetail: "사유 보완 필요", guardianName: "정하윤 모" },
      { s: created[5], docType: "absence", date: dateDaysAgo(10), status: "서류대기", absenceType: "질병결석", reasonDetail: "" },
      { s: created[6], docType: "tripApply", date: dateDaysAgo(-4), status: "확인완료", purpose: "가족 여행", location: "제주도", studyPlan: "제주 자연사박물관 견학 및 생태 체험" },
      { s: created[0], docType: "tripReport", date: dateDaysAgo(6), status: "제출완료", reportContent: "박물관 견학을 통해 화산 지형과 생태계를 관찰하고 기록했습니다." },
    ];
    for (const r of sampleRecords) {
      await addDoc(collection(db, "classes", classId, "records"), {
        docType: r.docType,
        studentId: r.s.id, studentNumber: r.s.number, studentName: r.s.name,
        startDate: r.date, endDate: r.date, dayCount: 1,
        absenceType: r.absenceType || "", subtype: "", reasonDetail: r.reasonDetail || r.studyPlan || r.reportContent || "",
        guardianName: r.guardianName || "", purpose: r.purpose || "", location: r.location || "",
        studyPlan: r.studyPlan || "", reportContent: r.reportContent || "",
        status: r.status, pdfPath: null, photoPath: null, source: "teacher",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    toast("예시 데이터를 추가했습니다. 대시보드에서 확인해보세요.");
    refresh();
  };

  refresh();
}
