'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Connection } from '@solana/web3.js';

// Fee Level Definitions
export type FeeLevel = 'Normal' | 'Fast' | 'Turbo' | 'Custom';

// Default values
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
const DEFAULT_CUSTOM_PRIORITY_FEE = 10000; // Default custom microLamports if custom is selected but no value set
const DEFAULT_FEE_LEVEL: FeeLevel = 'Normal';
const DEFAULT_RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8900";
//const DEFAULT_RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

// Placeholder dynamic fees - will be updated by fetchDynamicFees
const DEFAULT_DYNAMIC_FEES = {
    Normal: 1000,    // Example low fee
    Fast: 10000,   // Example medium fee
    Turbo: 50000   // Example high fee
};

interface DynamicFeeLevels {
    Normal: number;
    Fast: number;
    Turbo: number;
}

interface SettingsContextProps {
    feeLevel: FeeLevel;
    setFeeLevel: (level: FeeLevel) => void;
    customPriorityFee: number;
    setCustomPriorityFee: (fee: number) => void;
    priorityFee: number; // This will now be calculated based on level and dynamic fees
    dynamicFees: DynamicFeeLevels;
    fetchDynamicFees: (connection: Connection) => Promise<void>; // Function to fetch and update fees
    slippageBps: number;
    setSlippageBps: (bps: number) => void;
    rpcEndpoint: string;
    setRpcEndpoint: (endpoint: string) => void;
    isSettingsModalOpen: boolean;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [feeLevel, setFeeLevelState] = useState<FeeLevel>(DEFAULT_FEE_LEVEL);
    const [customPriorityFee, setCustomPriorityFeeState] = useState<number>(DEFAULT_CUSTOM_PRIORITY_FEE);
    const [dynamicFees, setDynamicFees] = useState<DynamicFeeLevels>(DEFAULT_DYNAMIC_FEES);
    const [slippageBps, setSlippageBpsState] = useState<number>(DEFAULT_SLIPPAGE_BPS);
    const [rpcEndpoint, setRpcEndpointState] = useState<string>(DEFAULT_RPC_ENDPOINT);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const storedFeeLevel = localStorage.getItem('feeLevel') as FeeLevel | null;
            const storedCustomFee = localStorage.getItem('customPriorityFee');
            const storedSlippageBps = localStorage.getItem('slippageBps');
            const storedRpcEndpoint = localStorage.getItem('rpcEndpoint');

            if (storedFeeLevel && ['Normal', 'Fast', 'Turbo', 'Custom'].includes(storedFeeLevel)) {
                setFeeLevelState(storedFeeLevel);
            }
            if (storedCustomFee) setCustomPriorityFeeState(parseInt(storedCustomFee, 10));
            if (storedSlippageBps) setSlippageBpsState(parseInt(storedSlippageBps, 10));
            if (storedRpcEndpoint) setRpcEndpointState(storedRpcEndpoint);
        } catch (error) {
            console.error("Error loading settings from localStorage:", error);
        }
        setIsLoaded(true);
    }, []);

    // Function to fetch and calculate dynamic fees
    const fetchDynamicFees = useCallback(async (connection: Connection) => {
        console.log("Attempting to fetch dynamic priority fees...");
        try {
            // TODO: Potentially filter by relevant program addresses if needed
            // const addresses = [ YOUR_PROGRAM_ID, ];
            const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: [] }); // Fetch global fees for simplicity
            
            if (fees.length === 0) {
                console.warn("No recent prioritization fees found. Using default dynamic fees.");
                setDynamicFees(DEFAULT_DYNAMIC_FEES);
                return; 
            }

            // Sort fees ascending
            fees.sort((a, b) => a.prioritizationFee - b.prioritizationFee);

            // Simple percentile calculation (adjust as needed)
            const p50Index = Math.floor(fees.length * 0.50);
            const p75Index = Math.floor(fees.length * 0.75);
            const p95Index = Math.min(Math.floor(fees.length * 0.95), fees.length - 1); // Ensure index is valid

            const newDynamicFees = {
                Normal: fees[p50Index]?.prioritizationFee || DEFAULT_DYNAMIC_FEES.Normal,
                Fast: fees[p75Index]?.prioritizationFee || DEFAULT_DYNAMIC_FEES.Fast,
                Turbo: fees[p95Index]?.prioritizationFee || DEFAULT_DYNAMIC_FEES.Turbo,
            };

            console.log("Calculated Dynamic Fees:", newDynamicFees);
            setDynamicFees(newDynamicFees);

        } catch (error) {
            console.error("Failed to fetch or process dynamic priority fees:", error);
            // Fallback to defaults on error
            setDynamicFees(DEFAULT_DYNAMIC_FEES);
        }
    }, []);

    // Save fee level to localStorage
    const setFeeLevel = useCallback((level: FeeLevel) => {
        if (isLoaded) {
            try {
                localStorage.setItem('feeLevel', level);
                setFeeLevelState(level);
            } catch (error) {
                console.error("Error saving feeLevel to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Save custom fee to localStorage
    const setCustomPriorityFee = useCallback((fee: number) => {
        if (isLoaded) {
            try {
                localStorage.setItem('customPriorityFee', fee.toString());
                setCustomPriorityFeeState(fee);
            } catch (error) {
                console.error("Error saving customPriorityFee to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Save slippage to localStorage
    const setSlippageBps = useCallback((bps: number) => {
        if (isLoaded) {
            try {
                localStorage.setItem('slippageBps', bps.toString());
                setSlippageBpsState(bps);
            } catch (error) {
                console.error("Error saving slippageBps to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Save RPC endpoint to localStorage
    const setRpcEndpoint = useCallback((endpoint: string) => {
        if (isLoaded) {
            try {
                localStorage.setItem('rpcEndpoint', endpoint);
                setRpcEndpointState(endpoint);
                alert("RPC endpoint updated. A page refresh may be needed for it to take full effect.");
            } catch (error) {
                console.error("Error saving rpcEndpoint to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Calculate the effective priority fee based on the selected level
    const priorityFee = useMemo(() => {
        if (feeLevel === 'Custom') {
            return customPriorityFee;
        }
        return dynamicFees[feeLevel] || DEFAULT_DYNAMIC_FEES[feeLevel];
    }, [feeLevel, customPriorityFee, dynamicFees]);

    const openSettingsModal = useCallback(() => setIsSettingsModalOpen(true), []);
    const closeSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);

    const value = {
        feeLevel,
        setFeeLevel,
        customPriorityFee,
        setCustomPriorityFee,
        priorityFee, // Calculated value
        dynamicFees, 
        fetchDynamicFees,
        slippageBps,
        setSlippageBps,
        rpcEndpoint,
        setRpcEndpoint,
        isSettingsModalOpen,
        openSettingsModal,
        closeSettingsModal
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = (): SettingsContextProps => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}; 