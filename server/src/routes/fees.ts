import { Router } from 'express';
import { z } from 'zod';
import type { FeeSummary, Invoice, InvoiceDetail, Payment } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanViewStudent } from '../lib/access.js';
import { badRequest, forbidden, intParam, notFound, pageParams, parse } from '../lib/http.js';
import { INVOICE_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const feesRouter = Router();

const money = z.coerce.number().positive('Must be more than 0').max(10_000_000).transform((n) => Math.round(n * 100) / 100);

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
  invoice.payments = await query<Payment>(
    `SELECT p.id, p.invoice_id, p.amount, p.method, p.reference, p.paid_on,
            CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS recorded_by_name
       FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE p.invoice_id = $1 ORDER BY p.paid_on, p.id`,
    [invoiceId],
  );
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
  res.status(201).json({ created: ids.length, invoiceIds: ids });
});

feesRouter.delete('/invoices/:id', requireRole('admin'), async (req, res) => {
  const invoiceId = intParam(req.params.id);
  const paid = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM payments WHERE invoice_id = $1', [invoiceId]);
  if (paid && paid.n > 0) throw badRequest('This invoice has payments recorded against it. Remove the payments first.');
  const row = await queryOne('DELETE FROM invoices WHERE id = $1 RETURNING id', [invoiceId]);
  if (!row) throw notFound('Invoice');
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
  await transaction(async (db) => {
    // Lock the invoice so two cashiers can't overpay it at the same moment.
    const inv = await queryOne<{ amount: number }>('SELECT amount FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId], db);
    if (!inv) throw notFound('Invoice');
    const paid = await queryOne<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = $1', [invoiceId], db);
    const balance = Math.round((inv.amount - (paid?.total ?? 0)) * 100) / 100;
    if (balance <= 0) throw badRequest('This invoice is already fully paid');
    if (b.amount > balance) throw badRequest(`The remaining balance is ${balance.toFixed(2)}. Enter that amount or less.`, { amount: `At most ${balance.toFixed(2)}` });
    await query(
      'INSERT INTO payments (invoice_id, amount, method, reference, paid_on, recorded_by) VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)',
      [invoiceId, b.amount, b.method, b.reference, b.paidOn ?? null, me(req).id],
      db,
    );
  });
  res.status(201).json(await loadInvoice(invoiceId));
});

feesRouter.delete('/payments/:id', requireRole('admin'), async (req, res) => {
  const row = await queryOne<{ invoiceId: number }>('DELETE FROM payments WHERE id = $1 RETURNING invoice_id', [intParam(req.params.id)]);
  if (!row) throw notFound('Payment');
  res.json(await loadInvoice(row.invoiceId));
});
