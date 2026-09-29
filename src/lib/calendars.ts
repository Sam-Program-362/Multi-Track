/** Multi-calendar conversion helpers: Gregorian, Hijri (Arabic) and Bangla. */

export type HijriDate = {
  year: number;
  month: number; // 1-12
  day: number;
  monthName: string;
  monthNameAr: string;
  formatted: string;
};

export type BanglaDate = {
  year: number;
  month: number; // 1-12
  day: number;
  monthName: string;
  monthNameBn: string;
  dayBn: string;
  formatted: string;
};

export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qi'dah",
  "Dhu al-Hijjah",
];

export const HIJRI_MONTHS_AR = [
  "مُحَرَّم",
  "صَفَر",
  "رَبيع الأوّل",
  "رَبيع الآخر",
  "جُمادى الأولى",
  "جُمادى الآخرة",
  "رَجَب",
  "شَعْبان",
  "رَمَضان",
  "شَوّال",
  "ذو القعدة",
  "ذو الحجة",
];

export const BANGLA_MONTHS = [
  "Boishakh",
  "Jyoishtho",
  "Asharh",
  "Srabon",
  "Bhadro",
  "Ashwin",
  "Kartik",
  "Ogrohayon",
  "Poush",
  "Magh",
  "Falgun",
  "Choitro",
];

export const BANGLA_MONTHS_BN = [
  "বৈশাখ",
  "জ্যৈষ্ঠ",
  "আষাঢ়",
  "শ্রাবণ",
  "ভাদ্র",
  "আশ্বিন",
  "কার্তিক",
  "অগ্রহায়ণ",
  "পৌষ",
  "মাঘ",
  "ফাল্গুন",
  "চৈত্র",
];

export const BANGLA_WEEKDAYS = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
];

export const ARABIC_WEEKDAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toBanglaDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function toArabicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/* ---------------------------------- Hijri --------------------------------- */

// Fallback arithmetic (tabular) Hijri conversion in case Intl calendars are missing.
function gregorianToJulianDay(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function tabularHijri(date: Date): { year: number; month: number; day: number } {
  const jd = gregorianToJulianDay(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  let l = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

let hijriFormatter: Intl.DateTimeFormat | null | undefined;

function getHijriFormatter(): Intl.DateTimeFormat | null {
  if (hijriFormatter !== undefined) return hijriFormatter;
  try {
    hijriFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    hijriFormatter = null;
  }
  return hijriFormatter;
}

export function toHijri(date: Date): HijriDate {
  const fallback = tabularHijri(date);
  let year = fallback.year;
  let month = fallback.month;
  let day = fallback.day;
  const fmt = getHijriFormatter();
  if (fmt) {
    try {
      const utc = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12),
      );
      const parts = fmt.formatToParts(utc);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const y = parseInt(get("year").replace(/[^\d-]/g, ""), 10);
      const m = parseInt(get("month").replace(/[^\d]/g, ""), 10);
      const d = parseInt(get("day").replace(/[^\d]/g, ""), 10);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        year = y;
        month = m;
        day = d;
      }
    } catch {
      /* keep tabular fallback */
    }
  }
  month = Math.min(12, Math.max(1, month));
  return {
    year,
    month,
    day,
    monthName: HIJRI_MONTHS[month - 1],
    monthNameAr: HIJRI_MONTHS_AR[month - 1],
    formatted: `${day} ${HIJRI_MONTHS[month - 1]} ${year} AH`,
  };
}

/* --------------------------------- Bangla --------------------------------- */

function isGregorianLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function banglaMonthLengths(banglaYear: number): number[] {
  // Revised (2019) Bangladesh calendar. Falgun gains a day in Gregorian leap years.
  const leap = isGregorianLeap(banglaYear + 594);
  return [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
}

const DAY_MS = 86400000;

function startOfDayUTC(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toBangla(date: Date): BanglaDate {
  const gYear = date.getFullYear();
  const stamp = startOfDayUTC(date);
  let pivotYear = gYear;
  let pivot = Date.UTC(gYear, 3, 14); // 14 April
  if (stamp < pivot) {
    pivotYear = gYear - 1;
    pivot = Date.UTC(pivotYear, 3, 14);
  }
  const banglaYear = pivotYear - 593;
  let dayIndex = Math.round((stamp - pivot) / DAY_MS);
  const lengths = banglaMonthLengths(banglaYear);
  let month = 0;
  while (month < 12 && dayIndex >= lengths[month]) {
    dayIndex -= lengths[month];
    month += 1;
  }
  if (month > 11) month = 11;
  const day = dayIndex + 1;
  return {
    year: banglaYear,
    month: month + 1,
    day,
    monthName: BANGLA_MONTHS[month],
    monthNameBn: BANGLA_MONTHS_BN[month],
    dayBn: toBanglaDigits(day),
    formatted: `${day} ${BANGLA_MONTHS[month]} ${banglaYear} BS`,
  };
}

/* --------------------------------- Helpers -------------------------------- */

export const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  gregorianDay: number;
  hijri: HijriDate;
  bangla: BanglaDate;
};

export function isoKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function buildMonthGrid(year: number, month: number, today: Date): CalendarCell[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const start = new Date(year, month, 1 - startOffset);
  const todayKey = isoKey(today);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date,
      iso: isoKey(date),
      inMonth: date.getMonth() === month,
      isToday: isoKey(date) === todayKey,
      gregorianDay: date.getDate(),
      hijri: toHijri(date),
      bangla: toBangla(date),
    });
  }
  return cells;
}

/** Spanning label such as "Rajab – Sha'ban 1447 AH" for a Gregorian month. */
export function spanLabel(cells: CalendarCell[], kind: "hijri" | "bangla"): string {
  const inMonth = cells.filter((c) => c.inMonth);
  if (inMonth.length === 0) return "";
  const first = inMonth[0];
  const last = inMonth[inMonth.length - 1];
  if (kind === "hijri") {
    const a = first.hijri;
    const b = last.hijri;
    if (a.month === b.month && a.year === b.year) return `${a.monthName} ${a.year} AH`;
    return `${a.monthName} – ${b.monthName} ${b.year} AH`;
  }
  const a = first.bangla;
  const b = last.bangla;
  if (a.month === b.month && a.year === b.year) return `${a.monthName} ${a.year} BS`;
  return `${a.monthName} – ${b.monthName} ${b.year} BS`;
}
