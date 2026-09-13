import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, collection, addDoc, getDocs, query, where, serverTimestamp,
} from "./firebase-init.js";
import { guardConfig, toast, setCurrentClassId, escapeHtml } from "./utils.js";

if (!guardConfig()) init();

// 관리자 번호(PIN)만으로 접속하되, 내부적으로는 PIN에서 만들어낸 고정 이메일/비밀번호로
// Firebase 로그인을 수행한다. 같은 PIN이면 항상 같은 계정으로 로그인되므로
// 여러 기기에서도 같은 학급 데이터에 접근할 수 있고, Firestore 보안 규칙(request.auth.uid)도
// 그대로 활용해 다른 사람이 학생 정보를 볼 수 없도록 지킨다.
function pinToCredential(pin) {
  const safePin = pin.trim();
  return {
    email: `admin-${safePin}@checkpass0913.local`,
    password: `ckpass-pin-${safePin}-9913`,
  };
}

function init() {
  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("auth-pin").value.trim();
    if (pin.length < 4) return toast("관리자 번호는 4자리 이상 입력해주세요.", true);
    const { email, password } = pinToCredential(pin);
    const btn = document.getElementById("auth-submit");
    btn.disabled = true;
    try {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
          await createUserWithEmailAndPassword(auth, email, password);
          toast("새 관리자 번호로 등록되었습니다. 이 번호를 꼭 기억해두세요.");
        } else {
          throw err;
        }
      }
    } catch (err) {
      toast(friendlyAuthError(err), true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("class-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const name = document.getElementById("class-name").value.trim();
    const grade = document.getElementById("class-grade").value.trim();
    if (!name) return;
    const ref = await addDoc(collection(db, "classes"), {
      name, grade, ownerId: user.uid, ownerEmail: user.email, createdAt: serverTimestamp(),
    });
    toast("학급이 생성되었습니다.");
    setCurrentClassId(ref.id);
    location.href = `dashboard.html?class=${ref.id}`;
  });

  document.getElementById("btn-logout-2").onclick = () => signOut(auth);

  onAuthStateChanged(auth, async (user) => {
    document.getElementById("auth-section").style.display = user ? "none" : "block";
    document.getElementById("class-section").style.display = user ? "block" : "none";
    if (user) await loadClasses(user.uid);
  });
}

async function loadClasses(uid) {
  const listEl = document.getElementById("class-list");
  const emptyEl = document.getElementById("class-empty");
  listEl.innerHTML = "";
  const snap = await getDocs(query(collection(db, "classes"), where("ownerId", "==", uid)));
  const classes = [];
  snap.forEach((d) => classes.push({ id: d.id, ...d.data() }));
  classes.sort((a, b) => (a.name > b.name ? 1 : -1));
  emptyEl.style.display = classes.length ? "none" : "block";
  for (const c of classes) {
    const a = document.createElement("a");
    a.href = `dashboard.html?class=${c.id}`;
    a.className = "class-item";
    a.onclick = () => setCurrentClassId(c.id);
    a.innerHTML = `
      <div>
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="meta">${escapeHtml(c.grade || "")}</div>
      </div>
      <div class="arrow">→</div>`;
    listEl.appendChild(a);
  }
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") || code.includes("email-already-in-use")) {
    return "관리자 번호를 다시 확인해주세요.";
  }
  return "오류가 발생했습니다: " + code;
}
