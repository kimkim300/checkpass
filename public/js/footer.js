const footer = document.createElement("footer");
footer.style.textAlign = "center";
footer.style.padding = "28px 16px 40px";
footer.style.fontSize = "12.5px";
footer.style.color = "var(--sub)";
footer.innerHTML = `
  © 2026 출결패스 ·
  <a href="terms.html" style="color:var(--sub); text-decoration:underline">이용약관</a> ·
  <a href="privacy.html" style="color:var(--sub); text-decoration:underline">개인정보처리방침</a>
`;
document.body.appendChild(footer);
