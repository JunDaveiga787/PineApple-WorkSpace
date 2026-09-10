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

function normalizeProductName(string $name): string
{
    $name = trim(preg_replace('/\s+/', ' ', $name));
    $name = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
    return strtolower(preg_replace('/[^a-zA-Z0-9]+/', ' ', $name));
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $statement = $pdo->query(
            'SELECT name FROM products ORDER BY name ASC'
        );

        echo json_encode($statement->fetchAll());
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $products = is_array($input['products'] ?? null)
            ? $input['products']
            : [$input['name'] ?? ''];
        $products = array_values(array_unique(array_filter(array_map(
            static fn ($product) => is_string($product) ? trim($product) : '',
            $products
        ))));

        if (!$products) {
            http_response_code(400);
            echo json_encode(['error' => 'El nombre del producto es obligatorio']);
            exit;
        }

        $statement = $pdo->prepare(
            'INSERT INTO products (name, normalized_name)
             VALUES (:name, :normalized_name)
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );

        foreach ($products as $name) {
            $statement->execute([
                ':name' => $name,
                ':normalized_name' => normalizeProductName($name)
            ]);
        }

        echo json_encode(['success' => true, 'count' => count($products)]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor']);
}
