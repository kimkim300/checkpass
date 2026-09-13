import { db, doc, getDoc } from "./firebase-init.js";
import { guardConfig, toast, classLookupId } from "./utils.js";

if (!guardConfig()) init();

function init() {
  document.querySelectorAll("#role-tabbar button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#role-tabbar button").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("role-teacher").style.display = btn.dataset.role === "teacher" ? "block" : "none";
      document.getElementById("role-parent").style.display = btn.dataset.role === "parent" ? "block" : "none";
    };
  });

  document.getElementById("parent-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("p-classname").value;
    const code = document.getElementById("p-password").value;
    const btn = document.getElementById("p-submit");
    btn.disabled = true;
    try {
      const lookupId = classLookupId(name, code);
      const snap = await getDoc(doc(db, "classLookup", lookupId));
      if (!snap.exists()) {
        toast("학급 이름 또는 비밀번호가 올바르지 않습니다.", true);
        return;
      }
      location.href = `submit.html?class=${snap.data().classId}`;
    } catch (err) {
      console.error(err);
      toast("오류가 발생했습니다: " + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}
