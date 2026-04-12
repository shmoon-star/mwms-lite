"use client";

import { useEffect } from "react";

// ── CSV export ────────────────────────────────────────────────────────────────

function tableTocsv(table: HTMLTableElement): string {
  const rows: string[] = [];

  table.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th, td")).map((cell) => {
      // Skip resizer handles from text
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".col-rsz-handle, .csv-btn-wrap").forEach((el) => el.remove());
      const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
      // Escape double quotes, wrap in quotes if contains comma/newline
      const escaped = text.replace(/"/g, '""');
      return /[,"\n]/.test(escaped) ? `"${escaped}"` : escaped;
    });
    if (cells.some((c) => c !== "")) rows.push(cells.join(","));
  });

  return "\uFEFF" + rows.join("\r\n"); // BOM for Excel
}

function downloadCsv(table: HTMLTableElement) {
  const csv = tableTocsv(table);
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const name = pathParts.length ? pathParts[pathParts.length - 1] : "export";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hasCsvNearby(table: HTMLTableElement): boolean {
  let el: Element | null = table;
  for (let i = 0; i < 8; i++) {
    el = el?.parentElement ?? null;
    if (!el) break;
    const btns = el.querySelectorAll("button, a");
    for (const btn of btns) {
      const txt = (btn.textContent ?? "").toLowerCase();
      if (txt.includes("csv") || txt.includes("export") || txt.includes("다운로드")) return true;
    }
  }
  return false;
}

function injectCsvButton(table: HTMLTableElement) {
  if (table.dataset.csvInit) return;
  if (hasCsvNearby(table)) { table.dataset.csvInit = "skip"; return; }

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  table.dataset.csvInit = "1";

  // Wrap table in relative container if not already
  const parent = table.parentElement;
  if (!parent) return;

  // Create button as absolute overlay on the table wrapper
  const wrap = document.createElement("div");
  wrap.className = "csv-btn-wrap";
  wrap.style.cssText = [
    "display:flex",
    "justify-content:flex-end",
    "margin-bottom:6px",
  ].join(";");

  const btn = document.createElement("button");
  btn.textContent = "⬇ CSV";
  btn.style.cssText = [
    "font-size:12px",
    "padding:4px 10px",
    "border:1px solid #d1d5db",
    "border-radius:6px",
    "background:#fff",
    "color:#374151",
    "cursor:pointer",
    "display:inline-flex",
    "align-items:center",
    "gap:4px",
    "transition:background 0.15s",
  ].join(";");

  btn.addEventListener("mouseenter", () => { btn.style.background = "#f3f4f6"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "#fff"; });
  btn.addEventListener("click", () => downloadCsv(table));

  wrap.appendChild(btn);
  parent.insertBefore(wrap, table);
}

// ── Column resize ─────────────────────────────────────────────────────────────

function makeResizable(table: HTMLTableElement) {
  if (table.dataset.rszInit) return;
  const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
  if (ths.length === 0) return;

  table.dataset.rszInit = "1";

  const widths = ths.map((th) => th.getBoundingClientRect().width);
  table.style.tableLayout = "fixed";
  table.style.width = table.getBoundingClientRect().width + "px";

  ths.forEach((th, i) => {
    th.style.width = widths[i] + "px";
    th.style.overflow = "hidden";
    th.style.position = "relative";
    th.style.userSelect = "none";
    th.style.whiteSpace = "nowrap";

    if (th.querySelector(".col-rsz-handle")) return;

    const handle = document.createElement("div");
    handle.className = "col-rsz-handle";
    handle.style.cssText = [
      "position:absolute",
      "right:0",
      "top:0",
      "height:100%",
      "width:6px",
      "cursor:col-resize",
      "z-index:10",
      "background:transparent",
      "transition:background 0.15s",
    ].join(";");

    handle.addEventListener("mouseenter", () => { handle.style.background = "rgba(99,102,241,0.35)"; });
    handle.addEventListener("mouseleave", () => { handle.style.background = "transparent"; });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        th.style.width = Math.max(40, startW + ev.clientX - startX) + "px";
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    th.appendChild(handle);
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TableResizer() {
  useEffect(() => {
    function initAll() {
      document.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
        makeResizable(table);
        injectCsvButton(table);
      });
    }

    const raf = requestAnimationFrame(initAll);

    // Throttle: MutationObserver가 너무 자주 발화하지 않도록 300ms debounce
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(initAll, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return null;
}
