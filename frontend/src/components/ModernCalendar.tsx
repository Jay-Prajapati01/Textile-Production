import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDisplayDate, getTodayString, isValidDateString } from '../utils/date';

interface ModernCalendarProps {
  /** Selected date, YYYY-MM-DD ('' allowed = placeholder state) */
  value: string;
  onChange: (date: string) => void;
  /** Classes for the trigger button */
  triggerClassName?: string;
  /** Earliest selectable date (YYYY-MM-DD) */
  minDate?: string;
  /** Latest selectable date (YYYY-MM-DD) */
  maxDate?: string;
  /** Show a Clear button that calls onChange('') */
  allowClear?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const POPUP_WIDTH = 336;
const EDGE = 8;
const GAP = 8;
const ESTIMATED_HEIGHT = 452;

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

interface Placement {
  left: number;
  top: number;
}

export const ModernCalendar: React.FC<ModernCalendarProps> = ({
  value,
  onChange,
  triggerClassName = '',
  minDate,
  maxDate,
  allowClear = false,
}) => {
  const today = getTodayString();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const src = isValidDateString(value) ? value : today;
    const [y, m] = src.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Keep the visible month in sync when the selected date changes externally
  useEffect(() => {
    if (isValidDateString(value)) {
      const [y, m] = value.split('-').map(Number);
      setView({ y, m: m - 1 });
    }
  }, [value]);

  // Fixed positioning: viewport-clamped, flips above when no room below.
  // position:fixed escapes overflow clipping from scroll containers (main, modals).
  const computePlacement = useCallback((): Placement | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(POPUP_WIDTH, vw - EDGE * 2);
    const height = popupRef.current?.offsetHeight ?? ESTIMATED_HEIGHT;

    let left = r.left;
    if (left + width > vw - EDGE) left = r.right - width; // prefer right-align
    left = Math.min(Math.max(EDGE, left), vw - width - EDGE);

    let top = r.bottom + GAP;
    if (top + height > vh - EDGE) top = r.top - GAP - height; // flip up
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - height - EDGE));

    return { left, top };
  }, []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Position on open, refine with measured height, track scroll/resize
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const next = computePlacement();
      if (!next) return;
      setPlacement((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next
      );
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, computePlacement]);

  const isDisabled = useCallback(
    (date: string) =>
      (minDate !== undefined && date < minDate) ||
      (maxDate !== undefined && date > maxDate),
    [minDate, maxDate]
  );

  const grid = useMemo(() => {
    const firstDay = new Date(view.y, view.m, 1).getDay();
    const total = daysInMonth(view.y, view.m);
    const prevTotal = daysInMonth(view.y, view.m - 1);
    const cells: { date: string; day: number; outside: boolean }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevTotal - i;
      const m = view.m === 0 ? 12 : view.m;
      const y = view.m === 0 ? view.y - 1 : view.y;
      cells.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        outside: true,
      });
    }
    for (let d = 1; d <= total; d++) {
      cells.push({
        date: `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        outside: false,
      });
    }
    let next = 1;
    while (cells.length < 42) {
      const m = view.m === 11 ? 1 : view.m + 2;
      const y = view.m === 11 ? view.y + 1 : view.y;
      cells.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(next).padStart(2, '0')}`,
        day: next,
        outside: true,
      });
      next++;
    }
    return cells;
  }, [view]);

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const goToday = () => {
    const [y, m] = today.split('-').map(Number);
    setView({ y, m: m - 1 });
    if (!isDisabled(today)) onChange(today);
    setOpen(false);
  };

  const selectDate = (date: string) => {
    if (isDisabled(date)) return;
    onChange(date);
    setOpen(false);
  };

  const toggle = () => {
    if (!open) {
      setPlacement(computePlacement());
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const display = isValidDateString(value) ? formatDisplayDate(value) : '';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-2 cursor-pointer transition-colors ${triggerClassName}`}
      >
        <CalendarDays className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
        {display ? (
          <span className="font-mono whitespace-nowrap">{display}</span>
        ) : (
          <span className="text-slate-400 whitespace-nowrap">Select date…</span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && placement && (
        <div
          ref={popupRef}
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', left: placement.left, top: placement.top }}
          className="calendar-pop z-[80] w-[21rem] max-w-[calc(100vw-1rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 p-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white tracking-tight font-display">
              {MONTH_NAMES[view.m]}{' '}
              <span className="text-slate-400 font-semibold">{view.y}</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-emerald-600 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-emerald-600 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 mb-1.5">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="h-7 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-slate-400"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const isSelected = cell.date === value;
              const isToday = cell.date === today;
              const disabled = isDisabled(cell.date);
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDate(cell.date)}
                  className={`h-10 rounded-xl text-[13px] font-bold transition-all duration-150 flex items-center justify-center ${
                    disabled
                      ? 'text-slate-600/60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-105'
                      : isToday
                      ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/50 hover:ring-emerald-400'
                      : cell.outside
                      ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goToday}
                className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Today
              </button>
              {allowClear && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">{value || '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModernCalendar;
