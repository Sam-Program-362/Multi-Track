import { toHijri } from "./calendars";

export type IslamicEventDef = {
  id: string;
  name: string;
  arabic: string;
  month: number; // Hijri month
  day: number;
  icon: string;
  note: string;
};

export const ISLAMIC_EVENTS: IslamicEventDef[] = [
  {
    id: "new-year",
    name: "Islamic New Year",
    arabic: "رأس السنة الهجرية",
    month: 1,
    day: 1,
    icon: "🌙",
    note: "1 Muharram – beginning of the Hijri year",
  },
  {
    id: "ashura",
    name: "Day of Ashura",
    arabic: "يوم عاشوراء",
    month: 1,
    day: 10,
    icon: "🕯️",
    note: "10 Muharram – recommended fasting",
  },
  {
    id: "mawlid",
    name: "Mawlid an-Nabi",
    arabic: "المولد النبوي",
    month: 3,
    day: 12,
    icon: "🕌",
    note: "12 Rabi al-Awwal",
  },
  {
    id: "isra-miraj",
    name: "Isra & Mi'raj",
    arabic: "الإسراء والمعراج",
    month: 7,
    day: 27,
    icon: "✨",
    note: "27 Rajab – the Night Journey",
  },
  {
    id: "shab-e-barat",
    name: "Shab-e-Barat",
    arabic: "ليلة البراءة",
    month: 8,
    day: 15,
    icon: "🌌",
    note: "15 Sha'ban – night of forgiveness",
  },
  {
    id: "ramadan",
    name: "First of Ramadan",
    arabic: "غرة رمضان",
    month: 9,
    day: 1,
    icon: "🌛",
    note: "Start of the month of fasting",
  },
  {
    id: "laylat-al-qadr",
    name: "Laylat al-Qadr",
    arabic: "ليلة القدر",
    month: 9,
    day: 27,
    icon: "⭐",
    note: "27 Ramadan – the Night of Decree",
  },
  {
    id: "eid-fitr",
    name: "Eid al-Fitr",
    arabic: "عيد الفطر",
    month: 10,
    day: 1,
    icon: "🎉",
    note: "1 Shawwal – festival of breaking the fast",
  },
  {
    id: "arafah",
    name: "Day of Arafah",
    arabic: "يوم عرفة",
    month: 12,
    day: 9,
    icon: "⛰️",
    note: "9 Dhu al-Hijjah",
  },
  {
    id: "eid-adha",
    name: "Eid al-Adha",
    arabic: "عيد الأضحى",
    month: 12,
    day: 10,
    icon: "🐑",
    note: "10 Dhu al-Hijjah – festival of sacrifice",
  },
];

export type UpcomingEvent = IslamicEventDef & {
  gregorianDate: Date;
  daysLeft: number;
  hijriLabel: string;
};

const DAY_MS = 86400000;

/** Scans forward day-by-day to map Hijri events onto Gregorian dates. */
export function upcomingIslamicEvents(from: Date, horizonDays = 400): UpcomingEvent[] {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const found = new Map<string, UpcomingEvent>();
  for (let i = 0; i <= horizonDays; i += 1) {
    const date = new Date(base.getTime() + i * DAY_MS);
    const h = toHijri(date);
    for (const evt of ISLAMIC_EVENTS) {
      if (found.has(evt.id)) continue;
      if (h.month === evt.month && h.day === evt.day) {
        found.set(evt.id, {
          ...evt,
          gregorianDate: date,
          daysLeft: i,
          hijriLabel: `${h.day} ${h.monthName} ${h.year} AH`,
        });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.daysLeft - b.daysLeft);
}
