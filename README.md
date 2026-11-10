# Session Switcher

Ekstensi Chrome (Manifest V3) untuk menyimpan, mengganti, dan memulihkan cookie sesi
antar beberapa akun di situs yang sama tanpa login/logout manual.

Dibangun dengan React 19, TypeScript, Vite 8, CRXJS, dan Tailwind CSS 4.

## Fitur

- Simpan seluruh cookie domain aktif sebagai satu sesi berlabel (mis. "Work", "Personal").
- Ganti sesi: hapus cookie domain aktif, tulis cookie tersimpan, lalu reload tab.
- Perbarui (`Update`) sesi tersimpan dengan cookie terbaru dari tab aktif.
- Ganti nama dan hapus sesi.
- Kelompokkan sesi per domain, dengan grup yang bisa diciutkan.
- Export satu sesi atau semua sesi ke JSON, serta import kembali dengan validasi skema.

## Persyaratan

- **Node.js 22.12 atau lebih baru** (disarankan 22 LTS atau 24/26). Vite 8 membutuhkan
  `^20.19.0 || >=22.12.0`, sedangkan `nanoid` 6 membutuhkan `^22 || ^24 || >=26`.
- npm (ikut terpasang bersama Node.js).
- Browser berbasis Chromium: Chrome, Edge, Brave, atau Chromium terbaru.

Cek versi:

```bash
node -v
npm -v
```

## Instalasi

```bash
git clone <URL_REPO>
cd sessionswithcer
npm install
```

Jika `package-lock.json` tersedia dan Anda ingin instalasi yang deterministik:

```bash
npm ci
```

Tidak ada variabel environment atau konfigurasi tambahan yang diperlukan.

## Build dan Memuat Ekstensi

### Mode development (hot reload)

```bash
npm run dev
```

Perintah ini menjalankan Vite dan menghasilkan folder `dist/` secara otomatis.
Biarkan proses tetap berjalan selama pengembangan.

1. Buka `chrome://extensions` (atau `edge://extensions`).
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** / **Muat yang belum dikemas**.
4. Pilih folder **`dist`** di dalam folder proyek — bukan folder root proyek.
5. Ikon Session Switcher muncul di toolbar; klik untuk membuka popup.

Saat kode berubah, `dist/` diperbarui dan halaman popup memuat ulang otomatis.
Jika `manifest.json` atau izin berubah, klik tombol **Reload** pada kartu ekstensi
di `chrome://extensions`.

### Build produksi

```bash
npm run build
```

Hasil build ada di `dist/`. Ulangi langkah **Load unpacked** di atas (cukup sekali),
lalu klik **Reload** pada kartu ekstensi setiap kali build ulang.

Untuk memuat di Edge:

1. Buka `edge://extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** dan pilih folder `dist`.

## Script

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan Vite dev server dan menulis ulang `dist/` saat ada perubahan. |
| `npm run build` | Build produksi ke `dist/`. |
| `npm run preview` | Menyajikan hasil build sebagai situs statis; tidak diperlukan untuk memakai ekstensi. |

## Cara Pakai

1. Buka situs target dan login ke akun pertama.
2. Klik ikon ekstensi, isi label (mis. `Work Account`), lalu **SAVE**.
3. Logout dan login ke akun kedua, simpan dengan label lain.
4. Untuk berpindah akun, klik **Switch** pada kartu sesi. Ekstensi menghapus cookie
   domain tersebut, menulis cookie sesi tersimpan, lalu me-reload tab.
5. **Update** menimpa cookie sesi tersimpan dengan kondisi tab saat ini.
6. **Rename** mengganti label; **Delete** menghapus sesi (dengan konfirmasi);
   **Export** mengunduh satu sesi sebagai JSON.

Tombol **EXPORT ALL** mengunduh semua sesi, sedangkan **IMPORT** membaca file JSON,
menampilkan pratinjau per domain, lalu mengimpor. Sesi dengan `id` yang sudah ada
dilewati (dihitung sebagai *skipped*).

## Format File Export/Import

```json
{
  "format": "session-switcher-export",
  "version": 1,
  "exportedAt": "2026-10-30T00:00:00.000Z",
  "sessions": [
    {
      "id": "abc123def456",
      "label": "Work Account",
      "domain": "example.com",
      "url": "https://example.com/dashboard",
      "cookies": [
        {
          "name": "session_id",
          "value": "…",
          "domain": ".example.com",
          "path": "/",
          "secure": true,
          "httpOnly": true,
          "sameSite": "lax",
          "expirationDate": 1767225600,
          "storeId": "0"
        }
      ],
      "savedAt": "2026-10-29T12:00:00.000Z",
      "lastUsedAt": null,
      "cookieCount": 1
    }
  ]
}
```

Nilai `format`, `version`, dan seluruh field wajib divalidasi saat import; file yang
tidak sesuai skema ditolak dengan daftar error.

## Keamanan Data

- Sesi disimpan di `chrome.storage.local` dalam bentuk **plaintext**, tanpa enkripsi.
  Siapa pun yang dapat mengakses profil browser dapat membaca cookie tersebut.
- File export berisi cookie sesi aktif dan setara dengan kredensial login. Jangan
  commit, unggah, atau bagikan file export.
- Ekstensi meminta izin `cookies`, `storage`, `tabs`, `activeTab`, dan host
  `<all_urls>`, sehingga dapat membaca serta menulis cookie di semua situs.
- Tidak ada sinkronisasi cloud dan tidak ada pengiriman data ke server.

## Batasan yang Diketahui

- Secara default hanya cookie disimpan. Adapter Anonymous dapat menyimpan key
  autentikasi localStorage/sessionStorage yang dipilih; IndexedDB belum didukung.
- Cookie partitioned top frame didukung pada API yang sesuai; lihat batasan Anonymous di bawah.
- Profil incognito memiliki penyimpanan cookie terpisah.
- Cookie yang sudah kedaluwarsa tetap dapat diimpor, tetapi situs akan menolaknya.
- Popup hanya aktif pada tab `http(s)`. Pada `chrome://`, halaman baru, atau Chrome
  Web Store, popup menampilkan pesan untuk membuka situs terlebih dahulu.

