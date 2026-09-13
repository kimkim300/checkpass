import { CONFIG_IS_DEFAULT } from "./firebase-init.js";

export function guardConfig() {
  if (!CONFIG_IS_DEFAULT) return false;
  const el = document.createElement("div");
  el.className = "notice";
  el.style.margin = "20px";
  el.innerHTML =
    "Firebase 설정이 아직 되어 있지 않습니다. <code>public/js/firebase-config.js</code> 파일에 " +
    "본인의 Firebase 프로젝트 설정값을 입력한 후 다시 열어주세요. (README.md 참고)";
  document.body.prepend(el);
  return true;
}

export function toast(msg, isError = false) {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function formatKoreanDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

// 시작일~종료일 사이의 평일(월~금) 수. 공휴일은 자동 반영되지 않으므로
// 교사/학부모가 필요 시 직접 일수를 수정할 수 있게 UI에서 노출한다.
export function countWeekdays(startStr, endStr) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function daysBetween(dateStr, fromDateStr) {
  const a = new Date(dateStr + "T00:00:00");
  const b = new Date(fromDateStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

export function getCurrentClassId() {
  return getParam("class") || localStorage.getItem("currentClassId") || "";
}

export function setCurrentClassId(id) {
  localStorage.setItem("currentClassId", id);
}

export const REASON_TYPES = ["출석인정결석", "질병결석", "기타결석"];

export const REASON_SUBTYPES = {
  "출석인정결석": ["감염병", "경조사", "학생선수", "생리통"],
  "질병결석": ["2일 이내", "3일 이상", "기저질환/만성질환"],
  "기타결석": [],
};

export const STATUS_LABEL = {
  "서류대기": { label: "서류대기", cls: "badge-wait" },
  "제출완료": { label: "제출완료", cls: "badge-done" },
  "확인완료": { label: "확인완료", cls: "badge-checked" },
  "반려": { label: "반려", cls: "badge-rejected" },
};
