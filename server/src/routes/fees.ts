import { Router } from 'express';
import { z } from 'zod';
import type { FeeStructure, FeeSummary, Invoice, InvoiceDetail, Payment, Receipt } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanViewStudent } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { guardiansOf, notifyUsers } from '../lib/notify.js';
import { loadSettings } from '../lib/settings.js';
import { badRequest, conflict, forbidden, intParam, notFound, pageParams, parse, provided } from '../lib/http.js';
import { INVOICE_SELECT, PAYMENT_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const feesRouter = Router();

const money = z.coerce.number().positive('Must be more than 0').max(1_000_000_000).transform((n) => Math.round(n * 100) / 100);

feesRouter.get('/summary', requireRole('admin'), async (_req, res) => {
  res.json(await queryOne<FeeSummary>(
    `SELECT COALESCE(SUM(amount), 0) AS billed, COALESCE(SUM(amount_paid), 0) AS collected,
            COALESCE(SUM(balance), 0) AS outstanding,
            COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count,
            COALESCE(SUM(balance) FILTER (WHERE status = 'overdue'), 0) AS overdue_amount
       FROM invoice_balances`,
  ));
});

feesRouter.get('/invoices', async (req, res) => {
  const user = me(req);
  const { page, pageSize, offset } = pageParams(req.query);
  const params: unknown[] = [];
  const where: string[] = [];
  if (user.role === 'student') {
    params.push(user.id);
    where.push(`ib.student_id = $${params.length}`);
  } else if (user.role === 'parent') {
    params.push(user.id);
    where.push(`ib.student_id IN (SELECT student_id FROM guardians WHERE parent_id = $${params.length})`);
  } else if (user.role !== 'admin') {
    throw forbidden('Fees are managed by the school office');
  }
  if (req.query.studentId) {
    params.push(intParam(req.query.studentId, 'studentId'));
    where.push(`ib.student_id = $${params.length}`);
  }
  if (req.query.classId) {
    params.push(intParam(req.query.classId, 'classId'));
    where.push(`s.class_id = $${params.length}`);
  }
  if (typeof req.query.status === 'string' && ['paid', 'partial', 'unpaid', 'overdue'].includes(req.query.status)) {
    params.push(req.query.status);
    where.push(`ib.status = $${params.length}`);
  } else if (req.query.status === 'open') {
    where.push(`ib.status <> 'paid'`);
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.first_name || ' ' || u.last_name ILIKE $${params.length} OR s.admission_no ILIKE $${params.length} OR ib.title ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    query<Invoice>(`${INVOICE_SELECT} ${whereSql} ORDER BY ib.due_date DESC, ib.id DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    queryOne<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM invoice_balances ib JOIN students s ON s.user_id = ib.student_id JOIN users u ON u.id = ib.student_id ${whereSql}`,
      params,
    ),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize });
});

async function loadInvoice(invoiceId: number): Promise<InvoiceDetail | null> {
  const invoice = await queryOne<InvoiceDetail>(`${INVOICE_SELECT} WHERE ib.id = $1`, [invoiceId]);
  if (!invoice) return null;
  invoice.payments = await query<Payment>(`${PAYMENT_SELECT} WHERE p.invoice_id = $1 ORDER BY p.paid_on, p.id`, [invoiceId]);
  return invoice;
}

feesRouter.get('/invoices/:id', async (req, res) => {
  const invoice = await loadInvoice(intParam(req.params.id));
  if (!invoice) throw notFound('Invoice');
  await assertCanViewStudent(me(req), invoice.studentId);
  res.json(invoice);
});

