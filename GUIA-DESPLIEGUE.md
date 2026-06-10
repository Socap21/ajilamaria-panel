# Ají la María · App con base de datos D1 + Login

App full-stack para Cloudflare: un Worker que sirve el panel y expone una API
conectada a **Cloudflare D1** (base de datos), con **login de usuarios** seguro.

```
ajilamaria-app/
├─ wrangler.toml        ← configuración (nombre del Worker + D1)
├─ schema.sql           ← tablas de la base de datos (obligatorio)
├─ seed.sql             ← productos de ejemplo (opcional)
├─ src/worker.js        ← backend: API + autenticación
└─ public/index.html    ← frontend: el panel
```

---

## Requisitos
- **Node.js 18+** instalado → https://nodejs.org
- Tu cuenta de Cloudflare (la misma: `mauropat0102@gmail.com`)

Todo se hace con **Wrangler**, la herramienta oficial de Cloudflare. No necesitas instalarla
aparte: se usa con `npx`.

---

## Paso a paso

### 1. Abrir la carpeta del proyecto
Descomprime/copia la carpeta `ajilamaria-app` y, en una terminal, entra a ella:
```bash
cd ajilamaria-app
```

### 2. Iniciar sesión en Cloudflare
```bash
npx wrangler login
```
Se abre el navegador, autorizas y listo.

### 3. Crear la base de datos D1
```bash
npx wrangler d1 create ajilamaria
```
Esto imprime algo como:
```
[[d1_databases]]
binding = "DB"
database_name = "ajilamaria"
database_id = "abc123-xxxx-xxxx"
```
👉 **Copia ese `database_id`** y pégalo en `wrangler.toml` donde dice
`PEGA_AQUI_TU_DATABASE_ID`.

### 4. Crear las tablas (en la nube)
```bash
npx wrangler d1 execute ajilamaria --remote --file=./schema.sql
```

### 5. (Opcional) Cargar productos de ejemplo
```bash
npx wrangler d1 execute ajilamaria --remote --file=./seed.sql
```
Si prefieres empezar con el catálogo vacío, omite este paso.

### 6. Publicar la app
```bash
npx wrangler deploy
```
Como en `wrangler.toml` el `name` es **`ancient-math-fa29`** (tu Worker actual),
esto **actualiza ese mismo Worker** y conserva tu dominio `aji.socap21.uk`.

### 7. Crear tu cuenta de administrador
Abre `https://aji.socap21.uk`. Como aún no hay usuarios, verás
**“Crea tu cuenta”**. Regístrate: esa primera cuenta queda como **administrador**.
Desde **Ajustes → Usuarios** podrás agregar más personas (staff o admin).

¡Listo! 🎉

---

## Cómo actualizar la app más adelante
Cambia lo que necesites y vuelve a publicar:
```bash
npx wrangler deploy
```
Para cambios en las tablas, ejecuta el `.sql` correspondiente con
`wrangler d1 execute ... --remote`.

## Probar en local (opcional)
```bash
npx wrangler dev --remote
```

---

## Notas de seguridad
- Las contraseñas se guardan **cifradas** (PBKDF2, 100.000 iteraciones + salt único). Nunca en texto plano.
- La sesión usa una **cookie HttpOnly + Secure**, no accesible desde JavaScript.
- El **registro abierto solo funciona para la primera cuenta**. Después, solo un
  administrador puede crear usuarios → nadie externo puede registrarse en tu dominio público.
- Roles: **admin** (todo + gestión de usuarios) y **staff** (ventas e inventario).

## Respaldos
Desde **Ajustes → Exportar respaldo** descargas un JSON con productos y ventas.
También puedes respaldar la base completa con:
```bash
npx wrangler d1 export ajilamaria --remote --output=respaldo.sql
```
