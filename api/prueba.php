<?php
/**
 * Prueba de la base de datos. Abre este archivo en el navegador:
 *
 *   https://cornflowerblue-beaver-995948.hostingersite.com/api/prueba.php
 *
 * Comprueba paso a paso:
 *   1. La conexión a MySQL.
 *   2. Que existan las tablas necesarias.
 *   3. Que se pueda escribir y leer una cotización de prueba real.
 *
 * Cuando todo diga "OK", el guardado automático está funcionando.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require __DIR__ . '/config.php';

// Detecta la variable de conexión, sea cual sea el nombre que use config.php.
if (!isset($pdo) || !($pdo instanceof PDO)) {
    foreach (['pdo', 'conn', 'conexion', 'connection', 'db', 'mysqli', 'link'] as $candidate) {
        if (isset($$candidate) && $$candidate instanceof PDO) {
            $pdo = $$candidate;
            break;
        }
    }
}

$resultado = [
    'paso_1_conexion' => (isset($pdo) && $pdo instanceof PDO) ? 'OK' : 'FALLO',
];

if (!isset($pdo) || !($pdo instanceof PDO)) {
    $resultado['RESULTADO_FINAL'] = '❌ config.php no expone una conexión PDO ($pdo). Revisa ese archivo.';
    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // --- Paso 2: tablas ---
    $tablas = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $resultado['paso_2_tablas_encontradas'] = $tablas;

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

    $tablasDespues = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $resultado['paso_2_tabla_documents_creada'] = in_array('documents', $tablasDespues, true) ? 'OK' : 'FALLO';

    // --- Paso 3: escribir una cotización de prueba ---
    $idPrueba = 'prueba_' . time();
    $now = gmdate('Y-m-d H:i:s');

    $insert = $pdo->prepare(
        'INSERT INTO documents
            (`id`, `client_id`, `client_name`, `type`, `date`, `items`, `total`, `display_name`, `created_at`, `updated_at`)
         VALUES
            (:id, :client_id, :client_name, :type, :date, :items, :total, :display_name, :created_at, :updated_at)'
    );

    $insert->execute([
        ':id' => $idPrueba,
        ':client_id' => '@99',
        ':client_name' => 'Cliente de prueba',
        ':type' => 'COTIZACION',
        ':date' => date('d/m/Y'),
        ':items' => json_encode([[
            'description' => 'Producto de prueba',
            'quantity' => '1',
            'price' => '100.00',
            'total' => '$ 100.00'
        ]], JSON_UNESCAPED_UNICODE),
        ':total' => 100,
        ':display_name' => 'Prueba.json',
        ':created_at' => $now,
        ':updated_at' => $now
    ]);

    $resultado['paso_3_escritura'] = 'OK';

    // --- Paso 4: leerla de vuelta ---
    $leer = $pdo->prepare('SELECT * FROM documents WHERE id = :id');
    $leer->execute([':id' => $idPrueba]);
    $fila = $leer->fetch();

    $resultado['paso_4_lectura'] = $fila
        ? 'OK · se guardó la cotización de "' . $fila['client_name'] . '" con total ' . $fila['total']
        : 'FALLO al leer';

    // Limpieza: borramos la prueba para no ensuciar el dashboard.
    $borrar = $pdo->prepare('DELETE FROM documents WHERE id = :id');
    $borrar->execute([':id' => $idPrueba]);
    $resultado['paso_5_limpieza'] = 'OK';

    $total = $pdo->query('SELECT COUNT(*) AS total FROM documents')->fetch();
    $resultado['documentos_guardados_actualmente'] = (int) ($total['total'] ?? 0);

    $resultado['RESULTADO_FINAL'] = '✅ TODO FUNCIONA — la base de datos está lista';
} catch (Throwable $error) {
    $resultado['RESULTADO_FINAL'] = '❌ ERROR: ' . $error->getMessage();
}

echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