/** Bill one or more students — or a whole class — in one go. */
feesRouter.post('/invoices', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({
      studentIds: z.array(id).max(1000).optional(),
      classId: id.optional(),
      termId: id.nullish(),
      title: z.string().trim().min(1, 'Required').max(120),
      amount: money,
      dueDate: isoDate,
      notes: optionalText(500),
    }),
    req.body,
  );
  let studentIds = b.studentIds ?? [];
  if (b.classId) {
    const rows = await query<{ userId: number }>(
      'SELECT s.user_id FROM students s JOIN users u ON u.id = s.user_id WHERE s.class_id = $1 AND u.is_active',
      [b.classId],
    );
    studentIds = [...new Set([...studentIds, ...rows.map((r) => r.userId)])];
  }
  if (!studentIds.length) throw badRequest('Choose at least one student or a class with students in it');
  const ids = await transaction(async (db) => {
    const out: number[] = [];
    for (const studentId of studentIds) {
      const row = await queryOne<{ id: number }>(
        `INSERT INTO invoices (student_id, term_id, title, amount, due_date, notes)
         VALUES ($1, COALESCE($2, (SELECT id FROM terms WHERE is_current)), $3, $4, $5, $6) RETURNING id`,
        [studentId, b.termId ?? null, b.title, b.amount, b.dueDate, b.notes],
        db,
      );
      out.push(row!.id);
    }
    return out;
  });
  await notifyInvoices(studentIds, b.title, b.amount, b.dueDate);
  await audit(req, { action: 'create', entity: 'invoice', summary: `Billed ${ids.length} student${ids.length === 1 ? '' : 's'}: ${b.title}`, details: { amount: b.amount, classId: b.classId ?? null } });
  res.status(201).json({ created: ids.length, invoiceIds: ids });
});

feesRouter.delete('/invoices/:id', requireRole('admin'), async (req, res) => {
  const invoiceId = intParam(req.params.id);
  const paid = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM payments WHERE invoice_id = $1', [invoiceId]);
  if (paid && paid.n > 0) throw badRequest('This invoice has payments recorded against it. Remove the payments first.');
  const row = await queryOne('DELETE FROM invoices WHERE id = $1 RETURNING id', [invoiceId]);
  if (!row) throw notFound('Invoice');
  await audit(req, { action: 'delete', entity: 'invoice', entityId: invoiceId, summary: `Deleted invoice #${invoiceId}` });
  res.status(204).end();
});

