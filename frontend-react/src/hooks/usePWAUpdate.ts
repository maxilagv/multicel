import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

/**
 * Gestiona las actualizaciones del Service Worker.
 *
 * Comportamiento:
 * - Cuando hay una nueva versión disponible, aplica la actualización
 *   automáticamente y recarga la página (ya que registerType: 'autoUpdate').
 * - Expone `needRefresh` por si se quiere mostrar un toast/aviso manual.
 *
 * Uso:
 *   const { needRefresh, update } = usePWAUpdate();
 *   if (needRefresh) mostrar banner "Nueva versión disponible"
 */
export function usePWAUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) return;
      // Revisar actualizaciones cada hora
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.warn('[PWA] Error registrando service worker:', error);
      }
    },
  });

  // Auto-update: si registerType='autoUpdate', el SW se actualiza solo.
  // Este efecto aplica cuando el SW ya está esperando activación.
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  return {
    needRefresh,
    update: () => updateServiceWorker(true),
  };
}
