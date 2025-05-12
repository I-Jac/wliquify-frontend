'use client';

import React, { FC, ReactNode, createContext, useContext, useState, useCallback } from 'react';
import { WalletModal } from './WalletModal';

// Define the context state shape
export interface WalletModalContextState {
    visible: boolean;
    setVisible: (open: boolean) => void;
}

// Create the context with a default value
const WalletModalContext = createContext<WalletModalContextState>(
    {} as WalletModalContextState
);

// Custom hook to use the context
export function useWalletModal(): WalletModalContextState {
    const context = useContext(WalletModalContext);
    if (!context) {
        throw new Error('useWalletModal must be used within a WalletModalProvider');
    }
    return context;
}

// Provider component
export const WalletModalProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [visible, setVisible] = useState(false);

    const setVisibleCallback = useCallback(
        (open: boolean) => {
            setVisible(open);
        },
        [setVisible]
    );

    return (
        <WalletModalContext.Provider
            value={{
                visible,
                setVisible: setVisibleCallback,
            }}
        >
            {children}
            {visible && <WalletModal />}
        </WalletModalContext.Provider>
    );
}; 