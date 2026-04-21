# Implementación del Modo Claro (Light Mode)

**Versión:** 2026-03-30
**Estado:** Pendiente de implementación
**Prioridad:** Sprint 4

---

## Punto de partida — qué ya existe

Antes de arrancar, es clave entender que la infraestructura del modo claro **ya está construida**:

| Componente | Archivo | Estado |
|------------|---------|--------|
| `ThemeProvider` — gestiona `theme`, `setTheme`, `toggle()` | `src/context/ThemeContext.tsx` | ✅ Completo |
| `ThemeProvider` en el árbol de la app | `src/App.tsx` línea 16 | ✅ Completo |
| Tailwind `darkMode: 'class'` | `tailwind.config.ts` línea 59 | ✅ Completo |
| Persistencia en `localStorage` | `ThemeContext.tsx` línea 27 | ✅ Completo |
| Respeto a preferencia del sistema operativo | `ThemeContext.tsx` línea 16 | ✅ Completo |

**Lo que falta:** el CSS de modo claro y el botón de toggle en la interfaz.

El hook para cualquier componente ya es:
```tsx
import { useTheme } from '../context/ThemeContext';
const { theme, toggle, setTheme } = useTheme();
```

---

## Paleta de colores — modo claro

El diseño actual es "neon oscuro" (`#0a0a0f` de fondo, glassmorphism, gradientes). El modo claro debe ser limpio, profesional y de alta legibilidad — no una simple inversión del oscuro.

### Paleta definida

```css
/* Fondos */
--light-bg-root:     #F1F5F9;   /* slate-100 — fondo principal, suave y neutro */
--light-bg-surface:  #F8FAFC;   /* slate-50  — superficies secundarias */
--light-bg-card:     #FFFFFF;   /* blanco puro para cards */

/* Bordes */
--light-border:      #E2E8F0;   /* slate-200 — bordes sutiles */
--light-border-strong: #CBD5E1; /* slate-300 — bordes con más presencia */

/* Texto */
--light-text-primary:   #0F172A; /* slate-900 — texto principal */
--light-text-secondary: #475569; /* slate-600 — texto secundario */
--light-text-muted:     #94A3B8; /* slate-400 — texto desactivado / labels */

/* Acento — se mantiene igual en ambos modos */
--light-accent:         #4F46E5; /* indigo-600 */
--light-accent-hover:   #4338CA; /* indigo-700 */
--light-accent-bg:      #EEF2FF; /* indigo-50  — fondo de chips/badges */

/* Inputs */
--light-input-bg:       #FFFFFF;
--light-input-border:   #CBD5E1;
--light-input-focus:    #6366F1; /* indigo-500 */

/* Sombras */
--light-shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--light-shadow-elevated: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
```

### Comparativa visual

| Elemento | Oscuro | Claro |
|----------|--------|-------|
| Fondo root | `#0a0a0f` | `#F1F5F9` |
| Card | glassmorphism oscuro | `#FFFFFF` + sombra sutil |
| Texto principal | `#e2e8f0` | `#0F172A` |
| Texto muted | `#94a3b8` | `#94A3B8` (igual) |
| Input bg | `rgba(0,0,0,0.35)` | `#FFFFFF` |
| Borde inputs | `rgba(255,255,255,0.12)` | `#CBD5E1` |
| Acento | `#7c3aed` / `#6366f1` | `#4F46E5` |

---

## Paso a paso — implementación completa

### Paso 1 — Agregar variables CSS y clases de modo claro en `index.css`

Archivo: `frontend-react/src/styles/index.css`

Agregar un bloque `:root.light` (o `html:not(.dark)`) que redefina las clases custom:

```css
/* ── MODO CLARO ──────────────────────────────────────────────────── */

html:not(.dark) .app-root {
  background-color: #F1F5F9;
  color: #0F172A;
}

html:not(.dark) .app-surface {
  background: #F8FAFC;
}

html:not(.dark) .app-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  backdrop-filter: none;
}

html:not(.dark) .app-panel {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
}

html:not(.dark) .app-muted {
  color: #64748B;
}

html:not(.dark) .app-title {
  color: #0F172A;
}

html:not(.dark) .app-subtitle {
  color: #64748B;
}

html:not(.dark) .input-modern {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  color: #0F172A;
}

html:not(.dark) .input-modern::placeholder {
  color: #94A3B8;
}

html:not(.dark) .input-modern:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
  background: #FFFFFF;
}

html:not(.dark) .select-modern {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  color: #0F172A;
}

html:not(.dark) .select-modern:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
  background: #FFFFFF;
}

html:not(.dark) .app-scrollbar {
  scrollbar-color: rgba(0,0,0,0.15) transparent;
}

html:not(.dark) .bg-neon {
  background-image: none;
  background-color: #F1F5F9;
}

html:not(.dark) .glass {
  backdrop-filter: none;
  background: rgba(255,255,255,0.9);
  border: 1px solid #E2E8F0;
}

html:not(.dark) .login-root {
  background-color: #F1F5F9;
  color: #0F172A;
}
```

