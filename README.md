# Evaluasi App — Pure PHP + JS (No Framework)

## Struktur File

```
Evaluasi-JS/
├── index.html   ← Single page app (semua UI)
├── api.php      ← Backend API (CRUD MySQL via PDO)
├── setup.sql    ← SQL untuk buat database & tabel
└── README.md
```

## Cara Install

### 1. Copy folder ke Laragon
Salin folder ini ke `C:\laragon\www\Evaluasi-JS\`

### 2. Buat database
Buka phpMyAdmin (`http://localhost/phpmyadmin`) → Import file `setup.sql`

Atau jalankan manual:
```sql
CREATE DATABASE IF NOT EXISTS db_evaluasi CHARACTER SET utf8mb4;
USE db_evaluasi;
-- (lalu paste isi setup.sql)
```

### 3. Sesuaikan konfigurasi DB di api.php (baris 12–17)
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'db_evaluasi');
define('DB_USER', 'root');
define('DB_PASS', '');       // kosong = default Laragon
define('DB_PORT', 3306);
```

### 4. Akses di browser
```
http://localhost/Evaluasi-JS/index.html
```

> Tidak perlu konfigurasi apapun, tidak perlu `.htaccess`, tidak perlu virtual host.

## Cara Kerja

- `index.html` adalah SPA (Single Page App) murni HTML + JS
- Semua data fetch via `fetch()` ke `api.php`
- `api.php` routing sederhana berdasarkan URL path + HTTP method
- Tidak ada dependency tambahan selain yang di-load via CDN (Bootstrap 5, DataTables, SweetAlert2)
