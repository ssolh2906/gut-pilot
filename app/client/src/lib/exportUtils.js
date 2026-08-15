// exportUtils.js — SVG/PNG/CSV export, ported from the mock. Every chart
// page uses these three functions plus <ChartTools> to offer the same
// download options the mock had, without re-implementing the plumbing.
const NS = "http://www.w3.org/2000/svg";
const SVG_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "font-size",
  "font-family", "font-weight", "text-anchor", "opacity",
];

export function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(",")
    )
    .join("\n");
}

// Serialising the live node ships CSS custom properties that do not
// resolve outside the page, so every computed paint value is written onto
// the clone before export.
function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  const orig = svg.querySelectorAll("*");
  const copy = clone.querySelectorAll("*");
  for (let i = 0; i < orig.length; i++) {
    const cs = getComputedStyle(orig[i]);
    const decl = [];
    SVG_PROPS.forEach((p) => {
      const v = cs.getPropertyValue(p);
      if (v) decl.push(p + ":" + v);
    });
    copy[i].setAttribute("style", decl.join(";"));
    copy[i].removeAttribute("data-tip");
    copy[i].removeAttribute("class");
    // the inline style already wins, but leftover fill="var(--color-cat-1)"
    // attributes break simpler SVG consumers, so drop them outright
    [...copy[i].attributes].forEach((a) => {
      if (a.value.includes("var(")) copy[i].removeAttribute(a.name);
    });
  }
  const vb = (svg.getAttribute("viewBox") || "0 0 900 400").split(/\s+/).map(Number);
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", vb[0]);
  bg.setAttribute("y", vb[1]);
  bg.setAttribute("width", vb[2]);
  bg.setAttribute("height", vb[3]);
  bg.setAttribute("fill", getComputedStyle(document.body).backgroundColor);
  clone.insertBefore(bg, clone.firstChild);
  clone.setAttribute("xmlns", NS);
  clone.setAttribute("width", vb[2]);
  clone.setAttribute("height", vb[3]);
  return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone), w: vb[2], h: vb[3] };
}

export function exportSvg(svgEl, name) {
  const { text } = serializeSvg(svgEl);
  download(name + ".svg", text, "image/svg+xml;charset=utf-8");
}

export function exportPng(svgEl, name, scale) {
  const { text, w, h } = serializeSvg(svgEl);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  img.onload = () => {
    const k = scale || 2;
    const c = document.createElement("canvas");
    c.width = w * k;
    c.height = h * k;
    const ctx = c.getContext("2d");
    ctx.scale(k, k);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob((b) => {
      if (!b) {
        alert("PNG export is not available in this browser. The SVG download works everywhere.");
        return;
      }
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = name + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("PNG export failed. Use the SVG download instead.");
  };
  img.src = url;
}
