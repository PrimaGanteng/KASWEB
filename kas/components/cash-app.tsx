"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  buildWeeks,
  cashTotals,
  currentWeekIndex,
  findPayment,
  fullDate,
  getWeekStatus,
  progress,
  rupiah,
  shortDate,
  sortPayments,
  studentTotals,
  todayInJakarta,
} from "@/lib/cash";
import type { CashData, Expense, Settings, Student, Week, WeekStatus } from "@/lib/types";

type AppMode = "public" | "login" | "admin";
type Result = { error: { message: string } | null };
type StatusFilter = "all" | "unpaid" | "paid";

const EMPTY_DATA: CashData = {
  settings: {
    id: 1,
    title: "Kas Kelas",
    start_date: "2026-11-02",
    end_date: "2027-12-31",
    weekly_amount: 2000,
    late_fee: 2000,
  },
  students: [],
  payments: [],
  expenses: [],
  holidays: [],
};

const STATUS_LABEL: Record<WeekStatus, string> = {
  paid: "Lunas",
  over: "Terlambat",
  now: "Minggu ini",
  future: "Belum waktunya",
  holiday: "Libur",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.";
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(data: CashData, weeks: Week[]): void {
  const rows: (string | number)[][] = [
    ["Nama", "Terbayar", "Tunggakan", ...weeks.map((week) => `M${week.index + 1} ${week.start}`)],
  ];
  for (const student of data.students) {
    const totals = studentTotals(data, student.id, weeks);
    rows.push([
      student.name,
      totals.paid,
      totals.owed,
      ...weeks.map((week) => {
        const status = getWeekStatus(data, student.id, week);
        const payment = findPayment(data.payments, student.id, week.index);
        return status === "paid" ? `${payment?.amount ?? 0} (lunas)` : STATUS_LABEL[status];
      }),
    ]);
  }
  rows.push([], ["Tanggal", "Pengeluaran", "Jumlah"]);
  for (const expense of data.expenses) rows.push([expense.spent_on, expense.note, expense.amount]);

  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rekap-kas-${todayInJakarta()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kas Kelas<span className="brand-dot">.</span></span>
        </a>
        <nav className="top-nav" aria-label="Navigasi utama">
          {admin ? (
            <>
              <a href="/">Lihat laporan publik</a>
              <a className="nav-cta" href="/login">Area bendahara</a>
            </>
          ) : (
            <a className="nav-cta" href="/login">Masuk bendahara <span aria-hidden="true">↗</span></a>
          )}
        </nav>
      </header>
      {children}
      <footer className="footer">
        <span>Kas kelas, dikelola bersama.</span>
        <span>Informasi diperbarui langsung dari buku kas digital.</span>
      </footer>
    </main>
  );
}

function StatCard({ label, value, note, variant = "" }: {
  label: string;
  value: string;
  note?: string;
  variant?: string;
}) {
  return (
    <article className={`stat-card ${variant}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </article>
  );
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div className={`notice ${success ? "notice-success" : "notice-error"}`} role="status">{children}</div>;
}

function StatusPill({ status, label }: { status: WeekStatus; label?: string }) {
  return <span className={`status-pill status-${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">✳</span><p>{children}</p></div>;
}

export default function CashApp({ mode }: { mode: AppMode }) {
  const [data, setData] = useState<CashData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const [acc, setAcc] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [expectedLoginEmail, setExpectedLoginEmail] = useState("");
  const [studentNames, setStudentNames] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInJakarta());
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [config, setConfig] = useState<Settings>(EMPTY_DATA.settings);
  const [newPassword, setNewPassword] = useState("");
  const initializedWeek = useRef(false);

  const refresh = useCallback(async (showLoading = true) => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      setError("Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    if (mode === "login") {
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    setError("");
    try {
      if (mode === "admin") {
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userResult.user) {
          window.location.assign("/login");
          return;
        }
        const { data: adminRecord, error: adminError } = await supabase
          .from("admins")
          .select("user_id, must_change_password")
          .eq("user_id", userResult.user.id)
          .maybeSingle();
        if (adminError) throw adminError;
        if (!adminRecord) {
          setAuthorized(false);
          setError("Akun ini belum diberi akses bendahara. Tambahkan User ID di tabel admins Supabase.");
          return;
        }
        setAuthorized(true);
        setMustChangePassword(Boolean(adminRecord.must_change_password));
      }

      const [settingsResult, studentsResult, paymentsResult, expensesResult, holidaysResult] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("students").select("*").order("name", { ascending: true }),
        supabase.from("payments").select("*").order("paid_on", { ascending: false }),
        supabase.from("expenses").select("*").order("spent_on", { ascending: false }),
        supabase.from("holidays").select("week_index"),
      ]);
      const resultError = [settingsResult, studentsResult, paymentsResult, expensesResult, holidaysResult]
        .find((result) => result.error)?.error;
      if (resultError) throw resultError;

      const nextData: CashData = {
        settings: settingsResult.data as Settings,
        students: (studentsResult.data ?? []) as Student[],
        payments: (paymentsResult.data ?? []) as CashData["payments"],
        expenses: (expensesResult.data ?? []) as Expense[],
        holidays: (holidaysResult.data ?? []).map((holiday) => holiday.week_index as number),
      };
      setData(nextData);
      setConfig(nextData.settings);
      const nextWeeks = buildWeeks(nextData.settings.start_date, nextData.settings.end_date);
      if (!initializedWeek.current) {
        setSelectedWeek(currentWeekIndex(nextWeeks, todayInJakarta()));
        initializedWeek.current = true;
      } else {
        setSelectedWeek((selected) => Math.min(selected, Math.max(nextWeeks.length - 1, 0)));
      }
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (mode === "login") return;
    const supabase = getSupabase();
    if (!supabase) {
      setRealtimeStatus("offline");
      return;
    }

    const tables = ["settings", "students", "payments", "holidays", "expenses"];
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel("public-cash-live-updates");
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(false), 120);
        },
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setRealtimeStatus("connected");
        void refresh(false);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setRealtimeStatus("offline");
      }
    });

    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [mode, refresh]);

  const weeks = useMemo(
    () => buildWeeks(data.settings.start_date, data.settings.end_date),
    [data.settings.start_date, data.settings.end_date],
  );
  const today = todayInJakarta();
  const weekIndex = Math.max(0, Math.min(selectedWeek, Math.max(weeks.length - 1, 0)));
  const currentWeek = weeks[weekIndex];
  const totals = useMemo(() => cashTotals(data, weeks, today), [data, today, weeks]);
  const paidCount = currentWeek
    ? data.students.filter((student) => getWeekStatus(data, student.id, currentWeek, today) === "paid").length
    : 0;
  const visibleStudents = data.students.filter((student) => {
    const status = currentWeek ? getWeekStatus(data, student.id, currentWeek, today) : "future";
    const matchesSearch = student.name.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID"));
    const matchesFilter = filter === "all" || (filter === "paid") === (status === "paid");
    return matchesSearch && matchesFilter;
  });

  async function mutate(action: () => Promise<Result>, successMessage: string): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setNotice(successMessage);
      await refresh(false);
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Periksa file environment.");
      setBusy(false);
      return;
    }
    const username = loginUsername.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      setError("Username harus 3–32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.");
      setBusy(false);
      return;
    }
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let projectRef = "";
    try {
      projectRef = new URL(projectUrl ?? "").hostname.split(".")[0];
    } catch {
      setError("NEXT_PUBLIC_SUPABASE_URL belum diatur dengan benar.");
      setBusy(false);
      return;
    }
    if (!projectRef || projectRef === "localhost" || projectRef === "127") {
      setError("URL project Supabase tidak valid untuk login username.");
      setBusy(false);
      return;
    }
    const authEmail = `${username}@${projectRef}.supabase.co`;
    setExpectedLoginEmail(authEmail);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: loginPassword,
      });
      if (loginError) {
        if (loginError.code === "email_not_confirmed") {
          setError(`Email internal akun belum dikonfirmasi. Buka Supabase → Authentication → Users dan konfirmasi akun "${authEmail}".`);
        } else if (loginError.code === "invalid_credentials" || loginError.status === 400) {
          setError(`Supabase tidak menerima kredensial. Pastikan akun di Authentication → Users memakai email persis "${authEmail}", statusnya sudah dikonfirmasi, serta password yang dimasukkan benar.`);
        } else {
          setError(`Login Supabase gagal (${loginError.code ?? loginError.status ?? "error"}): ${loginError.message}`);
        }
        return;
      }
      window.location.assign("/admin");
    } catch (caught) {
      setError(`Tidak dapat terhubung ke Supabase: ${messageOf(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else window.location.assign("/");
  }

  async function saveStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    const names = studentNames.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) {
      setError("Masukkan minimal satu nama mahasiswa.");
      return;
    }
    const invalid = names.find((name) => name.length > 60);
    if (invalid) {
      setError(`Nama "${invalid.slice(0, 24)}…" lebih dari 60 karakter.`);
      return;
    }
    const ok = await mutate(
      async () => await supabase.from("students").insert(names.map((name) => ({ name }))),
      `${names.length} mahasiswa berhasil ditambahkan.`,
    );
    if (ok) setStudentNames("");
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(expenseAmount);
    if (!expenseDate || !expenseNote.trim() || !Number.isSafeInteger(amount) || amount <= 0) {
      setError("Lengkapi tanggal, keterangan, dan jumlah pengeluaran yang valid.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    const ok = await mutate(async () => await supabase.from("expenses").insert({
      spent_on: expenseDate,
      note: expenseNote.trim().slice(0, 120),
      amount,
    }), "Pengeluaran berhasil dicatat.");
    if (ok) {
      setExpenseNote("");
      setExpenseAmount("");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config.start_date || !config.end_date || config.end_date < config.start_date) {
      setError("Tanggal selesai harus sama dengan atau sesudah tanggal mulai.");
      return;
    }
    if (config.weekly_amount < 0 || config.late_fee < 0 || !config.title.trim()) {
      setError("Judul wajib diisi dan nominal tidak boleh negatif.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    await mutate(async () => await supabase.from("settings").update({
      title: config.title.trim().slice(0, 80),
      start_date: config.start_date,
      end_date: config.end_date,
      weekly_amount: Number(config.weekly_amount),
      late_fee: Number(config.late_fee),
    }).eq("id", 1), "Pengaturan berhasil disimpan.");
  }

  async function togglePayment(student: Student, week: Week) {
    const supabase = getSupabase();
    if (!supabase) return;
    const payment = findPayment(data.payments, student.id, week.index);
    if (payment) {
      await mutate(async () => await supabase.from("payments").delete().eq("id", payment.id), "Pembayaran dibatalkan.");
      return;
    }
    const late = week.due < today;
    const amount = data.settings.weekly_amount + (late && !acc ? data.settings.late_fee : 0);
    await mutate(async () => await supabase.from("payments").insert({
      student_id: student.id,
      week_index: week.index,
      amount,
      paid_on: today,
      acc: late && acc,
    }), "Pembayaran berhasil dicatat.");
  }

  async function payArrears(student: Student) {
    const supabase = getSupabase();
    if (!supabase) return;
    const unpaidWeeks = weeks.filter((week) => {
      const status = getWeekStatus(data, student.id, week, today);
      return status === "over" || status === "now";
    });
    if (!unpaidWeeks.length) {
      setNotice("Tidak ada minggu berjalan atau tunggakan untuk mahasiswa ini.");
      return;
    }
    const payments = unpaidWeeks.map((week) => {
      const late = week.due < today;
      return {
        student_id: student.id,
        week_index: week.index,
        amount: data.settings.weekly_amount + (late && !acc ? data.settings.late_fee : 0),
        paid_on: today,
        acc: late && acc,
      };
    });
    await mutate(async () => await supabase.from("payments").upsert(payments, {
      onConflict: "student_id,week_index",
      ignoreDuplicates: true,
    }), "Tunggakan berhasil dilunasi.");
  }

  async function toggleHoliday(weekIndexToToggle: number) {
    const supabase = getSupabase();
    if (!supabase) return;
    const isHoliday = data.holidays.includes(weekIndexToToggle);
    if (isHoliday) {
      await mutate(async () => await supabase.from("holidays").delete().eq("week_index", weekIndexToToggle), "Minggu ditandai sebagai minggu aktif.");
    } else {
      await mutate(async () => await supabase.from("holidays").insert({ week_index: weekIndexToToggle }), "Minggu berhasil ditandai libur.");
    }
  }

  async function deleteStudent(student: Student) {
    if (!window.confirm(`Hapus ${student.name} beserta seluruh riwayat pembayarannya?`)) return;
    const supabase = getSupabase();
    if (!supabase) return;
    await mutate(async () => await supabase.from("students").delete().eq("id", student.id), "Data mahasiswa berhasil dihapus.");
  }

  async function deleteExpense(expense: Expense) {
    if (!window.confirm(`Hapus catatan pengeluaran "${expense.note}"?`)) return;
    const supabase = getSupabase();
    if (!supabase) return;
    await mutate(async () => await supabase.from("expenses").delete().eq("id", expense.id), "Pengeluaran berhasil dihapus.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    const ok = await mutate(async () => {
      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) return { error: passwordError };
      if (mustChangePassword) {
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError) return { error: userError };
        const { error: adminError } = await supabase
          .from("admins")
          .update({ must_change_password: false })
          .eq("user_id", userResult.user?.id ?? "");
        return { error: adminError };
      }
      return { error: null };
    }, "Password berhasil diperbarui.");
    if (ok) {
      setNewPassword("");
      setMustChangePassword(false);
    }
  }

  if (loading) {
    return <Shell><div className="loading-panel"><span className="spinner" /><p>Memuat laporan kas…</p></div></Shell>;
  }

  if (mode === "login") {
    return (
      <Shell>
        <section className="auth-layout">
          <div className="auth-copy">
            <span className="eyebrow">RUANG BENDAHARA</span>
            <h1>Kelola kas dengan <em>tenang.</em></h1>
            <p>Masuk untuk mencatat pembayaran, mengelola pengeluaran, dan memperbarui informasi kas kelas.</p>
            <div className="auth-points"><span>✓ Data tersimpan aman di Supabase</span><span>✓ Laporan publik diperbarui langsung</span></div>
          </div>
          <form className="panel auth-card" onSubmit={submitLogin}>
            <span className="form-icon">↗</span>
            <span className="eyebrow">SELAMAT DATANG KEMBALI</span>
            <h2>Masuk bendahara</h2>
            <p className="muted">Masuk menggunakan username bendahara. Email tidak perlu dimasukkan.</p>
            {error && <Alert>{error}</Alert>}
            <label htmlFor="username">Username</label>
            <input id="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} required value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
            {expectedLoginEmail && <p className="login-technical-hint">Email internal yang harus ada di Supabase Auth: <code>{expectedLoginEmail}</code></p>}
            <button className="button button-primary button-wide" disabled={busy}>{busy ? "Memeriksa…" : "Masuk ke dashboard"} <span>→</span></button>
            <a className="back-link" href="/">← Kembali ke laporan publik</a>
          </form>
        </section>
      </Shell>
    );
  }

  if (mode === "admin") {
    if (!authorized && !error) {
      return <Shell admin><div className="loading-panel"><span className="spinner" /><p>Memeriksa akses bendahara…</p></div></Shell>;
    }
    return (
      <Shell admin>
        <section className="admin-heading">
          <div><span className="eyebrow">PANEL PENGELOLAAN</span><h1>Dashboard bendahara</h1><p>Kelola pemasukan, pengeluaran, dan data kas kelas.</p></div>
          <div className="admin-heading-actions">
            <span className={`admin-live-pill ${realtimeStatus}`}><i />{realtimeStatus === "connected" ? "Tersinkron" : realtimeStatus === "connecting" ? "Menghubungkan" : "Koneksi terputus"}</span>
            <button className="button button-quiet" onClick={() => void signOut()}>Keluar <span>↗</span></button>
          </div>
        </section>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert success>{notice}</Alert>}
        {authorized && mustChangePassword && (
          <section className="panel first-login-panel">
            <span className="eyebrow">LANGKAH KEAMANAN WAJIB</span>
            <h2>Ganti password awal Anda</h2>
            <p className="muted">Demi keamanan, buat password pribadi sebelum mulai mengelola kas. Password baru minimal 8 karakter.</p>
            <form onSubmit={changePassword}>
              <label htmlFor="first-login-password">Password pribadi baru</label>
              <input id="first-login-password" type="password" minLength={8} autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <button className="button button-primary" disabled={busy}>Simpan password baru <span>→</span></button>
            </form>
          </section>
        )}
        {authorized && (
          !mustChangePassword && <>
            <div className="stats-grid admin-stats">
              <StatCard label="Saldo kas" value={rupiah(totals.balance)} note="Total masuk dikurangi pengeluaran" variant="stat-primary" />
              <StatCard label="Total pemasukan" value={rupiah(totals.collected)} note={`${data.payments.length} transaksi tercatat`} />
              <StatCard label="Pengeluaran" value={rupiah(totals.spent)} note={`${data.expenses.length} catatan`} />
              <StatCard label="Tunggakan berjalan" value={rupiah(totals.owed)} note="Iuran yang belum diselesaikan" />
            </div>
            <AdminPanel
              data={data}
              config={config}
              setConfig={setConfig}
              weeks={weeks}
              selectedWeek={selectedWeek}
              setSelectedWeek={setSelectedWeek}
              currentWeek={currentWeek}
              today={today}
              paidCount={paidCount}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              visibleStudents={visibleStudents}
              studentNames={studentNames}
              setStudentNames={setStudentNames}
              onSaveStudents={saveStudents}
              expenseDate={expenseDate}
              setExpenseDate={setExpenseDate}
              expenseNote={expenseNote}
              setExpenseNote={setExpenseNote}
              expenseAmount={expenseAmount}
              setExpenseAmount={setExpenseAmount}
              onSaveExpense={saveExpense}
              onTogglePayment={togglePayment}
              onPayArrears={payArrears}
              onToggleHoliday={toggleHoliday}
              onDeleteStudent={deleteStudent}
              onDeleteExpense={deleteExpense}
              onSaveSettings={saveSettings}
              onExport={() => downloadCsv(data, weeks)}
              acc={acc}
              setAcc={setAcc}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              onChangePassword={changePassword}
              busy={busy}
            />
          </>
        )}
      </Shell>
    );
  }

  const recentPayments = sortPayments(data.payments, data.students).slice(0, 10);
  const visibleExpenses = [...data.expenses].sort((a, b) => b.spent_on.localeCompare(a.spent_on));
  const publicWeek = currentWeek ?? weeks[0];
  const thisWeekProgress = publicWeek ? progress(data, publicWeek, today) : 0;

  return (
    <Shell>
      {error && <Alert>{error}</Alert>}
      <section className="hero">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="hero-content">
          <div className="hero-kicker"><span className={`live-dot ${realtimeStatus === "offline" ? "live-dot-offline" : ""}`} /> LAPORAN TERBUKA <span className="hero-kicker-separator">·</span> {fullDate(today)} <span className="live-status">{realtimeStatus === "connected" ? "REALTIME AKTIF" : realtimeStatus === "connecting" ? "MENGHUBUNGKAN…" : "LIVE TERPUTUS"}</span></div>
          <h1>{data.settings.title}</h1>
          <p>Catatan kas kelas yang bisa dipantau siapa saja. Jelas, terbuka, dan selalu diperbarui.</p>
          <div className="hero-meta"><span>↻ Perubahan data tersinkron otomatis</span><span>⌂ Periode {shortDate(data.settings.start_date)} – {shortDate(data.settings.end_date)}</span></div>
        </div>
        <div className="hero-watermark" aria-hidden="true">Rp</div>
      </section>

      <section className="stats-grid public-stats" aria-label="Ringkasan kas">
        <StatCard label="Saldo kas saat ini" value={rupiah(totals.balance)} note="Dana yang tersedia" variant="stat-primary" />
        <StatCard label="Total terkumpul" value={rupiah(totals.collected)} note="Dari seluruh pembayaran" />
        <StatCard label="Total pengeluaran" value={rupiah(totals.spent)} note="Penggunaan dana tercatat" />
        <StatCard label="Belum dibayar" value={rupiah(totals.owed)} note="Akumulasi iuran berjalan" variant="stat-alert" />
      </section>

      <section className="week-overview panel">
        <div className="week-overview-main">
          <div><span className="eyebrow">PROGRES MINGGU INI</span><h2>{publicWeek ? `Minggu ${publicWeek.index + 1}` : "Jadwal belum tersedia"}</h2></div>
          {publicWeek && <span className="week-date">{shortDate(publicWeek.start)} – {shortDate(publicWeek.due)}</span>}
        </div>
        <div className="progress-track"><span style={{ width: `${thisWeekProgress}%` }} /></div>
        <div className="progress-caption"><span><strong>{paidCount}</strong> dari {data.students.length} mahasiswa sudah lunas</span><strong>{thisWeekProgress}%</strong></div>
        <div className="week-rules"><span>Iuran mingguan <b>{rupiah(data.settings.weekly_amount)}</b></span><i /> <span>Denda terlambat <b>{rupiah(data.settings.late_fee)}</b></span></div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="RINCIAN IURAN" title="Status pembayaran" action={<span className="count-chip">{data.students.length} mahasiswa</span>} />
        {currentWeek && (
          <div className="public-controls">
            <div className="week-picker">
              <button className="icon-button" aria-label="Minggu sebelumnya" disabled={weekIndex <= 0} onClick={() => setSelectedWeek(Math.max(0, weekIndex - 1))}>←</button>
              <span>Minggu {currentWeek.index + 1} <small>{shortDate(currentWeek.start)}</small></span>
              <button className="icon-button" aria-label="Minggu berikutnya" disabled={weekIndex >= weeks.length - 1} onClick={() => setSelectedWeek(Math.min(weeks.length - 1, weekIndex + 1))}>→</button>
            </div>
            <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Cari mahasiswa" placeholder="Cari nama mahasiswa" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
        )}
        {visibleStudents.length ? (
          <div className="student-list">
            {visibleStudents.map((student, index) => {
              const status = currentWeek ? getWeekStatus(data, student.id, currentWeek, today) : "future";
              const summary = studentTotals(data, student.id, weeks, today);
              return (
                <article className="student-row" key={student.id}>
                  <span className="student-avatar" style={{ "--avatar": avatarHue(student.name) } as CSSProperties}>{initials(student.name)}</span>
                  <div className="student-info"><strong>{student.name}</strong><span>{summary.owed ? `Tunggakan ${rupiah(summary.owed)}` : "Tidak ada tunggakan"}</span></div>
                  <StatusPill status={status} />
                  <span className="row-amount">{status === "paid"
                    ? rupiah(findPayment(data.payments, student.id, currentWeek?.index ?? -1)?.amount ?? 0)
                    : status === "over" ? rupiah(data.settings.weekly_amount + data.settings.late_fee)
                      : status === "holiday" ? "—" : rupiah(data.settings.weekly_amount)}</span>
                </article>
              );
            })}
          </div>
        ) : <EmptyState>{data.students.length ? "Tidak ada mahasiswa yang cocok dengan pencarian." : "Data mahasiswa belum ditambahkan oleh bendahara."}</EmptyState>}
        <div className="legend"><span><i className="legend-paid" /> Lunas</span><span><i className="legend-late" /> Terlambat</span><span><i className="legend-current" /> Minggu ini</span></div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <SectionTitle eyebrow="ARUS KELUAR" title="Pengeluaran kas" action={<span className="count-chip">{visibleExpenses.length} catatan</span>} />
          {visibleExpenses.length ? (
            <div className="activity-list">
              {visibleExpenses.map((expense) => (
                <article className="activity-row" key={expense.id}>
                  <span className="activity-icon expense-icon">↗</span>
                  <div className="activity-info"><strong>{expense.note}</strong><span>{fullDate(expense.spent_on)}</span></div>
                  <b className="amount-negative">−{rupiah(expense.amount)}</b>
                </article>
              ))}
            </div>
          ) : <EmptyState>Belum ada pengeluaran yang dicatat.</EmptyState>}
        </section>
        <section className="panel">
          <SectionTitle eyebrow="ARUS MASUK" title="Pembayaran terbaru" action={<span className="count-chip">{data.payments.length} transaksi</span>} />
          {recentPayments.length ? (
            <div className="activity-list">
              {recentPayments.map((payment) => (
                <article className="activity-row" key={payment.id}>
                  <span className="activity-icon income-icon">↓</span>
                  <div className="activity-info"><strong>{payment.studentName}</strong><span>Minggu {payment.week_index + 1} · {fullDate(payment.paid_on)}{payment.acc ? " · ACC" : ""}</span></div>
                  <b className="amount-positive">+{rupiah(payment.amount)}</b>
                </article>
              ))}
            </div>
          ) : <EmptyState>Belum ada pembayaran yang tercatat.</EmptyState>}
        </section>
      </div>

      <section className="panel recap-panel">
        <SectionTitle eyebrow="ARSIP TRANSPARAN" title="Rekap semua minggu" action={<span className="count-chip">{weeks.length} minggu</span>} />
        {data.students.length && weeks.length ? (
          <div className="table-scroll">
            <table className="recap-table">
              <thead><tr><th className="sticky-col">Nama mahasiswa</th><th>Tunggakan</th>{weeks.map((week) => <th key={week.index}>M{week.index + 1}<small>{shortDate(week.start)}</small></th>)}</tr></thead>
              <tbody>{data.students.map((student) => {
                const summary = studentTotals(data, student.id, weeks, today);
                return <tr key={student.id}>
                  <th className="sticky-col">{student.name}</th>
                  <td className={summary.owed ? "table-debt" : "table-clear"}>{summary.owed ? rupiah(summary.owed) : "Lunas"}</td>
                  {weeks.map((week) => {
                    const status = getWeekStatus(data, student.id, week, today);
                    return <td className={`recap-cell recap-${status}`} key={week.index} title={STATUS_LABEL[status]}>
                      {status === "paid" ? "✓" : status === "over" ? "!" : status === "now" ? "·" : status === "holiday" ? "—" : "·"}
                    </td>;
                  })}
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState>Rekap akan tampil setelah jadwal dan data mahasiswa tersedia.</EmptyState>}
        <div className="recap-note"><span>i</span> Rekap menampilkan pembayaran per minggu; data pribadi sensitif tidak ditampilkan.</div>
      </section>
    </Shell>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toLocaleUpperCase("id-ID");
}

function avatarHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

function AdminPanel(props: {
  data: CashData;
  config: Settings;
  setConfig: (config: Settings) => void;
  weeks: Week[];
  selectedWeek: number;
  setSelectedWeek: (index: number) => void;
  currentWeek?: Week;
  today: string;
  paidCount: number;
  search: string;
  setSearch: (value: string) => void;
  filter: StatusFilter;
  setFilter: (filter: StatusFilter) => void;
  visibleStudents: Student[];
  studentNames: string;
  setStudentNames: (value: string) => void;
  onSaveStudents: (event: FormEvent<HTMLFormElement>) => void;
  expenseDate: string;
  setExpenseDate: (value: string) => void;
  expenseNote: string;
  setExpenseNote: (value: string) => void;
  expenseAmount: string;
  setExpenseAmount: (value: string) => void;
  onSaveExpense: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePayment: (student: Student, week: Week) => void;
  onPayArrears: (student: Student) => void;
  onToggleHoliday: (weekIndex: number) => void;
  onDeleteStudent: (student: Student) => void;
  onDeleteExpense: (expense: Expense) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onExport: () => void;
  acc: boolean;
  setAcc: (value: boolean) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"payments" | "students" | "expenses" | "settings">("payments");
  const { data, currentWeek, today } = props;
  return (
    <section className="admin-workspace">
      <div className="admin-tabs" role="tablist" aria-label="Pengelolaan kas">
        <button className={tab === "payments" ? "selected" : ""} onClick={() => setTab("payments")}>Pembayaran <span>{data.students.length}</span></button>
        <button className={tab === "students" ? "selected" : ""} onClick={() => setTab("students")}>Mahasiswa</button>
        <button className={tab === "expenses" ? "selected" : ""} onClick={() => setTab("expenses")}>Pengeluaran</button>
        <button className={tab === "settings" ? "selected" : ""} onClick={() => setTab("settings")}>Pengaturan</button>
      </div>

      {tab === "payments" && (
        <div className="panel admin-panel">
          <SectionTitle eyebrow="DAFTAR IURAN" title="Status pembayaran" action={currentWeek && <div className="week-picker admin-week-picker">
            <button className="icon-button" aria-label="Minggu sebelumnya" disabled={props.selectedWeek <= 0} onClick={() => props.setSelectedWeek(Math.max(0, props.selectedWeek - 1))}>←</button>
            <span>Minggu {currentWeek.index + 1}<small>{shortDate(currentWeek.start)} – {shortDate(currentWeek.due)}</small></span>
            <button className="icon-button" aria-label="Minggu berikutnya" disabled={props.selectedWeek >= props.weeks.length - 1} onClick={() => props.setSelectedWeek(Math.min(props.weeks.length - 1, props.selectedWeek + 1))}>→</button>
          </div>} />
          {currentWeek && <div className="progress-line"><span style={{ width: `${props.data.students.length ? Math.round((props.paidCount / props.data.students.length) * 100) : 0}%` }} /></div>}
          {currentWeek && currentWeek.due < today && <label className="acc-toggle"><input type="checkbox" checked={props.acc} onChange={(event) => props.setAcc(event.target.checked)} /><span>Mode ACC — lunasi tanpa denda untuk pembayaran terlambat yang disetujui</span></label>}
          <div className="public-controls admin-controls">
            <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Cari mahasiswa" placeholder="Cari nama mahasiswa" value={props.search} onChange={(event) => props.setSearch(event.target.value)} /></label>
            <div className="filter-buttons">
              {(["all", "unpaid", "paid"] as const).map((value) => <button key={value} className={props.filter === value ? "active" : ""} onClick={() => props.setFilter(value)}>{value === "all" ? "Semua" : value === "unpaid" ? "Belum lunas" : "Lunas"}</button>)}
            </div>
          </div>
          {currentWeek && props.visibleStudents.length ? <div className="student-list admin-student-list">
            {props.visibleStudents.map((student) => {
              const status = getWeekStatus(data, student.id, currentWeek, today);
              const payment = findPayment(data.payments, student.id, currentWeek.index);
              const summary = studentTotals(data, student.id, props.weeks, today);
              return <article className="student-row" key={student.id}>
                <span className="student-avatar" style={{ "--avatar": avatarHue(student.name) } as CSSProperties}>{initials(student.name)}</span>
                <div className="student-info"><strong>{student.name}</strong><span>{payment ? `Dibayar ${fullDate(payment.paid_on)}${payment.acc ? " · ACC" : ""}` : summary.owed ? `Tunggakan ${rupiah(summary.owed)}` : "Belum ada iuran jatuh tempo"}</span></div>
                <StatusPill status={status} />
                <button className={`payment-action ${payment ? "is-paid" : ""}`} disabled={props.busy || status === "holiday"} onClick={() => void props.onTogglePayment(student, currentWeek)} aria-label={payment ? `Batalkan pembayaran ${student.name}` : `Catat pembayaran ${student.name}`}>
                  {payment ? "✓" : "+"}
                </button>
                {summary.lateWeeks > 1 && <button className="arrears-button" disabled={props.busy} onClick={() => void props.onPayArrears(student)}>Lunasi {summary.lateWeeks} minggu</button>}
              </article>;
            })}
          </div> : <EmptyState>{props.data.students.length ? "Tidak ditemukan." : "Tambahkan mahasiswa terlebih dahulu di tab Mahasiswa."}</EmptyState>}
        </div>
      )}

      {tab === "students" && (
        <div className="admin-columns">
          <section className="panel admin-panel">
            <SectionTitle eyebrow="DATA KELAS" title="Tambah mahasiswa" />
            <p className="muted">Masukkan satu nama per baris. Nama ini akan tampil di laporan publik.</p>
            <form onSubmit={props.onSaveStudents}>
              <label htmlFor="student-names">Daftar nama</label>
              <textarea id="student-names" rows={6} maxLength={4000} placeholder={"Alya Putri\nBima Pratama"} value={props.studentNames} onChange={(event) => props.setStudentNames(event.target.value)} />
              <button className="button button-primary" disabled={props.busy}>Tambah mahasiswa <span>→</span></button>
            </form>
          </section>
          <section className="panel admin-panel">
            <SectionTitle eyebrow="TERDAFTAR" title={`Mahasiswa (${data.students.length})`} />
            {data.students.length ? <div className="compact-list">
              {data.students.map((student) => <div className="compact-row" key={student.id}>
                <span className="student-avatar small-avatar" style={{ "--avatar": avatarHue(student.name) } as CSSProperties}>{initials(student.name)}</span>
                <strong>{student.name}</strong>
                <button className="text-danger" disabled={props.busy} onClick={() => void props.onDeleteStudent(student)}>Hapus</button>
              </div>)}
            </div> : <EmptyState>Belum ada data mahasiswa.</EmptyState>}
          </section>
        </div>
      )}

      {tab === "expenses" && (
        <div className="admin-columns">
          <section className="panel admin-panel">
            <SectionTitle eyebrow="PENGELUARAN" title="Catat pengeluaran" />
            <form onSubmit={props.onSaveExpense}>
              <label htmlFor="expense-date">Tanggal</label><input id="expense-date" type="date" required value={props.expenseDate} onChange={(event) => props.setExpenseDate(event.target.value)} />
              <label htmlFor="expense-note">Keterangan</label><input id="expense-note" required maxLength={120} placeholder="Contoh: konsumsi rapat" value={props.expenseNote} onChange={(event) => props.setExpenseNote(event.target.value)} />
              <label htmlFor="expense-amount">Jumlah (Rp)</label><input id="expense-amount" type="number" min="1" step="1" required value={props.expenseAmount} onChange={(event) => props.setExpenseAmount(event.target.value)} />
              <button className="button button-primary" disabled={props.busy}>Simpan pengeluaran <span>→</span></button>
            </form>
          </section>
          <section className="panel admin-panel">
            <SectionTitle eyebrow="RIWAYAT" title={`Catatan (${data.expenses.length})`} />
            {data.expenses.length ? <div className="activity-list">
              {[...data.expenses].sort((a, b) => b.spent_on.localeCompare(a.spent_on)).map((expense) => <article className="activity-row" key={expense.id}>
                <span className="activity-icon expense-icon">↗</span>
                <div className="activity-info"><strong>{expense.note}</strong><span>{fullDate(expense.spent_on)}</span></div>
                <div className="expense-admin-amount"><b className="amount-negative">−{rupiah(expense.amount)}</b><button className="text-danger" disabled={props.busy} onClick={() => void props.onDeleteExpense(expense)}>Hapus</button></div>
              </article>)}
            </div> : <EmptyState>Belum ada pengeluaran yang dicatat.</EmptyState>}
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="admin-columns">
          <section className="panel admin-panel">
            <SectionTitle eyebrow="PREFERENSI KAS" title="Pengaturan periode" />
            <form onSubmit={props.onSaveSettings}>
              <label htmlFor="class-title">Judul laporan publik</label><input id="class-title" maxLength={80} required value={props.config.title} onChange={(event) => props.setConfig({ ...props.config, title: event.target.value })} />
              <div className="form-grid">
                <div><label htmlFor="start-date">Tanggal mulai</label><input id="start-date" type="date" required value={props.config.start_date} onChange={(event) => props.setConfig({ ...props.config, start_date: event.target.value })} /></div>
                <div><label htmlFor="end-date">Tanggal selesai</label><input id="end-date" type="date" required value={props.config.end_date} onChange={(event) => props.setConfig({ ...props.config, end_date: event.target.value })} /></div>
                <div><label htmlFor="weekly-amount">Iuran per minggu (Rp)</label><input id="weekly-amount" type="number" min="0" step="1" required value={props.config.weekly_amount} onChange={(event) => props.setConfig({ ...props.config, weekly_amount: Number(event.target.value) })} /></div>
                <div><label htmlFor="late-fee">Denda (Rp)</label><input id="late-fee" type="number" min="0" step="1" required value={props.config.late_fee} onChange={(event) => props.setConfig({ ...props.config, late_fee: Number(event.target.value) })} /></div>
              </div>
              <button className="button button-primary" disabled={props.busy}>Simpan pengaturan <span>→</span></button>
            </form>
          </section>
          <div className="settings-stack">
            <section className="panel admin-panel">
              <SectionTitle eyebrow="KALENDER" title="Tandai minggu libur" />
              <p className="muted">Minggu libur tidak dihitung sebagai iuran atau tunggakan.</p>
              <div className="holiday-grid">{props.weeks.map((week) => {
                const holiday = data.holidays.includes(week.index);
                return <button key={week.index} className={`holiday-button ${holiday ? "is-holiday" : ""}`} disabled={props.busy} onClick={() => void props.onToggleHoliday(week.index)} title={`${shortDate(week.start)}${holiday ? " · Libur" : ""}`}>
                  <strong>M{week.index + 1}</strong><small>{holiday ? "Libur" : shortDate(week.start)}</small>
                </button>;
              })}</div>
            </section>
            <section className="panel admin-panel">
              <SectionTitle eyebrow="KEAMANAN" title="Ganti password" />
              <form onSubmit={props.onChangePassword}>
                <label htmlFor="new-password">Password baru</label><input id="new-password" type="password" minLength={8} autoComplete="new-password" required value={props.newPassword} onChange={(event) => props.setNewPassword(event.target.value)} />
                <button className="button button-secondary" disabled={props.busy}>Perbarui password</button>
              </form>
            </section>
            <section className="panel export-panel">
              <div><span className="eyebrow">SALINAN DATA</span><h3>Unduh rekap kas</h3><p>Data pembayaran mingguan dan pengeluaran dalam format CSV.</p></div>
              <button className="button button-secondary" onClick={props.onExport}>Unduh CSV <span>↓</span></button>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
