<?php
/**
 * Conexión a la base de datos MySQL de Hostinger.
 *
 * Este archivo es usado por productos.php, clientes.php y documentos.php.
 * El host es "localhost" porque el servidor web y la base de datos viven en
 * la misma máquina. MySQL de Hostinger NO acepta conexiones desde fuera.
 */

$DB_NAME = 'u988650749_pineapple';
$DB_USER = 'u988650749_pineappleswork';
$DB_PASS = 'kj#XK6naCPP2DJQ&Uc';
$DB_PORT = 3306;

// Hostinger atiende por "localhost" en el mismo servidor. Si el hosting usara
// un host separado, se prueban estos en orden hasta que uno conecte.
$DB_HOSTS = ['localhost', '127.0.0.1', 'mysql.hostinger.com'];

$pdo = null;
$lastError = null;

foreach ($DB_HOSTS as $DB_HOST) {
    try {
        $pdo = new PDO(
            "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4",
            $DB_USER,
            $DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        break;
    } catch (Throwable $error) {
        $lastError = $error;
        $pdo = null;
    }
}

if ($pdo === null) {
    $error = $lastError;
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'No se pudo conectar a la base de datos',
        'detalle' => $error ? $error->getMessage() : 'Error desconocido'
    ]);
    exit;
}
