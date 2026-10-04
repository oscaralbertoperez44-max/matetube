import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawPublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabase = null;
let configured = false;
let configurationError = "";

try {
  const url = String(rawSupabaseUrl || "").trim();
  const key = String(rawPublishableKey || "").trim();
  if (!url || !key || url.includes("tu-proyecto")) {
    configurationError = "Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY.";
  } else {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") throw new Error("La Project URL debe empezar con https://");
    supabase = createClient(parsedUrl.href.replace(/\/$/, ""), key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    configured = true;
  }
} catch (error) {
  console.error("Configuración de Supabase no válida", error);
  configurationError = "La Project URL o la Publishable key de Supabase tiene un formato incorrecto.";
}

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastNode = document.querySelector("#toast");
const topics = ["Todo", "Álgebra", "Funciones", "Geometría", "Probabilidad", "Estadística", "Cálculo"];
const videoTypes = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
const state = {
  session: null,
  profile: null,
  videos: [],
  likes: new Set(),
  history: [],
  playlists: [],
  subscriptions: new Set(),
  view: "home",
  topic: "Todo",
  query: "",
  active: null,
  comments: [],
  activeSubscribed: false,
};

function $(selector, parent = document) { return parent.querySelector(selector); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]); }
function cleanText(value, limit) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit); }
function safeFileName(name) { return String(name || "video").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "video"; }
function subjectHue(subject) { let total = 0; for (const char of String(subject || "")) total = (total + char.charCodeAt(0) * 17) % 360; return 190 + (total % 135); }
function formatDate(value) { try { return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value)); } catch { return "recién"; } }
function formatNumber(value) { return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0)); }
function profileName(profile) { return profile?.display_name || "Docente de MateTube"; }
function videoAuthor(video) { return profileName(video.profiles); }
function ownVideo(video) { return Boolean(state.session && video?.owner_id === state.session.user.id); }
function setPageVideo(video) {
  const url = new URL(window.location.href);
  if (video) url.searchParams.set("v", video.id); else url.searchParams.delete("v");
  window.history.replaceState({}, "", url);
}

let toastTimer;
function toast(message, type = "") {
  clearTimeout(toastTimer);
  toastNode.textContent = message;
  toastNode.className = `show ${type}`;
  toastTimer = window.setTimeout(() => { toastNode.className = ""; }, 4200);
}