## Struktur Proyek

```text
.
├── manifest.json              # Manifest MV3 sumber (diolah CRXJS)
├── index.html                 # Entry popup
├── vite.config.ts             # React + Tailwind + CRXJS
├── public/icons/              # Ikon ekstensi
├── src/
│   ├── main.tsx               # Bootstrap React popup
│   ├── background/index.ts    # Service worker: router pesan
│   ├── messaging/             # Tipe pesan + client di sisi popup
│   ├── popup/                 # Komponen UI popup dan hooks
│   ├── services/              # Cookie, sesi, export/import
│   ├── storage/               # Persistensi chrome.storage.local
│   ├── types/                 # Tipe Session dan SavedCookie
│   ├── utils/                 # Domain/URL dan generator ID
│   └── styles/global.css      # Design token dan seluruh styling
└── dist/                      # Hasil build (folder yang dimuat ke browser)
```

Alur data: popup mengirim pesan ke service worker → service worker memanggil
`services/*` → `chrome.cookies` dan `chrome.storage.local` → respons dikirim balik
ke popup, yang lalu memuat ulang daftar sesi.

## Troubleshooting

**`npm run build` gagal dengan error versi Node.**
Perbarui Node.js ke 22.12+ lalu jalankan `npm install` ulang.

**Popup menampilkan "Navigate to a website…".**
Tab aktif bukan halaman `http(s)`. Buka situs biasa lalu klik ikon lagi.

**Perubahan kode tidak terlihat.**
Jalankan `npm run build` (atau pastikan `npm run dev` masih hidup), lalu klik
**Reload** pada ekstensi di `chrome://extensions`.

**Error pada service worker.**
Buka `chrome://extensions`, klik **service worker** pada kartu ekstensi untuk melihat
log, atau periksa tab Console pada DevTools popup.

**Import ditolak.**
Pastikan file memiliki `format: "session-switcher-export"`, `version: 1`, dan array
`sessions` yang tidak kosong dengan field sesuai skema di atas.

## Catatan Pengembangan

- `vite build` tidak melakukan pengecekan tipe. Jalankan `npm run typecheck` terpisah.
- Folder `node_modules/` dan `dist/` saat ini ikut terlacak di Git. Sebaiknya
  keluarkan dari indeks (`git rm -r --cached node_modules dist`) sebelum
  menambahkan keduanya ke `.gitignore`.
- Ikon di `public/icons/` sebenarnya data JPEG berukuran 1024×1024 dengan ekstensi
  `.png`; ketiganya identik. Sebaiknya diganti PNG asli berukuran 16/48/128 px.
## Automatic Anonymous Session

