<?php
/**
 * Borra el cliente de prueba "@88 / PRUEBA_TEMP_BORRAR" creado al verificar
 * la base de datos. Ábrelo una vez en el navegador y luego puedes borrar este
 * archivo del servidor.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require __DIR__ . '/config.php';

try {
    $statement = $pdo->prepare('DELETE FROM clients WHERE id = :id');
    $statement->execute([':id' => '@88']);

    $total = $pdo->query('SELECT COUNT(*) AS total FROM clients')->fetch();

    echo json_encode([
        'success' => true,
        'borrados' => $statement->rowCount(),
        'clientes_restantes' => (int) ($total['total'] ?? 0)
    ]);
} catch (Throwable $error) {
    echo json_encode(['error' => $error->getMessage()]);
}