**Nota:** El selector `html:not(.dark)` funciona porque Tailwind agrega/quita la clase `dark` en `<html>` directamente desde `ThemeContext.tsx`.

---

### Paso 2 — Auditar las clases Tailwind inline en los componentes

El mayor volumen de trabajo. Los componentes usan clases como `bg-slate-900`, `text-slate-400`, `border-slate-700` directamente en el JSX. Hay que convertirlas al patrón `dark:` de Tailwind.

**Patrón de conversión:**

```tsx
// ANTES (solo modo oscuro):
<div className="bg-slate-900 text-slate-100 border-slate-700">

// DESPUÉS (responsive a ambos modos):
<div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700">
```

**Tabla de conversiones frecuentes:**

| Clase oscura actual | Reemplazar por |
|---------------------|----------------|
| `bg-slate-950` | `bg-slate-50 dark:bg-slate-950` |
| `bg-slate-900` | `bg-white dark:bg-slate-900` |
| `bg-slate-800` | `bg-slate-100 dark:bg-slate-800` |
| `bg-slate-700` | `bg-slate-200 dark:bg-slate-700` |
| `text-slate-100` | `text-slate-900 dark:text-slate-100` |
| `text-slate-300` | `text-slate-700 dark:text-slate-300` |
| `text-slate-400` | `text-slate-500 dark:text-slate-400` |
| `text-slate-500` | `text-slate-500 dark:text-slate-500` |
| `border-slate-700` | `border-slate-200 dark:border-slate-700` |
| `border-slate-600` | `border-slate-300 dark:border-slate-600` |
| `border-white/10` | `border-slate-200 dark:border-white/10` |

**Componentes prioritarios a auditar (en este orden):**

1. Layout / navegación lateral — afecta a todas las páginas
2. `Ventas.tsx` — flujo principal del negocio
3. `Productos.tsx` — ficha de producto
4. `Clientes.tsx` / `ClienteDetalle.tsx`
5. `Dashboard.tsx` / métricas
6. `ConfiguracionAdmin.tsx`
7. Componentes UI compartidos: `Alert.tsx`, `Modal.tsx`, tablas, badges

---

### Paso 3 — Crear el botón de toggle en la navegación

El `ThemeContext` ya tiene `toggle()`. Solo hace falta un botón que lo llame.

**Agregar en el componente de navegación lateral o header:**

```tsx
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="p-2 rounded-lg text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
```

Lucide ya está instalado en el proyecto (`lucide-react`). Los íconos `Sun` y `Moon` están disponibles.

**Dónde colocar el toggle:**

Opción A — En el header superior (recomendado para mobile):
```
[Logo] ................... [🔔] [☀️/🌙] [Avatar]
```

Opción B — Al final del menú lateral (recomendado para desktop):
```
Menú lateral:
  Dashboard
  Ventas
  Productos
  ...
  ─────────────
  [☀️ Modo claro]    ← al fondo
```

Opción C — En Configuración del usuario (complementaria):
Además del toggle rápido, en la sección de perfil del usuario se puede mostrar un selector explícito:
```
Tema de la interfaz:  [🌙 Oscuro]  [☀️ Claro]
```

---

### Paso 4 — Manejar el color de fondo en `<html>` para evitar flash

Al cargar la app, existe un instante antes de que React hidrate donde `<html>` no tiene la clase `dark`. Esto produce un flash de modo claro aunque el usuario prefiera oscuro.

**Solución — Agregar un script inline en `index.html`:**

```html
<!-- En <head>, ANTES de cualquier otro script -->
<script>
  (function() {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

Este script se ejecuta de forma síncrona antes de que el navegador pinte el primer frame, eliminando el flash.

**Ubicación:** `frontend-react/index.html`, dentro de `<head>`, antes de `<script type="module">`.

---

### Paso 5 — Tratar los gradientes y efectos especiales

El diseño oscuro tiene efectos que no tienen sentido en modo claro (scanlines, neon glow, hue-rotate). Hay que desactivarlos:

```css
html:not(.dark) .animate-hue {
  animation: none;
  filter: none;
}

