import { createClient } from "@supabase/supabase-js";

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Método no permitido." });
  }

  const expectedCode = process.env.MATETUBE_TEACHER_INVITE_CODE;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!expectedCode || !serviceKey || !url) return send(res, 503, { error: "La activación docente todavía no está configurada." });

  const bearer = req.headers.authorization || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const inviteCode = typeof body === "object" ? String(body?.inviteCode || "") : "";
  if (!token) return send(res, 401, { error: "Ingresá con tu cuenta para continuar." });
  if (!inviteCode || inviteCode !== expectedCode) return send(res, 401, { error: "La clave de creador no es correcta." });

  try {
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    const user = userResult?.user;
    if (userError || !user) return send(res, 401, { error: "Tu sesión venció. Ingresá nuevamente." });

    const { data: existing, error: lookupError } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (lookupError) throw lookupError;
    const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Docente";
    const { error: profileError } = existing
      ? await admin.from("profiles").update({ is_teacher: true }).eq("id", user.id)
      : await admin.from("profiles").insert({ id: user.id, display_name: String(fallbackName).slice(0, 60), is_teacher: true });
    if (profileError) throw profileError;
    return send(res, 200, { teacher: true });
  } catch (error) {
    console.error("teacher enrollment failed", error?.message || error);
    return send(res, 500, { error: "No se pudo activar el modo docente. Intentá nuevamente." });
  }
}