function shell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <a class="brand" href="/" aria-label="MateTube inicio"><span class="mark">∑</span><span>MateTube<small>Comunidad matemática</small></span></a>
        <nav class="nav" aria-label="Navegación">
          <button data-view="home"><span>⌂</span>Inicio</button>
          <button data-view="explore"><span>⌕</span>Explorar</button>
          <button data-view="library"><span>▦</span>Mi biblioteca</button>
          <button data-action="open-upload"><span>＋</span>Publicar</button>
        </nav>
        <div class="teacher-card"><strong>Enseñá con tu canal</strong><p>Publicá explicaciones, creá comunidad y compartí tus clases.</p><button data-action="open-upload">Publicar una clase</button></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="phase">MateTube · Vercel + Supabase</div>
          <label class="search"><span>⌕</span><input id="search" type="search" autocomplete="off" placeholder="Buscar funciones, integrales, geometría…"></label>
          <div id="account" class="account"></div>
        </header>
        <div class="content">
          <section class="hero">
            <div class="hero-copy">
              <p class="eyebrow"><span></span> Clases creadas por docentes</p>
              <h1>Tu canal de matemática.<br>Tu comunidad.</h1>
              <p>Publicá clases, recibí comentarios y acompañá el aprendizaje desde un mismo lugar.</p>
              <div class="hero-actions"><button class="primary" data-action="open-upload">＋ Publicar una clase</button><button class="secondary" data-action="explore">Explorar videos</button></div>
            </div>
            <div class="math-panel" aria-hidden="true"><span class="axis x"></span><span class="axis y"></span><span class="curve"></span><b>f(x) = ax² + bx + c</b></div>
          </section>
          <section id="setup-notice" class="setup-notice" hidden></section>
          <section id="signin-notice" class="signin-notice" hidden></section>
          <section class="catalog" id="catalog">
            <div class="heading"><div><h2 id="feed-title">Videos para aprender</h2><p id="feed-subtitle">Explorá explicaciones de matemática compartidas por la comunidad.</p></div><span id="video-count" class="count"></span></div>
            <div id="topics" class="topics" aria-label="Filtrar por tema"></div>
            <div id="video-grid" class="video-grid"></div>
            <div id="empty" class="empty" hidden></div>
          </section>
        </div>
      </main>
      <nav class="mobile-nav" aria-label="Navegación móvil">
        <button data-view="home"><span>⌂</span>Inicio</button><button data-view="explore"><span>⌕</span>Explorar</button><button data-view="library"><span>▦</span>Biblioteca</button><button data-action="open-upload"><span>＋</span>Publicar</button>
      </nav>
    </div>`;
  $("#search").addEventListener("input", (event) => { state.query = event.target.value; renderFeed(); });
}

function renderAccount() {
  const node = $("#account");
  const notice = $("#signin-notice");
  if (!configured) {
    node.innerHTML = "";
    notice.hidden = true;
    return;
  }
  if (!state.session) {
    node.innerHTML = '<button class="signin" data-action="open-auth">Ingresar</button>';
    notice.hidden = false;
    notice.innerHTML = '<span>Ingresá con tu cuenta para comentar, guardar playlists y crear tu canal.</span><button data-action="open-auth">Ingresar</button>';
    return;
  }
  notice.hidden = false;
  const teacherText = state.profile?.is_teacher ? "Tu canal docente está activo." : "Tu cuenta está lista. Activá el modo docente para publicar.";
  notice.innerHTML = `<span>${teacherText}</span><button data-action="open-upload">${state.profile?.is_teacher ? "Publicar" : "Activar"}</button>`;
  const initials = profileName(state.profile).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  node.innerHTML = `<button class="avatar" data-action="open-profile" title="Editar perfil">${escapeHtml(initials)}</button><button class="account-name" data-action="open-profile">${escapeHtml(profileName(state.profile))}</button><button class="signout" data-action="signout" title="Cerrar sesión">↪</button>`;
}

function renderNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

function filteredVideos() {
  let videos = [...state.videos];
  if (state.view === "library") {
    const ids = new Set([...(state.history || []), ...videos.filter(ownVideo).map((video) => video.id)]);
    videos = videos.filter((video) => ids.has(video.id));
  }
  if (state.topic !== "Todo") videos = videos.filter((video) => video.subject === state.topic);
  const query = state.query.toLocaleLowerCase("es").trim();
  if (query) videos = videos.filter((video) => [video.title, video.subject, video.grade, video.description, ...(video.tags || []), videoAuthor(video)].join(" ").toLocaleLowerCase("es").includes(query));
  return videos;
}

function videoCard(video) {
  const hue = subjectHue(video.subject);
  return `<article class="video-card">
    <button class="thumbnail" data-action="play" data-id="${video.id}" style="--hue:${hue}" aria-label="Reproducir ${escapeHtml(video.title)}">
      <span class="topic-label">${escapeHtml(video.subject || "Matemática")}</span><span class="play-icon">▶</span><span class="equation">${escapeHtml(video.grade || "Clase de matemática")}</span><span class="duration">Nueva</span>
    </button>
    <div class="video-copy"><h3>${escapeHtml(video.title)}</h3><button class="channel-link" data-action="channel" data-channel="${video.owner_id}">${escapeHtml(videoAuthor(video))}</button><p>${escapeHtml([video.subject, video.grade, `${formatNumber(video.view_count)} vistas`].filter(Boolean).join(" · "))}</p>
      <div class="card-bottom"><span>${formatDate(video.created_at)}</span><button class="tiny" data-action="share" data-id="${video.id}">Compartir</button></div></div>
  </article>`;
}

function renderFeed() {
  const videos = filteredVideos();
  const library = state.view === "library";
  $("#feed-title").textContent = library ? "Mi biblioteca" : state.view === "explore" ? "Explorar clases" : "Videos para aprender";
  $("#feed-subtitle").textContent = library ? "Tus clases y los videos que viste recientemente." : "Explorá explicaciones de matemática compartidas por la comunidad.";
  $("#video-count").textContent = videos.length ? `${videos.length} ${videos.length === 1 ? "video" : "videos"}` : "";
  $("#topics").innerHTML = topics.map((topic) => `<button class="topic-filter ${topic === state.topic ? "active" : ""}" data-action="topic" data-topic="${topic}">${topic}</button>`).join("");
  $("#video-grid").innerHTML = videos.map(videoCard).join("");
  const empty = $("#empty");
  empty.hidden = videos.length > 0;
  empty.innerHTML = library && !state.session
    ? '<div class="empty-icon">▦</div><h3>Tu biblioteca te espera</h3><p>Ingresá para guardar tu historial, playlists y clases.</p><button class="primary" data-action="open-auth">Ingresar</button>'
    : '<div class="empty-icon">▶</div><h3>Todavía no hay videos</h3><p>La primera clase que publiques aparecerá en esta comunidad.</p><button class="primary" data-action="open-upload">Publicar el primer video</button>';
  renderNavigation();
}

function closeModal() { modalRoot.innerHTML = ""; document.body.classList.remove("modal-open"); }
function modal(content, className = "") { document.body.classList.add("modal-open"); modalRoot.innerHTML = `<div class="overlay" data-action="close-modal"><section class="modal ${className}" role="dialog" aria-modal="true"><button class="close" aria-label="Cerrar" data-action="close-modal">×</button>${content}</section></div>`; }
function requireAuth() { if (state.session) return true; openAuth(); return false; }

function openAuth() {
  if (!configured) return toast("Primero configurá las variables de Supabase.", "error");
  modal(`<div class="modal-inner narrow"><p class="eyebrow plain"><span></span> Cuenta MateTube</p><h2>Ingresá a tu comunidad</h2><p class="modal-copy">Te enviaremos un enlace seguro al correo. No necesitás crear ni recordar una contraseña.</p><form data-form="auth" class="form"><label>Correo electrónico<input name="email" type="email" placeholder="tu@email.com" required autocomplete="email"></label><button class="primary" type="submit">Enviar enlace de acceso</button><p class="form-message" id="auth-message"></p></form></div>`);
}

function openTeacher() {
  modal(`<div class="modal-inner narrow"><p class="eyebrow plain"><span></span> Canal docente</p><h2>Activá el modo docente</h2><p class="modal-copy">La clave protege a la comunidad: solo docentes autorizados pueden publicar.</p><form data-form="teacher" class="form"><label>Clave de creador<input name="inviteCode" type="password" required autocomplete="off" placeholder="Clave privada"></label><button class="primary" type="submit">Activar modo docente</button><p class="form-message" id="teacher-message"></p></form></div>`);
}

function openUpload() {
  if (!requireAuth()) return;
  if (!state.profile?.is_teacher) return openTeacher();
  modal(`<div class="modal-inner"><p class="eyebrow plain"><span></span> Publicar en MateTube</p><h2>Subí una clase</h2><form data-form="upload" class="form upload-form">
    <div class="form-grid"><label>Título de la clase *<input name="title" maxlength="110" required placeholder="Ej.: Función cuadrática desde cero"></label><label>Tema *<select name="subject">${topics.slice(1).map((topic) => `<option>${topic}</option>`).join("")}<option>Otro</option></select></label></div>
    <div class="form-grid"><label>Curso o nivel<input name="grade" maxlength="40" placeholder="Ej.: 3.º año"></label><label>Etiquetas<input name="tags" maxlength="140" placeholder="parábola, ecuaciones, secundaria"></label></div>
    <label>Descripción<textarea name="description" maxlength="1000" placeholder="Contá qué aprenderán en esta clase."></textarea></label>
    <label class="file-input"><input name="file" type="file" required accept="video/mp4,video/webm,video/ogg,video/quicktime"><span>Elegir video</span><small>MP4, WebM, OGG o MOV · máximo 100 MB</small></label>
    <button class="primary" type="submit">Publicar video</button><p class="form-message" id="upload-message"></p>
  </form></div>`, "large");
}

function openProfile() {
  if (!requireAuth()) return;
  const profile = state.profile || {};
  modal(`<div class="modal-inner narrow"><p class="eyebrow plain"><span></span> Mi canal</p><h2>Editar perfil</h2><form data-form="profile" class="form"><label>Nombre del canal<input name="displayName" maxlength="60" required value="${escapeHtml(profile.display_name || "")}"></label><label>Descripción<textarea name="bio" maxlength="360">${escapeHtml(profile.bio || "")}</textarea></label><label>Color del avatar<input name="avatarColor" type="color" value="${escapeHtml(profile.avatar_color || "#6ea8fe")}"></label><button class="primary" type="submit">Guardar perfil</button><p class="form-message" id="profile-message"></p></form></div>`);
}

