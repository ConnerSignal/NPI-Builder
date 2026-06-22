import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { getArtifact, artifacts } from '../data/artifacts';

export type ProjectDoc = Record<string, string>; // field -> value

export interface ProjectVersion {
  id: string;
  timestamp: string;
  label?: string;
  snapshot: {
    name: string;
    context: string;
    documents: Record<string, ProjectDoc>;
  };
}

export type Project = {
  id: string;
  name: string;
  context: string;
  version: string;
  author: string;
  description: string;
  documents: Record<string, Record<string, string>>;
  updatedAt: string;
  history: ProjectVersion[];
};

export function projectToMarkdown(proj: Project, docId?: string): string {
  const lines: string[] = [];
  lines.push(`# ${proj.name}`);
  lines.push('');
  if (proj.context) {
    lines.push('## Project Context');
    lines.push(proj.context);
    lines.push('');
  }

  const docIds = docId ? [docId] : Object.keys(proj.documents).sort();

  for (const id of docIds) {
    const art = getArtifact(id);
    const doc = proj.documents[id] || {};
    lines.push(`## ${art.shortName} — ${art.name}`);
    lines.push('');
    lines.push(`> ${art.definition}`);
    lines.push('');

    for (const [key, guidance] of Object.entries(art.template)) {
      const val = doc[key] || '';
      lines.push(`### ${key}`);
      lines.push(`_${guidance}_`);
      lines.push('');
      lines.push(val || '_[Not yet filled]_');
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDocx(proj: Project, docId: string): Promise<void> {
  const art = getArtifact(docId);
  const docContent = proj.documents[docId] || {};

  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `${art.shortName} — ${art.name}`, bold: true })],
    }),
    new Paragraph({ children: [new TextRun({ text: proj.name, italics: true, size: 22 })] }),
    new Paragraph({ children: [] }),
    new Paragraph({ children: [new TextRun({ text: art.definition })] }),
    new Paragraph({ children: [] }),
  ];

  for (const [key, guidance] of Object.entries(art.template)) {
    const value = docContent[key] || '';
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: key, bold: true })],
      }),
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: guidance, italics: true, size: 20, color: '555555' })],
      }),
    );
    children.push(new Paragraph({ children: [] }));
    const paragraphs = (value || '(empty)').split(/\n{2,}/);
    for (const p of paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(p)] }));
    }
    children.push(new Paragraph({ children: [] }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${proj.name.replace(/[^\w-]+/g, '_')}_${art.shortName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportProjectZip(proj: Project): Promise<void> {
  const zip = new JSZip();

  // project meta
  zip.file('project.json', JSON.stringify({
    id: proj.id,
    name: proj.name,
    context: proj.context,
    updatedAt: proj.updatedAt,
  }, null, 2));

  if (proj.context) {
    zip.file('context.md', proj.context);
  }

  // per doc
  for (const [docId, fields] of Object.entries(proj.documents)) {
    const art = getArtifact(docId);
    let md = `# ${art.shortName} — ${art.name}\n\n`;
    md += `Project: ${proj.name}\n\n`;
    for (const [k, v] of Object.entries(fields)) {
      md += `## ${k}\n\n${v || ''}\n\n`;
    }
    zip.file(`docs/${art.shortName.toLowerCase()}.md`, md);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${proj.name.replace(/[^\w-]+/g, '_')}_npi-docs.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Slick, minimalist, reusable PDF export.
 * Clean typography, generous whitespace, subtle accent, efficient layout.
 * Designed to look professional on any NPI initiative.
 */
export function exportMinimalistPdf(proj: Project): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const accent = '#0f7c90';
  const textColor = '#1a2942';
  const muted = '#5d6d86';

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
      addFooter();
    }
  };

  const addFooter = () => {
    const pageNum = doc.getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(
      `${proj.name} • NPI Document Pack • Page ${pageNum}`,
      margin,
      pageHeight - 25
    );
  };

  // Title page - minimalist and elegant
  doc.setFontSize(28);
  doc.setTextColor(textColor);
  doc.text(proj.name, margin, y + 20);
  y += 50;

  doc.setFontSize(14);
  doc.setTextColor(accent);
  doc.text('NPI Document Pack', margin, y);
  y += 25;

  doc.setFontSize(11);
  doc.setTextColor(muted);
  doc.text('Minimalist • Reusable • Evidence-based', margin, y);
  y += 40;

  if (proj.context) {
    doc.setFontSize(10);
    doc.setTextColor(textColor);
    const contextLines = doc.splitTextToSize(proj.context, contentWidth);
    doc.text(contextLines, margin, y);
    y += contextLines.length * 14 + 20;
  }

  doc.setDrawColor(accent);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 30;

  // Table of contents style
  doc.setFontSize(12);
  doc.setTextColor(accent);
  doc.text('Contents', margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(textColor);
  artifacts.forEach((art) => {
    checkPageBreak(16);
    doc.text(`${art.shortName}  —  ${art.name}`, margin, y);
    y += 14;
  });

  y += 25;
  addFooter();

  // Now each artifact
  const docIds = Object.keys(proj.documents).sort((a, b) => {
    const order = ['pcd', 'prd', 'pdd', 'sdd', 'hld', 'lld', 'risk-register', 'launch-checklist', 'post-launch-review'];
    return order.indexOf(a) - order.indexOf(b);
  });

  docIds.forEach((docId) => {
    const art = getArtifact(docId);
    const fields = proj.documents[docId] || {};

    checkPageBreak(120);

    // Section header - clean and prominent
    doc.setFontSize(16);
    doc.setTextColor(accent);
    doc.text(`${art.shortName} — ${art.name}`, margin, y);
    y += 18;

    doc.setFontSize(9);
    doc.setTextColor(muted);
    const defLines = doc.splitTextToSize(art.definition, contentWidth);
    doc.text(defLines, margin, y);
    y += defLines.length * 12 + 12;

    // Subtle separator
    doc.setDrawColor('#e5e4e7');
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    // Fields
    Object.entries(art.template).forEach(([key]) => {
      const value = fields[key] || '';
      if (!value.trim()) return;

      checkPageBreak(80);

      doc.setFontSize(10);
      doc.setTextColor(accent);
      doc.text(key, margin, y);
      y += 13;

      doc.setFontSize(9.5);
      doc.setTextColor(textColor);
      const lines = doc.splitTextToSize(value, contentWidth - 10);
      doc.text(lines, margin + 5, y);
      y += lines.length * 11 + 10;
    });

    y += 12;
  });

  addFooter();

  // Save
  const filename = `${proj.name.replace(/[^\w-]+/g, '_')}_NPI-Pack.pdf`;
  doc.save(filename);
}

/**
 * Improved DOCX that echoes the same minimalist aesthetic.
 */
export async function exportMinimalistDocx(proj: Project, docId: string): Promise<void> {
  const art = getArtifact(docId);
  const docContent = proj.documents[docId] || {};

  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: `${art.shortName} — ${art.name}`, bold: true, size: 28, color: '0f7c90' })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: proj.name, italics: true, size: 20, color: '5d6d86' })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: art.definition, size: 18, color: '5d6d86' })],
    }),
  ];

  Object.entries(art.template).forEach(([key, guidance]) => {
    const value = docContent[key] || '';
    if (!value.trim()) return;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 160, after: 60 },
        children: [new TextRun({ text: key, bold: true, size: 22, color: '0f7c90' })],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: guidance, italics: true, size: 16, color: '5d6d86' })],
      }),
    );

    const paragraphs = value.split(/\n{2,}/);
    paragraphs.forEach((p) => {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: p, size: 20 })],
        }),
      );
    });
  });

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${proj.name.replace(/[^\w-]+/g, '_')}_${art.shortName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
