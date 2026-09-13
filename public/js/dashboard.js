import {
  db, storage, collection, doc, addDoc, getDoc, setDoc, getDocs, updateDoc, deleteDoc,
  ref, getDownloadURL, serverTimestamp,
} from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast, escapeHtml, todayStr, daysBetween, STATUS_LABEL, DOC_TYPES, getDocType, classLookupId } from "./utils.js";

if (!guardConfig()) {
  requireTeacherPage("dashboard").then(({ cls }) => init(cls.id, cls));
}

function isOverdue(r) {
  if (r.status !== "서류대기") return false;
  const dt = getDocType(r.docType);
  if (!dt.deadline) return false;
  const fromDate = dt.deadline.from === "endDate" ? r.endDate : r.startDate;
  return daysBetween(fromDate, todayStr()) > dt.deadline.days;
}

async function init(classId, cls) {
  const submitUrl = `${location.origin}${location.pathname.replace("dashboard.html", "submit.html")}?class=${classId}`;
  document.getElementById("submit-link").textContent = submitUrl;
  document.getElementById("copy-link").onclick = async () => {
    await navigator.clipboard.writeText(submitUrl);
    toast("링크가 복사되었습니다.");
  };

  const settingsRef = doc(db, "classes", classId, "private", "settings");
  let existingParentCode = "";
  try {
    const settingsSnap = await getDoc(settingsRef);
    existingParentCode = settingsSnap.exists() ? settingsSnap.data().parentCode || "" : "";
  } catch (e) {
    console.error("비밀번호 불러오기 실패:", e);
  }
  document.getElementById("parent-code-input").value = existingParentCode;
  document.getElementById("parent-code-save").onclick = async () => {
    const newCode = document.getElementById("parent-code-input").value.trim();
    if (newCode.length < 4) return toast("비밀번호는 4자 이상으로 입력해주세요.", true);
    const btn = document.getElementById("parent-code-save");
    btn.disabled = true;
    try {
      if (existingParentCode && existingParentCode !== newCode) {
        try { await deleteDoc(doc(db, "classLookup", classLookupId(cls.name, existingParentCode))); } catch (e) { /* 이미 없어도 무방 */ }
      }
      await setDoc(doc(db, "classLookup", classLookupId(cls.name, newCode)), { classId });
      await setDoc(settingsRef, { parentCode: newCode });
      existingParentCode = newCode;
      toast("학부모용 비밀번호가 저장되었습니다. 이 화면을 새로고침해도 그대로 남아있습니다.");
    } catch (err) {
      console.error(err);
      toast("저장 중 오류가 발생했습니다: " + err.message, true);
    } finally {
      btn.disabled = false;
    }
  };

  let students = [];
  let records = [];

  async function loadAll() {
    const [stuSnap, recSnap] = await Promise.all([
      getDocs(collection(db, "classes", classId, "students")),
      getDocs(collection(db, "classes", classId, "records")),
    ]);
    students = [];
    stuSnap.forEach((d) => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    records = [];
    recSnap.forEach((d) => records.push({ id: d.id, ...d.data() }));
    records.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    renderStats();
    renderCalendar();
    renderStudentSummary();
    renderPending();
  }

  function renderStats() {
    const total = records.length;
    const done = records.filter((r) => r.status === "제출완료" || r.status === "확인완료").length;
    const overdue = records.filter(isOverdue).length;
    document.getElementById("stat-grid").innerHTML = `
      <div class="stat-box"><div class="num">${students.length}</div><div class="lbl">전체 학생</div></div>
      <div class="stat-box"><div class="num">${total}</div><div class="lbl">전체 서류 기록</div></div>
      <div class="stat-box"><div class="num">${done}</div><div class="lbl">서류 제출</div></div>
      <div class="stat-box"><div class="num" style="color:${overdue ? "#d0384e" : "inherit"}">${overdue}</div><div class="lbl">기한초과 미제출</div></div>`;
  }

  // ---------- 탭 전환 ----------
  document.querySelectorAll("#view-tabbar button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#view-tabbar button").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("view-date").style.display = btn.dataset.view === "date" ? "block" : "none";
      document.getElementById("view-student").style.display = btn.dataset.view === "student" ? "block" : "none";
      document.getElementById("view-pending").style.display = btn.dataset.view === "pending" ? "block" : "none";
    };
  });

  // ---------- 날짜별 보기 ----------
  let calYear, calMonth, selectedDate = null;
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  function dateRecordMap() {
    const map = {};
    for (const r of records) {
      if (!r.startDate || !r.endDate) continue;
      const cur = new Date(r.startDate + "T00:00:00");
      const end = new Date(r.endDate + "T00:00:00");
      let guard = 0;
      while (cur <= end && guard < 60) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        (map[key] = map[key] || []).push(r);
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    }
    return map;
  }

  function renderCalendar() {
    const map = dateRecordMap();
    document.getElementById("cal-title").textContent = `${calYear}년 ${calMonth + 1}월`;
    const grid = document.getElementById("calendar");
    grid.innerHTML = "";
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => {
      const el = document.createElement("div");
      el.className = "dow";
      el.textContent = d;
      grid.appendChild(el);
    });
    const first = new Date(calYear, calMonth, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayS = todayStr();
    for (let i = 0; i < startOffset; i++) {
      const el = document.createElement("div");
      el.className = "cell empty-cell";
      grid.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cell = document.createElement("div");
      cell.className = "cell" + (dateStr === todayS ? " today" : "") + (dateStr === selectedDate ? " selected" : "");
      const count = (map[dateStr] || []).length;
      cell.innerHTML = `<div class="date-num">${d}</div>${count ? `<div class="count">${count}</div>` : ""}`;
      cell.onclick = () => { selectedDate = dateStr; renderCalendar(); renderDateList(); };
      grid.appendChild(cell);
    }
  }

  document.getElementById("cal-prev").onclick = () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  };
  document.getElementById("cal-next").onclick = () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  };

  function renderDateList() {
    const titleEl = document.getElementById("selected-date-title");
    const listEl = document.getElementById("date-absence-list");
    if (!selectedDate) { titleEl.textContent = "날짜를 선택하세요"; listEl.innerHTML = ""; return; }
    titleEl.textContent = `${selectedDate} 관련 학생`;
    const map = dateRecordMap();
    const items = map[selectedDate] || [];
    if (!items.length) {
      listEl.innerHTML = `<div class="empty">이 날짜에 등록된 기록이 없습니다.</div>`;
      return;
    }
    listEl.innerHTML = renderRecordTable(items);
    bindRowActions(listEl);
  }

  document.getElementById("btn-add-manual").onclick = () => {
    const area = document.getElementById("manual-form-area");
    if (area.innerHTML) { area.innerHTML = ""; return; }
    area.innerHTML = `
      <div class="card" style="background:var(--bg)">
        <p class="hint" style="margin-top:0">결석계 기준으로만 미리 등록할 수 있습니다 (체험학습은 학부모가 직접 신청합니다).</p>
        <div class="row">
          <div class="field"><label>학생</label>
            <select id="m-student">${students.map((s) => `<option value="${s.id}">${escapeHtml(s.number)}번 ${escapeHtml(s.name)}</option>`).join("")}</select>
          </div>
          <div class="field"><label>시작일</label><input type="date" id="m-start" value="${selectedDate || todayStr()}" /></div>
          <div class="field"><label>종료일</label><input type="date" id="m-end" value="${selectedDate || todayStr()}" /></div>
        </div>
        <div class="field"><label>결석 유형</label>
          <select id="m-type"><option value="">미정</option><option value="출석인정결석">출석인정결석</option><option value="질병결석">질병결석</option><option value="기타결석">기타결석</option></select>
        </div>
        <button class="btn btn-primary btn-sm" id="m-save">서류대기로 등록</button>
      </div>`;
    document.getElementById("m-save").onclick = async () => {
      const student = students.find((s) => s.id === document.getElementById("m-student").value);
      const startDate = document.getElementById("m-start").value;
      const endDate = document.getElementById("m-end").value;
      const absenceType = document.getElementById("m-type").value;
      await addDoc(collection(db, "classes", classId, "records"), {
        docType: "absence",
        studentId: student.id, studentNumber: student.number, studentName: student.name,
        startDate, endDate, absenceType, subtype: "", reasonDetail: "", guardianName: "",
        status: "서류대기", pdfPath: null, photoPath: null, source: "teacher",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      area.innerHTML = "";
      toast("결석 기록이 추가되었습니다.");
      await loadAll();
      renderDateList();
    };
  };

  // ---------- 학생별 보기 ----------
  let expandedStudentId = null;
  function renderStudentSummary() {
    const tbody = document.getElementById("student-summary-tbody");
    tbody.innerHTML = "";
    for (const s of students) {
      const mine = records.filter((r) => r.studentId === s.id);
      const waiting = mine.filter((r) => r.status === "서류대기").length;
      const latest = mine[0];
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${escapeHtml(s.number)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${mine.length}</td>
        <td>${waiting ? `<span class="badge badge-wait">${waiting}</span>` : "-"}</td>
        <td>${latest ? statusBadge(latest.status) : "-"}</td>`;
      tr.onclick = () => {
        expandedStudentId = expandedStudentId === s.id ? null : s.id;
        renderStudentDetail();
      };
      tbody.appendChild(tr);
    }
    renderStudentDetail();
  }

  function renderStudentDetail() {
    const area = document.getElementById("student-detail-area");
    if (!expandedStudentId) { area.innerHTML = ""; return; }
    const s = students.find((x) => x.id === expandedStudentId);
    const mine = records.filter((r) => r.studentId === expandedStudentId);
    area.innerHTML = `<h2 style="margin-top:20px">${escapeHtml(s.name)} 학생 서류 기록</h2>` +
      (mine.length ? renderRecordTable(mine) : `<div class="empty">기록이 없습니다.</div>`);
    bindRowActions(area);
  }

  // ---------- 미제출자 보기 ----------
  function renderPending() {
    const list = records.filter((r) => r.status === "서류대기").sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    const el = document.getElementById("pending-list");
    if (!list.length) { el.innerHTML = `<div class="empty">미제출 서류가 없습니다.</div>`; return; }
    el.innerHTML = renderRecordTable(list, true);
    bindRowActions(el);
  }

  // ---------- 공통 렌더/액션 ----------
  function statusBadge(status) {
    const s = STATUS_LABEL[status] || { label: status, cls: "" };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }

  function typeLabel(r) {
    const dt = getDocType(r.docType);
    const detail = r.docType === "absence" ? (r.absenceType || "") : "";
    return escapeHtml(dt.label) + (detail ? ` · ${escapeHtml(detail)}` : "");
  }

  function renderRecordTable(items, showOverdue) {
    const rows = items.map((r) => {
      const overdue = isOverdue(r);
      return `
        <tr>
          <td>${escapeHtml(r.startDate)}${r.endDate && r.endDate !== r.startDate ? " ~ " + escapeHtml(r.endDate) : ""}</td>
          <td>${escapeHtml(r.studentNumber || "")}번 ${escapeHtml(r.studentName || "")}</td>
          <td>${typeLabel(r)}</td>
          <td>${statusBadge(r.status)}${showOverdue && overdue ? ' <span class="badge badge-rejected">기한초과</span>' : ""}</td>
          <td class="row-actions" style="white-space:nowrap">
            ${r.pdfPath ? `<button class="btn btn-ghost btn-sm" data-view-pdf="${r.id}">PDF</button>` : ""}
            ${r.status === "제출완료" ? `<button class="btn btn-secondary btn-sm" data-approve="${r.id}">확인완료</button><button class="btn btn-danger btn-sm" data-reject="${r.id}">반려</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-del="${r.id}">삭제</button>
          </td>
        </tr>`;
    }).join("");
    return `<div class="roster-table-wrap"><table><thead><tr><th>날짜</th><th>학생</th><th>유형</th><th>상태</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function bindRowActions(root) {
    root.querySelectorAll("[data-view-pdf]").forEach((btn) => {
      btn.onclick = async () => {
        const r = records.find((x) => x.id === btn.dataset.viewPdf);
        const url = await getDownloadURL(ref(storage, r.pdfPath));
        window.open(url, "_blank");
      };
    });
    root.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.onclick = async () => {
        await updateDoc(doc(db, "classes", classId, "records", btn.dataset.approve), { status: "확인완료", updatedAt: serverTimestamp() });
        toast("확인 처리되었습니다.");
        await loadAll(); renderDateList();
      };
    });
    root.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("반려하면 학부모가 다시 제출해야 합니다. 반려할까요?")) return;
        await updateDoc(doc(db, "classes", classId, "records", btn.dataset.reject), { status: "반려", updatedAt: serverTimestamp() });
        toast("반려되었습니다.");
        await loadAll(); renderDateList();
      };
    });
    root.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("이 기록을 삭제할까요?")) return;
        await deleteDoc(doc(db, "classes", classId, "records", btn.dataset.del));
        toast("삭제되었습니다.");
        await loadAll(); renderDateList();
      };
    });
  }

  await loadAll();
}
