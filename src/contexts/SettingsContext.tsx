'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { FeeLevel } from '@/utils/types'; // Import FeeLevel type
import {
    RPC_URL, // Import RPC_URL
    SETTINGS_DEFAULT_SLIPPAGE_BPS,
    SETTINGS_DEFAULT_FEE_LEVEL,
    SETTINGS_DEFAULT_DYNAMIC_FEES,
    SETTINGS_DEFAULT_MAX_PRIORITY_FEE_CAP_SOL, // This will be moved to constants.ts later
    TRANSACTION_COMPUTE_UNITS // Added TRANSACTION_COMPUTE_UNITS
} from '@/utils/constants'; // Import new constants

interface DynamicFeeLevels {
    Normal: number;
    Fast: number;
    Turbo: number;
}

interface SettingsContextProps {
    feeLevel: FeeLevel;
    setFeeLevel: (level: FeeLevel) => void;
    maxPriorityFeeCapSol: number; // Added
    setMaxPriorityFeeCapSol: (cap: number) => void; // Added
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
            const storedFeeLevel = localStorage.getItem('feeLevel') as FeeLevel | null;
            const storedMaxPriorityFeeCapSol = localStorage.getItem('maxPriorityFeeCapSol'); // Added
            const storedSlippageBps = localStorage.getItem('slippageBps');
            const storedRpcEndpoint = localStorage.getItem('rpcEndpoint');

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

    // Function to fetch and calculate dynamic fees
    const fetchDynamicFees = useCallback(async (connection: Connection) => {
        console.log("Attempting to fetch dynamic priority fees...");
        try {
            const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: [] });
            
            if (fees.length === 0) {
                console.warn("No recent prioritization fees found. Using default dynamic fees.");
                setDynamicFees(SETTINGS_DEFAULT_DYNAMIC_FEES);
                return; 
            }

            fees.sort((a, b) => a.prioritizationFee - b.prioritizationFee);

            const p50Index = Math.floor(fees.length * 0.50);
            const p75Index = Math.floor(fees.length * 0.75);
            const p95Index = Math.min(Math.floor(fees.length * 0.95), fees.length - 1);

            const calculateScaledDisplayValue = (rpcFeePerCu: number | undefined, defaultScaledValue: number): number => {
                // Assuming TRANSACTION_COMPUTE_UNITS and LAMPORTS_PER_SOL are always non-zero positive constants
                if (rpcFeePerCu === undefined || rpcFeePerCu < 0) {
                    return defaultScaledValue;
                }
                // This calculation transforms per-CU fee from RPC into a scaled total fee for UI consistency.
                // The result should be comparable to SETTINGS_DEFAULT_DYNAMIC_FEES values (e.g., 1000, 10000).
                return Math.round((rpcFeePerCu * TRANSACTION_COMPUTE_UNITS) / LAMPORTS_PER_SOL);
            };

            const newDynamicFees = {
                Normal: calculateScaledDisplayValue(fees[p50Index]?.prioritizationFee, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                Fast: calculateScaledDisplayValue(fees[p75Index]?.prioritizationFee, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                Turbo: calculateScaledDisplayValue(fees[p95Index]?.prioritizationFee, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
            };

            console.log("Calculated Dynamic Fees (scaled for display):", newDynamicFees);
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

    // Save max priority fee cap to localStorage
    const setMaxPriorityFeeCapSol = useCallback((cap: number) => { // Added
        if (isLoaded) {
            try {
                localStorage.setItem('maxPriorityFeeCapSol', cap.toString());
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
                console.warn("RPC endpoint updated in context. SettingsModal will trigger user-facing alert if changed there.");
            } catch (error) {
                console.error("Error saving rpcEndpoint to localStorage:", error);
            }
        }
    }, [isLoaded]);

    // Calculate the effective priority fee (actual microLamports per CU for transaction)
    const priorityFee = useMemo(() => {
        const calculateMicroLamportsPerCU = (targetTotalSol: number): number => {
            // TRANSACTION_COMPUTE_UNITS is a non-zero constant, so direct division is safe.
            return Math.round((targetTotalSol * LAMPORTS_PER_SOL * 1_000_000) / TRANSACTION_COMPUTE_UNITS);
        };

        let selectedFeeLevel = feeLevel;
        // Fallback for 'Custom' if it somehow still exists as a feeLevel,
        // though it shouldn't be settable through the UI anymore.
        if (feeLevel === 'Custom') {
            console.warn("'Custom' feeLevel encountered in priorityFee calculation, defaulting to Normal's capped fee.");
            selectedFeeLevel = 'Normal'; // Default to Normal for calculation
        }
        
        const validFeeLevel = selectedFeeLevel as Exclude<FeeLevel, 'Custom'>;
        const scaledTotalFeeForLevel = dynamicFees[validFeeLevel] !== undefined 
            ? dynamicFees[validFeeLevel] 
            : SETTINGS_DEFAULT_DYNAMIC_FEES[validFeeLevel];
        
        // Convert scaled display fee to target total SOL
        const targetTotalSolForLevel = scaledTotalFeeForLevel / 1_000_000; 
        
        // Calculate microLamports per CU for the selected fee level's target SOL
        const microLamportsPerCUForLevel = calculateMicroLamportsPerCU(targetTotalSolForLevel);

        // Calculate max allowed microLamports per CU based on the SOL cap
        const maxMicroLamportsPerCUFromCap = calculateMicroLamportsPerCU(maxPriorityFeeCapSol);
        
        // The final priority fee is the lesser of the level's fee and the cap, ensuring it's not negative
        const finalMicroLamportsPerCU = Math.max(0, Math.min(microLamportsPerCUForLevel, maxMicroLamportsPerCUFromCap));
        
        // console.log(`Priority Fee Calculation: Level=${validFeeLevel}, ScaledFee=${scaledTotalFeeForLevel}, TargetSOL=${targetTotalSolForLevel.toFixed(9)}, LevelCU=${microLamportsPerCUForLevel}, CapSOL=${maxPriorityFeeCapSol.toFixed(9)}, CapCU=${maxMicroLamportsPerCUFromCap}, FinalCU=${finalMicroLamportsPerCU}`);
        
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