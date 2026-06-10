/* ============================================================
 *  Ají la María · Cloudflare Worker (API + Auth + D1)
 *  - Sirve el frontend (public/index.html) vía binding ASSETS
 *  - Expone /api/* para login y datos
 *  - Contraseñas con PBKDF2 (100k iteraciones) + salt
 *  - Sesiones con cookie HttpOnly/Secure y token en D1
 * ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url);
      } catch (e) {
        return json({ error: e.message || "Error del servidor" }, 500);
      }
    }
    // Cualquier otra ruta -> archivo estático (el frontend)
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- utilidades ---------------- */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
const bufToHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function hexToBuf(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}
async function sha256Hex(s) {
  return bufToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function deriveHash(password, saltBuf) {
  const km = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 100000, hash: "SHA-256" },
    km,
    256
  );
  return bufToHex(bits);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? m[1] : null;
}
const num = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const int = (v) => (isFinite(parseInt(v)) ? parseInt(v) : 0);

async function getUser(request, env) {
  const token = getCookie(request, "session");
  if (!token) return null;
  const th = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT u.id,u.nombre,u.email,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?"
  )
    .bind(th)
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(th).run();
    return null;
  }
  return { id: row.id, nombre: row.nombre, email: row.email, role: row.role };
}

async function createSession(userId, env, user) {
  const token = bufToHex(crypto.getRandomValues(new Uint8Array(32)));
  const th = await sha256Hex(token);
  const now = Date.now();
  const exp = now + 30 * 24 * 3600 * 1000; // 30 días
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)"
  )
    .bind(th, userId, exp, now)
    .run();
  return json({ ok: true, user }, 200, {
    "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 3600}`,
  });
}

