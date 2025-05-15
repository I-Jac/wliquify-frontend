import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface WalletProfileContextState {
  isWalletProfileOpen: boolean;
  openWalletProfile: () => void;
  closeWalletProfile: () => void;
}

const WalletProfileContext = createContext<WalletProfileContextState | undefined>(undefined);

export const WalletProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isWalletProfileOpen, setIsWalletProfileOpen] = useState(false);

  const openWalletProfile = useCallback(() => {
    setIsWalletProfileOpen(true);
  }, []);

  const closeWalletProfile = useCallback(() => {
    setIsWalletProfileOpen(false);
  }, []);

  return (
    <WalletProfileContext.Provider value={{ isWalletProfileOpen, openWalletProfile, closeWalletProfile }}>
      {children}
      {/* The WalletProfilePanel will be rendered separately and use this context */}
    </WalletProfileContext.Provider>
  );
};

export const useWalletProfile = (): WalletProfileContextState => {
  const context = useContext(WalletProfileContext);
  if (!context) {
    throw new Error('useWalletProfile must be used within a WalletProfileProvider');
  }
  return context;
}; 