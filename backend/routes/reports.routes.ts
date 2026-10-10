import { Router, Request, Response } from 'express';
import { calculate_monthly_summary } from '../services/calculationService';
import { db } from '../services/db';
import { generateDailyExcelBuffer, generateMonthlyExcelBuffer } from '../services/excelService';
import { getActor } from '../middleware/actor';
import { computeDailySummary } from '../services/summaryService';

const router = Router();

// Build an inclusive YYYY-MM-DD date list. Times are normalised to UTC noon
// so server-timezone offsets can never shift a day.
function dateListInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Aggregate daily summaries over an arbitrary range with the SAME
// settings-driven logic as the monthly report (no client-side duplication).
function computeRangeSummary(from: string, to: string) {
  const dates = dateListInRange(from, to);
  const dailySummaries = dates.map((d) => computeDailySummary(d));
  const ref = new Date(`${from}T12:00:00Z`);
  const summary = calculate_monthly_summary(
    ref.getUTCFullYear(),
    ref.getUTCMonth() + 1,
    dailySummaries,
    db.getLooms(),
    db.getNumberLines(),
    db.getWorkers(),
    db.getSettings()
  );
  return { ...summary, month_name: `Custom (${from} to ${to})` };
}

router.get('/daily', (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const summary = computeDailySummary(date);
  return res.json(summary);
});

router.get('/monthly', (req: Request, res: Response) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
  const days = db
    .getProductionDays()
    .filter((d) => d.production_date.startsWith(monthPrefix))
    .sort((a, b) => a.production_date.localeCompare(b.production_date));

  const dailySummaries = days.map((d) => computeDailySummary(d.production_date));
  const looms = db.getLooms();
  const numberLines = db.getNumberLines();
  const workers = db.getWorkers();
  const settings = db.getSettings();

  const monthlySummary = calculate_monthly_summary(
    year,
    month,
    dailySummaries,
    looms,
    numberLines,
    workers,
    settings
  );

  return res.json(monthlySummary);
});

router.get('/range', (req: Request, res: Response) => {
  const from = req.query.from as string;
  const to = (req.query.to as string) || from;
  if (!from) {
    return res.status(400).json({ error: 'from date is required (YYYY-MM-DD)' });
  }
  try {
    return res.json(computeRangeSummary(from, to));
  } catch (err) {
    console.error('Error computing range summary:', err);
    return res.status(500).json({ error: 'Failed to compute range summary' });
  }
});

router.post('/export-excel', (req: Request, res: Response) => {
  try {
    const { type, date, year, month, fromDate, toDate } = req.body;
    const actor = getActor(req);

    if (type === 'range') {
      const from = (fromDate as string) || date;
      const to = (toDate as string) || from;
      if (!from) {
        return res.status(400).json({ error: 'fromDate is required for range export' });
      }
      const rangeSummary = computeRangeSummary(from, to);
      const buf = generateMonthlyExcelBuffer(rangeSummary);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Range_Production_${from}_to_${to}.xlsx"`
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      db.addAuditLog({
        user_name: actor.name,
        user_email: actor.email,
        action: 'EXPORT_RANGE_EXCEL',
        entity_type: 'REPORT',
        entity_id: `${from}_${to}`,
        details: `Exported range Excel report for ${from} to ${to}`,
      });

      return res.send(buf);
    }

    if (type === 'monthly') {
      const y = Number(year) || new Date().getFullYear();
      const m = Number(month) || new Date().getMonth() + 1;
      const monthPrefix = `${y}-${m.toString().padStart(2, '0')}`;
      const days = db
        .getProductionDays()
        .filter((d) => d.production_date.startsWith(monthPrefix))
        .sort((a, b) => a.production_date.localeCompare(b.production_date));

      const dailySummaries = days.map((d) => computeDailySummary(d.production_date));
      const looms = db.getLooms();
      const numberLines = db.getNumberLines();
      const workers = db.getWorkers();
      const settings = db.getSettings();

      const monthlySummary = calculate_monthly_summary(
        y,
        m,
        dailySummaries,
        looms,
        numberLines,
        workers,
        settings
      );

      const buf = generateMonthlyExcelBuffer(monthlySummary);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Monthly_Production_${y}_${m}.xlsx"`
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      db.addAuditLog({
        user_name: actor.name,
        user_email: actor.email,
        action: 'EXPORT_MONTHLY_EXCEL',
        entity_type: 'REPORT',
        entity_id: `${y}-${m}`,
        details: `Exported monthly Excel report for ${y}-${m}`,
      });

      return res.send(buf);
    }

    const d = date || new Date().toISOString().split('T')[0];
    const summary = computeDailySummary(d);
    const buf = generateDailyExcelBuffer(summary);

    res.setHeader('Content-Disposition', `attachment; filename="Daily_Production_${d}.xlsx"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    db.addAuditLog({
      user_name: actor.name,
      user_email: actor.email,
      action: 'EXPORT_DAILY_EXCEL',
      entity_type: 'REPORT',
      entity_id: d,
      details: `Exported daily Excel report for ${d}`,
    });

    return res.send(buf);
  } catch (err) {
    console.error('Error exporting Excel:', err);
    return res.status(500).json({ error: 'Failed to generate Excel workbook' });
  }
});

export default router;