async function loadComments(videoId) {
  const { data, error } = await supabase.from("comments").select("id, body, created_at, author_id, profiles!comments_author_id_fkey(display_name)").eq("video_id", videoId).order("created_at", { ascending: true });
  if (error) throw error;
  state.comments = data || [];
}

function commentAuthor(comment) { return profileName(comment.profiles); }
function playerHtml(video) {
  const liked = state.likes.has(video.id);
  const playlistOptions = state.playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.title)}</option>`).join("");
  return `<div class="player-wrap"><video class="video-player" controls playsinline src="${escapeHtml(video.media_url)}"></video></div><div class="modal-inner player-info">
    <p class="eyebrow plain"><span></span> ${escapeHtml(video.subject || "Matemática")}</p><h2>${escapeHtml(video.title)}</h2><p class="player-meta">${escapeHtml([videoAuthor(video), video.grade, `${formatNumber(video.view_count)} vistas`, formatDate(video.created_at)].filter(Boolean).join(" · "))}</p>
    <p class="description">${escapeHtml(video.description || "Clase publicada en MateTube.")}</p>
    <div class="player-actions"><button class="like ${liked ? "active" : ""}" data-action="like">${liked ? "♥ Te gusta" : "♡ Me gusta"}</button><button data-action="share" data-id="${video.id}">↗ Compartir</button><button data-action="open-channel" data-channel="${video.owner_id}">Canal</button>${ownVideo(video) ? '<button class="danger" data-action="delete-video">Eliminar</button>' : '<button data-action="report">Reportar</button>'}</div>
    <div class="playlist-bar"><select id="playlist-select"><option value="">Guardar en playlist…</option>${playlistOptions}</select><button data-action="save-playlist">Guardar</button><button data-action="new-playlist">Nueva playlist</button></div>
    <section class="comments"><h3>Comentarios <span>${state.comments.length}</span></h3>${state.session ? '<form data-form="comment" class="comment-form"><input name="body" maxlength="400" required placeholder="Sumá un comentario respetuoso"><button>Comentar</button></form>' : '<button class="login-comment" data-action="open-auth">Ingresá para comentar</button>'}<div class="comment-list">${state.comments.length ? state.comments.map((comment) => `<article class="comment"><b>${escapeHtml(commentAuthor(comment))}</b><small>${formatDate(comment.created_at)}</small><p>${escapeHtml(comment.body)}</p></article>`).join("") : '<p class="muted-text">Todavía no hay comentarios. Sé el primero en aportar.</p>'}</div></section>
  </div>`;
}

async function openPlayer(id) {
  const video = state.videos.find((item) => item.id === id);
  if (!video) return toast("No encontramos este video.", "error");
  state.active = video;
  setPageVideo(video);
  try {
    await loadComments(video.id);
    if (state.session) {
      const [subscription] = await Promise.all([
        supabase.from("channel_subscriptions").select("channel_id").eq("subscriber_id", state.session.user.id).eq("channel_id", video.owner_id).maybeSingle(),
        supabase.from("watch_history").upsert({ user_id: state.session.user.id, video_id: video.id, watched_at: new Date().toISOString() }),
        supabase.rpc("record_video_view", { p_video_id: video.id }),
      ]);
      state.activeSubscribed = Boolean(subscription.data);
      await loadSocial();
    }
    modal(playerHtml(video), "player-modal");
  } catch (error) { toast(error.message || "No se pudo abrir el video.", "error"); }
}

async function openChannel(channelId) {
  const channelVideos = state.videos.filter((video) => video.owner_id === channelId);
  const channel = channelVideos[0]?.profiles || (state.profile?.id === channelId ? state.profile : null);
  if (!channel) return toast("Este canal aún no tiene videos públicos.");
  const subscribed = state.subscriptions.has(channelId);
  modal(`<div class="modal-inner channel-modal"><div class="channel-heading"><span class="channel-avatar" style="background:${escapeHtml(channel.avatar_color || "#6ea8fe")}">${escapeHtml(profileName(channel).slice(0, 1).toUpperCase())}</span><div><p class="eyebrow plain"><span></span> Canal educativo</p><h2>${escapeHtml(profileName(channel))}</h2><p>${escapeHtml(channel.bio || "Canal de matemática en MateTube.")}</p></div></div>${state.session && state.session.user.id !== channelId ? `<button class="primary compact" data-action="subscribe" data-channel="${channelId}">${subscribed ? "✓ Suscripto" : "＋ Suscribirme"}</button>` : ""}<h3>Clases publicadas</h3><div class="channel-videos">${channelVideos.length ? channelVideos.map((video) => `<button data-action="play-from-channel" data-id="${video.id}"><span><b>${escapeHtml(video.title)}</b><small>${escapeHtml([video.subject, video.grade].filter(Boolean).join(" · "))}</small></span><span>Ver →</span></button>`).join("") : '<p class="muted-text">Todavía no publicó clases.</p>'}</div></div>`);
}

