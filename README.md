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

- Hanya cookie yang disimpan. localStorage, sessionStorage, dan IndexedDB tidak
  ikut dipindahkan.
- Cookie partitioned top frame didukung bila browser menyediakan API partition key.
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
## Pengujian

Jalankan `npm run typecheck`, `npm test`, dan `npm run build`. Pengujian Node
menggunakan mock API Chrome dan membutuhkan Node 24 untuk loader TypeScript.
Switching hanya memindahkan cookie pada host/store/partition target; dukungan
login tetap bergantung pada mekanisme autentikasi website. Tidak ada akses storage
website melalui scripting.

Saat extension dimuat ulang, migrasi membersihkan data profil otomatis dan
konfigurasi fitur lama yang telah dihapus. Sesi yang disimpan manual dipertahankan.

## New Session

Tombol **NEW** menyimpan cookie situs aktif sebagai sesi biasa sebelum mengosongkan
cookie lokal dan me-reload tab. Tidak ada request logout/revoke, profil browser
lain, atau pemisahan cookie antar-tab. Tidak ada profil Recovery yang dibuat.

1. Saat akun A aktif, isi label A (opsional), lalu klik **NEW**. Tanpa label,
   snapshot yang identik dipakai kembali bila ada; selain itu nama dibuat dari
   domain dan waktu. Snapshot lama tidak ditimpa.
2. Cookie situs yang berlaku pada host/store/partition aktif dikosongkan. Cookie
   preferensi juga ikut disimpan dan dikosongkan. Parent-domain cookie dapat
   memengaruhi subdomain lain yang memang berbagi cookie tersebut.
3. Login ke akun B pada situs. Jika perlu, buka halaman login situs secara manual.
   Extension tidak menentukan URL login dan tidak mengklaim verifikasi logout.
4. Buka popup, beri label B dan klik **SAVE**. B disimpan lewat tindakan pengguna;
   extension tidak menebak kapan login selesai. Gunakan **Switch** untuk A/B.

Status New tetap tersedia setelah popup ditutup. Save atau Switch mengakhiri
status tersebut. New berikutnya diblokir sampai salah satu tindakan itu dilakukan.
Jika proses terputus, sesi A sudah disimpan sebelum perubahan cookie; pilih Switch
pada sesi itu untuk kembali. Snapshot/account tidak otomatis dihapus saat New gagal.

New dan Switch memakai lock yang sama serta pemulihan cookie sebelumnya jika
mutasi gagal dalam proses yang masih berjalan. Snapshot harus berhasil ditulis
sebelum penghapusan cookie dimulai; kegagalan penyimpanan menghentikan proses.
New tidak membuat snapshot tambahan jika tidak ada cookie situs untuk disimpan.

Batasan: hanya cookie yang diisolasi melalui swapping. localStorage,
sessionStorage, IndexedDB, in-memory token, dan SSO identity provider tidak dihapus
atau dipindahkan. Website dapat tetap login otomatis atau membatalkan sesi A saat B
login sesuai kebijakan server. Tab situs yang sama dalam profil browser yang sama
berbagi cookie; gunakan fitur ini untuk berpindah akun, bukan memakai dua akun
bersamaan secara independen. Tidak ada permission baru.

Pengujian New menggunakan mock Chrome API: A→New→Save B→A/B, deduplikasi snapshot
identik, kegagalan persistensi/penghapusan, double New, dan scope store/partition.
Pengujian tersebut tidak menggantikan validasi pada website autentikasi nyata.
