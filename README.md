# Contacta Floor Monitor v3.0

Monitor de puestos en tiempo real para Contact Centers — Editor SVG interactivo con colaboración multi-usuario vía Supabase.

---

## Requisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (plan gratuito es suficiente para empezar)

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (ver sección Supabase abajo)

# 3. Ejecutar en desarrollo
npm run dev
```

Abrir: [http://localhost:3000](http://localhost:3000)

---

## Configurar Supabase

### 1. Crear proyecto

1. Ir a [supabase.com](https://supabase.com) → New Project
2. Guardar la contraseña de la DB

### 2. Obtener credenciales

En tu proyecto → **Settings → API**:

| Variable en .env | Dónde encontrarla |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (mantener privada) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings |

### 3. Ejecutar la migración SQL

En Supabase → **SQL Editor** → pegar y ejecutar:

```
supabase/migrations/001_initial_schema.sql
```

Crea todas las tablas, RLS, triggers y funciones.

### 4. Crear bucket de Storage

En Supabase → **Storage** → New bucket:
- Nombre: `floor-assets`
- Public: **No**

### 5. Completar `.env`

```env
PORT=3000
NODE_ENV=development

SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...

APP_URL=http://localhost:3000
APP_NAME=Contacta Floor Monitor
```

---

## Primeros pasos

1. Ir a `/login.html` → **Registrarse**
2. Confirmar el email (Supabase envía un link)
3. Iniciar sesión → serás `admin` de tu empresa automáticamente
4. Clic en el icono de layouts en el header → **Nuevo Layout**
5. Activar **Modo Edición**
6. Agregar puestos con `+ Puesto`
7. Guardar con el botón ☁️

---

## Arquitectura

```
floor-monitor-2/
├── public/
│   ├── index.html              # App principal (editor + monitor)
│   ├── login.html              # Autenticación
│   ├── css/
│   │   ├── styles.css          # Estilos del editor
│   │   └── auth.css            # Estilos de login
│   └── js/
│       ├── auth/
│       │   ├── supabaseClient.js   # Inicialización del cliente
│       │   └── authService.js      # Login, registro, logout, roles
│       ├── services/
│       │   ├── dbService.js        # CRUD: layouts, desks, zones
│       │   ├── realtimeService.js  # Realtime + presencia
│       │   └── storageService.js   # Supabase Storage
│       ├── app.js              # Orquestación principal
│       ├── editor.js           # Lógica del editor
│       ├── map.js              # Pan, zoom, render SVG
│       ├── dragHandler.js      # Drag & drop de puestos
│       ├── zoneManager.js      # Zonas interactivas
│       ├── snapEngine.js       # Smart Guides + snap-to-grid
│       ├── undoManager.js      # Undo/Redo
│       ├── storageManager.js   # Persistencia híbrida (Supabase + localStorage)
│       └── ui.js               # Notificaciones, panels
├── server/
│   ├── server.js               # Express + Socket.IO + API routes
│   └── socket/socketManager.js
├── supabase/migrations/
│   └── 001_initial_schema.sql  # Schema PostgreSQL completo
└── .env.example
```

---

## Roles y permisos (RLS)

| Rol | Permisos |
|---|---|
| `admin` | Todo: layouts, empresa, invitar usuarios |
| `supervisor` | Crear/editar layouts, ver auditoría |
| `editor` | Crear/editar layouts propios |
| `viewer` | Solo monitoreo (sin edición) |

Los permisos se aplican via **Row Level Security** en PostgreSQL — no dependen del frontend.

---

## Colaboración en tiempo real

Usa **Supabase Realtime** para:
- Sincronizar cambios de desks/zonas entre usuarios conectados al mismo layout
- Mostrar avatares de presencia en el header
- Propagar cambios sin recargar la página

---

## Modo sin Supabase (local)

Si no configuras Supabase, la app funciona en **modo local**:
- Layouts en `localStorage`
- Sin autenticación ni colaboración

---

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl+Z` | Deshacer |
| `Ctrl+Y` | Rehacer |
| `Ctrl+N` | Agregar puesto |
| `Ctrl+S` | Guardar layout |
| `Ctrl+A` | Seleccionar todos |
| `Del` | Eliminar selección |
| `Espacio + drag` | Pan (en modo edición) |
| `Escape` | Deseleccionar |
| `+` / `-` | Zoom |
