'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    RPC_URL, // Import RPC_URL
    SETTINGS_DEFAULT_SLIPPAGE_BPS,
    SETTINGS_DEFAULT_FEE_LEVEL,
    SETTINGS_DEFAULT_DYNAMIC_FEES,
    SETTINGS_DEFAULT_MAX_PRIORITY_FEE_CAP_SOL, // This will be moved to constants.ts later
    TRANSACTION_COMPUTE_UNITS, // Added TRANSACTION_COMPUTE_UNITS
    HELIUS_API_KEY, // Import Helius API Key
    LOCAL_STORAGE_KEY_FEE_LEVEL, // Added
    LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL, // Added
    LOCAL_STORAGE_KEY_SLIPPAGE_BPS, // Added
    LOCAL_STORAGE_KEY_RPC_ENDPOINT // Added
} from '@/utils/constants'; // Import new constants

// Re-add FeeLevel type definition here, or ensure it's correctly imported if moved to types.ts
// For now, assuming it was defined in this file and should be exported.
export type FeeLevel = 'Normal' | 'Fast' | 'Turbo' | 'Custom'; // Ensure 'Custom' is included if used by initial state or localStorage

interface DynamicFeeLevels {
    Normal: number;
    Fast: number;
    Turbo: number;
}

// Moved calculateSolFromFeeMicroLamportsPerCu to top level and exported
export const calculateSolFromFeeMicroLamportsPerCu = (rpcFeePerCu: number | undefined, defaultFeeMicroLamportsPerCu: number): number => {
    const feeToUse = (rpcFeePerCu === undefined || rpcFeePerCu < 0) ? defaultFeeMicroLamportsPerCu : rpcFeePerCu;
    if (feeToUse < 0) {
        console.warn(`[SettingsContext] feeToUse is negative (${feeToUse}), returning 0 SOL.`);
        return 0;
    }
    const solAmount = (feeToUse * TRANSACTION_COMPUTE_UNITS) / (1_000_000 * LAMPORTS_PER_SOL);
    return solAmount;
};

interface SettingsContextProps {
    feeLevel: FeeLevel;
    setFeeLevel: (level: FeeLevel) => void;
    maxPriorityFeeCapSol: number; // Added
    setMaxPriorityFeeCapSol: (cap: number) => void; // Added
    priorityFee: number; // This will now be calculated based on level and dynamic fees
    dynamicFees: DynamicFeeLevels;
    fetchDynamicFees: (connection?: Connection) => Promise<void>; // Make connection optional
    slippageBps: number;
    setSlippageBps: (bps: number) => void;
    rpcEndpoint: string;
    setRpcEndpoint: (endpoint: string) => void;
    isSettingsModalOpen: boolean;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
    isSettingsDirty: boolean; // Added for tracking unsaved changes
    setIsSettingsDirty: (isDirty: boolean) => void; // Added for tracking unsaved changes

