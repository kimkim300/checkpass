import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from "./firebase-init.js";
import { getCurrentClassId, setCurrentClassId } from "./utils.js";

const TABS = [
  { key: "dashboard", label: "대시보드", href: "dashboard.html" },
  { key: "roster", label: "학생 명단", href: "roster.html" },
  { key: "template", label: "서류 양식", href: "template.html" },
  { key: "export", label: "서류 수합", href: "export.html" },
];

// 로그인 + 학급 선택이 끝난 교사 페이지 공통 헤더.
// 인증되지 않았거나 선택된 학급이 없으면 teacher.html 로 되돌려보낸다.
export function requireTeacherPage(activeKey) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        location.href = "teacher.html";
        return;
      }
      const classId = getCurrentClassId();
      if (!classId) {
        location.href = "teacher.html";
        return;
      }
      const snap = await getDoc(doc(db, "classes", classId));
      if (!snap.exists()) {
        location.href = "teacher.html";
        return;
      }
      const cls = { id: snap.id, ...snap.data() };
      setCurrentClassId(classId);
      renderNav(activeKey, cls);
      resolve({ user, cls });
    });
  });
}

function renderNav(activeKey, cls) {
  const mount = document.getElementById("app-nav");
  if (!mount) return;
  const tabsHtml = TABS.map(
    (t) =>
      `<a href="${t.href}?class=${cls.id}" class="${t.key === activeKey ? "active" : ""}">${t.label}</a>`
  ).join("");
  mount.outerHTML = `
    <div class="topnav">
      <div class="topnav-inner">
        <a href="index.html" class="nav-home-btn" title="홈으로">🏠</a>
        <div class="brand">${cls.name}
          <small>${cls.grade ? cls.grade + " · " : ""}출결패스</small>
        </div>
        <div class="tabs">${tabsHtml}</div>
        <button class="logout-btn" id="nav-switch-class">학급 전환</button>
        <button class="logout-btn" id="nav-logout">로그아웃</button>
      </div>
    </div>`;
  document.getElementById("nav-switch-class").onclick = () => {
    location.href = "teacher.html";
  };
  document.getElementById("nav-logout").onclick = async () => {
    await signOut(auth);
    location.href = "teacher.html";
  };
}
