import type { CashData, Payment, Student, Week, WeekStatus } from "@/lib/types";

export function todayInJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function buildWeeks(start: string, end: string): Week[] {
  const weeks: Week[] = [];
  for (let index = 0; index < 200; index += 1) {
    const firstDay = addDays(start, index * 7);
    if (firstDay > end) break;
    weeks.push({ index, start: firstDay, due: addDays(firstDay, 5) });
  }
  return weeks;
}

export function currentWeekIndex(weeks: Week[], today: string): number {
  const current = weeks.find((week) => week.start <= today && today < addDays(week.start, 7));
  if (current) return current.index;
  if (weeks.length && today >= addDays(weeks[weeks.length - 1].start, 7)) {
    return weeks.length - 1;
  }
  return 0;
}

export function getWeekStatus(
  data: CashData,
  studentId: string,
  week: Week,
  today = todayInJakarta(),
): WeekStatus {
  if (data.holidays.includes(week.index)) return "holiday";
  if (data.payments.some((payment) => payment.student_id === studentId && payment.week_index === week.index)) {
    return "paid";
  }
  if (week.due < today) return "over";
  if (week.start <= today) return "now";
  return "future";
}

export function studentTotals(data: CashData, studentId: string, weeks: Week[], today = todayInJakarta()) {
  let paid = 0;
  let owed = 0;
  let lateWeeks = 0;
  for (const week of weeks) {
    const status = getWeekStatus(data, studentId, week, today);
    if (status === "paid") {
      paid += findPayment(data.payments, studentId, week.index)?.amount ?? 0;
    } else if (status === "over") {
      owed += data.settings.weekly_amount + data.settings.late_fee;
      lateWeeks += 1;
    } else if (status === "now") {
      owed += data.settings.weekly_amount;
      lateWeeks += 1;
    }
  }
  return { paid, owed, lateWeeks };
}

export function findPayment(payments: Payment[], studentId: string, weekIndex: number) {
  return payments.find((payment) => payment.student_id === studentId && payment.week_index === weekIndex);
}

export function cashTotals(data: CashData, weeks: Week[], today = todayInJakarta()) {
  const collected = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const spent = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const owed = data.students.reduce(
    (sum, student) => sum + studentTotals(data, student.id, weeks, today).owed,
    0,
  );
  return { collected, spent, balance: collected - spent, owed };
}

export function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

export function fullDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

export function progress(data: CashData, week: Week, today = todayInJakarta()): number {
  if (!data.students.length) return 0;
  const count = data.students.filter((student) => getWeekStatus(data, student.id, week, today) === "paid").length;
  return Math.round((count / data.students.length) * 100);
}

export function sortPayments(payments: Payment[], students: Student[]): (Payment & { studentName: string })[] {
  const names = new Map(students.map((student) => [student.id, student.name]));
  return payments
    .map((payment) => ({ ...payment, studentName: names.get(payment.student_id) ?? "Mahasiswa dihapus" }))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on));
}
