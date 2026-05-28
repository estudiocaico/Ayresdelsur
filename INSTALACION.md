# Guía de Instalación — Ayres del Sur App

## Requisitos previos

- **Node.js 18+** instalado en tu computadora ([descargar acá](https://nodejs.org))
- Cuenta en **Supabase** (gratis): [supabase.com](https://supabase.com)
- Cuenta en **Vercel** (gratis, para deploy): [vercel.com](https://vercel.com)

---

## PASO 1 — Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta gratuita.
2. Hacé clic en **"New Project"**.
3. Elegí un nombre: `ayres-del-sur` y una contraseña segura para la base de datos.
4. Seleccioná la región más cercana (ej: South America).
5. Esperá que el proyecto se cree (1-2 minutos).

---

## PASO 2 — Crear las tablas en Supabase

1. En tu proyecto de Supabase, andá a **SQL Editor** (barra lateral izquierda).
2. Hacé clic en **"New Query"**.
3. Copiá todo el contenido del archivo `supabase/schema.sql` y pegalo ahí.
4. Hacé clic en **"Run"** (botón azul).
5. Deberías ver `Success. No rows returned.`

---

## PASO 3 — Crear el usuario administrador

1. En Supabase, andá a **Authentication → Users**.
2. Hacé clic en **"Add user" → "Create new user"**.
3. Ingresá el email y contraseña del administrador (ej: `admin@ayresdelsur.com`).
4. Marcá **"Auto Confirm User"**.
5. Hacé clic en **"Create User"**.
6. Copiá el **UUID** del usuario que aparece en la tabla.
7. Volvé al **SQL Editor** y ejecutá el siguiente SQL reemplazando `TU-UUID-ACÁ`:

```sql
UPDATE profiles SET role = 'admin' WHERE id = 'TU-UUID-ACÁ';
```

---

## PASO 4 — Obtener las credenciales de Supabase

1. En Supabase, andá a **Settings → API**.
2. Copiá los siguientes dos valores:
   - **Project URL**: está al principio de la página, con formato `https://xxxxx.supabase.co`. Si no lo ves en Settings → API, buscalo en **Settings → General** bajo el nombre "Reference ID" o directamente en la URL del dashboard de tu proyecto.
   - **Publishable key** (antes llamada "anon public"): es la clave pública larga. **No uses la Secret key**, esa es privada y no debe usarse en el frontend.

---

## PASO 5 — Configurar el proyecto local

1. Abrí una terminal en la carpeta `ayres-del-sur-app`.
2. Copiá el archivo de variables de entorno:
   ```
   cp .env.example .env
   ```
3. Abrí el archivo `.env` con cualquier editor de texto y completalo:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co        ← Project URL
   VITE_SUPABASE_ANON_KEY=eyJhbGci...                 ← Publishable key
   ```

---

## PASO 6 — Instalar dependencias y correr la app

```bash
npm install
npm run dev
```

Abrí el navegador en `http://localhost:5173`.  
Ingresá con el email y contraseña del administrador que creaste en el Paso 3.

---

## PASO 7 — Importar el catálogo de ejemplo

1. Ingresá al panel de administración.
2. Andá a **Importar** en el menú lateral.
3. Seleccioná el archivo `Catalogo_Productos_Ejemplo.xlsx`.
4. Revisá la preview y hacé clic en **"Importar"**.

Los 39 productos ficticios se cargarán en la base de datos.

---

## PASO 8 — Crear el primer cliente

1. En el panel admin, andá a **Clientes → Nuevo cliente**.
2. Completá los datos del comercio.
3. El cliente puede ingresar desde su celular en la misma URL de la app.

---

## Deploy en Vercel (para que esté online)

1. Subí la carpeta `ayres-del-sur-app` a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com), conectá tu cuenta de GitHub.
3. Importá el repositorio.
4. En la configuración del proyecto, agregá las variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Hacé clic en **Deploy**.

Vercel te dará una URL pública (ej: `https://ayres-del-sur.vercel.app`) que podés compartir con los clientes.

---

## Estructura de archivos

```
ayres-del-sur-app/
├── src/
│   ├── contexts/AuthContext.jsx     ← Manejo de sesión
│   ├── hooks/useCart.js             ← Lógica del carrito
│   ├── components/
│   │   ├── ClientNavbar.jsx         ← Barra de navegación del cliente
│   │   ├── AdminLayout.jsx          ← Sidebar del panel admin
│   │   └── PrivateRoute.jsx         ← Protección de rutas
│   ├── pages/
│   │   ├── Login.jsx                ← Pantalla de ingreso
│   │   ├── client/
│   │   │   ├── Catalog.jsx          ← Catálogo de productos
│   │   │   ├── Cart.jsx             ← Carrito y confirmación
│   │   │   └── OrderConfirmed.jsx   ← Pantalla de éxito
│   │   └── admin/
│   │       ├── Dashboard.jsx        ← Panel principal
│   │       ├── Orders.jsx           ← Listado de prepedidos
│   │       ├── OrderDetail.jsx      ← Detalle + impresión
│   │       ├── Clients.jsx          ← Gestión de clientes
│   │       ├── Products.jsx         ← Gestión de productos
│   │       └── ImportExcel.jsx      ← Importación desde Excel
│   └── lib/supabase.js              ← Conexión a Supabase
├── supabase/schema.sql              ← Estructura de la base de datos
├── Catalogo_Productos_Ejemplo.xlsx  ← 39 productos de ejemplo
└── .env.example                     ← Variables de entorno
```
