export type Settings = {
  id: number;
  start_date: string;
  end_date: string;
  weekly_amount: number;
  late_fee: number;
  title: string;
};

export type Student = {
  id: string;
  name: string;
  created_at: string;
};

export type Payment = {
  id: string;
  student_id: string;
  week_index: number;
  amount: number;
  paid_on: string;
  acc: boolean;
};

export type Expense = {
  id: string;
  spent_on: string;
  note: string;
  amount: number;
};

export type Week = {
  index: number;
  start: string;
  due: string;
};

export type WeekStatus = "paid" | "over" | "now" | "future" | "holiday";

export type CashData = {
  settings: Settings;
  students: Student[];
  payments: Payment[];
  expenses: Expense[];
  holidays: number[];
};
