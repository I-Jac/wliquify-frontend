'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';

// Define a more specific type for network configuration if available, using string for now
export type NetworkConfiguration = WalletAdapterNetwork.Mainnet | WalletAdapterNetwork.Devnet | WalletAdapterNetwork.Testnet | string;

interface SolanaNetworkContextState {
  networkConfiguration: NetworkConfiguration;
  setNetworkConfiguration: (networkConfiguration: NetworkConfiguration) => void;
  endpoint: string;
}

const SolanaNetworkContext = createContext<SolanaNetworkContextState | undefined>(undefined);

export const SolanaNetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Default to Devnet or load from settings/localStorage
  const [networkConfiguration, setNetworkConfiguration] = useState<NetworkConfiguration>(WalletAdapterNetwork.Devnet);

  const endpoint = useMemo(() => {
    if (networkConfiguration === WalletAdapterNetwork.Mainnet) return clusterApiUrl(WalletAdapterNetwork.Mainnet);
    if (networkConfiguration === WalletAdapterNetwork.Devnet) return clusterApiUrl(WalletAdapterNetwork.Devnet);
    if (networkConfiguration === WalletAdapterNetwork.Testnet) return clusterApiUrl(WalletAdapterNetwork.Testnet);
    // If it's a custom RPC URL string
    if (typeof networkConfiguration === 'string' && (networkConfiguration.startsWith('http') || networkConfiguration.startsWith('ws'))) {
        return networkConfiguration;
    }
    return clusterApiUrl(WalletAdapterNetwork.Devnet); // Fallback
  }, [networkConfiguration]);

  return (
    <SolanaNetworkContext.Provider value={{ networkConfiguration, setNetworkConfiguration, endpoint }}>
      {children}
    </SolanaNetworkContext.Provider>
  );
};

export const useSolanaNetwork = (): SolanaNetworkContextState => {
  const context = useContext(SolanaNetworkContext);
  if (context === undefined) {
    throw new Error('useSolanaNetwork must be used within a SolanaNetworkProvider');
  }
  return context;
}; 