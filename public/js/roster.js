import { db, collection, doc, addDoc, getDocs, updateDoc, deleteDoc, serverTimestamp } from "./firebase-init.js";
import { requireTeacherPage } from "./nav.js";
import { guardConfig, toast, escapeHtml } from "./utils.js";

if (!guardConfig()) {
  requireTeacherPage("roster").then(({ cls }) => init(cls.id));
}

async function init(classId) {
  const studentsCol = collection(db, "classes", classId, "students");
  let students = [];

  async function refresh() {
    const snap = await getDocs(studentsCol);
    students = [];
    snap.forEach((d) => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    render();
  }

  function render() {
    const tbody = document.getElementById("student-tbody");
    tbody.innerHTML = "";
    document.getElementById("student-count").textContent = students.length;
    document.getElementById("student-empty").style.display = students.length ? "none" : "block";
    for (const s of students) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.number ?? "")}</td>
        <td>${escapeHtml(s.name ?? "")}</td>
        <td>${escapeHtml(s.gender ?? "")}</td>
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

  refresh();
}
