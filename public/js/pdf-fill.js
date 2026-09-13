// 결석계 PDF에 학부모가 입력한 값을 실제로 그려 넣는 공통 로직.
// pdf-lib(전역 PDFLib)와 fontkit(전역 fontkit)은 각 html에서 <script> 태그로 미리 로드한다.

let cachedFontBytes = null;

async function loadKoreanFontBytes() {
  if (cachedFontBytes) return cachedFontBytes;
  const res = await fetch("assets/fonts/NotoSansKR-VF.ttf");
  if (!res.ok) throw new Error("한글 폰트를 불러오지 못했습니다.");
  cachedFontBytes = new Uint8Array(await res.arrayBuffer());
  return cachedFontBytes;
}

function wrapText(text, font, size, maxWidth) {
  if (!maxWidth || !text) return [text || ""];
  const lines = [];
  let current = "";
  for (const ch of String(text)) {
    const trial = current + ch;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// fields: template.js에서 저장한 { "text:key": {x,y,size,width,label}, "mark:group:option": {x,y}, sig: {x,y,width,height} }
// values: 각 서류 종류(FIELD_TARGETS_BY_TYPE)의 key와 같은 이름의 값들을 담은 객체
// signatureDataUrl: 서명 캔버스에서 얻은 PNG data URL (없으면 서명 생략)
export async function fillTemplate({ templateBytes, fields, values, signatureDataUrl }) {
  const { PDFDocument, rgb } = window.PDFLib;
  const fontkit = window.fontkit;
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await loadKoreanFontBytes();
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const page = pdfDoc.getPages()[0];
  const black = rgb(0.05, 0.05, 0.05);

  for (const [key, f] of Object.entries(fields)) {
    if (!key.startsWith("text:")) continue;
    const val = values[key.slice(5)];
    if (!val) continue;
    const size = f.size || 11;
    const lines = wrapText(val, font, size, f.width);
    lines.forEach((line, i) => {
      page.drawText(line, { x: f.x, y: f.y - i * (size + 3), size, font, color: black });
    });
  }

  for (const [markKey, f] of Object.entries(fields)) {
    if (!markKey.startsWith("mark:")) continue;
    const [, group, option] = markKey.split(":");
    const selected = values[group];
    if (selected && selected === option) {
      page.drawText("V", { x: f.x, y: f.y, size: 12, font, color: black });
    }
  }

  if (signatureDataUrl && fields.sig) {
    const sigBytes = dataUrlToBytes(signatureDataUrl);
    const img = await pdfDoc.embedPng(sigBytes);
    const f = fields.sig;
    page.drawImage(img, { x: f.x, y: f.y, width: f.width, height: f.height });
  }

  return pdfDoc.save();
}

// 이미 완성된 제출 PDF 위에 담임 서명(도장) 이미지만 추가로 얹는다.
// "확인완료" 처리 시 호출되며, 한글 텍스트를 새로 그리지 않으므로 폰트가 필요 없다.
export async function stampTeacherSignature({ pdfBytes, field, signatureBytes }) {
  const { PDFDocument } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0];
  const img = await pdfDoc.embedPng(signatureBytes);
  page.drawImage(img, { x: field.x, y: field.y, width: field.width, height: field.height });
  return pdfDoc.save();
}

export async function mergePdfs(byteArrays) {
  const { PDFDocument } = window.PDFLib;
  const merged = await PDFDocument.create();
  for (const bytes of byteArrays) {
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const SAMPLE_VALUES = {
  studentName: "홍길동",
  studentNumber: "7",
  period: "2026년 9월 15일 ~ 2026년 9월 15일 (1일간)",
  reasonDetail: "감기 몸살로 인한 통원 치료 (샘플 미리보기)",
  guardianName: "홍판서",
  writeDate: "2026년 9월 15일",
  gender: "남",
  absenceType: "질병결석",
  contact: "010-1234-5678",
  purpose: "가족 여행",
  location: "제주도",
  studyPlan: "제주 자연사박물관 견학 및 생태 체험 (샘플 미리보기)",
  accompany: "예",
  contact5day: "예",
  reportContent: "제주 자연사박물관에서 화산 지형과 생태계를 관찰하고 기록했습니다. (샘플 미리보기)",
};
