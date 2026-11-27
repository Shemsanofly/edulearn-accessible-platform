/**
 * Tables as files: Excel (.xlsx), CSV and PDF, for templates, exports and imports.
 *
 * A template carries what it was made for (kind, version, format, class, assessment or date, header row and column
 * order) plus an HMAC signature of those details:
 *   - in Excel, on a hidden "_edulearn" sheet;
 *   - in CSV, in the first row ("EduLearn template — keep this row unchanged", <details>.<signature>).
 * Uploads are only accepted when the signature matches, so a template can't silently be pointed at a different class
 * or assessment, and a CSV saved by Excel (comma, semicolon or tab separated, with or without BOM) still reads back.
 */
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import type { FileFormat } from '../../../shared/types.js';
import { config } from '../config.js';
import { badRequest } from './http.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME: Record<FileFormat, string> = { xlsx: XLSX_MIME, csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
export const TEMPLATE_VERSION = 1;
const META_SHEET = '_edulearn';
const CSV_MARKER = 'EduLearn template — keep this row unchanged';
const BRAND = 'FF0E6672';
const LOCKED_FILL = 'FFF3F1EC';

export interface TemplateMeta {
  kind: string;
  version: number;
  format: 'xlsx' | 'csv';
  sheetName: string;
  headerRow: number;
  columns: string[];
  generatedAt: string;
  [key: string]: unknown;
}

const sign = (meta: TemplateMeta) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`edulearn-template:${JSON.stringify(meta)}`).digest('hex');

export interface SheetColumn {
  key: string;
  header: string;
  width: number;
  /** Entry columns are left unlocked (and get a white background); the rest are locked. */
  entry?: boolean;
  validation?: ExcelJS.DataValidation;
  align?: 'left' | 'right' | 'center';
}

export type Cell = string | number | null;

export interface SheetSpec {
  sheetName: string;
  title: string;
  details: [string, string][];
  instructions: string[];
  columns: SheetColumn[];
  rows: Cell[][];
  /** Present for templates (which can be uploaded again); absent for read-only exports. */
  meta?: Record<string, unknown> & { kind: string };
  /** When false, Excel cells stay editable everywhere (exports that can be edited and imported back). */
  lockIdentifiers?: boolean;
  footerNote?: string;
  /** Extra reference sheets in Excel (for example the list of class names). */
  lists?: { name: string; header: string; values: string[] }[];
  references?: { name: string; headers: string[]; rows: (string | number | null)[][] }[];
}

const fullMeta = (spec: SheetSpec, format: 'xlsx' | 'csv', headerRow: number): TemplateMeta => ({
  ...spec.meta!, version: TEMPLATE_VERSION, format, sheetName: spec.sheetName, headerRow,
  columns: spec.columns.map((c) => c.key), generatedAt: new Date().toISOString(),
});