html:not(.dark) .scanlines {
  display: none;
}

html:not(.dark) .grid-sweep::after {
  display: none;
}

html:not(.dark) .glow-ring {
  animation: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

---

### Paso 6 — Adaptar los gráficos (Recharts)

Recharts usa colores hardcodeados. En modo claro, los textos de ejes y tooltips pueden quedar ilegibles.

Patrón a aplicar:

```tsx
import { useTheme } from '../context/ThemeContext';

const { theme } = useTheme();
const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b';
const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
const tooltipBg = theme === 'dark' ? '#1e293b' : '#ffffff';

<CartesianGrid stroke={gridColor} />
<XAxis tick={{ fill: axisColor }} />
<YAxis tick={{ fill: axisColor }} />
<Tooltip
  contentStyle={{ background: tooltipBg, border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}` }}
/>
```

---

### Paso 7 — Verificación y QA

Antes de dar por terminada la implementación, recorrer estas pantallas en modo claro:

**Checklist:**

- [ ] Login — legible, contraste correcto
- [ ] Dashboard — métricas y gráficos visibles
- [ ] Listado de productos — tabla, badges de estado
- [ ] Ficha de producto — formulario, precios, historial
- [ ] Nueva venta — todos los pasos del flujo
- [ ] Listado de clientes — tabla, saldo, estado
- [ ] Configuración — todos los formularios
- [ ] Modales (cualquier modal abierto)
- [ ] Toast/alertas — éxito, error, advertencia
- [ ] Páginas de error (404, sin permisos)
- [ ] Vista mobile — menú hamburguesa, formularios
- [ ] Transición al cambiar entre modos — no debe haber flash ni elementos "rotos"

**Herramienta:** en Chrome DevTools, emular modo claro y oscuro desde `Rendering → Emulate CSS media feature prefers-color-scheme`.

---

## Orden de implementación recomendado

| Paso | Tarea | Tiempo estimado |
|------|-------|-----------------|
| 1 | CSS de clases custom en `index.css` | 2 h |
| 2 | Anti-flash script en `index.html` | 15 min |
| 3 | Toggle button en la navegación | 30 min |
| 4 | Auditar y convertir clases inline — layout/nav | 3 h |
| 5 | Auditar clases inline — páginas principales | 4 h |
| 6 | Efectos neon desactivados en claro | 30 min |
| 7 | Colores de gráficos Recharts | 1 h |
| 8 | QA completo en ambos modos | 2 h |

**Total estimado: 1 a 2 jornadas de trabajo.**

---

## Reglas de diseño para modo claro

Estas reglas garantizan que el resultado sea coherente y no parezca "un parche":

1. **Nunca usar blanco puro (`#FFFFFF`) como fondo de página.** Usar `#F1F5F9` (slate-100). El blanco puro cansa la vista. El blanco puro va solo en las cards.

2. **El acento (`indigo-600`, `#4F46E5`) se mantiene igual en ambos modos.** Es suficientemente legible sobre fondo claro y ya era el color principal.

3. **Las sombras reemplazan los bordes brillantes.** En oscuro, los bordes `rgba(255,255,255,0.08)` separan los elementos. En claro, eso desaparece — reemplazar con `box-shadow` sutil.

4. **No invertir colores de estado.** Verde de éxito, rojo de error, amarillo de advertencia se mantienen en ambos modos. Solo puede variar el fondo del chip/badge (más saturado en oscuro, más pastel en claro).

5. **Las tipografías no cambian.** Outfit para interfaz, Space Grotesk para títulos. Solo cambia el color del texto.

6. **El logo debe funcionar en ambos fondos.** Si el logo es solo blanco, necesita una versión oscura para modo claro. Verificar en `ConfiguracionAdmin` donde se sube el logo.

---

## Qué NO hacer

- ❌ No aplicar `filter: invert(1)` al app completo — rompe imágenes, íconos con color, y gráficos.
- ❌ No usar `prefers-color-scheme` como única fuente de verdad — el usuario debe poder overridear manualmente.
- ❌ No eliminar los efectos neon del modo oscuro — solo desactivarlos con `html:not(.dark)`.
- ❌ No cambiar la paleta del modo oscuro al implementar el claro — ambos deben coexistir sin tocarse.
