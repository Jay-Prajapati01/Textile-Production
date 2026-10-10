import { calculate_daily_summary } from './calculationService';
import { db } from './db';

export const computeDailySummary = (date: string) => {
  const day = db.getProductionDays().find((d) => d.production_date === date);
  const dayId = day?.id;
  const looms = db.getLooms();
  const productions = dayId ? db.getLoomProductions(dayId) : [];
  const workerEntries = dayId ? db.getWorkerEntries(dayId) : [];
  const workers = db.getWorkers();
  const numberLines = db.getNumberLines();
  const settings = db.getSettings();

  return calculate_daily_summary(
    date,
    day,
    looms,
    productions,
    workerEntries,
    workers,
    numberLines,
    settings,
    db.getSubmittedEntries(),
    db.getProductionDays(),
    db.getLoomProductions()
  );
};