/* ---------------- router ---------------- */
async function api(request, env, url) {
  const p = url.pathname.replace(/\/$/, "");
  const m = request.method;
  const body = m === "POST" || m === "PUT" ? await request.json().catch(() => ({})) : {};

  // ¿Hace falta crear la primera cuenta?
  if (p === "/api/setup" && m === "GET") {
    const c = await env.DB.prepare("SELECT COUNT(*) n FROM users").first();
    return json({ needsSetup: c.n === 0 });
  }

  // Registro: el primer usuario será admin; después solo un admin puede crear usuarios
  if (p === "/api/auth/register" && m === "POST") {
    const c = await env.DB.prepare("SELECT COUNT(*) n FROM users").first();
    let role = "staff";
    if (c.n === 0) {
      role = "admin";
    } else {
      const u = await getUser(request, env);
      if (!u || u.role !== "admin") return json({ error: "No autorizado" }, 403);
      if (body.role === "admin") role = "admin";
    }
    const { nombre, email, password } = body;
    if (!nombre || !email || !password || password.length < 6)
      return json({ error: "Datos inválidos (la contraseña requiere mínimo 6 caracteres)" }, 400);
    const mail = email.toLowerCase().trim();
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(mail).first();
    if (exists) return json({ error: "Ese correo ya está registrado" }, 400);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(password, salt);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id,nombre,email,pass_hash,pass_salt,role,created_at) VALUES (?,?,?,?,?,?,?)"
    )
      .bind(id, nombre.trim(), mail, hash, bufToHex(salt), role, new Date().toISOString())
      .run();
    if (c.n === 0) return await createSession(id, env, { id, nombre: nombre.trim(), email: mail, role });
    return json({ ok: true });
  }

  // Login
  if (p === "/api/auth/login" && m === "POST") {
    const mail = (body.email || "").toLowerCase().trim();
    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(mail).first();
    if (!u) return json({ error: "Correo o contraseña incorrectos" }, 401);
    const hash = await deriveHash(body.password || "", hexToBuf(u.pass_salt));
    if (!timingSafeEqual(hash, u.pass_hash))
      return json({ error: "Correo o contraseña incorrectos" }, 401);
    return await createSession(u.id, env, { id: u.id, nombre: u.nombre, email: u.email, role: u.role });
  }

  // Logout
  if (p === "/api/auth/logout" && m === "POST") {
    const token = getCookie(request, "session");
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await sha256Hex(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    });
  }

  /* ---- de aquí en adelante se requiere sesión ---- */
  const user = await getUser(request, env);
  if (!user) return json({ error: "No autenticado" }, 401);

  if (p === "/api/me" && m === "GET") return json({ user });

  if (p === "/api/data" && m === "GET") {
    const products = (
      await env.DB.prepare(
        "SELECT id,nombre,cat,precio,costo,stock,stock_min AS min,heat,em,activo FROM products ORDER BY nombre"
      ).all()
    ).results;
    const sales = (
      await env.DB.prepare(
        "SELECT id,pid,nombre,em,qty,precio,total,fecha FROM sales ORDER BY fecha DESC"
      ).all()
    ).results;
    return json({ user, products, sales });
  }

  /* ----- productos ----- */
  if (p === "/api/products" && m === "POST") {
    if (!body.nombre) return json({ error: "Falta el nombre" }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO products (id,nombre,cat,precio,costo,stock,stock_min,heat,em,activo,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)"
    )
      .bind(id, body.nombre, body.cat || "", num(body.precio), num(body.costo), int(body.stock),
        int(body.min), int(body.heat) || 1, body.em || "🌶️", new Date().toISOString())
      .run();
    return json({ ok: true, id });
  }
  const pm = p.match(/^\/api\/products\/([^/]+)$/);
  if (pm && m === "PUT") {
    await env.DB.prepare(
      "UPDATE products SET nombre=?,cat=?,precio=?,costo=?,stock=?,stock_min=?,heat=?,em=? WHERE id=?"
    )
      .bind(body.nombre, body.cat || "", num(body.precio), num(body.costo), int(body.stock),
        int(body.min), int(body.heat) || 1, body.em || "🌶️", pm[1])
      .run();
    return json({ ok: true });
  }
  if (pm && m === "DELETE") {
    await env.DB.prepare("DELETE FROM products WHERE id=?").bind(pm[1]).run();
    return json({ ok: true });
  }
  const rm = p.match(/^\/api\/products\/([^/]+)\/restock$/);
  if (rm && m === "POST") {
    await env.DB.prepare("UPDATE products SET stock=stock+? WHERE id=?").bind(int(body.qty), rm[1]).run();
    return json({ ok: true });
  }

  /* ----- ventas ----- */
  if (p === "/api/sales" && m === "POST") {
    const prod = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(body.pid).first();
    if (!prod) return json({ error: "El producto no existe" }, 400);
    const qty = int(body.qty);
    if (qty < 1) return json({ error: "Cantidad inválida" }, 400);
    if (qty > prod.stock) return json({ error: "No hay suficiente inventario" }, 400);
    const id = crypto.randomUUID();
    const total = prod.precio * qty;
    await env.DB.batch([
      env.DB.prepare("UPDATE products SET stock=stock-? WHERE id=?").bind(qty, prod.id),
      env.DB.prepare(
        "INSERT INTO sales (id,pid,nombre,em,qty,precio,total,fecha,user_id) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(id, prod.id, prod.nombre, prod.em, qty, prod.precio, total, new Date().toISOString(), user.id),
    ]);
    return json({ ok: true, id, total });
  }
  const sm = p.match(/^\/api\/sales\/([^/]+)$/);
  if (sm && m === "DELETE") {
    const sale = await env.DB.prepare("SELECT * FROM sales WHERE id=?").bind(sm[1]).first();
    if (sale) {
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET stock=stock+? WHERE id=?").bind(sale.qty, sale.pid),
        env.DB.prepare("DELETE FROM sales WHERE id=?").bind(sm[1]),
      ]);
    }
    return json({ ok: true });
  }

  /* ----- usuarios (solo admin) ----- */
  if (p === "/api/users" && m === "GET") {
    if (user.role !== "admin") return json({ error: "No autorizado" }, 403);
    const users = (
      await env.DB.prepare("SELECT id,nombre,email,role,created_at FROM users ORDER BY created_at").all()
    ).results;
    return json({ users });
  }
  const um = p.match(/^\/api\/users\/([^/]+)$/);
  if (um && m === "DELETE") {
    if (user.role !== "admin") return json({ error: "No autorizado" }, 403);
    if (um[1] === user.id) return json({ error: "No puedes eliminar tu propia cuenta" }, 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(um[1]),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(um[1]),
    ]);
    return json({ ok: true });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}