// --------------------------------------------------------------------------------------------------------- Excel
export async function buildWorkbook(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduLearn';
  wb.created = new Date();
  wb.title = spec.title;
  const ws = wb.addWorksheet(spec.sheetName, { views: [{ showGridLines: false }] });
  spec.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  ws.getCell('A1').value = spec.title;
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: BRAND } };
  let r = 3;
  for (const [label, value] of spec.details) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, color: { argb: 'FF57535F' } };
    ws.getCell(r, 2).value = value;
    r++;
  }
  if (spec.instructions.length) {
    r++;
    ws.getCell(r, 1).value = 'How to fill in';
    ws.getCell(r, 1).font = { bold: true };
    r++;
    for (const line of spec.instructions) {
      ws.getCell(r, 1).value = `•  ${line}`;
      ws.getCell(r, 1).font = { color: { argb: 'FF57535F' } };
      r++;
    }
  }
  r++;
  const headerRow = r;
  spec.columns.forEach((c, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: c.align ?? 'left' };
  });
  ws.getRow(headerRow).height = 30;

  const protect = !!spec.meta && spec.lockIdentifiers !== false;
  spec.rows.forEach((values, idx) => {
    const rowNo = headerRow + 1 + idx;
    spec.columns.forEach((c, i) => {
      const cell = ws.getCell(rowNo, i + 1);
      cell.value = values[i] ?? null;
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E1D9' } } };
      cell.alignment = { horizontal: c.align ?? 'left' };
      if (spec.meta) {
        if (c.entry || !protect) {
          cell.protection = { locked: false };
          if (c.validation) cell.dataValidation = c.validation;
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOCKED_FILL } };
        }
      }
    });
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  if (spec.footerNote) ws.getCell(headerRow + spec.rows.length + 2, 1).value = spec.footerNote;

  for (const list of spec.lists ?? []) {
    const ls = wb.addWorksheet(list.name);
    ls.getColumn(1).width = 30;
    ls.getCell('A1').value = list.header;
    ls.getCell('A1').font = { bold: true };
    list.values.forEach((v, i) => { ls.getCell(i + 2, 1).value = v; });
  }

  if (spec.meta) {
    // Identifier columns are locked so they aren't changed by accident; the server checks them anyway.
    if (protect) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, insertRows: true });
    const meta = fullMeta(spec, 'xlsx', headerRow);
    const hidden = wb.addWorksheet(META_SHEET, { state: 'veryHidden' });
    hidden.getCell('A1').value = 'EduLearn template details. Do not edit.';
    hidden.getCell('A2').value = JSON.stringify(meta);
    hidden.getCell('A3').value = sign(meta);
  }
  for (const reference of spec.references ?? []) {
    const sheet = wb.addWorksheet(reference.name);
    sheet.addRow(reference.headers);
    reference.rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    reference.headers.forEach((_, i) => { sheet.getColumn(i + 1).width = 28; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----------------------------------------------------------------------------------------------------------- CSV
/** Quote for CSV, and stop spreadsheet apps treating text such as "=cmd" or "+255…" as a formula. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(spec: SheetSpec): Buffer {
  const lines: Cell[][] = [];
  if (spec.meta) {
    const meta = fullMeta(spec, 'csv', 2);
    const token = `${Buffer.from(JSON.stringify(meta)).toString('base64url')}.${sign(meta)}`;
    lines.push([CSV_MARKER, token]);
  }
  lines.push(spec.columns.map((c) => c.header));
  for (const row of spec.rows) lines.push(spec.columns.map((_, i) => row[i] ?? null));
  // A byte-order mark makes Excel open the file as UTF-8 (names with accents, "—", "·").
  return Buffer.from(`﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

/** Parse CSV text (RFC 4180 quoting). The separator is detected from the first line: comma, semicolon or tab. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // Undo the formula guard added on export ('=…, '+…).
  return rows.map((r) => r.map((c) => (/^'[=+\-@]/.test(c) ? c.slice(1) : c)));
}

// ----------------------------------------------------------------------------------------------------------- PDF
export function buildPdf(spec: SheetSpec): Promise<Buffer> {
  const totalWidth = spec.columns.reduce((s, c) => s + c.width, 0);
  const landscape = spec.columns.length > 6 || totalWidth > 90;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: spec.title, Author: 'EduLearn' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const widths = spec.columns.map((c) => (c.width / totalWidth) * usable);
  const bottom = () => doc.page.height - doc.page.margins.bottom - 16;
  const pad = 4;
  const rowH = 18;

  doc.fillColor('#0e6672').font('Helvetica-Bold').fontSize(15).text(spec.title, left, doc.y);
  doc.moveDown(0.3).fillColor('#57535f').font('Helvetica').fontSize(9);
  doc.text(spec.details.map(([k, v]) => `${k}: ${v}`).join('    '), { width: usable });
  doc.moveDown(0.8);

  const header = () => {
    const y = doc.y;
    doc.rect(left, y, usable, rowH + 4).fill('#0e6672');
    let x = left;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    spec.columns.forEach((c, i) => {
      doc.text(c.header, x + pad, y + 6, { width: widths[i]! - pad * 2, height: rowH, ellipsis: true, lineBreak: false, align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' });
      x += widths[i]!;
    });
    doc.y = y + rowH + 4;
  };
  header();
  spec.rows.forEach((row, n) => {
    if (doc.y + rowH > bottom()) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (n % 2 === 1) doc.rect(left, y, usable, rowH).fill('#f3f1ec');
    let x = left;
    doc.fillColor('#1d1b22').font('Helvetica').fontSize(8);
    spec.columns.forEach((c, i) => {
      const v = row[i];
      doc.text(v === null || v === undefined ? '' : String(v), x + pad, y + 5, { width: widths[i]! - pad * 2, height: rowH, ellipsis: true, lineBreak: false, align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' });
      x += widths[i]!;
    });
    doc.y = y + rowH;
  });
  if (!spec.rows.length) doc.fillColor('#57535f').fontSize(9).text('No records.', left, doc.y + 8);
  if (spec.footerNote) doc.moveDown(1).fillColor('#57535f').fontSize(8).text(spec.footerNote, left, doc.y + 6, { width: usable });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fillColor('#6b6774').fontSize(7.5).text(
      `${spec.title} · Page ${i + 1} of ${range.count} · ${new Date().toLocaleDateString('en-GB')}`,
      left, doc.page.height - doc.page.margins.bottom + 6, { width: usable, align: 'center', lineBreak: false },
    );
  }
  doc.end();
  return done;
}

// --------------------------------------------------------------------------------------------------------- Output
export async function renderTable(spec: SheetSpec, format: FileFormat): Promise<Buffer> {
  if (format === 'csv') return buildCsv(spec);
  if (format === 'pdf') return buildPdf({ ...spec, meta: undefined });
  return buildWorkbook(spec);
}

export function sendFile(res: Response, filename: string, format: FileFormat, buffer: Buffer) {
  const safe = `${filename.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 110)}.${format}`;
  res.setHeader('Content-Type', MIME[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

export async function sendTable(res: Response, filename: string, format: FileFormat, spec: SheetSpec) {
  sendFile(res, filename, format, await renderTable(spec, format));
}

/** ?format=xlsx|csv|pdf (templates allow only xlsx and csv). */
export function formatParam(value: unknown, allowPdf: boolean): FileFormat {
  const f = String(value ?? 'xlsx').toLowerCase();
  if (f === 'xlsx' || f === 'csv' || (allowPdf && f === 'pdf')) return f;
  throw badRequest(allowPdf ? 'Choose Excel, CSV or PDF' : 'Templates come as Excel or CSV');
}

// --------------------------------------------------------------------------------------------------------- Import
export interface Template {
  meta: TemplateMeta;
  sheet: ExcelJS.Worksheet;
}

function checkMeta(meta: TemplateMeta, signature: string, kind: string, kindLabel: (k: string) => string) {
  const expected = sign(meta);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw badRequest('The template’s hidden details were changed. Download a fresh template and copy your entries into it.');
  }
  if (meta.version !== TEMPLATE_VERSION) throw badRequest('This template is from a different version of EduLearn. Download a new template.');
  if (meta.kind !== kind) throw badRequest(`This is ${kindLabel(meta.kind)} template, not ${kindLabel(kind)} template.`);
}

const KIND_LABEL: Record<string, string> = {
  marks: 'a marks', attendance: 'an attendance', students: 'a students', teachers: 'a teachers', parents: 'a parents',
};
const label = (k: string) => KIND_LABEL[k] ?? `a ${k}`;

/** Open an uploaded Excel or CSV template and check it is a genuine, unmodified EduLearn template of the expected kind. */
export async function readTemplate(file: unknown, kind: string): Promise<Template> {
  if (!Buffer.isBuffer(file) || file.length === 0) throw badRequest('Choose the completed file to upload.');
  const isZip = file.length > 4 && file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04;
  if (!isZip) return readCsvTemplate(file, kind);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw badRequest('This file isn’t an Excel workbook (.xlsx) or a CSV file. Save it as .xlsx or .csv and try again.');
  }
  const hidden = wb.getWorksheet(META_SHEET);
  const raw = hidden?.getCell('A2').value;
  const signature = hidden?.getCell('A3').value;
  if (!hidden || typeof raw !== 'string' || typeof signature !== 'string') {
    throw badRequest('This isn’t an EduLearn template. Download a template from EduLearn and enter the data there.');
  }
  let meta: TemplateMeta;
  try {
    meta = JSON.parse(raw) as TemplateMeta;
  } catch {
    throw badRequest('The template’s hidden details are damaged. Download a fresh template.');
  }
  checkMeta(meta, signature, kind, label);
  const sheet = wb.getWorksheet(meta.sheetName);
  if (!sheet) throw badRequest(`The “${meta.sheetName}” sheet is missing. Download a fresh template.`);
  if (sheet.rowCount - meta.headerRow > 2000) throw badRequest('The file has too many rows (at most 2000).');
  return { meta, sheet };
}

function readCsvTemplate(file: Buffer, kind: string): Template {
  const text = file.toString('utf8').replace(/^﻿/, '');
  if (text.includes('\u0000') || !text.trim()) throw badRequest('This file isn’t an Excel workbook (.xlsx) or a CSV file. Save it as .xlsx or .csv and try again.');
  const rows = parseCsv(text);
  const [marker, token] = rows[0] ?? [];
  if (marker?.trim() !== CSV_MARKER || !token) {
    throw badRequest('This isn’t an EduLearn template: its first row is missing or changed. Download a template from EduLearn and enter the data there.');
  }
  const [payload, signature] = token.trim().split('.');
  let meta: TemplateMeta;
  try {
    meta = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as TemplateMeta;
  } catch {
    throw badRequest('The template’s first row is damaged. Download a fresh template.');
  }
  checkMeta(meta, signature ?? '', kind, label);
  if (rows.length - meta.headerRow > 2000) throw badRequest('The file has too many rows (at most 2000).');
  const sheet = new ExcelJS.Workbook().addWorksheet(meta.sheetName);
  for (const r of rows) sheet.addRow(r.map((c) => (c === '' ? null : c)));
  return { meta, sheet };
}

export interface CellRead {
  /** Trimmed text, '' when the cell is empty. */
  text: string;
  /** The number, when the cell holds one (or text that is clearly a number). */
  num: number | null;
  /** Excel error such as #VALUE!, when a formula failed. */
  error: string | null;
  /** The date, when Excel stored a date. */
  date: Date | null;
}

/** Read a cell as plain text and/or a number, whatever Excel stored (formulas, rich text, links, dates). */
export function readCell(value: ExcelJS.CellValue): CellRead {
  if (value === null || value === undefined) return { text: '', num: null, error: null, date: null };
  if (typeof value === 'number') return { text: String(value), num: value, error: null, date: null };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', num: null, error: null, date: null };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), num: null, error: null, date: value };
  if (typeof value === 'string') {
    const text = value.replace(/ /g, ' ').trim();
    const num = /^-?\d+([.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : null;
    return { text, num, error: null, date: null };
  }
  if (typeof value === 'object') {
    if ('error' in value && value.error) return { text: '', num: null, error: String(value.error), date: null };
    if ('formula' in value || 'sharedFormula' in value) return readCell((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ('richText' in value) return readCell(value.richText.map((t) => t.text).join(''));
    if ('text' in value) return readCell(String((value as { text: unknown }).text));
  }
  return readCell(String(value));
}
