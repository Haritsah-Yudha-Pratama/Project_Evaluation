<?php
// ============================================================
//  api.php — REST API untuk aplikasi Evaluasi
//  Routing via query string: api.php?path=evaluasi/EVAL0001
// ============================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── KONFIGURASI DB ─────────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_NAME', 'db_evaluasi');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_PORT', 3306);

// ── KONFIGURASI API KEY ────────────────────────────────────
// Ganti nilai ini dengan string acak yang kuat untuk production.
// Set ke null atau string kosong untuk menonaktifkan autentikasi (lokal only).
define('API_KEY', 'evaluasi-secret-2025');

// ── AUTENTIKASI ────────────────────────────────────────────
function checkAuth(): void {
    if (!API_KEY) return; // Autentikasi dinonaktifkan

    $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($provided !== API_KEY) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized: API key tidak valid']);
        exit;
    }
}

// Lewati auth untuk ping & OPTIONS
$skipAuth = ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') ||
            (trim($_GET['path'] ?? '', '/') === 'ping') ||
            (trim($_GET['path'] ?? '', '/') === '');

if (!$skipAuth) checkAuth();

// ── HELPERS ────────────────────────────────────────────────
function resp(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    return $raw ? (json_decode($raw, true) ?? []) : [];
}

// ── KONEKSI + AUTO-SETUP DB ────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    try {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        // Auto-create database
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `" . DB_NAME . "`");

        // Auto-create tabel evaluasi
        $pdo->exec("CREATE TABLE IF NOT EXISTS evaluasi (
            id   VARCHAR(20)  NOT NULL,
            nama VARCHAR(255) NOT NULL,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Auto-create tabel evaluasi_detail
        $pdo->exec("CREATE TABLE IF NOT EXISTS evaluasi_detail (
            id           INT         NOT NULL AUTO_INCREMENT,
            evaluasi_id  VARCHAR(20) NOT NULL,
            issue        TEXT,
            note         TEXT,
            deadline     DATE,
            status       ENUM('Belum','Sudah') NOT NULL DEFAULT 'Belum',
            PRIMARY KEY (id),
            FOREIGN KEY (evaluasi_id) REFERENCES evaluasi(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Migrasi: ubah kolom status ke ENUM jika masih VARCHAR
        $pdo->exec("ALTER TABLE evaluasi_detail
            MODIFY COLUMN status ENUM('Belum','Sudah') NOT NULL DEFAULT 'Belum'");

    } catch (PDOException $e) {
        resp(500, ['error' => 'DB error: ' . $e->getMessage()]);
    }

    return $pdo;
}

// ── GENERATE ID EVALUASI (transaction-safe) ───────────────
// Menggunakan LOCK + transaction agar aman dari race condition
// saat dua request POST evaluasi terjadi bersamaan.
function generateEvalId(PDO $db): string {
    $db->beginTransaction();
    try {
        // Lock tabel evaluasi untuk read, cegah concurrent INSERT
        $db->exec("LOCK TABLES evaluasi WRITE");

        $last = $db->query("SELECT id FROM evaluasi ORDER BY id DESC LIMIT 1")->fetchColumn();
        $num  = $last ? (intval(substr($last, 4)) + 1) : 1;
        $newId = 'EVAL' . str_pad($num, 4, '0', STR_PAD_LEFT);

        $db->exec("UNLOCK TABLES");
        $db->commit();
        return $newId;
    } catch (Exception $e) {
        $db->exec("UNLOCK TABLES");
        $db->rollBack();
        throw $e;
    }
}

// ── ROUTING via ?path= ─────────────────────────────────────
$method   = $_SERVER['REQUEST_METHOD'];
$rawPath  = trim($_GET['path'] ?? '', '/');
$segments = $rawPath !== '' ? explode('/', $rawPath) : [];

$resource = $segments[0] ?? '';
$id       = $segments[1] ?? null;
$sub      = $segments[2] ?? null;

// ── Whitelist status yang valid ────────────────────────────
const VALID_STATUS = ['Belum', 'Sudah'];

// ============================================================
//  RESOURCE: evaluasi
// ============================================================
if ($resource === 'evaluasi') {
    $db = getDB();

    // GET evaluasi — list semua
    if ($method === 'GET' && !$id) {
        $rows = $db->query("
            SELECT e.id, e.nama, COUNT(ed.id) AS total_issue
            FROM evaluasi e
            LEFT JOIN evaluasi_detail ed ON e.id = ed.evaluasi_id
            GROUP BY e.id, e.nama
            ORDER BY e.id ASC
        ")->fetchAll();
        resp(200, $rows);
    }

    // GET evaluasi/{id}
    if ($method === 'GET' && $id && !$sub) {
        $stmt = $db->prepare("SELECT * FROM evaluasi WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $row ? resp(200, $row) : resp(404, ['error' => 'Not found']);
    }

    // GET evaluasi/{id}/issues
    if ($method === 'GET' && $id && $sub === 'issues') {
        $stmt = $db->prepare("SELECT * FROM evaluasi_detail WHERE evaluasi_id = ? ORDER BY id ASC");
        $stmt->execute([$id]);
        resp(200, $stmt->fetchAll());
    }

    // POST evaluasi
    if ($method === 'POST' && !$id) {
        $body = body();
        $nama = trim($body['nama'] ?? '');
        if ($nama === '') resp(422, ['error' => 'Nama wajib diisi']);
        if (mb_strlen($nama) > 255) resp(422, ['error' => 'Nama terlalu panjang (maks 255 karakter)']);

        $chk = $db->prepare("SELECT COUNT(*) FROM evaluasi WHERE LOWER(nama) = LOWER(?)");
        $chk->execute([$nama]);
        if ($chk->fetchColumn() > 0) resp(409, ['error' => 'Nama sudah digunakan']);

        try {
            $newId = generateEvalId($db);
            $db->prepare("INSERT INTO evaluasi (id, nama) VALUES (?, ?)")->execute([$newId, $nama]);
            resp(201, ['id' => $newId, 'nama' => $nama, 'total_issue' => 0]);
        } catch (Exception $e) {
            resp(500, ['error' => 'Gagal generate ID: ' . $e->getMessage()]);
        }
    }

    // PUT evaluasi/{id}
    if ($method === 'PUT' && $id) {
        $body = body();
        $nama = trim($body['nama'] ?? '');
        if ($nama === '') resp(422, ['error' => 'Nama wajib diisi']);
        if (mb_strlen($nama) > 255) resp(422, ['error' => 'Nama terlalu panjang (maks 255 karakter)']);

        $chk = $db->prepare("SELECT COUNT(*) FROM evaluasi WHERE LOWER(nama) = LOWER(?) AND id != ?");
        $chk->execute([$nama, $id]);
        if ($chk->fetchColumn() > 0) resp(409, ['error' => 'Nama sudah digunakan']);

        $stmt = $db->prepare("UPDATE evaluasi SET nama = ? WHERE id = ?");
        $stmt->execute([$nama, $id]);
        if ($stmt->rowCount() === 0) {
            // Cek apakah ID memang tidak ada
            $exists = $db->prepare("SELECT COUNT(*) FROM evaluasi WHERE id = ?");
            $exists->execute([$id]);
            if ($exists->fetchColumn() == 0) resp(404, ['error' => 'Evaluasi tidak ditemukan']);
        }
        resp(200, ['id' => $id, 'nama' => $nama]);
    }

    // DELETE evaluasi/{id}
    if ($method === 'DELETE' && $id) {
        $exists = $db->prepare("SELECT COUNT(*) FROM evaluasi WHERE id = ?");
        $exists->execute([$id]);
        if ($exists->fetchColumn() == 0) resp(404, ['error' => 'Evaluasi tidak ditemukan']);

        // CASCADE sudah handle hapus detail, tapi kita eksplisit untuk kejelasan
        $db->prepare("DELETE FROM evaluasi WHERE id = ?")->execute([$id]);
        resp(200, ['deleted' => $id]);
    }
}

// ============================================================
//  RESOURCE: issues
// ============================================================
if ($resource === 'issues') {
    $db = getDB();

    // GET issues/{id}
    if ($method === 'GET' && $id) {
        $stmt = $db->prepare("SELECT * FROM evaluasi_detail WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $row ? resp(200, $row) : resp(404, ['error' => 'Not found']);
    }

    // POST issues
    if ($method === 'POST' && !$id) {
        $body     = body();
        $evalId   = trim($body['evaluasi_id'] ?? '');
        $issue    = trim($body['issue']       ?? '');
        $note     = trim($body['note']        ?? '') ?: null;
        $deadline = trim($body['deadline']    ?? '');
        $status   = trim($body['status']      ?? '');

        if (!$evalId || !$issue || !$deadline || !$status)
            resp(422, ['error' => 'Field wajib: evaluasi_id, issue, deadline, status']);

        // Validasi status
        if (!in_array($status, VALID_STATUS, true))
            resp(422, ['error' => 'Status tidak valid. Gunakan: ' . implode(', ', VALID_STATUS)]);

        // Validasi format deadline (YYYY-MM-DD)
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline))
            resp(422, ['error' => 'Format deadline tidak valid (YYYY-MM-DD)']);

        // Pastikan evaluasi_id ada
        $evalCheck = $db->prepare("SELECT COUNT(*) FROM evaluasi WHERE id = ?");
        $evalCheck->execute([$evalId]);
        if ($evalCheck->fetchColumn() == 0) resp(404, ['error' => 'Evaluasi tidak ditemukan']);

        $db->prepare("INSERT INTO evaluasi_detail (evaluasi_id, issue, note, deadline, status) VALUES (?,?,?,?,?)")
           ->execute([$evalId, $issue, $note, $deadline, $status]);
        $newId = (int) $db->lastInsertId();
        resp(201, ['id' => $newId, 'evaluasi_id' => $evalId, 'issue' => $issue, 'note' => $note, 'deadline' => $deadline, 'status' => $status]);
    }

    // PUT issues/{id}
    if ($method === 'PUT' && $id) {
        $body     = body();
        $issue    = trim($body['issue']    ?? '');
        $note     = trim($body['note']     ?? '') ?: null;
        $deadline = trim($body['deadline'] ?? '');
        $status   = trim($body['status']   ?? '');

        if (!$issue || !$deadline || !$status)
            resp(422, ['error' => 'Field wajib: issue, deadline, status']);

        // Validasi status
        if (!in_array($status, VALID_STATUS, true))
            resp(422, ['error' => 'Status tidak valid. Gunakan: ' . implode(', ', VALID_STATUS)]);

        // Validasi format deadline
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline))
            resp(422, ['error' => 'Format deadline tidak valid (YYYY-MM-DD)']);

        $stmt = $db->prepare("UPDATE evaluasi_detail SET issue=?, note=?, deadline=?, status=? WHERE id=?");
        $stmt->execute([$issue, $note, $deadline, $status, $id]);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare("SELECT COUNT(*) FROM evaluasi_detail WHERE id = ?");
            $exists->execute([$id]);
            if ($exists->fetchColumn() == 0) resp(404, ['error' => 'Issue tidak ditemukan']);
        }
        resp(200, ['id' => (int) $id]);
    }

    // DELETE issues/{id}
    if ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("SELECT evaluasi_id FROM evaluasi_detail WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) resp(404, ['error' => 'Issue tidak ditemukan']);
        $db->prepare("DELETE FROM evaluasi_detail WHERE id = ?")->execute([$id]);
        resp(200, ['deleted' => (int) $id, 'evaluasi_id' => $row['evaluasi_id']]);
    }
}

// ── SETUP manual ───────────────────────────────────────────
if ($resource === 'setup') {
    getDB();
    resp(200, ['message' => 'Database & tables OK']);
}

// ── PING / health check (tanpa auth) ──────────────────────
if ($resource === 'ping' || $resource === '') {
    resp(200, ['status' => 'ok', 'message' => 'API evaluasi-js running']);
}

resp(404, ['error' => 'Endpoint not found', 'path' => $rawPath]);
