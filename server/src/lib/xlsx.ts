/**
 * Excel (.xlsx) helpers for templates and exports.
 *
 * A template carries a hidden "_edulearn" sheet with what it was made for (kind, version, class, assessment or
 * date, header row and column order) and an HMAC signature of those details. Uploads are only accepted when the
 * signature matches, so a template can't silently be pointed at a different class or assessment.
 */
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { config } from '../config.js';
import { badRequest } from './http.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const TEMPLATE_VERSION = 1;
const META_SHEET = '_edulearn';
const BRAND = 'FF0E6672';
const LOCKED_FILL = 'FFF3F1EC';

export interface TemplateMeta {
  kind: 'marks' | 'attendance' | 'records';
  version: number;
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

export interface SheetSpec {
  sheetName: string;
  title: string;
  details: [string, string][];
  instructions: string[];
  columns: SheetColumn[];
  rows: (string | number | null)[][];
  /** Present for templates (which can be uploaded again); absent for read-only exports. */
  meta?: Omit<TemplateMeta, 'version' | 'sheetName' | 'headerRow' | 'columns' | 'generatedAt'>;
  /** Extra columns appended to the header row as plain values (exports). */
  footerNote?: string;
  references?: { name: string; headers: string[]; rows: (string | number | null)[][] }[];
}

/** Build a workbook with a title, a details block, short instructions and a table. */
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

  spec.rows.forEach((values, idx) => {
    const rowNo = headerRow + 1 + idx;
    spec.columns.forEach((c, i) => {
      const cell = ws.getCell(rowNo, i + 1);
      cell.value = values[i] ?? null;
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E1D9' } } };
      cell.alignment = { horizontal: c.align ?? 'left' };
      if (spec.meta) {
        if (c.entry) {
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

  if (spec.meta) {
    // Identifier and name columns are locked so they aren't changed by accident; the server checks them anyway.
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, insertRows: true });
    const meta: TemplateMeta = {
      ...spec.meta, version: TEMPLATE_VERSION, sheetName: spec.sheetName, headerRow,
      columns: spec.columns.map((c) => c.key), generatedAt: new Date().toISOString(),
    } as TemplateMeta;
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

export function sendWorkbook(res: Response, filename: string, buffer: Buffer) {
  const safe = filename.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 120);
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

export interface Template {
  meta: TemplateMeta;
  sheet: ExcelJS.Worksheet;
}

/** Open an uploaded template and check it is a genuine, unmodified EduLearn template of the expected kind. */
export async function readTemplate(file: unknown, kind: TemplateMeta['kind']): Promise<Template> {
  if (!Buffer.isBuffer(file) || file.length === 0) throw badRequest('Choose the completed Excel file to upload.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw badRequest('This file isn’t an Excel workbook (.xlsx). Save it as .xlsx and try again.');
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
  const expected = sign(meta);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw badRequest('The template’s hidden details were changed. Download a fresh template and copy your entries into it.');
  }
  if (meta.version !== TEMPLATE_VERSION) throw badRequest('This template is from a different version of EduLearn. Download a new template.');
  if (meta.kind !== kind) {
    throw badRequest(meta.kind === 'attendance'
      ? 'This is an attendance template, not a marks template.'
      : 'This is a marks template, not an attendance template.');
  }
  const sheet = wb.getWorksheet(meta.sheetName);
  if (!sheet) throw badRequest(`The “${meta.sheetName}” sheet is missing. Download a fresh template.`);
  if (sheet.rowCount - meta.headerRow > 1000) throw badRequest('The file has too many rows. Use one template per class.');
  return { meta, sheet };
}

export interface CellRead {
  /** Trimmed text, '' when the cell is empty. */
  text: string;
  /** The number, when the cell holds one (or text that is clearly a number). */
  num: number | null;
  /** Excel error such as #VALUE!, when a formula failed. */
  error: string | null;
}

/** Read a cell as plain text and/or a number, whatever Excel stored (formulas, rich text, links, dates). */
export function readCell(value: ExcelJS.CellValue): CellRead {
  if (value === null || value === undefined) return { text: '', num: null, error: null };
  if (typeof value === 'number') return { text: String(value), num: value, error: null };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', num: null, error: null };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), num: null, error: null };
  if (typeof value === 'string') {
    const text = value.replace(/ /g, ' ').trim();
    const num = /^-?\d+([.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : null;
    return { text, num, error: null };
  }
  if (typeof value === 'object') {
    if ('error' in value && value.error) return { text: '', num: null, error: String(value.error) };
    if ('formula' in value || 'sharedFormula' in value) return readCell((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ('richText' in value) return readCell(value.richText.map((t) => t.text).join(''));
    if ('text' in value) return readCell(String((value as { text: unknown }).text));
  }
  return readCell(String(value));
}
