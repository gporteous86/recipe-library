
// Recipe Library API — Cloudflare Worker / D1
// Requires D1 binding named DB.

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });

const enc = new TextEncoder();

const hex = bytes =>
  Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

const random = (n = 32) =>
  crypto.getRandomValues(new Uint8Array(n));

const uuid = () => crypto.randomUUID();

const hash = async value =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));

const pbkdf2 = async (password, salt) =>
  hex(await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(
        salt.match(/../g).map(x => parseInt(x, 16))
      ),
      iterations: 100000,
      hash: "SHA-256"
    },
    await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    ),
    256
  ));

const parse = (x, fallback) => {
  try {
    return JSON.parse(x);
  } catch {
    return fallback;
  }
};

const fail = (message, status = 400) =>
  json({ error: message }, status);

const requireText = (v, max = 5000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const numeric = v =>
  v == null || v === ""
    ? null
    : Number.isFinite(Number(v))
      ? Number(v)
      : null;

const normalize = r => ({
  ...r,
  ingredients: parse(r.ingredients, []),
  method: parse(r.method, []),
  tags: parse(r.tags, []),
  is_favourite: Boolean(r.is_favourite)
});

const recipeFields = [
  "title",
  "description",
  "serves",
  "prep_minutes",
  "cook_minutes",
  "calories_per_portion",
  "protein_g",
  "fat_g",
  "carbs_g",
  "ingredients",
  "method",
  "notes",
  "tags",
  "is_favourite",
  "source_type",
  "source_image_path"
];

const numberFields = new Set([
  "serves",
  "prep_minutes",
  "cook_minutes",
  "calories_per_portion",
  "protein_g",
  "fat_g",
  "carbs_g"
]);

const arrayFields = new Set([
  "ingredients",
  "method",
  "tags"
]);

const nullableText = new Set([
  "description",
  "notes",
  "source_image_path"
]);

function recipeData(b) {
  const out = {};

  for (const key of recipeFields) {
    if (!Object.hasOwn(b, key)) continue;

    const v = b[key];

    if (arrayFields.has(key)) {
      if (!Array.isArray(v)) {
        throw new Error(key + " must be an array");
      }

      out[key] = JSON.stringify(
        v.map(x => String(x).slice(0, 2000)).slice(0, 300)
      );
    } else if (numberFields.has(key)) {
      out[key] = numeric(v);
    } else if (key === "is_favourite") {
      out[key] = v ? 1 : 0;
    } else {
      out[key] =
        v == null && nullableText.has(key)
          ? null
          : requireText(v, key === "title" ? 200 : 5000);
    }
  }

  return out;
}

async function member(db, userId, householdId) {
  return db.prepare(
    "SELECT 1 FROM household_members WHERE user_id=? AND household_id=?"
  ).bind(userId, householdId).first();
}

async function authenticate(db, req) {
  const token = (
    req.headers.get("Authorization") || ""
  ).match(/^Bearer (\S+)$/)?.[1];

  if (!token) return null;

  const digest = await hash(token);

  return db.prepare(
    `SELECT u.id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > datetime('now')`
  ).bind(digest).first();
}

async function issueSession(db, userId) {
  const token = hex(random());

  await db.prepare(
    `INSERT INTO sessions
       (token_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+30 days'))`
  ).bind(await hash(token), userId).run();

  return token;
}

async function handler(request, env) {
  if (!env.DB) {
    return fail("D1 binding DB is missing", 503);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method;

  if (path === "/health" && method === "GET") {
    return json({
      ok: true,
      service: "recipe-library-api"
    });
  }

  let body = {};

  if (["POST", "PUT", "PATCH"].includes(method)) {
    try {
      body = await request.json();

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        throw new Error("Invalid body");
      }
    } catch {
      return fail("Invalid JSON body");
    }
  }

  const db = env.DB;

  // Protect login and registration against repeated attempts.
  if (
    method === "POST" &&
    (path === "/auth/login" || path === "/auth/register")
  ) {
    if (!env.LOGIN_LIMITER) {
      return fail("Login protection unavailable", 503);
    }

    const ip = request.headers.get("CF-Connecting-IP");

    if (!ip) {
      return fail("Unable to verify request", 403);
    }

    const result = await env.LOGIN_LIMITER.limit({
      key: `${path}:${ip}`
    });

    if (!result.success) {
      return json(
        { error: "Too many attempts. Please try again later." },
        429,
        { "Retry-After": "60" }
      );
    }
  }

  if (path === "/auth/register" && method === "POST") {
    const email = requireText(body.email, 254).toLowerCase();
    const password = body.password;

    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 256
    ) {
      return fail(
        "Use a valid email and a password of at least 12 characters"
      );
    }

    const salt = hex(random(16));
    const passwordHash = await pbkdf2(password, salt);
    const id = uuid();

    try {
      await db.prepare(
        `INSERT INTO users
           (id, email, password_hash)
         VALUES (?, ?, ?)`
      ).bind(
        id,
        email,
        `pbkdf2$100000$${salt}$${passwordHash}`
      ).run();
    } catch {
      return fail("This email is already registered", 409);
    }

    return json({
      user: { id, email },
      token: await issueSession(db, id)
    }, 201);
  }

  if (path === "/auth/login" && method === "POST") {
    const email = requireText(body.email, 254).toLowerCase();

    const user = await db.prepare(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = ?`
    ).bind(email).first();

    const stored = user?.password_hash?.split("$");

    if (
      !stored ||
      stored.length !== 4 ||
      stored[0] !== "pbkdf2" ||
      stored[1] !== "100000" ||
      typeof body.password !== "string"
    ) {
      return fail("Incorrect email or password", 401);
    }

    const check = await pbkdf2(body.password, stored[2]);

    let diff = 0;

    for (let i = 0; i < check.length; i++) {
      diff |= check.charCodeAt(i) ^ stored[3].charCodeAt(i);
    }

    if (diff || check.length !== stored[3].length) {
      return fail("Incorrect email or password", 401);
    }

    return json({
      user: {
        id: user.id,
        email: user.email
      },
      token: await issueSession(db, user.id)
    });
  }

  const user = await authenticate(db, request);

  if (!user) {
    return fail("Sign in required", 401);
  }

  if (path === "/auth/me" && method === "GET") {
    return json({ user });
  }

  if (path === "/auth/logout" && method === "POST") {
    const token = request.headers
      .get("Authorization")
      .replace(/^Bearer\s+/, "");

    await db.prepare(
      "DELETE FROM sessions WHERE token_hash = ?"
    ).bind(await hash(token)).run();

    return json({ ok: true });
  }

  if (path === "/household" && method === "GET") {
    const h = await db.prepare(
      `SELECT h.id, h.name, h.join_code
       FROM households h
       JOIN household_members m
         ON m.household_id = h.id
       WHERE m.user_id = ?
       ORDER BY m.joined_at
       LIMIT 1`
    ).bind(user.id).first();

    return json({ household: h || null });
  }

  if (path === "/household" && method === "POST") {
    const existing = await db.prepare(
      `SELECT 1 FROM household_members
       WHERE user_id = ?
       LIMIT 1`
    ).bind(user.id).first();

    if (existing) {
      return fail("Already in a household", 409);
    }

    const id = uuid();
    const code = hex(random(4)).toUpperCase();
    const name = requireText(
      body.name || "Our Recipes",
      100
    );

    await db.batch([
      db.prepare(
        `INSERT INTO households
           (id, name, join_code)
         VALUES (?, ?, ?)`
      ).bind(id, name, code),

      db.prepare(
        `INSERT INTO household_members
           (household_id, user_id, role)
         VALUES (?, ?, 'owner')`
      ).bind(id, user.id)
    ]);

    return json({
      household: {
        id,
        name,
        join_code: code
      }
    }, 201);
  }

  if (path === "/household/join" && method === "POST") {
    const code = requireText(
      body.code,
      20
    ).toUpperCase();

    const h = await db.prepare(
      `SELECT id, name, join_code
       FROM households
       WHERE join_code = ?`
    ).bind(code).first();

    if (!h) {
      return fail("Household code not found", 404);
    }

    await db.prepare(
      `INSERT OR IGNORE INTO household_members
         (household_id, user_id, role)
       VALUES (?, ?, 'member')`
    ).bind(h.id, user.id).run();

    return json({ household: h });
  }

  const householdId = requireText(
    request.headers.get("X-Household-Id"),
    100
  );

  if (
    !householdId ||
    !(await member(db, user.id, householdId))
  ) {
    return fail("Household access denied", 403);
  }

  if (path === "/recipes" && method === "GET") {
    const rows = await db.prepare(
      `SELECT *
       FROM recipes
       WHERE household_id = ?
       ORDER BY title COLLATE NOCASE`
    ).bind(householdId).all();

    return json({
      recipes: rows.results.map(normalize)
    });
  }

  if (path === "/recipes" && method === "POST") {
    const fields = recipeData(body);

    if (!fields.title) {
      return fail("Recipe title required");
    }

    const id = uuid();
    const keys = Object.keys(fields);

    await db.prepare(
      `INSERT INTO recipes
         (id, household_id, created_by, ${keys.join(",")})
       VALUES (?, ?, ?, ${keys.map(() => "?").join(",")})`
    ).bind(
      id,
      householdId,
      user.id,
      ...keys.map(k => fields[k])
    ).run();

    return json({ id }, 201);
  }

  const match = path.match(
    /^\/recipes\/([a-zA-Z0-9-]+)$/
  );

  if (
    match &&
    ["PATCH", "DELETE"].includes(method)
  ) {
    const existing = await db.prepare(
      `SELECT id FROM recipes
       WHERE id = ? AND household_id = ?`
    ).bind(match[1], householdId).first();

    if (!existing) {
      return fail("Recipe not found", 404);
    }

    if (method === "DELETE") {
      await db.prepare(
        `DELETE FROM meal_plan
         WHERE household_id = ?
           AND recipe_id = ?`
      ).bind(householdId, match[1]).run();

      await db.prepare(
        `DELETE FROM recipes
         WHERE id = ? AND household_id = ?`
      ).bind(match[1], householdId).run();

      return json({ ok: true });
    }

    const fields = recipeData(body);
    const keys = Object.keys(fields);

    if (!keys.length) {
      return fail("No fields supplied");
    }

    await db.prepare(
      `UPDATE recipes
       SET ${keys.map(k => k + "=?").join(",")},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND household_id = ?`
    ).bind(
      ...keys.map(k => fields[k]),
      match[1],
      householdId
    ).run();

    return json({ ok: true });
  }

  if (path === "/meal-plan" && method === "GET") {
    const rows = await db.prepare(
      `SELECT *
       FROM meal_plan
       WHERE household_id = ?
       ORDER BY day_of_week`
    ).bind(householdId).all();

    return json({
      meal_plan: rows.results
    });
  }

  const dayMatch = path.match(
    /^\/meal-plan\/([1-7])$/
  );

  if (
    dayMatch &&
    ["PUT", "DELETE"].includes(method)
  ) {
    const day = Number(dayMatch[1]);

    if (method === "DELETE") {
      await db.prepare(
        `DELETE FROM meal_plan
         WHERE household_id = ?
           AND day_of_week = ?`
      ).bind(householdId, day).run();

      return json({ ok: true });
    }

    const recipeId = body.recipe_id || null;
    const customMeal =
      requireText(body.custom_meal, 300) || null;

    if (!recipeId && !customMeal) {
      return fail("Choose a recipe or enter a meal");
    }

    if (
      recipeId &&
      !(await db.prepare(
        `SELECT 1 FROM recipes
         WHERE id = ? AND household_id = ?`
      ).bind(recipeId, householdId).first())
    ) {
      return fail(
        "Recipe not in this household",
        403
      );
    }

    await db.prepare(
      `INSERT INTO meal_plan
         (household_id, day_of_week,
          recipe_id, custom_meal, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(household_id, day_of_week)
       DO UPDATE SET
         recipe_id = excluded.recipe_id,
         custom_meal = excluded.custom_meal,
         updated_by = excluded.updated_by,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(
      householdId,
      day,
      recipeId,
      customMeal,
      user.id
    ).run();

    return json({ ok: true });
  }

  return fail("Endpoint not found", 404);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const allowed =
      env.APP_ORIGIN ||
      "https://gporteous86.github.io";

    const cors = {
      "Access-Control-Allow-Origin":
        origin === allowed ? origin : allowed,
      "Vary": "Origin",
      "Access-Control-Allow-Methods":
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Household-Id"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    try {
      const response = await handler(request, env);
      const headers = new Headers(response.headers);

      Object.entries(cors).forEach(([k, v]) =>
        headers.set(k, v)
      );

      headers.set("Cache-Control", "no-store");

      return new Response(response.body, {
        status: response.status,
        headers
      });
    } catch (e) {
      console.error("API error", e);

      return json(
        { error: "Internal server error" },
        500,
        {
          ...cors,
          "Cache-Control": "no-store"
        }
      );
    }
  }
};
