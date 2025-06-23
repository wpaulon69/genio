
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
    - **MySQL:** Base de datos relacional para almacenar toda la información de la aplicación (servicios, empleados, horarios, feriados, etc.).
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
│   │   ├── scheduler/      # Lógica del generador algorítmico de horarios y evaluación
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
- Cada servicio tiene reglas de dotación de personal (cuántos empleados por turno en días de semana y fines de semana/feriados), si habilita turno noche, reglas de consecutividad de trabajo/descanso, y un objetivo de fines de semana completos de descanso al mes.
- **Componentes Clave:** `src/app/services/page.tsx`, `src/components/services/service-form.tsx`, `src/components/services/service-list.tsx`.
- **Campos del Servicio:**
    - `name`: Nombre del servicio.
    - `description`: Descripción.
    - `enableNightShift`: Booleano que indica si se habilita el turno noche (N).
    - `staffingNeeds`: Objeto con la dotación requerida para turnos Mañana/Tarde/Noche en días de semana y fines de semana/feriados.
    - `consecutivenessRules`: Objeto con reglas sobre máximos/preferidos días de trabajo/descanso consecutivos y mínimo de descansos antes de volver a trabajar.
    - `targetCompleteWeekendsOff`: Número objetivo de fines de semana completos (Sábado + Domingo) de descanso que se busca dar a los empleados de este servicio por mes. El algoritmo de generación de horarios evalúa el cumplimiento de este objetivo (ver `evaluateScheduleMetrics`) y lo refleja en la puntuación y violaciones. También intenta suavemente favorecer este objetivo durante la asignación de turnos de fin de semana.
    - `additionalNotes`: Notas adicionales o reglas específicas del servicio.

### 4.2. Gestión de Empleados
- Mantiene un directorio del personal del hospital.
- Cada empleado tiene información de contacto, roles, servicios a los que puede ser asignado.
- **Preferencias del Empleado:**
    - **Elegibilidad para día libre post-guardia (D/D):** Esta preferencia (`eligibleForDayOffAfterDuty`) se registra para cada empleado. Sin embargo, es importante notar que el algoritmo de generación de horarios actual (`src/lib/scheduler/algorithmic-scheduler.ts`) **no utiliza explícitamente esta preferencia** para forzar un día de descanso después de un turno específico (ej. Noche). La asignación de descansos se basa en las reglas generales de consecutividad del servicio, las asignaciones fijas y la necesidad de cubrir turnos. Esta podría ser un área de mejora futura para el algoritmo.
    - Preferencia por trabajar fines de semana (`prefersWeekendWork`).
    - Patrón de trabajo general (`workPattern`: Rotación Estándar, L-V Mañana Fijo, L-V Tarde Fijo).
    - Turno fijo semanal (`fixedWeeklyShiftDays`, `fixedWeeklyShiftTiming`): Días y horario específico, si aplica para Rotación Estándar.
- **Asignaciones Fijas:** Permite registrar periodos de descanso (D), licencias anuales (LAO) o médicas (LM) para un empleado.
- **Componentes Clave:** `src/app/employees/page.tsx`, `src/components/employees/employee-form.tsx`, `src/components/employees/employee-list.tsx`.

### 4.3. Gestión de Feriados
- Permite definir y organizar los días feriados, que son tenidos en cuenta por el planificador de horarios.
- **Componentes Clave:** `src/app/holidays/page.tsx`, `src/components/holidays/holiday-form.tsx`, `src/components/holidays/holiday-list.tsx`.

### 4.4. Generación y Gestión de Horarios
- **Núcleo de la aplicación.** Permite generar, visualizar y editar horarios de turnos.
- **Flujo Borrador-Publicado-Archivado:**
    - Los horarios se pueden trabajar como **borradores** (`draft`).
    - Un borrador puede ser **publicado** (`published`), convirtiéndose en el horario activo para un servicio/mes/año. Solo puede haber un horario publicado.
    - Al publicar un nuevo horario, la versión publicada anterior (si existía) se **archiva** (`archived`). Los borradores también se archivan si se publican o se sobrescriben por un nuevo borrador.
