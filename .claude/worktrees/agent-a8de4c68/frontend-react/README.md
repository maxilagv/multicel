Frontend (React + Vite)

Resumen te©nico
- Framework: React 18 + TypeScript (Vite)
- Estilos: TailwindCSS (tokens extendidos), tema oscuro/claro con ThemeContext
- Animaciones: Framer Motion para transiciones, microinteracciones y efectos decorativos
- GrÃ¡ficos: Recharts (tema oscuro con gradientes)
- IconografÃ­a: lucide-react

Estructura de carpetas (src/)
- components: piezas reutilizables (Alert, Logo, Spinner, StatCard heredado)
- context: AuthContext (manejo de tokens) y ThemeContext (tema claro/oscuro)
- layout: contenedores de layout (Navbar, Sidebar, Layout)
- lib: utilidades de dominio (api.ts, storage.ts)
- pages: vistas de aplicaciÃ³n (Login, Dashboard, Clientes, Productos, Categorías, etc.)
- routes: enrutador principal y protecciÃ³n de rutas (AppRouter)
- styles: estilos globales Tailwind + utilidades (glass, neon, skeleton)
- ui: UI kit local (Button, Card, MetricCard, ChartCard, DataTable, Skeleton, AnimatedOrbs)
- config, types: constantes y tipos de apoyo

Funcionamiento
- Enrutamiento: `AppRouter` organiza rutas pÃºblicas (Login) y privadas (`/app/*`) con un wrapper `Protected` que consulta `AuthContext`.
- Autenticacion: `AuthContext` persiste tokens; `lib/api.ts` implementa `apiFetch` con cabecera Bearer y flujo de refresh 401â†’POST `/api/refresh-token`.
- Theming: `ThemeContext` aplica/remueve la clase `dark` en `documentElement` y persiste la preferencia en `localStorage`.
- EstÃ©tica: tokens (indigo/cian), glassmorphism y fondos neon. Login con orbes animados (AnimatedOrbs) y efectos â€œscanlines/grid-sweepâ€.

ConfiguraciÃ³n
- Variables de entorno (no incluir credenciales en repositorio):
  - `VITE_API_BASE_URL` (opcional en desarrollo si se usa proxy)
- Vite proxy: `vite.config.ts` enruta `/api` â†’ `http://127.0.0.1:3000` en desarrollo.

Comandos
- Desarrollo: `npm install && npm run dev`
- ConstrucciÃ³n: `npm run build` (salida en `dist/`)
- Previsualizacion estatica: `npm run preview`


