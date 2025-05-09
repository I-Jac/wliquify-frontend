'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Connection } from '@solana/web3.js';
import { FeeLevel } from '@/utils/types'; // Import FeeLevel type
import {
    RPC_URL, // Import RPC_URL
    SETTINGS_DEFAULT_SLIPPAGE_BPS,
    SETTINGS_DEFAULT_CUSTOM_PRIORITY_FEE,
    SETTINGS_DEFAULT_FEE_LEVEL,
    SETTINGS_DEFAULT_DYNAMIC_FEES
} from '@/utils/constants'; // Import new constants

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
    const [feeLevel, setFeeLevelState] = useState<FeeLevel>(SETTINGS_DEFAULT_FEE_LEVEL);
    const [customPriorityFee, setCustomPriorityFeeState] = useState<number>(SETTINGS_DEFAULT_CUSTOM_PRIORITY_FEE);
    const [dynamicFees, setDynamicFees] = useState<DynamicFeeLevels>(SETTINGS_DEFAULT_DYNAMIC_FEES);
    const [slippageBps, setSlippageBpsState] = useState<number>(SETTINGS_DEFAULT_SLIPPAGE_BPS);
    const [rpcEndpoint, setRpcEndpointState] = useState<string>(RPC_URL); // Use RPC_URL from constants
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
                setDynamicFees(SETTINGS_DEFAULT_DYNAMIC_FEES); // Use imported constant
                return; 
            }

            // Sort fees ascending
            fees.sort((a, b) => a.prioritizationFee - b.prioritizationFee);

            // Simple percentile calculation (adjust as needed)
            const p50Index = Math.floor(fees.length * 0.50);
            const p75Index = Math.floor(fees.length * 0.75);
            const p95Index = Math.min(Math.floor(fees.length * 0.95), fees.length - 1); // Ensure index is valid

            const newDynamicFees = {
                Normal: fees[p50Index]?.prioritizationFee || SETTINGS_DEFAULT_DYNAMIC_FEES.Normal, // Use imported constant
                Fast: fees[p75Index]?.prioritizationFee || SETTINGS_DEFAULT_DYNAMIC_FEES.Fast, // Use imported constant
                Turbo: fees[p95Index]?.prioritizationFee || SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo, // Use imported constant
            };

            console.log("Calculated Dynamic Fees:", newDynamicFees);
            setDynamicFees(newDynamicFees);

        } catch (error) {
            console.error("Failed to fetch or process dynamic priority fees:", error);
            // Fallback to defaults on error
            setDynamicFees(SETTINGS_DEFAULT_DYNAMIC_FEES); // Use imported constant
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
        return dynamicFees[feeLevel] || SETTINGS_DEFAULT_DYNAMIC_FEES[feeLevel]; // Use imported constant
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