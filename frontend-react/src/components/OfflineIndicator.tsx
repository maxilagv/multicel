import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Banner que aparece cuando el usuario pierde la conexión.
 * Se oculta automáticamente cuando vuelve internet.
 * Posicionado en la parte superior para máxima visibilidad.
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      if (wasOffline) {
        setShowBackOnline(true);
        const t = setTimeout(() => setShowBackOnline(false), 3000);
        return () => clearTimeout(t);
      }
    }
    function handleOffline() {
      setIsOnline(false);
      setWasOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-black shadow-lg"
          role="status"
          aria-live="polite"
        >
          <WifiOff size={15} />
          <span>Sin conexión — estás viendo datos guardados. Las ventas se procesarán cuando vuelva internet.</span>
        </motion.div>
      )}

      {isOnline && showBackOnline && (
        <motion.div
          key="back-online"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-emerald-500 px-4 py-2 text-sm font-medium text-black shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span>✓ Conexión restablecida</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
