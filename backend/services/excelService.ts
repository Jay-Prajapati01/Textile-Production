import * as XLSX from 'xlsx';
import { DailySummary, MonthlySummary } from '../types';

export function generateDailyExcelBuffer(summary: DailySummary): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Daily Production Sheet
  const dailyData: any[][] = [];

  dailyData.push(['TEXTILE LOOM PRODUCTION MANAGEMENT SYSTEM']);
  dailyData.push([`DAILY PRODUCTION REPORT — DATE: ${summary.date}`]);
  dailyData.push([`Status: ${summary.status.toUpperCase()} | Active Looms: ${summary.active_looms} / ${summary.total_looms}`]);
  dailyData.push([]); // empty line

  // Summary Metrics Banner
  dailyData.push([
    'Shift A Total',
    'Shift B Total',
    'Grand Total',
    'Daily Average',
    'Efficiency %',
    'Total Meters',
    'Total Revenue (Rs)'
  ]);
  dailyData.push([
    summary.total_shift_a,
    summary.total_shift_b,
    summary.grand_total,
    summary.average,
    `${summary.percentage}%`,
    summary.total_meter,
    summary.total_rs
  ]);
  dailyData.push([]); // empty line

  // Main Production Table Header
  dailyData.push([
    'Loom No.',
    'Loom Name',
    'Line',
    'Spec (Picks)',
    'Rate (Rs)',
    'Shift A',
    'Shift B',
    'Total',
    'Average',
    'Efficiency %',
    'Meters',
    'Amount (Rs)',
    'Worker',
    'Price/Rate',
    'Remarks'
  ]);

  // Rows grouped by Number Line
  const lineGroups = new Map<string, typeof summary.rows>();
  summary.rows.forEach(r => {
    const list = lineGroups.get(r.number_line_name) || [];
    list.push(r);
    lineGroups.set(r.number_line_name, list);
  });

  lineGroups.forEach((rows, lineName) => {
    rows.forEach(r => {
      dailyData.push([
        r.loom_number,
        r.loom_name,
        r.number_line_name,
        r.specification,
        r.rate,
        r.shift_a,
        r.shift_b,
        r.total,
        r.average,
        `${r.percentage}%`,
        r.meter,
        r.rs,
        r.worker_name || '—',
        r.worker_price || '—',
        r.remark || ''
      ]);
    });

    // Line Subtotal
    const lineShiftA = Math.round(rows.reduce((s, r) => s + r.shift_a, 0) * 100) / 100;
    const lineShiftB = Math.round(rows.reduce((s, r) => s + r.shift_b, 0) * 100) / 100;
    const lineTot = Math.round((lineShiftA + lineShiftB) * 100) / 100;
    const lineMtr = Math.round(rows.reduce((s, r) => s + r.meter, 0) * 100) / 100;
    const lineRs = Math.round(rows.reduce((s, r) => s + r.rs, 0) * 100) / 100;

    dailyData.push([
      `Subtotal: ${lineName}`,
      '',
      '',
      '',
      '',
      lineShiftA,
      lineShiftB,
      lineTot,
      '',
      '',
      lineMtr,
      lineRs,
      '',
      '',
      ''
    ]);
  });

  // Grand Total Row
  dailyData.push([
    'GRAND TOTAL',
    '',
    '',
    '',
    '',
    summary.total_shift_a,
    summary.total_shift_b,
    summary.grand_total,
    summary.average,
    `${summary.percentage}%`,
    summary.total_meter,
    summary.total_rs,
    '',
    '',
    ''
  ]);

  const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
  // Column widths
  wsDaily['!cols'] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Production');

  // 2. Number Line Summary Sheet
  const lineData: any[][] = [
    ['NUMBER LINE PRODUCTION BREAKDOWN'],
    [`Date: ${summary.date}`],
    [],
    ['Line Name', 'Loom Count', 'Shift A', 'Shift B', 'Total Production', 'Total Meters', 'Total Revenue (Rs)']
  ];

  summary.line_summaries.forEach(ls => {
    lineData.push([
      ls.line_name,
      ls.loom_count,
      ls.shift_a,
      ls.shift_b,
      ls.total,
      ls.meter,
      ls.rs
    ]);
  });

  lineData.push([
    'TOTAL',
    summary.total_looms,
    summary.total_shift_a,
    summary.total_shift_b,
    summary.grand_total,
    summary.total_meter,
    summary.total_rs
  ]);

  const wsLines = XLSX.utils.aoa_to_sheet(lineData);
  wsLines['!cols'] = [
    { wch: 26 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsLines, 'Number Lines');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

export function generateMonthlyExcelBuffer(summary: MonthlySummary): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Monthly Summary Sheet
  const monthData: any[][] = [];
  monthData.push(['TEXTILE LOOM PRODUCTION MANAGEMENT SYSTEM']);
  monthData.push([`MONTHLY CONSOLIDATED REPORT — ${summary.month_name.toUpperCase()} ${summary.year}`]);
  monthData.push([`Recorded Days: ${summary.days_recorded} | Overall Efficiency: ${summary.overall_percentage}%`]);
  monthData.push([]);

  monthData.push(['Financial Overview']);
  monthData.push(['Metric', 'Value']);
  monthData.push(['Total Shift A Production', summary.total_shift_a]);
  monthData.push(['Total Shift B Production', summary.total_shift_b]);
  monthData.push(['Total Unit Production', summary.grand_total]);
  monthData.push(['Average Daily Production', summary.avg_daily_production]);
  monthData.push(['Overall Efficiency %', `${summary.overall_percentage}%`]);
  monthData.push(['Total Meters Produced', summary.total_meter]);
  monthData.push(['Base Revenue (Rs)', summary.base_rs]);
  monthData.push(['Approved Adjustment (Rs)', summary.adjustment_amount]);
  monthData.push(['Final Net Amount (Rs)', summary.final_adjusted_rs]);
  monthData.push([]);

  // Daily Log
  monthData.push(['Daily Production Log']);
  monthData.push([
    'Date',
    'Status',
    'Shift A',
    'Shift B',
    'Day Total',
    'Average',
    'Efficiency %',
    'Meters',
    'Revenue (Rs)'
  ]);

  summary.daily_breakdown.forEach(d => {
    monthData.push([
      d.date,
      d.status.toUpperCase(),
      d.shift_a,
      d.shift_b,
      d.total,
      d.average,
      `${d.percentage}%`,
      d.meter,
      d.rs
    ]);
  });

  const wsMonth = XLSX.utils.aoa_to_sheet(monthData);
  wsMonth['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMonth, 'Monthly Overview');

  // 2. Loom Breakdown Sheet
  const loomData: any[][] = [];
  loomData.push(['LOOM MONTHLY PERFORMANCE']);
  loomData.push([`Month: ${summary.month_name} ${summary.year}`]);
  loomData.push([]);
  loomData.push([
    'Loom No.',
    'Loom Name',
    'Number Line',
    'Specification',
    'Rate (Rs)',
    'Total Shift A',
    'Total Shift B',
    'Total Units',
    'Total Meters',
    'Total Revenue (Rs)'
  ]);

  summary.loom_breakdown.forEach(l => {
    loomData.push([
      l.loom_number,
      l.loom_name,
      l.number_line_name,
      l.specification,
      l.rate,
      l.shift_a,
      l.shift_b,
      l.total,
      l.meter,
      l.rs
    ]);
  });

  const wsLoom = XLSX.utils.aoa_to_sheet(loomData);
  wsLoom['!cols'] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsLoom, 'Loom Breakdown');

  // 3. Worker Summary Sheet
  const workerData: any[][] = [];
  workerData.push(['WORKER / WIVAR PERFORMANCE & WAGES']);
  workerData.push([`Month: ${summary.month_name} ${summary.year}`]);
  workerData.push([]);
  workerData.push([
    'Worker Code',
    'Worker Name',
    'Assigned Days',
    'Total Meters Woven',
    'Calculated Wages (Rs)'
  ]);

  summary.worker_breakdown.forEach(w => {
    workerData.push([
      w.worker_code,
      w.worker_name,
      w.assigned_days_count,
      w.total_meters,
      w.total_wages
    ]);
  });

  const wsWorker = XLSX.utils.aoa_to_sheet(workerData);
  wsWorker['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsWorker, 'Worker Summary');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}
