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

1. Di Supabase, buka **Authentication → Users** dan buat pengguna dengan email dan password bendahara. Jangan aktifkan pendaftaran publik untuk aplikasi ini.
2. Salin UUID pengguna, lalu jalankan di SQL Editor:

   ```sql
   insert into public.admins (user_id)
   values ('<UUID-PENGGUNA-SUPABASE>');
   ```

3. Masuk dari tautan **Masuk bendahara** pada website. Pengguna yang belum tercatat pada `public.admins` tidak dapat mengubah data.

## Deploy ke Vercel

1. Hubungkan repository ke Vercel. Atur **Root Directory** ke folder aplikasi ini, yaitu folder yang berisi `package.json`.
2. Tambahkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada **Project Settings → Environment Variables** untuk environment yang digunakan.
3. Deploy. Vercel akan mendeteksi Next.js dan menjalankan build.
4. Tambahkan domain Vercel di **Supabase → Authentication → URL Configuration** sebagai Site URL.

Jangan masukkan `service_role` key ke dalam website atau variabel yang diawali `NEXT_PUBLIC_`. Aplikasi memakai publishable/anon key; kebijakan Row Level Security membatasi perubahan hanya untuk bendahara yang terdaftar.

## Database dan transparansi

Jalankan `supabase/schema.sql` satu kali untuk membuat tabel, data pengaturan awal, fungsi pengecekan admin, dan kebijakan Row Level Security. Tabel pengaturan, mahasiswa, pembayaran, minggu libur, dan pengeluaran dapat dibaca publik agar laporan dapat diverifikasi. Hanya akun admin yang tercatat dapat menambah, mengubah, atau menghapus data. Password tidak disimpan di tabel aplikasi; autentikasi dikelola Supabase Auth.

Data yang ditampilkan publik mencakup nama mahasiswa, status pembayaran per minggu, nominal pembayaran, tanggal pembayaran, serta rincian pengeluaran. Pastikan kelas menyetujui tingkat keterbukaan ini sebelum data asli dimasukkan.

Folder source ini tidak menyertakan `data/kas.sqlite`. Jika aplikasi PHP sebelumnya sudah menyimpan data di hosting lain, ekspor dan migrasikan data tersebut ke Supabase sebelum mengganti domain/cutover; deployment baru tidak dapat membaca SQLite dari hosting PHP.

## Aturan perhitungan

- Periode iuran berjalan per minggu mulai Senin; batas pembayaran Sabtu.
- Iuran yang belum dibayar setelah Sabtu dihitung sebagai iuran mingguan ditambah denda.
- Minggu libur tidak menghasilkan tunggakan.
- Mode ACC mencatat pembayaran terlambat tanpa denda dan memberi penanda ACC.
- Laporan dan ekspor menggunakan tanggal zona waktu Asia/Jakarta.
