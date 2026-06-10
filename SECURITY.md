# Seguridad

Este proyecto fue construido siguiendo buenas prácticas de seguridad para
aplicaciones web. A continuación se documentan las medidas implementadas.

## Autenticación y sesiones
- **Contraseñas cifradas con PBKDF2** (SHA-256, 100.000 iteraciones) y un *salt*
  aleatorio único por usuario. Nunca se almacenan ni se transmiten en texto plano.
- **Comparación en tiempo constante** al verificar contraseñas, para mitigar
  ataques de temporización (*timing attacks*).
- **Sesiones por token**: se genera un token aleatorio de 256 bits; en la base de
  datos solo se guarda su *hash* (SHA-256), nunca el token en sí.
- **Cookies seguras**: `HttpOnly` (no accesibles desde JavaScript), `Secure`
  (solo HTTPS) y `SameSite=Strict` (protección contra CSRF). Expiración a 30 días.

## Control de acceso
- Todas las rutas de datos (`/api/data`, productos, ventas, usuarios) exigen
  sesión válida.
- **Registro cerrado**: solo la primera cuenta puede registrarse libremente
  (queda como administrador). Después, únicamente un administrador puede crear
  nuevos usuarios, evitando registros no autorizados en el dominio público.
- **Roles**: `admin` (gestión total, incluidos usuarios) y `staff` (ventas e
  inventario).

## Datos y consultas
- Todas las consultas a la base de datos usan **sentencias preparadas con
  parámetros** (`.bind(...)`), evitando inyección SQL.
- Operaciones que modifican stock y ventas se ejecutan en **transacciones por
  lotes** para mantener la consistencia del inventario.

## Gestión de secretos
- El repositorio **no contiene credenciales ni tokens**.
- El `database_id` presente en `wrangler.toml` **no es un secreto**: acceder a la
  base de datos requiere autenticación de la cuenta de Cloudflare.
- El token de despliegue (`CLOUDFLARE_API_TOKEN`) se gestiona como *secret* de
  GitHub Actions y nunca se versiona.

## Reporte de vulnerabilidades
Si encuentras un problema de seguridad, por favor abre un *issue* o contacta al
autor directamente.