- **Generación Algorítmica:** Utiliza un planificador algorítmico (`src/lib/scheduler/algorithmic-scheduler.ts`) para crear horarios basándose en:
    - Reglas del servicio (incluyendo `targetCompleteWeekendsOff`, cuyo cumplimiento se evalúa y se intenta favorecer suavemente durante la asignación).
    - Preferencias y asignaciones fijas de los empleados.
    - Feriados.
    - Continuidad con el horario del mes anterior.
- **Evaluación de Horarios:** La función `evaluateScheduleMetrics` (en `src/lib/scheduler/algorithmic-scheduler.ts`) calcula una puntuación para el horario y lista cualquier violación de reglas (errores o advertencias). Esta función es llamada tanto después de la generación algorítmica como cuando se solicita una re-evaluación manual de un horario editado.
- **Edición Manual:** Los horarios (borradores o copias del publicado) se pueden editar manualmente en una grilla interactiva.
- **Re-evaluación Manual:** Desde la interfaz de edición, se puede solicitar una re-evaluación completa del horario actual en la grilla para actualizar la puntuación y las violaciones.
- **Componentes Clave:** `src/app/schedule/page.tsx`, `src/components/schedule/shift-generator-form.tsx`, `src/components/schedule/InteractiveScheduleGrid.tsx`, `src/components/schedule/schedule-evaluation-display.tsx`.

### 4.5. Informes y Analíticas
- Proporciona información sobre la utilización del personal y las operaciones.
- **Resumen de Informe con IA:** Utiliza Genkit para resumir texto de informes de turno proporcionado por el user.
- **Análisis Comparativo de Empleados:** Muestra métricas de trabajo y descanso para empleados en un rango de fechas y servicio, basándose en horarios publicados.
- **Análisis de Calidad de Horario:** Muestra la puntuación y violaciones de un horario publicado específico.
- **Componentes Clave:** `src/app/reports/page.tsx`, `src/components/reports/report-filters.tsx`, `src/components/reports/report-display.tsx`.

### 4.6. Personal por Servicio
- Una vista simple para seleccionar un servicio y ver los empleados asignados a él.
- **Componentes Clave:** `src/app/service-overview/page.tsx`, `src/components/overview/ServiceEmployeeViewer.tsx`.

## 5. Interfaz de Usuario (UI) y Estilos

- La UI se construye con componentes **ShadCN UI**, que son personalizables y accesibles.
- Los estilos se manejan principalmente con **Tailwind CSS**.
- El tema de colores base (claro y oscuro) se define en `src/app/globals.css` usando variables HSL CSS.
- Los iconos son de **Lucide React**.

### 5.1. Componentes de Layout
- **`AppShell` (`src/components/layout/app-shell.tsx`):** Es el componente principal que define la estructura general de la aplicación. Incluye el `Sidebar` y el área de contenido principal. Utiliza el `SidebarProvider` y los componentes `Sidebar`, `SidebarRail`, `SidebarHeader`, `SidebarContent`, `SidebarFooter` y `SidebarInset` de ShadCN UI para lograr una navegación lateral colapsable y responsiva. También incluye un encabezado superior con un menú desplegable para el usuario.
- **`SidebarNav` (`src/components/layout/sidebar-nav.tsx`):** Contiene la lógica para renderizar los elementos de navegación dentro del `Sidebar`. Utiliza `SidebarMenu`, `SidebarMenuItem` y `SidebarMenuButton` de ShadCN UI. Resalta el ítem activo basándose en la ruta actual.