feesRouter.post('/invoices/:id/payments', requireRole('admin'), async (req, res) => {
  const invoiceId = intParam(req.params.id);
  const b = parse(
    z.object({
      amount: money,
      method: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']),
      reference: optionalText(80),
      paidOn: isoDate.optional(),
    }),
    req.body,
  );
  const paymentId = await transaction(async (db) => {
    // Lock the invoice so two cashiers can't overpay it at the same moment.
    const inv = await queryOne<{ amount: number }>('SELECT amount FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId], db);
    if (!inv) throw notFound('Invoice');
    const paid = await queryOne<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = $1', [invoiceId], db);
    const balance = Math.round((inv.amount - (paid?.total ?? 0)) * 100) / 100;
    if (balance <= 0) throw badRequest('This invoice is already fully paid');
    if (b.amount > balance) throw badRequest(`The remaining balance is ${balance.toFixed(2)}. Enter that amount or less.`, { amount: `At most ${balance.toFixed(2)}` });
    const row = await queryOne<{ id: number }>(
      'INSERT INTO payments (invoice_id, amount, method, reference, paid_on, recorded_by) VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6) RETURNING id',
      [invoiceId, b.amount, b.method, b.reference, b.paidOn ?? null, me(req).id],
      db,
    );
    return row!.id;
  });
  const invoice = (await loadInvoice(invoiceId))!;
  const payment = invoice.payments.find((p) => p.id === paymentId)!;
  const school = await loadSettings();
  const parents = (await guardiansOf([invoice.studentId])).get(invoice.studentId) ?? [];
  await notifyUsers([...parents, invoice.studentId], {
    type: 'fees',
    title: `Payment received: ${formatMoney(b.amount, school.currency)}`,
    body: `${invoice.title} for ${invoice.studentName}. Receipt ${payment.receiptNo}. Remaining balance ${formatMoney(invoice.balance, school.currency)}.`,
    link: `/receipts/${paymentId}`,
  });
  await audit(req, { action: 'payment', entity: 'payment', entityId: paymentId, summary: `Recorded ${formatMoney(b.amount, school.currency)} from ${invoice.studentName} (${payment.receiptNo})` });
  res.status(201).json(invoice);
});

feesRouter.delete('/payments/:id', requireRole('admin'), async (req, res) => {
  const row = await queryOne<{ invoiceId: number; receiptNo: string; amount: number }>(
    'DELETE FROM payments WHERE id = $1 RETURNING invoice_id, receipt_no, amount',
    [intParam(req.params.id)],
  );
  if (!row) throw notFound('Payment');
  await audit(req, { action: 'delete', entity: 'payment', entityId: intParam(req.params.id), summary: `Removed payment ${row.receiptNo} (${row.amount})` });
  res.json(await loadInvoice(row.invoiceId));
});

const formatMoney = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

async function notifyInvoices(studentIds: number[], title: string, amount: number, dueDate: string) {
  const school = await loadSettings();
  const parents = await guardiansOf(studentIds);
  await notifyUsers([...studentIds, ...[...parents.values()].flat()], {
    type: 'fees',
    title: `New invoice: ${title}`,
    body: `${formatMoney(amount, school.currency)} due ${dueDate}.`,
    link: '/fees',
  });
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------
feesRouter.get('/payments/:id/receipt', async (req, res) => {
  const paymentId = intParam(req.params.id);
  const payment = await queryOne<Payment>(`${PAYMENT_SELECT} WHERE p.id = $1`, [paymentId]);
  if (!payment) throw notFound('Receipt');
  const invoice = (await loadInvoice(payment.invoiceId))!;
  await assertCanViewStudent(me(req), invoice.studentId);
  if (me(req).role === 'teacher') throw forbidden();
  // Balance straight after this payment (later payments don't change an issued receipt).
  const paidUpTo = invoice.payments
    .filter((p) => p.paidOn < payment.paidOn || (p.paidOn === payment.paidOn && p.id <= payment.id))
    .reduce((sum, p) => sum + p.amount, 0);
  const receipt: Receipt = { school: await loadSettings(), payment, invoice, balanceAfter: Math.round((invoice.amount - paidUpTo) * 100) / 100 };
  res.json(receipt);
});

// ---------------------------------------------------------------------------
// Fee reminders
// ---------------------------------------------------------------------------
feesRouter.post('/reminders', requireRole('admin'), async (req, res) => {
  const { invoiceIds } = parse(z.object({ invoiceIds: z.array(id).max(2000).optional() }), req.body);
  const rows = await query<Invoice>(
    `${INVOICE_SELECT} WHERE ib.status <> 'paid' AND ${invoiceIds?.length ? 'ib.id = ANY($1)' : "ib.status = 'overdue' AND $1::int[] IS NULL"}`,
    [invoiceIds?.length ? invoiceIds : null],
  );
  const school = await loadSettings();
  const parents = await guardiansOf(rows.map((r) => r.studentId));
  for (const inv of rows) {
    await notifyUsers([...(parents.get(inv.studentId) ?? []), inv.studentId], {
      type: 'fees',
      title: `Fee reminder: ${inv.title}`,
      body: `${formatMoney(inv.balance, school.currency)} outstanding for ${inv.studentName}${inv.status === 'overdue' ? ` (was due ${inv.dueDate})` : ''}.`,
      link: '/fees',
    });
  }
  await audit(req, { action: 'remind', entity: 'invoice', summary: `Sent fee reminders for ${rows.length} invoice${rows.length === 1 ? '' : 's'}` });
  res.json({ reminded: rows.length });
});

// ---------------------------------------------------------------------------
// Fee structures
// ---------------------------------------------------------------------------
const STRUCTURE_SELECT = `
  SELECT fs.id, fs.name, fs.amount, fs.level, fs.term_id, t.name AS term_name, fs.due_date, fs.description, fs.is_active,
         (SELECT COUNT(*)::int FROM invoices i WHERE i.fee_structure_id = fs.id) AS invoice_count,
         (SELECT COALESCE(SUM(ib.amount_paid), 0) FROM invoice_balances ib WHERE ib.fee_structure_id = fs.id) AS collected
    FROM fee_structures fs LEFT JOIN terms t ON t.id = fs.term_id`;

const structureSchema = z.object({
  name: z.string().trim().min(2, 'Required').max(120),
  amount: money,
  level: z.coerce.number().int().min(1).max(13).nullish(),
  termId: id.nullish(),
  dueDate: isoDate,
  description: optionalText(500),
  isActive: z.boolean().default(true),
});

feesRouter.get('/structures', requireRole('admin'), async (_req, res) => {
  res.json(await query<FeeStructure>(`${STRUCTURE_SELECT} ORDER BY fs.is_active DESC, fs.due_date DESC, fs.name`));
});

feesRouter.post('/structures', requireRole('admin'), async (req, res) => {
  const b = parse(structureSchema, req.body);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO fee_structures (name, amount, level, term_id, due_date, description, is_active)
     VALUES ($1, $2, $3, COALESCE($4, (SELECT id FROM terms WHERE is_current)), $5, $6, $7) RETURNING id`,
    [b.name, b.amount, b.level ?? null, b.termId ?? null, b.dueDate, b.description, b.isActive],
  );
  await audit(req, { action: 'create', entity: 'fee_structure', entityId: row!.id, summary: `Created fee structure ${b.name}`, details: { amount: b.amount } });
  res.status(201).json(await queryOne<FeeStructure>(`${STRUCTURE_SELECT} WHERE fs.id = $1`, [row!.id]));
});

feesRouter.patch('/structures/:id', requireRole('admin'), async (req, res) => {
  const structureId = intParam(req.params.id);
  const b = provided(parse(structureSchema.partial(), req.body), req.body);
  const used = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM invoices WHERE fee_structure_id = $1', [structureId]);
  if (used && used.n > 0 && b.amount !== undefined) {
    throw conflict('Invoices were already issued from this fee structure, so its amount can’t change. Create a new structure instead.');
  }
  const row = await queryOne(
    `UPDATE fee_structures SET name = COALESCE($2, name), amount = COALESCE($3, amount),
       level = CASE WHEN $4::boolean THEN $5 ELSE level END, term_id = CASE WHEN $6::boolean THEN $7 ELSE term_id END,
       due_date = COALESCE($8, due_date), description = CASE WHEN $9::boolean THEN $10 ELSE description END,
       is_active = COALESCE($11, is_active)
     WHERE id = $1 RETURNING id`,
    [structureId, b.name ?? null, b.amount ?? null, 'level' in b, b.level ?? null, 'termId' in b, b.termId ?? null,
      b.dueDate ?? null, 'description' in b, b.description ?? null, b.isActive ?? null],
  );
  if (!row) throw notFound('Fee structure');
  await audit(req, { action: 'update', entity: 'fee_structure', entityId: structureId, summary: 'Updated fee structure', details: { fields: Object.keys(b) } });
  res.json(await queryOne<FeeStructure>(`${STRUCTURE_SELECT} WHERE fs.id = $1`, [structureId]));
});

feesRouter.delete('/structures/:id', requireRole('admin'), async (req, res) => {
  const structureId = intParam(req.params.id);
  const used = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM invoices WHERE fee_structure_id = $1', [structureId]);
  if (used && used.n > 0) throw conflict(`${used.n} invoices came from this fee structure. Mark it inactive instead of deleting it.`);
  const row = await queryOne<{ name: string }>('DELETE FROM fee_structures WHERE id = $1 RETURNING name', [structureId]);
  if (!row) throw notFound('Fee structure');
  await audit(req, { action: 'delete', entity: 'fee_structure', entityId: structureId, summary: `Deleted fee structure ${row.name}` });
  res.status(204).end();
});

/**
 * Bill every active student the structure applies to (its level, or everyone), skipping students
 * who already have an invoice from it. Safe to run again after new students join.
 */
feesRouter.post('/structures/:id/apply', requireRole('admin'), async (req, res) => {
  const structureId = intParam(req.params.id);
  const { classIds } = parse(z.object({ classIds: z.array(id).max(200).optional() }), req.body ?? {});
  const fs = await queryOne<FeeStructure>(`${STRUCTURE_SELECT} WHERE fs.id = $1`, [structureId]);
  if (!fs) throw notFound('Fee structure');
  if (!fs.isActive) throw badRequest('This fee structure is inactive');
  const created = await query<{ studentId: number }>(
    `INSERT INTO invoices (student_id, term_id, title, amount, due_date, notes, fee_structure_id)
     SELECT s.user_id, $2, $3, $4, $5, $6, $1
       FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id
      WHERE u.is_active AND ($7::smallint IS NULL OR c.grade_level = $7) AND ($8::int[] IS NULL OR c.id = ANY($8))
     ON CONFLICT (fee_structure_id, student_id) WHERE fee_structure_id IS NOT NULL DO NOTHING
     RETURNING student_id`,
    [structureId, fs.termId, fs.name, fs.amount, fs.dueDate, fs.description, fs.level, classIds?.length ? classIds : null],
  );
  if (created.length) await notifyInvoices(created.map((c) => c.studentId), fs.name, fs.amount, fs.dueDate);
  await audit(req, { action: 'apply', entity: 'fee_structure', entityId: structureId, summary: `Applied ${fs.name} to ${created.length} student${created.length === 1 ? '' : 's'}` });
  res.json({ created: created.length });
});
