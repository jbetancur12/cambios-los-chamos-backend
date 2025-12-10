# Backend - Cambios Los Chamos

API RESTful para el sistema de gestión de remesas y cambios de divisas "Cambios Los Chamos". Construido con Node.js, Express y TypeScript.

## 🛠 Tecnologías Principales

- **Runtime:** Node.js
- **Framework:** Express
- **Lenguaje:** TypeScript
- **Base de Datos:** PostgreSQL
- **ORM:** MikroORM
- **Validación:** Zod
- **Autenticación:** JWT + Firebase Admin
- **Almacenamiento:** MinIO / S3
- **Emails:** Resend
- **Logging:** Pino
- **Testing de Carga:** Artillery

## 🚀 Requisitos Previos

- Node.js (v18 o superior recomendado)
- PostgreSQL
- MinIO (o credenciales de S3 compatible)
- Redis (para colas y caché, si aplica)

## 📦 Instalación

1.  Clonar el repositorio y navegar a la carpeta `backend`.
2.  Instalar dependencias:
    ```bash
    npm install
    ```
3.  Configurar las variables de entorno:
    - Copiar `.env.example` a `.env` y llenar los valores requeridos (Base de datos, JWT secret, Firebase, etc.).

## 🏃‍♂️ Ejecución

### Desarrollo
Para levantar el servidor en modo desarrollo con recarga automática:
```bash
npm run dev
```

### Producción
Para compilar y correr en producción:
```bash
npm run build
npm start
```

## 🗄 Scripts de Base de Datos

El proyecto utiliza **MikroORM** para la gestión de la base de datos.

- **Migraciones:**
    - Crear migración: `npm run migration:create`
    - Ejecutar migraciones: `npm run migration:up`
    - Revertir migración: `npm run migration:down`

- **Seeders (Datos de Prueba):**
    - Ejecutar seeders: `npm run seed`

- **Reinicio Completo (Peligroso):**
    - Borra la BD, corre migraciones y seeds: `npm run db:fresh`

## 👤 Gestión de Usuarios

- **Crear Superadmin:**
    ```bash
    npm run create:superadmin
    ```

## 🧪 Calidad de Código

- **Linting:** `npm run lint`
- **Formateo:** `npm run format`
- **Chequeo de Tipos:** `npm run ts-check`
