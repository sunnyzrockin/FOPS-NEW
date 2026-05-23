'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * FOPS branded PDF generator.
 *
 * Provides:
 *   - Branded header (gradient bar + FOPS logotype + subtitle)
 *   - Date-range banner
 *   - Optional KPI strip
 *   - Tables (via jspdf-autotable)
 *   - Footer with page numbers + generation timestamp
 *
 * Usage:
 *   const doc = createFopsPdf({ title: 'Monthly Report', subtitle: 'Site X', dateRange: { from, to } });
 *   addKpiStrip(doc, [{ label: 'Revenue', value: '$10,000' }, ...]);
 *   addTable(doc, headers, rows);
 *   finalizeFopsPdf(doc);
 *   doc.save('report.pdf');
 */

const FOPS_BLUE = [37, 99, 235]; // tailwind blue-600
const FOPS_INDIGO = [79, 70, 229]; // tailwind indigo-600
const SLATE_700 = [51, 65, 85];
const SLATE_500 = [100, 116, 139];
const SLATE_100 = [241, 245, 249];

export function createFopsPdf({ title = 'FOPS Report', subtitle = '', dateRange = null, orientation = 'landscape' } = {}) {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  doc.__fopsMeta = { title, subtitle, dateRange, orientation };
  drawHeader(doc, { title, subtitle, dateRange });
  return doc;
}

function drawHeader(doc, { title, subtitle, dateRange }) {
  const pageW = doc.internal.pageSize.getWidth();
  // Top gradient bar simulated with two rectangles
  doc.setFillColor(...FOPS_BLUE);
  doc.rect(0, 0, pageW / 2, 6, 'F');
  doc.setFillColor(...FOPS_INDIGO);
  doc.rect(pageW / 2, 0, pageW / 2, 6, 'F');

  // FOPS logo block (rounded square)
  doc.setFillColor(...FOPS_BLUE);
  doc.roundedRect(36, 18, 28, 28, 6, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('⛽', 50, 38, { align: 'center' });

  // Brand name
  doc.setTextColor(...FOPS_BLUE);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FOPS', 72, 36);

  // Tagline
  doc.setTextColor(...SLATE_500);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Fuel Operations Platform', 72, 48);

  // Title (right side)
  doc.setTextColor(...SLATE_700);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageW - 36, 32, { align: 'right' });

  if (subtitle) {
    doc.setTextColor(...SLATE_500);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageW - 36, 46, { align: 'right' });
  }

  // Date range banner
  if (dateRange?.from || dateRange?.to) {
    const yBanner = 60;
    doc.setFillColor(...SLATE_100);
    doc.rect(36, yBanner, pageW - 72, 22, 'F');
    doc.setTextColor(...SLATE_700);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const txt = `Period: ${dateRange.from || '—'}  →  ${dateRange.to || '—'}`;
    doc.text(txt, 44, yBanner + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_500);
    const generated = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
    doc.text(`Generated ${generated}`, pageW - 44, yBanner + 14, { align: 'right' });
  }
}

export function addKpiStrip(doc, kpis = []) {
  if (!kpis.length) return;
  const pageW = doc.internal.pageSize.getWidth();
  const startY = 92;
  const padding = 36;
  const gap = 8;
  const cardW = (pageW - padding * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 50;
  kpis.forEach((k, i) => {
    const x = padding + i * (cardW + gap);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(x, startY, cardW, cardH, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.setFont('helvetica', 'normal');
    doc.text(String(k.label || '').toUpperCase(), x + 8, startY + 14);
    doc.setFontSize(14);
    doc.setTextColor(...SLATE_700);
    doc.setFont('helvetica', 'bold');
    doc.text(String(k.value || ''), x + 8, startY + 34);
    if (k.sub) {
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_500);
      doc.setFont('helvetica', 'normal');
      doc.text(String(k.sub), x + 8, startY + 44);
    }
  });
  doc.__fopsMeta.contentStartY = startY + cardH + 16;
}

export function addSectionTitle(doc, text) {
  const y = doc.__fopsMeta.contentStartY || 100;
  doc.setFontSize(12);
  doc.setTextColor(...SLATE_700);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 36, y);
  doc.__fopsMeta.contentStartY = y + 14;
}

export function addTable(doc, head, body, options = {}) {
  const startY = doc.__fopsMeta.contentStartY || 100;
  autoTable(doc, {
    startY,
    head: [head],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4, textColor: SLATE_700, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: FOPS_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 36, right: 36 },
    ...options,
  });
  doc.__fopsMeta.contentStartY = doc.lastAutoTable.finalY + 20;
}

export function finalizeFopsPdf(doc) {
  const total = doc.internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    // Footer bar
    doc.setDrawColor(226, 232, 240);
    doc.line(36, pageH - 28, pageW - 36, pageH - 28);
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.setFont('helvetica', 'normal');
    doc.text('FOPS · Fuel Operations Platform', 36, pageH - 14);
    doc.text(`Page ${i} of ${total}`, pageW - 36, pageH - 14, { align: 'right' });
  }
}

export function saveFopsPdf(doc, filename = 'fops-report.pdf') {
  finalizeFopsPdf(doc);
  doc.save(filename);
}
