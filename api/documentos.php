<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/config.php';

// El config.php del servidor puede llamar la conexión de distintas formas.
// Se detecta automáticamente para que este endpoint funcione con cualquiera.
if (!isset($pdo) || !($pdo instanceof PDO)) {
    foreach (['pdo', 'conn', 'conexion', 'connection', 'db', 'mysqli', 'link'] as $candidate) {
        if (isset($$candidate) && $$candidate instanceof PDO) {
            $pdo = $$candidate;
            break;
        }
    }
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'config.php no expone una conexión PDO llamada $pdo',
        'ayuda' => 'Revisa que api/config.php cree la variable $pdo con new PDO(...)'
    ]);
    exit;
}

/**
 * Convierte una fila de la base de datos al formato que espera el dashboard.
 */
function documentRowToArray(array $row): array
{
    $items = json_decode($row['items'] ?? '[]', true);
    if (!is_array($items)) {
        $items = [];
    }

    return [
        'id' => (string) $row['id'],
        'clientId' => $row['client_id'] ?? '',
        'clientName' => $row['client_name'] ?? 'Sin cliente',
        'type' => $row['type'] ?? 'COTIZACIÓN',
        'date' => $row['date'] ?? '',
        'items' => $items,
        'total' => (float) ($row['total'] ?? 0),
        'displayName' => $row['display_name'] ?? '',
        'deletedAt' => $row['deleted_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'payload' => [
            'type' => $row['type'] ?? 'COTIZACIÓN',
            'date' => $row['date'] ?? '',
            'client' => [
                'id' => $row['client_id'] ?? '',
                'name' => $row['client_name'] ?? 'Sin cliente'
            ],
            'items' => $items
        ]
    ];
}

try {
    // Crea la tabla si es la primera vez que se usa el endpoint.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS documents (
            `id` VARCHAR(64) NOT NULL,
            `client_id` VARCHAR(32) NOT NULL DEFAULT \'\',
            `client_name` VARCHAR(255) NOT NULL DEFAULT \'Sin cliente\',
            `type` VARCHAR(32) NOT NULL DEFAULT \'COTIZACION\',
            `date` VARCHAR(32) NOT NULL DEFAULT \'\',
            `items` LONGTEXT NULL,
            `total` DECIMAL(14,2) NOT NULL DEFAULT 0,
            `display_name` VARCHAR(255) NOT NULL DEFAULT \'\',
            `deleted_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            PRIMARY KEY (`id`),
            KEY `client_name_index` (`client_name`),
            KEY `updated_at_index` (`updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // Diagnóstico: permite comprobar desde el navegador que el endpoint está vivo.
    if (($_GET['ping'] ?? '') !== '') {
        $countStatement = $pdo->query('SELECT COUNT(*) AS total FROM documents');
        $countRow = $countStatement->fetch();
        echo json_encode([
            'ok' => true,
            'endpoint' => 'documentos.php',
            'tabla' => 'documents',
            'documentos' => (int) ($countRow['total'] ?? 0)
        ]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $statement = $pdo->query(
            'SELECT * FROM documents ORDER BY `updated_at` DESC LIMIT 2000'
        );

        $documents = array_map('documentRowToArray', $statement->fetchAll());
        echo json_encode($documents);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);

        if (!is_array($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Cuerpo de la solicitud inválido']);
            exit;
        }

        $documents = isset($input['documents']) && is_array($input['documents'])
            ? $input['documents']
            : [$input];

        $statement = $pdo->prepare(
            'INSERT INTO documents
                (`id`, `client_id`, `client_name`, `type`, `date`, `items`, `total`, `display_name`, `deleted_at`, `created_at`, `updated_at`)
             VALUES
                (:id, :client_id, :client_name, :type, :date, :items, :total, :display_name, :deleted_at, :created_at, :updated_at)
             ON DUPLICATE KEY UPDATE
                `client_id` = VALUES(`client_id`),
                `client_name` = VALUES(`client_name`),
                `type` = VALUES(`type`),
                `date` = VALUES(`date`),
                `items` = VALUES(`items`),
                `total` = VALUES(`total`),
                `display_name` = VALUES(`display_name`),
                `deleted_at` = VALUES(`deleted_at`),
                `updated_at` = VALUES(`updated_at`)'
        );

        $saved = 0;
        $now = gmdate('Y-m-d H:i:s');

        foreach ($documents as $document) {
            if (!is_array($document)) {
                continue;
            }

            $id = trim((string) ($document['id'] ?? ''));
            if ($id === '') {
                continue;
            }

            $client = is_array($document['client'] ?? null) ? $document['client'] : [];
            $items = is_array($document['items'] ?? null) ? $document['items'] : [];
            $deletedAt = $document['deletedAt'] ?? null;

            $statement->execute([
                ':id' => $id,
                ':client_id' => (string) ($document['clientId'] ?? $client['id'] ?? ''),
                ':client_name' => (string) ($document['clientName'] ?? $client['name'] ?? 'Sin cliente'),
                ':type' => (string) ($document['type'] ?? 'COTIZACIÓN'),
                ':date' => (string) ($document['date'] ?? ''),
                ':items' => json_encode($items, JSON_UNESCAPED_UNICODE),
                ':total' => (float) ($document['total'] ?? 0),
                ':display_name' => (string) ($document['displayName'] ?? ''),
                ':deleted_at' => $deletedAt ? date('Y-m-d H:i:s', strtotime((string) $deletedAt)) : null,
                ':created_at' => isset($document['createdAt'])
                    ? date('Y-m-d H:i:s', strtotime((string) $document['createdAt']))
                    : $now,
                ':updated_at' => isset($document['updatedAt'])
                    ? date('Y-m-d H:i:s', strtotime((string) $document['updatedAt']))
                    : $now
            ]);

            $saved++;
        }

        echo json_encode(['success' => true, 'count' => $saved]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el id del documento']);
            exit;
        }

        $statement = $pdo->prepare('DELETE FROM documents WHERE `id` = :id');
        $statement->execute([':id' => $id]);

        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor']);
}
