import { db, storage, collection, doc, getDocs, updateDoc, ref, getBytes, deleteObject } from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast, escapeHtml, todayStr, STATUS_LABEL, getDocType } from "./utils.js";
import { mergePdfs } from "./pdf-fill.js";

if (!guardConfig()) {
  requireTeacherPage("export").then(({ cls }) => init(cls.id));
}

async function init(classId) {
  const start = document.getElementById("e-start");
  const end = document.getElementById("e-end");
  const today = todayStr();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  start.value = monthAgo.toISOString().slice(0, 10);
  end.value = today;

  let currentResults = [];

  document.getElementById("e-search").onclick = search;

  async function search() {
    const snap = await getDocs(collection(db, "classes", classId, "records"));
    const all = [];
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
    const s = start.value, e = end.value;
    const wantType = document.getElementById("e-doctype").value;
    let results = all.filter((a) =>
      a.startDate >= s && a.startDate <= e &&
      (wantType === "all" || a.docType === wantType) &&
      (a.status === "제출완료" || a.status === "확인완료") && a.pdfPath
    );
    const sortBy = document.getElementById("e-sort").value;
    if (sortBy === "student") {
      results.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0) || (a.startDate < b.startDate ? -1 : 1));
    } else {
      results.sort((a, b) => (a.startDate < b.startDate ? -1 : 1) || ((Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0)));
    }
    currentResults = results;
    renderResults();
  }

  function renderResults() {
    document.getElementById("result-count").textContent = currentResults.length;
    const el = document.getElementById("result-list");
    if (!currentResults.length) {
      el.innerHTML = `<div class="empty">조건에 맞는 제출 서류가 없습니다.</div>`;
    } else {
      el.innerHTML = `<div class="roster-table-wrap"><table>
        <thead><tr><th>날짜</th><th>학생</th><th>서류 종류</th><th>상태</th></tr></thead>
        <tbody>${currentResults.map((a) => `
          <tr>
            <td>${escapeHtml(a.startDate)}</td>
            <td>${escapeHtml(a.studentNumber || "")}번 ${escapeHtml(a.studentName || "")}</td>
            <td>${escapeHtml(getDocType(a.docType).label)}${a.absenceType ? " · " + escapeHtml(a.absenceType) : ""}</td>
            <td><span class="badge ${(STATUS_LABEL[a.status] || {}).cls || ""}">${(STATUS_LABEL[a.status] || {}).label || a.status}</span></td>
          </tr>`).join("")}</tbody></table></div>`;
    }
    document.getElementById("e-merge").disabled = !currentResults.length;
    document.getElementById("e-cleanup").disabled = !currentResults.length;
  }

  document.getElementById("e-merge").onclick = async () => {
    const btn = document.getElementById("e-merge");
    btn.disabled = true;
    btn.textContent = "합치는 중...";
    try {
      const byteArrays = [];
      for (const a of currentResults) {
        byteArrays.push(await getBytes(ref(storage, a.pdfPath)));
      }
      const merged = await mergePdfs(byteArrays);
      const blob = new Blob([merged], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `서류수합_${start.value}_${end.value}.pdf`;
      a.click();
      toast("PDF가 다운로드되었습니다.");
    } catch (err) {
      console.error(err);
      toast("합치기 중 오류: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "PDF로 합쳐서 다운로드";
    }
  };

  document.getElementById("e-cleanup").onclick = async () => {
    if (!confirm(`선택된 ${currentResults.length}건의 원본 서류 파일을 서버에서 삭제할까요? (기록 자체는 대시보드에 계속 남습니다)`)) return;
    let ok = 0;
    for (const a of currentResults) {
      try {
        if (a.pdfPath) await deleteObject(ref(storage, a.pdfPath));
        if (a.photoPath) await deleteObject(ref(storage, a.photoPath));
        await updateDoc(doc(db, "classes", classId, "records", a.id), { pdfPath: null, photoPath: null });
        ok++;
      } catch (err) {
        console.error(err);
      }
    }
    toast(`${ok}건 정리 완료`);
    search();
  };
}
