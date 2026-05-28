# Ayres del Sur — App de Preventa

## Qué es este proyecto

Aplicación web PWA para que los clientes de una distribuidora de alimentos argentina hagan pre-pedidos desde el celular. El administrador gestiona todo desde un panel de escritorio.

## Stack técnico

- **Frontend**: React 18 + Vite + React Router v6
- **Backend/DB**: Supabase (PostgreSQL + Auth + RLS)
- **Hosting**: Vercel (deploy desde la carpeta del proyecto)
- **Otras libs**: SheetJS (importar Excel), Open Food Facts API (imágenes de productos por EAN)

## Correr el proyecto localmente

```bash
npm install
npm run dev
# Abre en http://localhost:5173
```

## Variables de entorno

El archivo `.env` en la raíz debe tener:
```
VITE_SUPABASE_URL=https://{project_id}.supabase.co
VITE_SUPABASE_ANON_KEY={publishable_key}
```

## Estructura del proyecto

```
src/
├── contexts/
│   └── AuthContext.jsx       # Sesión y rol del usuario (lee de tabla profiles)
├── components/
│   ├── PrivateRoute.jsx      # Protege rutas por rol (admin / cliente)
│   └── AdminLayout.jsx       # Sidebar + layout del panel admin
├── pages/
│   ├── Login.jsx             # Login con email/password
│   ├── Register.jsx          # Auto-registro de clientes (verifica email pre-cargado)
│   ├── client/
│   │   ├── Catalog.jsx       # Catálogo de productos con carrito (sessionStorage)
│   │   ├── Cart.jsx          # Carrito y confirmación de pedido
│   │   └── OrderConfirmed.jsx
│   └── admin/
│       ├── Dashboard.jsx     # Métricas generales
│       ├── Orders.jsx        # Lista de prepedidos + asignación de vendedor + impresión
│       ├── OrderDetail.jsx   # Detalle de un prepedido + impresión individual
│       ├── Clients.jsx       # ABM de clientes
│       ├── Vendedores.jsx    # ABM de vendedores
│       ├── Products.jsx      # ABM de productos
│       └── ImportExcel.jsx   # Importar catálogo desde .xlsx
└── lib/
    └── supabase.js           # Cliente Supabase inicializado
```

## Base de datos (Supabase)

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Un registro por usuario auth. Solo tiene `id` y `role` ('admin' o 'cliente') |
| `clientes` | Datos del negocio: nombre, CUIT, dirección, email, `user_id` (FK a auth) |
| `vendedores` | Equipo de ventas: nombre, activo |
| `categorias` | Categorías de productos |
| `productos` | Catálogo: código, EAN, nombre, precio, imagen_url, etc. |
| `variantes_producto` | Variantes de un producto (ej: sabores) |
| `prepedidos` | Pedidos: estado, total, `cliente_id`, `vendedor_id`, notas |
| `items_prepedido` | Líneas de cada pedido |

### Funciones SQL importantes

- `is_admin()` — devuelve true si el usuario actual tiene role='admin' en profiles
- `my_cliente_id()` — devuelve el id en la tabla clientes del usuario actual
- `check_email_preregistered(p_email)` — SECURITY DEFINER, verifica si un email está pre-cargado en clientes (para el registro de clientes)
- `link_client_on_signup()` — trigger AFTER INSERT en auth.users, vincula el nuevo usuario con su registro en clientes por email

### Migraciones ejecutadas (en orden)

1. `schema.sql` — tablas base, RLS, triggers
2. `migration_autolink.sql` — trigger para vincular auth.users con clientes
3. `migration_vendedores.sql` — tabla vendedores + columna vendedor_id en prepedidos
4. `migration_security.sql` — políticas de seguridad en profiles (bloquea auto-promoción de rol)

## Flujo de roles

**Admin:**
- Crea clientes en el panel (solo carga el email, sin contraseña)
- El cliente recibe la URL de la app y se registra en `/registro` eligiendo su contraseña
- Un trigger vincula automáticamente la cuenta con el registro del cliente por email

**Cliente:**
- Navega el catálogo, agrega al carrito, confirma el pedido
- Ve sus propios pedidos confirmados

## Funcionalidades del panel admin

- **Prepedidos**: lista con filtros por estado y vendedor, asignación inline de vendedor, impresión de pedidos completos por vendedor, hoja de ruta (lista de clientes a visitar)
- **Clientes**: alta de clientes, activar/desactivar
- **Vendedores**: alta de vendedores, activar/desactivar
- **Productos**: gestión manual de productos
- **Importar**: carga masiva desde Excel (.xlsx, máx 15 MB, hasta 10.000 filas)

## Features pendientes (backlog)

Estas funcionalidades fueron discutidas pero aún no implementadas:

1. **Historial de pedidos del cliente** — que el cliente vea sus pedidos anteriores y los repita con un click
2. **Notificación por WhatsApp al admin** — al entrar un pedido nuevo, generar link wa.me con resumen
3. **Exportar pedidos a Excel** — descargar lista filtrada en .xlsx desde el panel
4. **Pedido mínimo** — monto mínimo configurable; bloquea confirmar si no se alcanza
5. **Precios diferenciados por cliente** — asignar lista de precios distinta a cada cliente
6. **Dashboard mejorado** — top clientes, productos más pedidos, comparativo semanal
7. **Fecha de visita del vendedor** — el admin agenda la visita, el cliente la ve en su pedido

## Consideraciones de seguridad

- RLS activado en todas las tablas
- La anon key (VITE_SUPABASE_ANON_KEY) es pública por diseño — Supabase la pensó para el frontend
- Nunca poner la Secret key en el frontend
- El `.env` está en `.gitignore`
- El rol del usuario se lee desde la DB (tabla profiles), no del JWT — no es manipulable desde el cliente
- Los strings en impresión se escapan con `esc()` para prevenir XSS
- El import de Excel valida tipo, tamaño y longitud de strings antes de insertar