Anonymous adalah profil virtual, bukan snapshot cookie akun. Di website yang memiliki
adapter, pilih **Use Anonymous** pada kartu Anonymous. Tidak perlu profile browser
lain, logout, atau capture cookie anonim. Tidak ada request bootstrap/logout/revoke
atau pengiriman token oleh extension. Reload website tetap dapat membuat request
normal; kebijakan rotasi/invalidation server berada di luar kendali extension.

### Mengaktifkan dukungan website

Tidak ada adapter produksi bawaan yang diklaim aman untuk semua website. Klik
**Configure website** dan masukkan konfigurasi berdasarkan mekanisme autentikasi
website yang sudah ditinjau. Contoh berikut hanya contoh skema, bukan adapter
universal yang boleh langsung dipakai di website lain:

```json
{
  "domain": "app.example.test",
  "cookies": [
    { "name": "sid", "domain": ".example.test" },
    { "name": "__Host-auth", "domain": "app.example.test", "path": "/" }
  ],
  "localKeys": ["access_token"],
  "sessionKeys": ["auth_nonce"],
  "verification": {
    "authenticated": "[data-account]",
    "anonymous": "[data-anonymous]"
  }
}
```

- Domain adapter harus persis hostname tab aktif. Rule cookie boleh menunjuk host
  tersebut atau parent domain yang memang mengirim cookie ke host itu. Cookie
  host-only dan domain dibedakan saat pemulihan; `path` opsional pada rule berarti
  semua path untuk nama/domain tersebut. Sertakan seluruh cookie auth/CSRF terkait
  yang perlu diisolasi; jangan masukkan preferensi atau draft.
- `localKeys` dan `sessionKeys` adalah daftar key autentikasi yang tepat, bukan pola
  atau perintah clear. Jika tidak diperlukan, gunakan array kosong. Hanya top frame
  dan origin aktif yang dibaca/ditulis. Tidak ada clear massal storage.
- Verifier adalah dua selector CSS yang saling eksklusif pada halaman yang telah
  selesai reload. Keberadaan elemen membuktikan status login menurut adapter, belum
  membuktikan identitas akun tertentu. SPA yang terlambat render dapat menghasilkan
  kegagalan verifikasi dan rollback. Pilih indikator yang stabil pada halaman itu.
- Verifier opsional. Tanpanya hasil selalu diberi label **Unverified**; UI tidak
  menyatakan bahwa website sudah menerima sesi atau benar-benar anonim.
- Adapter salah/tidak lengkap dapat meninggalkan autentikasi aktif atau menghapus
  data yang keliru. Website tanpa adapter ditandai unsupported; tidak ada heuristic
  otomatis berdasarkan nama cookie. Konfigurasi cukup dilakukan sekali per host.

### Alur dan perlindungan snapshot

`AnonymousSession / SessionCard → runtime message → background router →
 session.service → auth-adapter.service + cookie.service → chrome APIs → reload →
 verification → status UI`.

Sebelum perubahan pertama, service mengunci operasi dan memvalidasi origin, store,
partition, scope cookie, serta expiration. Snapshot kondisi saat ini ditambahkan
sebagai sesi **Recovery** baru jika terdapat data auth. Snapshot akun lama tidak
ditimpa; snapshot Recovery tidak dapat di-Update. Ini juga menangkap cookie yang
sudah dirotasi server tanpa mengubah akun A/B yang pernah disimpan. Bila snapshot
akun lama sudah tidak valid, pilih Recovery terbaru yang sesuai, bukan snapshot
lama. Snapshot tetap dapat diekspor/dihapus secara eksplisit oleh pengguna.

Journal `switchJournal` disimpan sebelum mutasi. Anonymous hanya menghapus cookie
yang cocok dengan rule dan key storage yang tercantum. Berpindah ke akun dengan
adapter menggunakan jalur transaksi yang sama untuk membersihkan auth yang
bertentangan lalu memulihkan auth target. Cookie preferensi saat ini dipertahankan.
Tidak ada cookie akun lain yang dipakai untuk profil Anonymous.

Sesudah reload selesai, verifier dijalankan bila tersedia. Kegagalan menyebabkan
upaya rollback cookie dan storage sebelumnya, lalu reload. Bila rollback gagal atau
service worker terputus, journal tetap tersedia dan switching baru diblokir. Kembali
ke origin/store semula dan pilih **Recover interrupted switch**. Pemulihan lokal
tidak menjamin server masih menerima sesi. Jika tab sudah ditutup, buka kembali origin yang sama di store yang sama dan pilih
Recover; key sessionStorage dari tab lama akan diterapkan ke tab pemulihan tersebut.
Jangan menutup tab selama switching/recovery.

