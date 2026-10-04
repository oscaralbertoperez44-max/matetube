# MateTube para GitHub + Vercel + Supabase

Aplicación web para publicar y compartir clases de matemática. Incluye inicio por enlace mágico, canales docentes, publicación de videos, comentarios, likes, suscripciones, playlists, historial, reportes y enlaces compartibles.

## 1. Crear Supabase

1. Creá un proyecto en [Supabase](https://supabase.com/).
2. Abrí **SQL Editor** y ejecutá `supabase/schema.sql` completo.
   - Si Supabase muestra `ERROR 42883: text = uuid`, ejecutá primero `supabase/fix-storage-policies.sql` y después repetí `schema.sql`.
3. En **Authentication > URL Configuration**, agregá `http://localhost:5173` y después el dominio de Vercel como Redirect URL.
4. En **Project Settings > API**, copiá el Project URL, la anon key y la service role key.

## 2. Variables de entorno

Copiá `.env.example` como `.env.local` para desarrollo. En Vercel cargá las mismas variables en **Production**, **Preview** y **Development**:

| Variable | Dónde se usa | ¿Pública? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Navegador | Sí |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Navegador | Sí |
| `SUPABASE_URL` | Función Vercel | No |
| `SUPABASE_SECRET_KEY` | Función Vercel | **No** |
| `MATETUBE_TEACHER_INVITE_CODE` | Función Vercel | **No** |

Nunca subas `.env.local`, la secret key ni la clave docente a GitHub.

## 3. Ejecutar y publicar

```bash
npm install
npm run dev
npm run build
```

1. Creá un repositorio vacío llamado, por ejemplo, `matetube` en GitHub.
2. Subí esta carpeta sin los archivos `.env*`.
3. En Vercel, elegí **Add New > Project**, importá el repositorio y definí las variables anteriores.
4. Deploy. Vercel ejecuta `npm run build` y publica `dist`; la función `api/teacher/enroll.js` protege la activación docente.

## Operación inicial

1. Ingresá con el correo del docente mediante el enlace mágico.
2. Elegí **Publicar** y activá el modo docente con la clave configurada en Vercel.
3. Subí un video MP4, WebM, OGG o MOV de hasta 100 MB.
4. Compartí el enlace generado desde el reproductor.

## Próxima fase para una escala tipo YouTube

Supabase Storage sirve para esta primera versión. Para videos extensos, varias calidades y transmisiones en vivo, conectá Cloudflare Stream u otra plataforma de video y mantené Supabase para usuarios, datos y permisos.