    // New properties for the custom alert modal
    isAlertModalOpen: boolean;
    alertModalMessage: string;
    openAlertModal: (message: string) => void;
    closeAlertModal: () => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [feeLevel, setFeeLevelState] = useState<FeeLevel>(SETTINGS_DEFAULT_FEE_LEVEL);
    const [maxPriorityFeeCapSol, setMaxPriorityFeeCapSolState] = useState<number>(SETTINGS_DEFAULT_MAX_PRIORITY_FEE_CAP_SOL); // Added
    const [dynamicFees, setDynamicFees] = useState<DynamicFeeLevels>(SETTINGS_DEFAULT_DYNAMIC_FEES);
    const [slippageBps, setSlippageBpsState] = useState<number>(SETTINGS_DEFAULT_SLIPPAGE_BPS);
    const [rpcEndpoint, setRpcEndpointState] = useState<string>(RPC_URL); // Use RPC_URL from constants
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSettingsDirty, setIsSettingsDirty] = useState(false); // Added for tracking unsaved changes

    // New state for the custom alert modal
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertModalMessage, setAlertModalMessage] = useState('');

    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const storedFeeLevel = localStorage.getItem(LOCAL_STORAGE_KEY_FEE_LEVEL) as FeeLevel | null;
            const storedMaxPriorityFeeCapSol = localStorage.getItem(LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL);
            const storedSlippageBps = localStorage.getItem(LOCAL_STORAGE_KEY_SLIPPAGE_BPS);
            const storedRpcEndpoint = localStorage.getItem(LOCAL_STORAGE_KEY_RPC_ENDPOINT);

            if (storedFeeLevel && ['Normal', 'Fast', 'Turbo'].includes(storedFeeLevel)) { // Removed 'Custom'
                setFeeLevelState(storedFeeLevel);
            }
            if (storedMaxPriorityFeeCapSol) setMaxPriorityFeeCapSolState(parseFloat(storedMaxPriorityFeeCapSol)); // Added & parseFloat
            if (storedSlippageBps) setSlippageBpsState(parseInt(storedSlippageBps, 10));
            if (storedRpcEndpoint) setRpcEndpointState(storedRpcEndpoint);
        } catch (error) {
            console.error("Error loading settings from localStorage:", error);
        }
        setIsLoaded(true);
    }, []);

    // Function to fetch and calculate dynamic fees using Helius API
    const fetchDynamicFees = useCallback(async () => { // _connection param is no longer used
        // console.log("Attempting to fetch dynamic priority fees using Helius API..."); // REMOVED
        const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
        
        try {
            const response = await fetch(HELIUS_RPC_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "1",
                    method: "getPriorityFeeEstimate",
                    params: [{"options": {"includeAllPriorityFeeLevels": true}}]
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Helius API request failed with status ${response.status}: ${errorText}`);
                setDynamicFees(SETTINGS_DEFAULT_DYNAMIC_FEES);
                return;
            }

            const data = await response.json();

            if (data.error) {
                console.error("Helius API returned an error:", data.error);
                setDynamicFees(SETTINGS_DEFAULT_DYNAMIC_FEES);
                return;
            }
            
            if (data.result && data.result.priorityFeeLevels) {
                const levels = data.result.priorityFeeLevels;
                // console.log("[SettingsContext] Helius priorityFeeLevels (micro-lamports/CU):", levels); // REMOVED

                // Default values from SETTINGS_DEFAULT_DYNAMIC_FEES are treated as micro-lamports/CU
                const newDynamicFeesInSol = {
                    Normal: calculateSolFromFeeMicroLamportsPerCu(levels.medium, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                    Fast: calculateSolFromFeeMicroLamportsPerCu(levels.high, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                    Turbo: calculateSolFromFeeMicroLamportsPerCu(levels.veryHigh, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
                };
                // console.log("Calculated Dynamic Fees (in SOL, from Helius):", newDynamicFeesInSol); // REMOVED
                setDynamicFees(newDynamicFeesInSol);

            } else {
                console.warn("Helius API response did not contain expected priorityFeeLevels. Using default dynamic fees (converted to SOL).");
                // Convert default micro-lamports/CU fees to SOL
                setDynamicFees({
                    Normal: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                    Fast: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                    Turbo: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
                });
            }

        } catch (error) {
            console.error("Failed to fetch or process dynamic priority fees from Helius:", error);
            // Convert default micro-lamports/CU fees to SOL on error
            setDynamicFees({
                Normal: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                Fast: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                Turbo: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
            });
        }
    }, []); // REMOVED HELIUS_API_KEY and calculateSolFromFeeMicroLamportsPerCu from dependencies

    // Save fee level to localStorage
    const setFeeLevel = useCallback((level: FeeLevel) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_FEE_LEVEL, level);
                setFeeLevelState(level);
            } catch (error) {
                console.error("Error saving feeLevel to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Save max priority fee cap to localStorage
    const setMaxPriorityFeeCapSol = useCallback((cap: number) => { // Added
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL, cap.toString());
                setMaxPriorityFeeCapSolState(cap);
            } catch (error) {
                console.error("Error saving maxPriorityFeeCapSol to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Save slippage to localStorage
    const setSlippageBps = useCallback((bps: number) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_SLIPPAGE_BPS, bps.toString());
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
                localStorage.setItem(LOCAL_STORAGE_KEY_RPC_ENDPOINT, endpoint);
                setRpcEndpointState(endpoint);
                console.warn("RPC endpoint updated in context. SettingsModal will trigger user-facing alert if changed there.");
            } catch (error) {
                console.error("Error saving rpcEndpoint to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Calculate the effective priority fee (actual microLamports per CU for transaction)
    const priorityFee = useMemo(() => {
        const calculateMicroLamportsPerCUFromSol = (targetSol: number): number => {
            // targetSol = (microLamportsPerCU * TRANSACTION_COMPUTE_UNITS) / (1_000_000 * LAMPORTS_PER_SOL)
            // microLamportsPerCU = (targetSol * 1_000_000 * LAMPORTS_PER_SOL) / TRANSACTION_COMPUTE_UNITS
            return Math.round((targetSol * 1_000_000 * LAMPORTS_PER_SOL) / TRANSACTION_COMPUTE_UNITS);
        };

        let selectedFeeLevel = feeLevel;
        if (feeLevel === 'Custom') {
            console.warn("'Custom' feeLevel encountered in priorityFee calculation, defaulting to Normal's capped fee.");
            selectedFeeLevel = 'Normal';
        }
        
        const validFeeLevel = selectedFeeLevel as Exclude<FeeLevel, 'Custom'>;
        
        // dynamicFees now stores SOL amounts.
        // SETTINGS_DEFAULT_DYNAMIC_FEES stores micro-lamports/CU.
        // We need to ensure we get a SOL value here.
        let solForLevel: number;
        if (dynamicFees[validFeeLevel] !== undefined) {
            solForLevel = dynamicFees[validFeeLevel];
        } else {
            // Fallback: calculate SOL from the default micro-lamports/CU
            solForLevel = calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES[validFeeLevel]);
        }
        
        const microLamportsPerCUForLevel = calculateMicroLamportsPerCUFromSol(solForLevel);
        const maxMicroLamportsPerCUFromCap = calculateMicroLamportsPerCUFromSol(maxPriorityFeeCapSol);
        
        const finalMicroLamportsPerCU = Math.max(0, Math.min(microLamportsPerCUForLevel, maxMicroLamportsPerCUFromCap));
        
        // console.log(`Priority Fee Calculation: Level=${validFeeLevel}, SOLForLevel=${solForLevel.toFixed(9)}, LevelCU=${microLamportsPerCUForLevel}, CapSOL=${maxPriorityFeeCapSol.toFixed(9)}, CapCU=${maxMicroLamportsPerCUFromCap}, FinalCU=${finalMicroLamportsPerCU}`);
        
        return finalMicroLamportsPerCU;
    }, [feeLevel, dynamicFees, maxPriorityFeeCapSol]);

    const openSettingsModal = useCallback(() => setIsSettingsModalOpen(true), []);
    const closeSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);

    // New functions for custom alert modal
    const openAlertModal = useCallback((message: string) => {
        setAlertModalMessage(message);
        setIsAlertModalOpen(true);
    }, []);

    const closeAlertModal = useCallback(() => {
        setIsAlertModalOpen(false);
        // Optional: Reset message after a short delay if desired, or leave it
        // setTimeout(() => setAlertModalMessage(''), 300);
    }, []);

    const value = {
        feeLevel,
        setFeeLevel,
        maxPriorityFeeCapSol, // Added
        setMaxPriorityFeeCapSol, // Added
        priorityFee, // Calculated value
        dynamicFees, 
        fetchDynamicFees,
        slippageBps,
        setSlippageBps,
        rpcEndpoint,
        setRpcEndpoint,
        isSettingsModalOpen,
        openSettingsModal,
        closeSettingsModal,
        isSettingsDirty, // Added for tracking unsaved changes
        setIsSettingsDirty, // Added for tracking unsaved changes

        // New context values for alert modal
        isAlertModalOpen,
        alertModalMessage,
        openAlertModal,
        closeAlertModal
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