### 5.2. Componentes de UI Genéricos (ShadCN)
La aplicación utiliza una variedad de componentes de `src/components/ui/` que son en su mayoría componentes estilizados de ShadCN UI. Algunos de los más utilizados son:
- **`Button`**: Para acciones del usuario. (Ver documentación en `src/components/ui/button.tsx`)
- **`Card`**: Para agrupar contenido relacionado. (Ver documentación en `src/components/ui/card.tsx`)
- **`Dialog`**: Para modales y formularios emergentes. (Ver documentación en `src/components/ui/dialog.tsx`)
- **`Select`**: Para menús desplegables. (Ver documentación en `src/components/ui/select.tsx`)
- **`Table`**: Para mostrar datos tabulares. (Ver documentación en `src/components/ui/table.tsx`)
- **`Input`**, **`Textarea`**, **`Checkbox`**: Para formularios.
- **`Alert`**: Para mostrar mensajes importantes.
- **`Toast`**: Para notificaciones no intrusivas.
- La documentación detallada de cada uno de estos componentes se encuentra en la [documentación oficial de ShadCN UI](https://ui.shadcn.com/docs) y en los comentarios JSDoc dentro de cada archivo de componente en `src/components/ui/`.

### 5.3. Componentes Específicos de la Aplicación
Los componentes específicos de cada módulo (ej. `service-form.tsx`, `employee-list.tsx`, `InteractiveScheduleGrid.tsx`) se encuentran en sus respectivas carpetas dentro de `src/components/`. Estos combinan componentes de ShadCN UI y lógica de React para implementar las funcionalidades requeridas. Los comentarios JSDoc en cada archivo proporcionan más detalles.

## 6. Base de Datos
- **MySQL:** Utilizado como base de datos principal. Las colecciones principales son:
    - `services`: Para los servicios del hospital.
    - `employees`: Para la información del personal.
    - `holidays`: Para los días feriados.
    - `monthlySchedules`: Para los horarios generados (con sus estados `draft`, `published`, `archived`).
- La configuración de MySQL se encuentra en `.env.local`.
- Las funciones CRUD para cada colección están en `src/lib/mysql/`.

## 7. Genkit (Inteligencia Artificial)

- Genkit se utiliza para integrar funcionalidades de IA.
- La configuración se encuentra en `src/ai/genkit.ts`.
- Los flujos de IA (que definen prompts y lógica de interacción con LLMs) están en `src/ai/flows/`.
    - **`summarizeShiftReport`**: Resume texto de informes de turno.
    - **`suggestShiftSchedule`**: Sugiere un horario de turnos basado on a prompt detallado. Este flujo es más complejo, manejando la transformación de la salida de la IA a un formato estructurado y asegurando que los campos obligatorios estén presentes.
- Los flujos se llaman desde componentes de React (Server Components o a través de Server Actions implícitas en el patrón de Next.js).

## 8. Gestión de Estado

- **Estado del Servidor:** Se maneja con **TanStack Query (React Query)**. Esto incluye la obtención de datos, cacheo, y re-sincronización con MySQL.
- **Estado Local de UI:** Se maneja con hooks de React (`useState`, `useMemo`, etc.) dentro de los componentes.

## 9. Próximos Pasos y Mejoras Potenciales (Ejemplos)

- Implementación de autenticación de usuarios y roles.
- Interfaz de usuario para listar, previsualizar y gestionar borradores de horarios.
- Notificaciones (ej. cuando un horario está por vencer, o cuando se publica uno nuevo).
- Más tipos de informes y analíticas avanzadas.
- Integración con calendarios externos.
- Mejora del algoritmo de generación de horarios para considerar más preferencias de forma explícita (ej. `eligibleForDayOffAfterDuty`).
- Mejorar el algoritmo para que intente más activamente cumplir con el objetivo `targetCompleteWeekendsOff` durante la asignación de turnos (esto ya se ha empezado a favorecer suavemente en la asignación actual).

---

_Este documento se actualizará a medida que la aplicación evolucione._
