-- Tabla de documentos (cotizaciones y facturas) guardadas desde el editor.
-- El endpoint api/documentos.php la crea sola la primera vez, pero este script
-- permite crearla manualmente en el servidor.

CREATE TABLE IF NOT EXISTS documents (
    `id` VARCHAR(64) NOT NULL,
    `client_id` VARCHAR(32) NOT NULL DEFAULT '',
    `client_name` VARCHAR(255) NOT NULL DEFAULT 'Sin cliente',
    `type` VARCHAR(32) NOT NULL DEFAULT 'COTIZACION',
    `date` VARCHAR(32) NOT NULL DEFAULT '',
    `items` LONGTEXT NULL,
    `total` DECIMAL(14,2) NOT NULL DEFAULT 0,
    `display_name` VARCHAR(255) NOT NULL DEFAULT '',
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL,
    `updated_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `client_name_index` (`client_name`),
    KEY `updated_at_index` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