async function loadProfile() {
  if (!state.session) { state.profile = null; return; }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", state.session.user.id).maybeSingle();
  if (error) throw error;
  state.profile = data;
}

async function loadSocial() {
  if (!state.session) { state.likes = new Set(); state.history = []; state.playlists = []; state.subscriptions = new Set(); return; }
  const userId = state.session.user.id;
  const [likes, history, playlists, subscriptions] = await Promise.all([
    supabase.from("video_likes").select("video_id").eq("user_id", userId),
    supabase.from("watch_history").select("video_id, watched_at").eq("user_id", userId).order("watched_at", { ascending: false }),
    supabase.from("playlists").select("id, title, created_at").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("channel_subscriptions").select("channel_id").eq("subscriber_id", userId),
  ]);
  for (const result of [likes, history, playlists, subscriptions]) if (result.error) throw result.error;
  state.likes = new Set((likes.data || []).map((row) => row.video_id));
  state.history = (history.data || []).map((row) => row.video_id);
  state.playlists = playlists.data || [];
  state.subscriptions = new Set((subscriptions.data || []).map((row) => row.channel_id));
}

async function loadVideos() {
  const { data, error } = await supabase.from("videos").select("id, owner_id, title, subject, grade, description, tags, media_path, media_url, mime_type, size_bytes, visibility, view_count, created_at, profiles!videos_owner_id_fkey(id, display_name, bio, avatar_color)").eq("visibility", "public").order("created_at", { ascending: false });
  if (error) throw error;
  state.videos = data || [];
}

