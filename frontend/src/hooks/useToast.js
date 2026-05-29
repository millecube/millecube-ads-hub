import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = 'success', duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ x: 110, opacity: 0, scale: 0.88 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 110, opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className={`toast glass toast-${t.type}`}
            >
              <span>{t.type === 'success' ? '✓' : '✕'}</span>
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
