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

// 학부모가 "학급 이름 + 비밀번호"로 입장할 때 쓰는 조회용 문서 ID.
// 이름과 비밀번호를 둘 다 정확히 알아야 같은 ID를 만들 수 있어서,
// classLookup 컬렉션을 목록 조회(list) 없이 단건 조회(get)만 허용해도 안전하다.
function normalizeForLookup(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function classLookupId(name, code) {
  return `${normalizeForLookup(name)}__${normalizeForLookup(code)}`;
}

export const REASON_TYPES = ["출석인정결석", "질병결석", "기타결석"];

export const DIRECT_INPUT = "직접입력";

export const REASON_SUBTYPES = {
  "출석인정결석": ["감염병", "경조사", "학생선수", "생리통", DIRECT_INPUT],
  "질병결석": ["2일 이내", "3일 이상", "기저질환/만성질환", DIRECT_INPUT],
  "기타결석": [],
};

export const STATUS_LABEL = {
  "서류대기": { label: "서류대기", cls: "badge-wait" },
  "제출완료": { label: "제출완료", cls: "badge-done" },
  "확인완료": { label: "확인완료", cls: "badge-checked" },
  "반려": { label: "반려", cls: "badge-rejected" },
};

// 지원하는 서류 종류. deadline은 미제출 "기한초과" 판단 기준(실제 서식에 적힌 제출 기한)이다.
export const DOC_TYPES = [
  { id: "absence", label: "결석계", pdfFile: "absence.pdf", deadline: { days: 5, from: "startDate" } },
  { id: "tripApply", label: "교외체험학습 신청서", pdfFile: "tripApply.pdf", deadline: null },
  { id: "tripReport", label: "교외체험학습 보고서", pdfFile: "tripReport.pdf", deadline: { days: 7, from: "endDate" } },
];

export function getDocType(id) {
  return DOC_TYPES.find((d) => d.id === id) || DOC_TYPES[0];
}

// 결석계 양식 설계 화면(template.js)과 학부모 제출 화면(submit.js)이 공통으로 쓰는
// "입력란 위치 지정" 대상 목록. type: text(글자) / mark(체크표시) / sig(서명 이미지)
export const FIELD_TARGETS_BY_TYPE = {
  absence: [
    { id: "text:studentName", label: "학생 이름", type: "text", size: 11 },
    { id: "text:studentNumber", label: "번호", type: "text", size: 11 },
    { id: "mark:gender:남", label: "성별 - 남", type: "mark" },
    { id: "mark:gender:여", label: "성별 - 여", type: "mark" },
    { id: "text:period", label: "결석 기간 문구", type: "text", size: 10, width: 260 },
    { id: "mark:absenceType:출석인정결석", label: "결석유형 - 출석인정결석", type: "mark" },
    { id: "mark:absenceType:질병결석", label: "결석유형 - 질병결석", type: "mark" },
    { id: "mark:absenceType:기타결석", label: "결석유형 - 기타결석", type: "mark" },
    { id: "text:reasonDetail", label: "결석 사유 (상세)", type: "text", size: 10, width: 420 },
    { id: "text:guardianName", label: "보호자 성명", type: "text", size: 11 },
    { id: "text:writeDate", label: "신고일자", type: "text", size: 10 },
    { id: "sig", label: "서명란 (이미지)", type: "sig", width: 110, height: 45 },
  ],
  tripApply: [
    { id: "text:studentName", label: "학생 이름", type: "text", size: 11 },
    { id: "text:studentNumber", label: "번호", type: "text", size: 11 },
    { id: "mark:gender:남", label: "성별 - 남", type: "mark" },
    { id: "mark:gender:여", label: "성별 - 여", type: "mark" },
    { id: "text:contact", label: "연락처", type: "text", size: 10 },
    { id: "text:period", label: "체험학습 기간 문구", type: "text", size: 10, width: 260 },
    { id: "text:purpose", label: "목적", type: "text", size: 10, width: 420 },
    { id: "text:location", label: "장소", type: "text", size: 10, width: 420 },
    { id: "text:studyPlan", label: "학습계획", type: "text", size: 10, width: 420 },
    { id: "mark:accompany:예", label: "보호자 동행 - 예", type: "mark" },
    { id: "mark:accompany:아니오", label: "보호자 동행 - 아니오", type: "mark" },
    { id: "mark:contact5day:예", label: "5일초과 시 연락 - 예", type: "mark" },
    { id: "mark:contact5day:아니오", label: "5일초과 시 연락 - 아니오", type: "mark" },
    { id: "text:writeDate", label: "신청일자", type: "text", size: 10 },
    { id: "sig", label: "서명란 (이미지)", type: "sig", width: 110, height: 45 },
  ],
  tripReport: [
    { id: "text:studentName", label: "학생 이름", type: "text", size: 11 },
    { id: "text:studentNumber", label: "번호", type: "text", size: 11 },
    { id: "text:period", label: "체험학습 기간 문구", type: "text", size: 10, width: 260 },
    { id: "text:reportContent", label: "학습 내용", type: "text", size: 10, width: 460 },
    { id: "text:writeDate", label: "보고일자", type: "text", size: 10 },
    { id: "sig", label: "서명란 (이미지)", type: "sig", width: 110, height: 45 },
  ],
};
