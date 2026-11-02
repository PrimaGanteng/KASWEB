# Kas Kelas

Website laporan kas kelas dengan Next.js, TypeScript, dan Supabase. Halaman publik menampilkan saldo, seluruh catatan pengeluaran, pembayaran terbaru, status iuran mahasiswa, dan rekap per minggu. Bendahara dapat mengelola data setelah login.

## Menjalankan secara lokal

1. Gunakan Node.js 20.9 atau lebih baru.
2. Buat project Supabase dan jalankan seluruh isi `supabase/schema.sql` melalui **SQL Editor**.
3. Salin `.env.example` menjadi `.env.local`, lalu isi:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   ```

4. Pasang dependency dan jalankan aplikasi:

   ```sh
   npm install
   npm run dev
   ```

5. Buka `http://localhost:3000`.

## Membuat akses bendahara

Form login menerima username, sedangkan Supabase Auth menggunakan email. Aplikasi memetakan username secara internal ke alamat teknis `<username>@<project-ref>.supabase.co`; alamat tersebut hanya dipakai untuk autentikasi dan tidak ditampilkan pada formulir login.

1. Di Supabase, buka **Authentication → Users** lalu buat pengguna bendahara dengan alamat `<username>@<project-ref>.supabase.co`. Ganti `<project-ref>` dengan bagian sebelum `.supabase.co` pada URL project Anda. Contoh, untuk username `admintekdus`, alamat internal berbentuk `admintekdus@abcdefghijklmnop.supabase.co`. Gunakan password awal yang sudah ditentukan oleh pemilik project; setelah login, aplikasi akan mewajibkan password tersebut diganti sebelum dashboard dapat digunakan. Jangan aktifkan pendaftaran publik untuk aplikasi ini.
2. Salin UUID pengguna, lalu jalankan di SQL Editor. Sesuaikan username jika diperlukan:

   ```sql
   insert into public.admins (user_id, username)
   values ('<UUID-PENGGUNA-SUPABASE>', 'admintekdus');
   ```

3. Masuk dari tautan **Masuk bendahara** dengan username dan password yang dibuat di Supabase. Pengguna yang belum tercatat pada `public.admins` tidak dapat mengubah data.

Username awal yang diminta adalah `admintekdus`. Password awal hanya untuk proses penyiapan akun di Supabase, bukan kode login yang ditanamkan di aplikasi; wajib menggantinya saat login pertama. Jangan menyimpan password di repository. Jika skema lama pernah dijalankan, jalankan skema terbaru lagi untuk menambah kolom username dan pengingat penggantian password. Lalu isi kolom username pada baris admin Anda dengan menjalankan `update public.admins set username = 'admintekdus' where user_id = '<UUID-PENGGUNA-SUPABASE>';`.

## Deploy ke Vercel

1. Hubungkan repository ke Vercel. Atur **Root Directory** ke folder aplikasi ini, yaitu folder yang berisi `package.json`.
2. Tambahkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada **Project Settings → Environment Variables** untuk environment yang digunakan.
3. Deploy. Vercel akan mendeteksi Next.js dan menjalankan build.
4. Tambahkan domain Vercel di **Supabase → Authentication → URL Configuration** sebagai Site URL.

Jangan masukkan `service_role` key ke dalam website atau variabel yang diawali `NEXT_PUBLIC_`. Aplikasi memakai publishable/anon key; kebijakan Row Level Security membatasi perubahan hanya untuk bendahara yang terdaftar.

## Database dan transparansi

Jalankan `supabase/schema.sql` untuk membuat tabel, data pengaturan awal, fungsi pengecekan admin, kebijakan Row Level Security, serta mendaftarkan tabel laporan pada publikasi Supabase Realtime. Jalankan ulang skrip jika project sudah disiapkan dengan versi skema sebelumnya. Tabel pengaturan, mahasiswa, pembayaran, minggu libur, dan pengeluaran dapat dibaca publik agar laporan dapat diverifikasi. Hanya akun admin yang tercatat dapat menambah, mengubah, atau menghapus data. Perubahan data disiarkan otomatis ke semua browser yang sedang membuka laporan atau dashboard. Jika koneksi realtime terputus, muat ulang halaman untuk mengambil data terbaru. Password tidak disimpan di tabel aplikasi; autentikasi dikelola Supabase Auth.

Pada halaman publik, indikator **REALTIME AKTIF** berarti browser sudah menerima pembaruan langsung. Jika tidak aktif, buka **Supabase → Database → Replication** dan pastikan `settings`, `students`, `payments`, `holidays`, serta `expenses` dipilih untuk Realtime; setelah itu muat ulang aplikasi.

Data yang ditampilkan publik mencakup nama mahasiswa, status pembayaran per minggu, nominal pembayaran, tanggal pembayaran, serta rincian pengeluaran. Pastikan kelas menyetujui tingkat keterbukaan ini sebelum data asli dimasukkan.

Folder source ini tidak menyertakan `data/kas.sqlite`. Jika aplikasi PHP sebelumnya sudah menyimpan data di hosting lain, ekspor dan migrasikan data tersebut ke Supabase sebelum mengganti domain/cutover; deployment baru tidak dapat membaca SQLite dari hosting PHP.

## Aturan perhitungan

- Periode iuran berjalan per minggu mulai Senin; batas pembayaran Sabtu.
- Iuran yang belum dibayar setelah Sabtu dihitung sebagai iuran mingguan ditambah denda.
- Minggu libur tidak menghasilkan tunggakan.
- Mode ACC mencatat pembayaran terlambat tanpa denda dan memberi penanda ACC.
- Laporan dan ekspor menggunakan tanggal zona waktu Asia/Jakarta.
