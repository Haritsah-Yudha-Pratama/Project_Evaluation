-- ============================================================
--  setup.sql — Jalankan sekali untuk inisialisasi database
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_evaluasi
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE db_evaluasi;

CREATE TABLE IF NOT EXISTS evaluasi (
    id   VARCHAR(20)  NOT NULL,
    nama VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluasi_detail (
    id           INT         NOT NULL AUTO_INCREMENT,
    evaluasi_id  VARCHAR(20) NOT NULL,
    issue        TEXT,
    note         TEXT,
    deadline     DATE,
    status       VARCHAR(50),
    PRIMARY KEY (id),
    FOREIGN KEY (evaluasi_id) REFERENCES evaluasi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