Operasi capture/recapture/switch diserialkan oleh lock service worker, dan mutasi
array sesi diserialkan agar penulisan bersamaan tidak menghilangkan snapshot.
Lock switching sengaja global (lebih konservatif daripada lock per domain), karena
cookie parent domain dapat dibagi beberapa subdomain. Journal juga mencegah
switching baru setelah restart worker. Browser/website masih dapat menulis cookie
dan storage di tab lain; lock ini bukan isolasi proses website. Tutup tab lain pada
website yang sama untuk menghindari penulisan token bersamaan.

### Kompatibilitas dan batasan

- Menambahkan permission `scripting` untuk akses key storage terpilih dan verifier
  DOM. Host permissions tidak diperluas. Reload extension setelah build dan setujui
  perubahan permission browser bila diminta.
- Switching dengan adapter memerlukan Chromium dengan `cookies.getPartitionKey`
  (Chrome 132+). Cookie unpartitioned dan partition top frame aktif dibaca terpisah;
  store, partition, domain, path, host-only, secure, HttpOnly, SameSite, dan expiration
  dipertahankan. Partition/store yang berbeda tidak dipindahkan secara otomatis.
  Identitas penghapusan diperiksa sebelum dan sesudah operasi; konflik ambigu
  menghasilkan error/recovery, bukan penghapusan cookie lain secara diam-diam.
  Rujukan: [Chrome Cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies).
- Snapshot v1 lama tetap dapat diimpor tanpa migrasi. `hostOnly` yang dahulu tidak
  disimpan diinferensikan dari leading dot domain; informasi historis yang hilang
  tidak dapat dijamin pulih. Jika adapter memerlukan storage, snapshot lama harus
  di-Update saat login sebelum digunakan. Snapshot dengan cookie di luar scope,
  store lain, atau expiration auth yang sudah lewat ditolak sebelum mutasi.
- Tanpa adapter, fitur switching akun cookie-only lama tetap tersedia (unverified)
  dan membersihkan cookie yang berlaku untuk host target. Anonymous tetap disabled.
- IndexedDB, cache/service worker website, auth dalam memori JS, iframe lintas
  origin, sibling host/identity provider SSO, HTTP auth, passkey/refresh flow khusus,
  serta bootstrap sesi anonim terisolasi belum didukung. Data tersebut tidak dihapus.
  Automatic SSO dapat langsung login kembali setelah reload; verifier harus dapat
  mendeteksinya. Extension tidak menjamin anonimitas jaringan atau anti-tracking.
- Data tetap plaintext di `chrome.storage.local`; export dan Recovery mengandung
  kredensial. Recovery bersifat append-only dan dapat menambah penggunaan kuota.
  Jika penyimpanan snapshot/journal gagal, mutasi auth belum dimulai. Hapus snapshot
  Recovery lama secara eksplisit bila sudah tidak diperlukan.
- Indikator mode disimpan per tab/origin/store dan diperiksa ulang melalui verifier
  saat popup dibuka/daftar sesi diperbarui. Tanpa verifier indikator hanya pilihan
  terakhir, bukan bukti status login, khususnya setelah perubahan dari tab lain.

### Pengujian fitur

```bash
npm run typecheck
npm test
npm run build
```

Test Node memakai loader TypeScript bawaan Node 24 dan mock Chrome APIs. Mock
menjalankan fungsi injeksi storage/verifier yang sama, lalu mensimulasikan cookie
jar, store, partition, reload dan state halaman. `tests/session.test.mjs` mencakup
A→Anonymous→A, beberapa akun, rotasi auth, preferensi/draft, path ganda, host-only,
partition/store lain, expiration, gagal mutasi/rollback, journal recovery, snapshot
lama, double switch, adapter unsupported, dan penolakan Update saat Anonymous.
Ini pengujian unit/integrasi dengan mock, bukan browser E2E atau bukti dukungan
website produksi. Tidak ada lint script pada proyek.

Untuk validasi browser manual gunakan website autentikasi lokal yang Anda kontrol,
pasang dua indikator DOM sesuai verifier dan cookie/key sesuai adapter di atas,
simpan akun A/B, lalu jalankan urutan pada test. Periksa DevTools bahwa theme/draft
tetap ada, tidak ada request logout/revoke, cookie path dan partition cocok, serta
snapshot Recovery bisa dipulihkan. Jangan gunakan sesi produksi untuk uji kegagalan.
