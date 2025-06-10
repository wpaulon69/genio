# ShiftFlow - Documentación del Proyecto

## 1. Introducción

ShiftFlow es una aplicación web diseñada para la planificación y gestión inteligente de turnos de personal en entornos hospitalarios. Su objetivo es optimizar la asignación de turnos, asegurar la cobertura adecuada de los servicios, respetar las preferencias y restricciones de los empleados, y facilitar la administración general del personal y los servicios del hospital. La aplicación utiliza inteligencia artificial para sugerir horarios y analizar informes.

## 2. Tecnologías Utilizadas

- **Frontend:**
    - **Next.js:** Framework de React para renderizado del lado del servidor (SSR) y generación de sitios estáticos (SSG), con App Router.
    - **React:** Biblioteca para construir interfaces de usuario.
    - **TypeScript:** Superset de JavaScript que añade tipado estático.
    - **Tailwind CSS:** Framework CSS "utility-first" para diseño rápido y responsivo.
    - **ShadCN UI:** Colección de componentes de UI reutilizables construidos sobre Tailwind CSS y Radix UI.
    - **Lucide Icons:** Biblioteca de iconos SVG.
    - **React Hook Form:** Para la gestión de formularios.
    - **Zod:** Para validación de esquemas.
    - **Recharts:** Para la visualización de gráficos en informes.
- **Backend & Base de Datos:**
    - **Firebase Firestore:** Base de datos NoSQL en la nube para almacenar toda la información de la aplicación (servicios, empleados, horarios, feriados, etc.).
- **Inteligencia Artificial:**
    - **Genkit (Firebase GenAI):** Framework para construir flujos de IA, conectándose a modelos de lenguaje grandes (LLMs) como Gemini para generación de texto y análisis.
- **Gestión de Estado del Servidor:**
    - **TanStack Query (React Query):** Para la obtención, cacheo, sincronización y actualización de datos del servidor.
- **Despliegue (Configuración por defecto):**
    - **Firebase App Hosting:** Para el despliegue de la aplicación Next.js.

## 3. Estructura del Proyecto

El proyecto sigue una estructura típica para aplicaciones Next.js con el App Router.

```
/
├── public/                 # Archivos estáticos públicos
├── src/
│   ├── ai/                 # Lógica relacionada con Inteligencia Artificial (Genkit)
│   │   ├── flows/          # Flujos de Genkit (ej. sugerir horarios, resumir informes)
│   │   ├── dev.ts          # Archivo para desarrollo local de Genkit
│   │   └── genkit.ts       # Configuración global de Genkit
│   ├── app/                # Rutas de la aplicación (App Router de Next.js)
│   │   ├── (nombre-ruta)/  # Carpetas de ruta
│   │   │   └── page.tsx    # Componente de página para la ruta
│   │   ├── globals.css     # Estilos globales y tema de ShadCN
│   │   └── layout.tsx      # Layout principal de la aplicación
│   ├── components/         # Componentes React reutilizables
│   │   ├── common/         # Componentes genéricos (ej. PageHeader)
│   │   ├── employees/      # Componentes específicos para la gestión de empleados
│   │   ├── holidays/       # Componentes específicos para la gestión de feriados
│   │   ├── layout/         # Componentes de estructura (ej. AppShell, SidebarNav)
│   │   ├── overview/       # Componentes para la vista de personal por servicio
│   │   ├── reports/        # Componentes para la sección de informes
│   │   ├── schedule/       # Componentes para la gestión de horarios
│   │   ├── services/       # Componentes específicos para la gestión de servicios
│   │   └── ui/             # Componentes de UI de ShadCN (botones, inputs, etc.)
│   ├── hooks/              # Hooks personalizados de React (ej. useToast, useMobile)
│   ├── lib/                # Utilidades, tipos, y lógica de negocio no-UI
│   │   ├── constants/      # Constantes de la aplicación (ej. opciones de turno)
│   │   ├── firebase/       # Interacciones con Firebase (config, CRUD para colecciones)
│   │   ├── scheduler/      # Lógica del generador algorítmico de horarios
│   │   ├── types.ts        # Definiciones de TypeScript para tipos e interfaces
│   │   └── utils.ts        # Funciones de utilidad generales
│   ├── ...
├── .env                    # Variables de entorno (no versionado)
├── .gitignore
├── apphosting.yaml         # Configuración de Firebase App Hosting
├── components.json         # Configuración de ShadCN UI
├── next.config.ts          # Configuración de Next.js
├── package.json
├── tailwind.config.ts      # Configuración de Tailwind CSS
├── tsconfig.json           # Configuración de TypeScript
└── README.md
```

## 4. Módulos Principales y Funcionalidades

### 4.1. Gestión de Servicios
- Permite definir y administrar los diferentes servicios del hospital (ej. Emergencias, Cardiología).
- Cada servicio tiene reglas de dotación de personal (cuántos empleados por turno en días de semana y fines de semana/feriados), si habilita turno noche, y reglas de consecutividad de trabajo/descanso.
- **Componentes Clave:** `src/app/services/page.tsx`, `src/components/services/service-form.tsx`, `src/components/services/service-list.tsx`.
- **Datos Firebase:** Colección `services`.

### 4.2. Gestión de Empleados
- Mantiene un directorio del personal del hospital.
- Cada empleado tiene información de contacto, roles, servicios a los que puede ser asignado.
- **Preferencias del Empleado:**
    - Elegibilidad para día libre post-guardia.
    - Preferencia por trabajar fines de semana.
    - Patrón de trabajo general (Rotación Estándar, L-V Mañana Fijo, L-V Tarde Fijo).
    - Turno fijo semanal (días y horario específico, si aplica para Rotación Estándar).
