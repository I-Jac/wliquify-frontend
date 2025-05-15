'use client';

import React, { createContext, useContext, ReactNode, useState } from 'react';

interface AutoConnectContextState {
  autoConnect: boolean;
  setAutoConnect: (autoConnect: boolean) => void;
}

const AutoConnectContext = createContext<AutoConnectContextState | undefined>(undefined);

export const AutoConnectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [autoConnect, setAutoConnect] = useState(true); // Default to true or based on localStorage

  // Placeholder for localStorage logic if needed
  // useEffect(() => {
  //   const storedValue = localStorage.getItem('autoConnect');
  //   if (storedValue) {
  //     setAutoConnect(storedValue === 'true');
  //   }
  // }, []);

  // const value = useMemo(() => ({ autoConnect, setAutoConnect }), [autoConnect]);

  return (
    <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
      {children}
    </AutoConnectContext.Provider>
  );
};

export const useAutoConnect = (): AutoConnectContextState => {
  const context = useContext(AutoConnectContext);
  if (context === undefined) {
    throw new Error('useAutoConnect must be used within an AutoConnectProvider');
  }
  return context;
}; 