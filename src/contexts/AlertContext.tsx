'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface AlertContextState {
  alertMessage: string | null;
  alertType: 'success' | 'error' | 'info' | 'warning' | null;
  openAlertModal: (message: string, type?: AlertContextState['alertType']) => void;
  closeAlertModal: () => void;
  isAlertModalOpen: boolean; 
}

const AlertContext = createContext<AlertContextState | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<AlertContextState['alertType']>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  const openAlertModal = useCallback((message: string, type: AlertContextState['alertType'] = 'info') => {
    setAlertMessage(message);
    setAlertType(type);
    setIsAlertModalOpen(true);
  }, []);

  const closeAlertModal = useCallback(() => {
    setAlertMessage(null);
    setAlertType(null);
    setIsAlertModalOpen(false);
  }, []);

  return (
    <AlertContext.Provider value={{ alertMessage, alertType, openAlertModal, closeAlertModal, isAlertModalOpen }}>
      {children}
      {/* Actual AlertModal component would be rendered elsewhere, using this context */}
    </AlertContext.Provider>
  );
};

export const useAlert = (): AlertContextState => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}; 