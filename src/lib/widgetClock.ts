/**
 * Pure formatting helpers for the digital clock widget.
 *
 * Kept separate from the React component so the layout contract (half-size
 * seconds, sun/half-moon meridiem, weekday + month + date) is easy to test and
 * reuse by future widget adapters.
 */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
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
] as const;

export type DigitalClockParts = {
  hours: string;
  minutes: string;
  seconds: string;
  meridiem: "AM" | "PM";
  weekday: string;
  month: string;
  day: number;
  /** e.g. "09:41:05 AM" — used for the accessible label. */
  timeLabel: string;
  /** e.g. "Saturday, November 14" */
  dateLabel: string;
};

function pad(value: number): string {
  return `${value}`.padStart(2, "0");
}

/** Format a Date in the viewer's local time. Call only after mount on the client. */
export function getDigitalClockParts(date: Date, use24Hour = false): DigitalClockParts {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const hours = pad(use24Hour ? hours24 : hours12);
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const meridiem: "AM" | "PM" = hours24 < 12 ? "AM" : "PM";
  const weekday = WEEKDAYS[date.getDay()];
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();

  return {
    hours,
    minutes,
    seconds,
    meridiem,
    weekday,
    month,
    day,
    timeLabel: use24Hour ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds} ${meridiem}`,
    dateLabel: `${weekday}, ${month} ${day}`,
  };
}
