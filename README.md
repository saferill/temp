# ✉️ Tempik Mail — Modern Disposable Temp Mail

Tempik Mail adalah layanan **email sementara (*disposable temporary email*) modern** berkinerja tinggi yang berjalan sepenuhnya di atas ekosistem **Cloudflare Workers** dan **Cloudflare D1**. 

Tidak memerlukan VPS, tanpa server Linux, tanpa konfigurasi Docker, dan tanpa pusing merawat Postfix/SMTP server sendiri — 100% *serverless* dan dapat berjalan gratis di *Free Tier* Cloudflare.

> 🌐 **Live Demo / Instance**: [tempik.cinewatch.web.id](http://tempik.cinewatch.web.id)  
> 📦 **GitHub Repository**: [github.com/saferill/temp](https://github.com/saferill/temp.git)

---

## ✨ Fitur Unggulan

- 🎨 **Antarmuka Google Gmail Material 3**: Tampilan bersih, intuitif, dan responsif (desktop, tablet, dan mobile) lengkap dengan bilah pencarian, pill *Compose* melayang, panel pembaca email, dan drawer navigasi.
- ⚡ **Detektor OTP Otomatis**: Secara otomatis mendeteksi kode verifikasi 4–8 digit serta format kode Google (`G-XXXXXX`) dan menampilkan banner salin satu klik (*one-click copy*).
- 🔄 **Sinkronisasi Real-Time & Sound Chime**: Polling latar belakang otomatis setiap 6 detik disertai notifikasi suara merdu (*web audio chime*) saat email baru masuk.
- 🌓 **Mode Gelap & Terang (Dark/Light)**: Dukungan tema gelap dan terang yang nyaman di mata dengan penyimpanan preferensi otomatis.
- 🔒 **Privasi Berbasis Sesi Anonim**: Sesi pengguna terisolasi di browser via `localStorage` tanpa perlu mendaftar akun atau login.
- ⏱️ **Auto-Hapus 24 Jam (*Retention Policy*)**: Email otomatis dihapus setelah 24 jam via Cloudflare Cron Triggers per jam, menjaga database D1 selalu bersih dan hemat kuota storage.
- 🗑️ **Pembersihan Permanen (*Cascade Delete*)**: Hapus pesan individual atau hapus seluruh alamat inbox beserta riwayat emailnya secara permanen dari database.
- 🛡️ **Sanitasi XSS & Rich HTML**: Menampilkan email HTML dengan aman di dalam sandboxed iframe dan otomatis mengubah tautan/URL menjadi tautan aktif yang dapat diklik.

---

## 🏗️ Cara Kerja Sistem

```text
Pengirim Email (Google, dsb.)
            │
            ▼
Cloudflare MX Records (route1, route2, route3.mx.cloudflare.net)
            │
            ▼
Cloudflare Email Routing (Catch-all Rule)
            │
            ▼
Worker email() Handler (PostalMime Parser)
            │
            ▼
Cloudflare D1 Database (SQLite di Edge)
            ▲
            │
Worker fetch() Handler (Hono REST API)
            ▲
            │
Web Frontend (Gmail Material 3 UI / Static Assets)
```

1. **Inbound Email**: Ketika email dikirim ke alamat apa pun `@cinewatch.web.id`, Cloudflare Email Routing meneruskannya langsung ke fungsi `email()` pada Worker `tempik`.
2. **Parsing & Storage**: Worker membaca raw stream email via native `ArrayBuffer`, mem-parsing subjek, pengirim, dan isi (HTML/Text) menggunakan `PostalMime`, lalu menyimpannya ke database Cloudflare D1.
3. **Web Client**: Frontend memuat email secara instan melalui Hono REST API (`/api/inboxes/:address/messages`) dan memperbarui tampilan secara dinamis tanpa perlu me-refresh halaman browser.

---

## 📋 Prasyarat

Sebelum memulai pemasangan, pastikan Anda memiliki:

| Kebutuhan | Keterangan |
|---|---|
| **Akun Cloudflare** | [Daftar gratis di Cloudflare](https://dash.cloudflare.com/sign-up) |
| **Domain Aktif** | Domain yang nameserver-nya sudah diarahkan ke Cloudflare (contoh: `cinewatch.web.id`) |
| **Node.js** | Versi 18 atau lebih baru ([Unduh Node.js](https://nodejs.org/)) |
| **npm** | Bawaan instalasi Node.js |
| **Git** | Untuk clone repository |

---

## 🚀 Panduan Instalasi Langkah Demi Langkah

### 1. Clone Repository & Install Dependensi

```bash
git clone https://github.com/saferill/temp.git
cd temp
npm install
```

### 2. Login ke Cloudflare via Wrangler

```bash
npx wrangler login
```

Browser akan terbuka otomatis. Masuk ke akun Cloudflare Anda dan klik **Allow** untuk memberikan izin akses CLI.

Untuk memastikan login berhasil:

```bash
npx wrangler whoami
```

### 3. Buat Database Cloudflare D1

Jalankan perintah berikut untuk membuat database D1 di Cloudflare:

```bash
npx wrangler d1 create tempik-db
```

Output akan menampilkan ID database Anda:

```text
✅ Successfully created DB 'tempik-db'

[[d1_databases]]
binding = "DB"
database_name = "tempik-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4. Sesuaikan `wrangler.toml`

Buka file `wrangler.toml` dan pastikan konfigurasi sesuai dengan domain dan ID database Anda:

```toml
name = "tempik"
main = "src/index.ts"
compatibility_date = "2025-06-01"

workers_dev = false

[[d1_databases]]
binding = "DB"
database_name = "tempik-db"
database_id = "MASUKKAN_DATABASE_ID_ANDA_DI_SINI"

[[routes]]
pattern = "tempik.cinewatch.web.id"
custom_domain = true

[vars]
APP_NAME = "Tempik Mail"
MAIL_DOMAIN = "cinewatch.web.id"
WEB_HOST = "tempik.cinewatch.web.id"

[assets]
directory = "./src/web"

[observability]
enabled = true
```

> **Catatan**: Ganti `cinewatch.web.id` dengan nama domain Anda sendiri jika menggunakan domain lain.

### 5. Terapkan Skema Database (*Migration*)

Jalankan skema SQL ke database D1 remote di Cloudflare:

```bash
npx wrangler d1 execute tempik-db --remote --file=src/db/schema.sql
```

Ini akan membuat 4 tabel utama dengan aturan integritas `ON DELETE CASCADE`:
- `inboxes`: Menyimpan alamat email aktif.
- `messages`: Menyimpan email yang diterima.
- `sessions`: Token sesi browser pengunjung.
- `session_inboxes`: Relasi kepemilikan inbox terhadap sesi browser.

### 6. Konfigurasi Cloudflare Email Routing

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pilih domain Anda (`cinewatch.web.id`).
2. Masuk ke menu **Email** → **Email Routing**.
3. Jika baru pertama kali, aktifkan Email Routing dan izinkan Cloudflare menambahkan catatan DNS secara otomatis:
   - **MX Records**: `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`
   - **SPF TXT**: `v=spf1 include:_spf.mx.cloudflare.net ~all`
   - **DKIM TXT**: `cf2024-1._domainkey`
4. Di tab **Routing Rules**:
   - Cari bagian **Catch-all rule** → Klik **Edit**.
   - Atur **Action**: `Send to a Worker`.
   - Pilih Worker: `tempik`.
   - Pastikan status Catch-all rule berstatus **Enabled** / Aktif.

### 7. Deploy ke Cloudflare Workers

Jalankan perintah deploy:

```bash
npx wrangler deploy
```

Setelah selesai, web email sementara Anda sudah aktif dan dapat diakses di domain kustom Anda (misal: `https://tempik.cinewatch.web.id`)!

---

## 🛠️ Perintah Berguna (*Commands Cheat Sheet*)

| Perintah | Fungsi |
|---|---|
| `npm run deploy` | Melakukan build dan deploy Worker + aset Web UI ke Cloudflare |
| `npm run db:migrate` | Menerapkan skema SQL ke database D1 di Cloudflare |
| `npm run db:local` | Menerapkan skema SQL ke database lokal untuk uji coba dev |
| `npx wrangler dev` | Menjalankan server pengembangan lokal |
| `npx wrangler tail tempik` | Melihat log aktivitas Worker secara *real-time* |
| `npx wrangler d1 execute tempik-db --remote --command="SELECT * FROM messages;"` | Melihat isi tabel pesan langsung dari terminal |

---

## 📁 Struktur Direktori Proyek

```text
temp/
├── wrangler.toml              # Konfigurasi Cloudflare Worker, D1 binding, & routes
├── package.json               # Dependensi proyek & npm scripts
├── tsconfig.json              # Konfigurasi TypeScript
├── API.md                     # Dokumentasi lengkap REST API
├── LICENSE                    # Lisensi MIT
├── README.md                  # Dokumentasi panduan proyek
└── src/
    ├── index.ts               # Entry point Worker: fetch() untuk API & email() untuk inbound mail
    ├── email-handler.ts       # Logika penerimaan email & parsing PostalMime
    ├── api/
    │   └── routes.ts          # REST API router (Hono): /config, /session, /inboxes, /messages
    ├── db/
    │   ├── schema.sql         # Skema tabel SQLite D1 (inboxes, messages, sessions, cascade)
    │   └── queries.ts         # Query database D1 terstruktur & bertipe data
    ├── utils/
    │   └── random-address.ts  # Generator nama email acak Indonesia yang ramah & natural
    └── web/
        ├── index.html         # Tampilan Web UI (Material 3 Gmail layout)
        ├── app.js             # Logika antarmuka klien (deteksi OTP, tema, polling)
        └── styles.css         # Desain tema Gmail Material 3 (Dark & Light mode)
```

---

## ❓ Tanya Jawab & Solusi Masalah (*Troubleshooting*)

### 1. Kode OTP / Email Belum Masuk?
- **Penyebab**: Jika Anda baru saja mengaktifkan Email Routing di Cloudflare, catatan DNS MX memerlukan beberapa menit untuk terpropagasi secara global. Layanan pengirim email (seperti Google, Facebook, dsb.) mungkin telah mencoba mengirim sebelum DNS selesai diperbarui dan menahan email sementara waktu.
- **Solusi**: Pada halaman verifikasi (misalnya pendaftaran Google), klik tombol **Back** (Kembali) lalu klik **Next** (Berikutnya) kembali untuk meminta pengiriman ulang (*resend*). Pastikan juga Catch-all rule di Email Routing sudah mengarah ke Worker `tempik`.

### 2. Memeriksa Alur Email yang Masuk
Anda bisa memantau alur masuk email secara langsung dengan menjalankan:

```bash
npx wrangler tail tempik
```

Lalu kirim email uji coba dari akun Gmail atau Yahoo Anda ke alamat email yang dibuat. Log Worker akan mencetak status penerimaan email secara detail.

---

## 📄 Lisensi

Proyek ini dirilis di bawah lisensi [MIT](LICENSE).

Dibuat dan dikembangkan oleh [saferill (Payy)](https://github.com/saferill).
