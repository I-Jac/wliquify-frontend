'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import { RPC_URL } from '@/utils/core/constants'; // LOCAL_STORAGE_KEY_RPC_ENDPOINT is no longer needed here for init
import { useSettings } from './SettingsContext'; // Import useSettings

// Define a more specific type for network configuration if available, using string for now
export type NetworkConfiguration = WalletAdapterNetwork.Mainnet | WalletAdapterNetwork.Devnet | WalletAdapterNetwork.Testnet | string;

interface SolanaNetworkContextState {
  networkConfiguration: NetworkConfiguration;
  setNetworkConfiguration: (networkConfiguration: NetworkConfiguration) => void;
  endpoint: string;
}

const SolanaNetworkContext = createContext<SolanaNetworkContextState | undefined>(undefined);

export const SolanaNetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { rpcEndpoint: settingsRpcEndpoint } = useSettings(); // Get rpcEndpoint from SettingsContext

  const [networkConfiguration, setNetworkConfigurationState] = useState<NetworkConfiguration>(() => {
    if (settingsRpcEndpoint) {
      if (Object.values(WalletAdapterNetwork).includes(settingsRpcEndpoint as WalletAdapterNetwork)) {
        return settingsRpcEndpoint as WalletAdapterNetwork;
      }
      return settingsRpcEndpoint; // Custom URL
    }
    return RPC_URL; // Default from constants (e.g., Devnet)
  });

  const [endpoint, setEndpointState] = useState<string>(() => { // Renamed setEndpoint to setEndpointState
    if (settingsRpcEndpoint) {
      if (Object.values(WalletAdapterNetwork).includes(settingsRpcEndpoint as WalletAdapterNetwork)) {
        return clusterApiUrl(settingsRpcEndpoint as WalletAdapterNetwork);
      }
      return settingsRpcEndpoint; // Custom URL
    }
    return RPC_URL; // Default from constants
  });

  useEffect(() => {
    console.log("[SolanaNetworkContext] useEffect triggered. settingsRpcEndpoint:", settingsRpcEndpoint);
    let newNetworkConfig: NetworkConfiguration;
    let newEndpointValue: string;

    if (settingsRpcEndpoint) {
      if (Object.values(WalletAdapterNetwork).includes(settingsRpcEndpoint as WalletAdapterNetwork)) {
        newNetworkConfig = settingsRpcEndpoint as WalletAdapterNetwork;
        newEndpointValue = clusterApiUrl(settingsRpcEndpoint as WalletAdapterNetwork);
      } else { // Custom URL
        newNetworkConfig = settingsRpcEndpoint;
        newEndpointValue = settingsRpcEndpoint;
      }
    } else {
      // Fallback if settingsRpcEndpoint is somehow undefined/null after init
      newNetworkConfig = RPC_URL;
      newEndpointValue = RPC_URL;
    }
    
    if (newNetworkConfig !== networkConfiguration) {
      console.log("[SolanaNetworkContext] Updating networkConfiguration from", networkConfiguration, "to", newNetworkConfig);
      setNetworkConfigurationState(newNetworkConfig);
    }
    if (newEndpointValue !== endpoint) {
      console.log("[SolanaNetworkContext] Updating endpoint from", endpoint, "to", newEndpointValue);
      setEndpointState(newEndpointValue); // Use renamed setEndpointState
    }

  }, [settingsRpcEndpoint, networkConfiguration, endpoint]); // Added networkConfiguration and endpoint to deps

  const value = useMemo(() => ({
    networkConfiguration,
    endpoint,
    setNetworkConfiguration: (config: NetworkConfiguration) => { // This is for external calls to change network, not internal reaction
      let newEndpointValue: string;
      if (Object.values(WalletAdapterNetwork).includes(config as WalletAdapterNetwork)) {
        newEndpointValue = clusterApiUrl(config as WalletAdapterNetwork);
      } else {
        newEndpointValue = config; // Custom URL
      }
      setNetworkConfigurationState(config);
      setEndpointState(newEndpointValue);
      // Note: This explicit set does not automatically update SettingsContext.
      // That should happen through the UI settings modal.
    }
  }), [networkConfiguration, endpoint]);

  return (
    <SolanaNetworkContext.Provider value={value}>
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