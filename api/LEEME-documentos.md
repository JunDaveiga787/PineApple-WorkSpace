# Conectar el guardado automático a la base de datos

## Estado actual

Tu base de datos **ya está verificada y funciona**. Desde aquí comprobé que:

- ✅ La conexión con el usuario `u988650749_pineappleswork` funciona
- ✅ El servidor guarda y lee datos correctamente (creé y leí un cliente de prueba)
- ✅ `clientes.php` y `productos.php` ya están operativos en el servidor
- ❌ **`documentos.php` no está subido** — por eso las facturas y cotizaciones no aparecen

El código ya está listo. Solo falta **subir 3 archivos** a tu Hostinger.

## Archivos a subir

Todos van dentro de la carpeta `api/` de tu sitio, junto a `clientes.php` y
`productos.php` que ya están ahí:

| Archivo local            | ¿Obligatorio? | Para qué sirve                                      |
| ------------------------ | ------------- | --------------------------------------------------- |
| `api/documentos.php`     | **Sí**        | Guarda y lee las facturas y cotizaciones            |
| `api/config.php`         | **Sí**        | Conexión a MySQL con tus datos                      |
| `api/prueba.php`         | Recomendado   | Comprueba que todo funciona (puedes borrarlo luego) |
| `api/limpiar-prueba.php` | Temporal      | Borra el cliente de prueba `@88`                    |

> ⚠️ **Importante sobre `config.php`**: si tu servidor ya tiene un `config.php`
> funcionando (el que usa `clientes.php`), **no lo sobrescribas con el mío**. En
> ese caso solo sube `documentos.php` y `prueba.php`.
>
> Si no sabes cuál es, súbelo y luego abre `prueba.php`: si da error de
> conexión, restaura el anterior.

## Paso a paso

1. Entra a **Hostinger → hPanel → Archivos → Administrador de archivos**
   (o conéctate por FTP con tu cliente habitual).

2. Abre la carpeta `api/` de tu sitio. Ahí debe estar `clientes.php`.

3. Sube **`documentos.php`** y **`prueba.php`**.

4. Si tu servidor **no tenía** `config.php`, sube también `config.php`.

## Comprobar que funcionó

Abre esta dirección en el navegador:

```
https://cornflowerblue-beaver-995948.hostingersite.com/api/prueba.php
```

Debes ver algo como esto:

```json
{
    "paso_1_conexion": "OK",
    "paso_2_tabla_documents_creada": "OK",
    "paso_3_escritura": "OK",
    "paso_4_lectura": "OK · se guardó la cotización de \"Cliente de prueba\" con total 100",
    "paso_5_limpieza": "OK",
    "documentos_guardados_actualmente": 0,
    "RESULTADO_FINAL": "✅ TODO FUNCIONA — la base de datos está lista"
}
```

Ese `✅ TODO FUNCIONA` significa que el guardado automático ya está conectado.

5. Después, abre `limpiar-prueba.php` una vez para borrar el cliente de prueba
   `@88`, y borra ese archivo del servidor junto con `prueba.php` si quieres.

## Qué verás en el dashboard

En la barra superior del dashboard hay un aviso de estado. Este es el
significado de cada uno:

| Aviso                                          | Significado                              |
| ---------------------------------------------- | ---------------------------------------- |
| 🟢 **Base de datos conectada**                 | Todo funciona desde la base de datos     |
| 🟡 **Conectando con la base de datos…**        | Está cargando                            |
| 🔴 **Falta api/documentos.php en el servidor** | Falta subir el archivo                   |
| 🔴 **Sin conexión a la base de datos**         | No hay internet o el servidor está caído |

Cuando veas **"Base de datos conectada"** en verde, ya puedes crear facturas y
cotizaciones: se guardarán solas en la base de datos y aparecerán en el
dashboard desde cualquier dispositivo.

## Recuperar lo que ya creaste

Lo que creaste mientras el endpoint no existía quedó guardado **solo en ese
navegador**. Al volver a abrir el dashboard en ese mismo navegador, aparecerá
un botón **"Subir todo a la base (N)"** en la barra superior. Púlsalo una vez y
sube todo de golpe a la base de datos.

## Datos de conexión usados

Están en `api/config.php`:

```php
$DB_NAME = 'u988650749_pineapple';
$DB_USER = 'u988650749_pineappleswork';
$DB_PASS = 'kj#XK6naCPP2DJQ&Uc';
```

El host es `localhost` (la base de datos vive en el mismo servidor que la web).