async function reload() {
  if (!configured) { renderAccount(); renderFeed(); return; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    state.session = session;
    await Promise.all([loadVideos(), loadProfile(), loadSocial()]);
    renderAccount();
    renderFeed();
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (videoId && !modalRoot.children.length) await openPlayer(videoId);
  } catch (error) {
    console.error(error);
    renderAccount();
    renderFeed();
    toast("No se pudo conectar con la comunidad. Revisá la configuración de Supabase.", "error");
  }
}

async function sendMagicLink(form) {
  const email = String(new FormData(form).get("email") || "").trim();
  const message = $("#auth-message", form);
  if (!email) return;
  message.textContent = "Enviando enlace…";
  try {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
    message.textContent = "Listo. Revisá tu correo y abrí el enlace para entrar.";
    message.className = "form-message success";
  } catch (error) { message.textContent = error.message || "No se pudo enviar el enlace."; message.className = "form-message error"; }
}

async function activateTeacher(form) {
  const message = $("#teacher-message", form);
  const inviteCode = String(new FormData(form).get("inviteCode") || "");
  message.textContent = "Activando canal…";
  try {
    const response = await fetch("/api/teacher/enroll", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${state.session.access_token}` }, body: JSON.stringify({ inviteCode }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo activar el canal.");
    await loadProfile();
    renderAccount();
    closeModal();
    toast("Modo docente activado. Ya podés publicar tu clase.");
    openUpload();
  } catch (error) { message.textContent = error.message || "No se pudo activar el modo docente."; message.className = "form-message error"; }
}

async function uploadVideo(form) {
  const message = $("#upload-message", form);
  const fields = new FormData(form);
  const file = fields.get("file");
  if (!(file instanceof File) || !file.size) return;
  if (!videoTypes.has(file.type)) return setFormError(message, "Elegí un archivo MP4, WebM, OGG o MOV.");
  if (file.size > 100 * 1024 * 1024) return setFormError(message, "El video supera el máximo de 100 MB.");
  const title = cleanText(fields.get("title"), 110);
  if (!title) return setFormError(message, "Agregá un título a la clase.");
  message.textContent = "Subiendo el video…";
  message.className = "form-message success";
  const path = `${state.session.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  try {
    const { error: uploadError } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from("videos").getPublicUrl(path);
    const tags = String(fields.get("tags") || "").split(",").map((tag) => cleanText(tag, 32)).filter(Boolean).slice(0, 8);
    const { data: created, error: insertError } = await supabase.from("videos").insert({ owner_id: state.session.user.id, title, subject: cleanText(fields.get("subject"), 50) || "Matemática", grade: cleanText(fields.get("grade"), 40), description: cleanText(fields.get("description"), 1000), tags, media_path: path, media_url: publicData.publicUrl, mime_type: file.type, size_bytes: file.size }).select("id").single();
    if (insertError) { await supabase.storage.from("videos").remove([path]); throw insertError; }
    await loadVideos();
    renderFeed();
    closeModal();
    toast("Clase publicada. Ya podés compartirla.");
    await openPlayer(created.id);
  } catch (error) { setFormError(message, error.message || "No se pudo publicar el video."); }
}

function setFormError(node, message) { node.textContent = message; node.className = "form-message error"; }

async function saveProfile(form) {
  const message = $("#profile-message", form);
  const values = new FormData(form);
  try {
    const { error } = await supabase.from("profiles").update({ display_name: cleanText(values.get("displayName"), 60), bio: cleanText(values.get("bio"), 360), avatar_color: String(values.get("avatarColor") || "#6ea8fe") }).eq("id", state.session.user.id);
    if (error) throw error;
    await loadProfile();
    renderAccount();
    renderFeed();
    closeModal();
    toast("Perfil actualizado.");
  } catch (error) { setFormError(message, error.message || "No se pudo guardar el perfil."); }
}

async function sendComment(form) {
  if (!requireAuth() || !state.active) return;
  const body = cleanText(new FormData(form).get("body"), 400);
  if (!body) return;
  try {
    const { error } = await supabase.from("comments").insert({ video_id: state.active.id, author_id: state.session.user.id, body });
    if (error) throw error;
    await loadComments(state.active.id);
    modal(playerHtml(state.active), "player-modal");
  } catch (error) { toast(error.message || "No se pudo publicar el comentario.", "error"); }
}

async function toggleLike() {
  if (!requireAuth() || !state.active) return;
  const videoId = state.active.id;
  try {
    const result = state.likes.has(videoId)
      ? await supabase.from("video_likes").delete().eq("user_id", state.session.user.id).eq("video_id", videoId)
      : await supabase.from("video_likes").insert({ user_id: state.session.user.id, video_id: videoId });
    if (result.error) throw result.error;
    await loadSocial();
    modal(playerHtml(state.active), "player-modal");
  } catch (error) { toast(error.message || "No se pudo guardar el like.", "error"); }
}

async function saveToPlaylist(playlistId) {
  if (!requireAuth() || !state.active || !playlistId) return toast("Elegí una playlist o creá una nueva.");
  try {
    const { error } = await supabase.from("playlist_items").upsert({ playlist_id: playlistId, video_id: state.active.id }, { onConflict: "playlist_id,video_id" });
    if (error) throw error;
    toast("Video guardado en tu playlist.");
  } catch (error) { toast(error.message || "No se pudo guardar en la playlist.", "error"); }
}

async function createPlaylist() {
  if (!requireAuth() || !state.active) return;
  const title = window.prompt("Nombre de la playlist:");
  if (!title) return;
  try {
    const { data, error } = await supabase.from("playlists").insert({ owner_id: state.session.user.id, title: cleanText(title, 70) }).select("id, title, created_at").single();
    if (error) throw error;
    state.playlists.unshift(data);
    await saveToPlaylist(data.id);
    modal(playerHtml(state.active), "player-modal");
  } catch (error) { toast(error.message || "No se pudo crear la playlist.", "error"); }
}

async function toggleSubscription(channelId) {
  if (!requireAuth()) return;
  if (channelId === state.session.user.id) return toast("No podés suscribirte a tu propio canal.");
  try {
    const result = state.subscriptions.has(channelId)
      ? await supabase.from("channel_subscriptions").delete().eq("subscriber_id", state.session.user.id).eq("channel_id", channelId)
      : await supabase.from("channel_subscriptions").insert({ subscriber_id: state.session.user.id, channel_id: channelId });
    if (result.error) throw result.error;
    await loadSocial();
    toast(state.subscriptions.has(channelId) ? "Te suscribiste al canal." : "Se eliminó la suscripción.");
    await openChannel(channelId);
  } catch (error) { toast(error.message || "No se pudo actualizar la suscripción.", "error"); }
}

async function reportVideo() {
  if (!requireAuth() || !state.active) return;
  const reason = window.prompt("¿Por qué querés reportar este contenido?");
  if (!reason) return;
  try {
    const { error } = await supabase.from("reports").insert({ reporter_id: state.session.user.id, video_id: state.active.id, reason: cleanText(reason, 300) });
    if (error) throw error;
    toast("Gracias. El reporte fue enviado.");
  } catch (error) { toast(error.message || "No se pudo enviar el reporte.", "error"); }
}

async function deleteVideo() {
  if (!state.active || !ownVideo(state.active) || !window.confirm("¿Eliminar este video de MateTube?")) return;
  const video = state.active;
  try {
    const { error: databaseError } = await supabase.from("videos").delete().eq("id", video.id).eq("owner_id", state.session.user.id);
    if (databaseError) throw databaseError;
    const { error: storageError } = await supabase.storage.from("videos").remove([video.media_path]);
    if (storageError) console.warn("No se pudo eliminar el archivo", storageError.message);
    closeModal(); setPageVideo(null); state.active = null;
    await loadVideos(); renderFeed(); toast("Video eliminado.");
  } catch (error) { toast(error.message || "No se pudo eliminar el video.", "error"); }
}

async function shareVideo(id) {
  const video = state.videos.find((item) => item.id === id) || state.active;
  if (!video) return;
  const url = `${window.location.origin}${window.location.pathname}?v=${encodeURIComponent(video.id)}`;
  try {
    if (navigator.share) { await navigator.share({ title: video.title, text: "Te comparto esta clase de matemática.", url }); return; }
    await navigator.clipboard.writeText(url); toast("Enlace copiado.");
  } catch { toast("Copiá este enlace: " + url); }
}

async function signOut() { await supabase.auth.signOut(); closeModal(); toast("Sesión cerrada."); }

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action], [data-view]");
  if (!button) return;
  if (button.dataset.action === "close-modal" && event.target !== button && !event.target.closest(".modal")) { closeModal(); return; }
  const action = button.dataset.action;
  const view = button.dataset.view;
  if (view) { if (view === "library" && !requireAuth()) return; state.view = view; renderFeed(); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (!action) return;
  if (action === "close-modal") return closeModal();
  if (action === "open-auth") return openAuth();
  if (action === "open-upload") return openUpload();
  if (action === "open-profile") return openProfile();
  if (action === "signout") return signOut();
  if (action === "explore") { state.view = "explore"; renderFeed(); $("#search").focus(); return; }
  if (action === "topic") { state.topic = button.dataset.topic; renderFeed(); return; }
  if (action === "play") return openPlayer(button.dataset.id);
  if (action === "play-from-channel") { const id = button.dataset.id; closeModal(); return openPlayer(id); }
  if (action === "channel" || action === "open-channel") return openChannel(button.dataset.channel);
  if (action === "like") return toggleLike();
  if (action === "share") return shareVideo(button.dataset.id);
  if (action === "save-playlist") return saveToPlaylist($("#playlist-select")?.value);
  if (action === "new-playlist") return createPlaylist();
  if (action === "subscribe") return toggleSubscription(button.dataset.channel);
  if (action === "report") return reportVideo();
  if (action === "delete-video") return deleteVideo();
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.matches("form[data-form]")) return;
  event.preventDefault();
  if (form.dataset.form === "auth") return sendMagicLink(form);
  if (form.dataset.form === "teacher") return activateTeacher(form);
  if (form.dataset.form === "upload") return uploadVideo(form);
  if (form.dataset.form === "profile") return saveProfile(form);
  if (form.dataset.form === "comment") return sendComment(form);
});

window.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); setPageVideo(null); } });
window.addEventListener("popstate", () => { const id = new URLSearchParams(window.location.search).get("v"); if (id) openPlayer(id); else closeModal(); });

async function initialize() {
  shell();
  if (!configured) {
    const setup = $("#setup-notice");
    setup.hidden = false;
    setup.innerHTML = `<span><b>MateTube necesita revisar la conexión con Supabase.</b><br>${escapeHtml(configurationError || "Agregá las variables de Supabase para activar cuentas, publicaciones y comunidad.")}<br>Usá la Project URL (https://…supabase.co) y la Publishable key, sin comillas.</span><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir Supabase</a>`;
  }
  renderAccount(); renderFeed();
  if (!configured) return;
  supabase.auth.onAuthStateChange((_event, session) => { state.session = session; reload(); });
  await reload();
}

initialize();