- **Asignaciones Fijas:** Permite registrar periodos de descanso (D), licencias anuales (LAO) o médicas (LM) para un empleado.
- **Componentes Clave:** `src/app/employees/page.tsx`, `src/components/employees/employee-form.tsx`, `src/components/employees/employee-list.tsx`.
- **Datos Firebase:** Colección `employees`.

### 4.3. Gestión de Feriados
- Permite definir y organizar los días feriados, que son tenidos en cuenta por el planificador de horarios.
- **Componentes Clave:** `src/app/holidays/page.tsx`, `src/components/holidays/holiday-form.tsx`, `src/components/holidays/holiday-list.tsx`.
- **Datos Firebase:** Colección `holidays`.

### 4.4. Generación y Gestión de Horarios
- **Núcleo de la aplicación.** Permite generar, visualizar y editar horarios de turnos.
- **Flujo Borrador-Publicado-Archivado:**
    - Los horarios se pueden trabajar como **borradores** (`draft`).
    - Un borrador puede ser **publicado** (`published`), convirtiéndose en el horario activo para un servicio/mes/año. Solo puede haber un horario publicado.
    - Al publicar un nuevo horario, la versión publicada anterior (si existía) se **archiva** (`archived`). Los borradores también se archivan si se publican o se sobrescriben por un nuevo borrador.
- **Generación Algorítmica:** Utiliza un planificador algorítmico (`src/lib/scheduler/algorithmic-scheduler.ts`) para crear horarios basándose en:
    - Reglas del servicio.
    - Preferencias y asignaciones fijas de los empleados.
    - Feriados.
    - Continuidad con el horario del mes anterior.
- **Evaluación de Horarios:** El algoritmo también calcula una puntuación para el horario generado y lista cualquier violación de reglas (errores o advertencias).
- **Edición Manual:** Los horarios (borradores o copias del publicado) se pueden editar manualmente en una grilla interactiva.
- **Componentes Clave:** `src/app/schedule/page.tsx`, `src/components/schedule/shift-generator-form.tsx`, `src/components/schedule/InteractiveScheduleGrid.tsx`, `src/components/schedule/schedule-evaluation-display.tsx`.
- **Datos Firebase:** Colección `monthlySchedules`.

### 4.5. Informes y Analíticas
- Proporciona información sobre la utilización del personal y las operaciones.
- **Resumen de Informe con IA:** Utiliza Genkit para resumir texto de informes de turno proporcionado por el usuario.
- **Análisis Comparativo de Empleados:** Muestra métricas de trabajo y descanso para empleados en un rango de fechas y servicio, basándose en horarios publicados.
- **Análisis de Calidad de Horario:** Muestra la puntuación y violaciones de un horario publicado específico.
- **Componentes Clave:** `src/app/reports/page.tsx`, `src/components/reports/report-filters.tsx`, `src/components/reports/report-display.tsx`.
- **Flujos AI:** `src/ai/flows/summarize-shift-report.ts`.

### 4.6. Personal por Servicio
- Una vista simple para seleccionar un servicio y ver los empleados asignados a él.
- **Componentes Clave:** `src/app/service-overview/page.tsx`, `src/components/overview/ServiceEmployeeViewer.tsx`.

## 5. Interfaz de Usuario (UI) y Estilos

- La UI se construye con componentes **ShadCN UI**, que son personalizables y accesibles.
- Los estilos se manejan principalmente con **Tailwind CSS**.
- El tema de colores base (claro y oscuro) se define en `src/app/globals.css` usando variables HSL CSS.
- Los iconos son de **Lucide React**.

## 6. Firebase
- **Firestore:** Utilizado como base de datos principal. Las colecciones principales son:
    - `services`: Para los servicios del hospital.
    - `employees`: Para la información del personal.
    - `holidays`: Para los días feriados.
    - `monthlySchedules`: Para los horarios generados (con sus estados draft, published, archived).
- La configuración de Firebase se encuentra en `src/lib/firebase/config.ts`.
- Las funciones CRUD para cada colección están en `src/lib/firebase/`.

## 7. Genkit (Inteligencia Artificial)

- Genkit se utiliza para integrar funcionalidades de IA.
- La configuración se encuentra en `src/ai/genkit.ts`.
- Los flujos de IA (que definen prompts y lógica de interacción con LLMs) están en `src/ai/flows/`.
    - Ejemplo: `summarizeShiftReport` para resumir texto.
- Los flujos se llaman desde componentes de React (Server Components o a través de Server Actions implícitas en el patrón de Next.js).

## 8. Gestión de Estado

- **Estado del Servidor:** Se maneja con **TanStack Query (React Query)**. Esto incluye la obtención de datos, cacheo, y re-sincronización con Firestore.
- **Estado Local de UI:** Se maneja con hooks de React (`useState`, `useMemo`, etc.) dentro de los componentes.

## 9. Próximos Pasos y Mejoras Potenciales (Ejemplos)

- Implementación de autenticación de usuarios y roles.
- Mejoras en la UI para la gestión de borradores de horarios (listarlos, publicarlos, eliminarlos directamente).
- Notificaciones (ej. cuando un horario está por vencer, o cuando se publica uno nuevo).
- Más tipos de informes y analíticas avanzadas.
- Integración con calendarios externos.

---

_Este documento se actualizará a medida que la aplicación evolucione._
