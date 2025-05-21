'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useTranslation } from 'react-i18next'; // Import useTranslation
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
    LOCAL_STORAGE_KEY_RPC_ENDPOINT, // Added
    // Add localStorage keys for profile settings
    LOCAL_STORAGE_KEY_PREFERRED_LANGUAGE,
    LOCAL_STORAGE_KEY_PREFERRED_CURRENCY,
    LOCAL_STORAGE_KEY_NUMBER_FORMAT,
    LOCAL_STORAGE_KEY_PREFERRED_EXPLORER,
    // Default profile settings (can be moved to constants.ts later)
    DEFAULT_PREFERRED_LANGUAGE,
    DEFAULT_PREFERRED_CURRENCY,
    DEFAULT_NUMBER_FORMAT,
    DEFAULT_PREFERRED_EXPLORER,
    DEFAULT_EXPLORER_OPTIONS, // Added for explorer options
} from '@/utils/core/constants'; // Import new constants
import type { FeeLevel, NumberFormatSettings, SolanaExplorerOption, LanguageOption, CurrencyOption } from '@/utils/core/types'; // Import related types

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

// Reinstated DynamicFeeLevels interface
interface DynamicFeeLevels {
    Normal: number;
    Fast: number;
    Turbo: number;
}

export interface SettingsContextProps {
    feeLevel: FeeLevel;
    setFeeLevel: (level: FeeLevel) => void;
    maxPriorityFeeCapSol: number;
    setMaxPriorityFeeCapSol: (cap: number) => void;
    priorityFee: number;
    dynamicFees: DynamicFeeLevels;
    fetchDynamicFees: (connection?: Connection) => Promise<void>;
    slippageBps: number;
    setSlippageBps: (bps: number) => void;
    slippageTolerance: number;
    rpcEndpoint: string;
    setRpcEndpoint: (endpoint: string) => void;
    isSettingsModalOpen: boolean;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
    isSettingsDirty: boolean;
    setIsSettingsDirty: (isDirty: boolean) => void;

    isAlertModalOpen: boolean;
    alertModalMessage: string;
    openAlertModal: (message: string) => void;
    closeAlertModal: () => void;

    // Profile Settings
    preferredLanguage: string;
    setPreferredLanguage: (languageCode: string) => void;
    preferredCurrency: string;
    setPreferredCurrency: (currencyCode: string) => void;
    numberFormat: NumberFormatSettings;
    setNumberFormat: (format: NumberFormatSettings) => void;
    preferredExplorer: string;
    setPreferredExplorer: (explorerName: string) => void;
    explorerOptions: Record<string, SolanaExplorerOption>;
    availableLanguages: LanguageOption[];
    availableCurrencies: CurrencyOption[];

    isCustomSlippage: boolean;
    setIsCustomSlippage: (value: boolean) => void;
    rawCustomSlippageInput: string;
    setRawCustomSlippageInput: (value: string) => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { i18n } = useTranslation(); // Get i18n instance from useTranslation
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [feeLevel, setFeeLevelState] = useState<FeeLevel>(SETTINGS_DEFAULT_FEE_LEVEL);
    const [maxPriorityFeeCapSol, setMaxPriorityFeeCapSolState] = useState<number>(SETTINGS_DEFAULT_MAX_PRIORITY_FEE_CAP_SOL);
    const [dynamicFees, setDynamicFees] = useState<DynamicFeeLevels>(SETTINGS_DEFAULT_DYNAMIC_FEES);
    const [slippageBps, setSlippageBpsState] = useState<number>(SETTINGS_DEFAULT_SLIPPAGE_BPS);
    const [rpcEndpoint, setRpcEndpointState] = useState<string>(RPC_URL);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSettingsDirty, setIsSettingsDirty] = useState(false);

    // Profile Settings State
    const [preferredLanguage, setPreferredLanguageState] = useState<string>(DEFAULT_PREFERRED_LANGUAGE);
    const [preferredCurrency, setPreferredCurrencyState] = useState<string>(DEFAULT_PREFERRED_CURRENCY);
    const [numberFormat, setNumberFormatState] = useState<NumberFormatSettings>(DEFAULT_NUMBER_FORMAT);
    const [preferredExplorer, setPreferredExplorerState] = useState<string>(DEFAULT_PREFERRED_EXPLORER);
    const explorerOptions: Record<string, SolanaExplorerOption> = useMemo(() => DEFAULT_EXPLORER_OPTIONS, []);
    const availableLanguages: LanguageOption[] = useMemo(() => [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }], []); // Example languages
    const availableCurrencies: CurrencyOption[] = useMemo(() => [
        { code: 'USD', name: 'US Dollar', symbol: '$' }, 
        { code: 'EUR', name: 'Euro', symbol: '€' }
        // Add more currencies as needed
    ], []);

    // ADDED: State for custom slippage mode and raw input string
    const [isCustomSlippage, setIsCustomSlippage] = useState<boolean>(() => {
        const savedIsCustom = localStorage.getItem('isCustomSlippage');
        // If 'isCustomSlippage' is explicitly 'true', then true. Otherwise, default to false.
        return savedIsCustom === 'true'; 
    });
    const [rawCustomSlippageInput, setRawCustomSlippageInput] = useState<string>(() => {
        return localStorage.getItem('rawCustomSlippageInput') || "";
    });

    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertModalMessage, setAlertModalMessage] = useState('');

    useEffect(() => {
        if (preferredLanguage && i18n.language !== preferredLanguage) {
            i18n.changeLanguage(preferredLanguage);
        }
    }, [preferredLanguage, i18n]);

    useEffect(() => {
        try {
            const storedFeeLevel = localStorage.getItem(LOCAL_STORAGE_KEY_FEE_LEVEL) as FeeLevel | null;
            const storedMaxPriorityFeeCapSol = localStorage.getItem(LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL);
            const storedSlippageBps = localStorage.getItem(LOCAL_STORAGE_KEY_SLIPPAGE_BPS);
            const storedRpcEndpoint = localStorage.getItem(LOCAL_STORAGE_KEY_RPC_ENDPOINT);

            const storedLanguage = localStorage.getItem(LOCAL_STORAGE_KEY_PREFERRED_LANGUAGE);
            const storedCurrency = localStorage.getItem(LOCAL_STORAGE_KEY_PREFERRED_CURRENCY);
            const storedNumberFormat = localStorage.getItem(LOCAL_STORAGE_KEY_NUMBER_FORMAT);
            const storedExplorer = localStorage.getItem(LOCAL_STORAGE_KEY_PREFERRED_EXPLORER);

            if (storedFeeLevel && ['Normal', 'Fast', 'Turbo'].includes(storedFeeLevel)) {
                setFeeLevelState(storedFeeLevel);
            }
            if (storedMaxPriorityFeeCapSol) setMaxPriorityFeeCapSolState(parseFloat(storedMaxPriorityFeeCapSol));
            if (storedSlippageBps) setSlippageBpsState(parseInt(storedSlippageBps, 10));
            if (storedRpcEndpoint) setRpcEndpointState(storedRpcEndpoint);

            if (storedLanguage) setPreferredLanguageState(storedLanguage);
            if (storedCurrency) setPreferredCurrencyState(storedCurrency);
            if (storedNumberFormat) {
                try {
                    const parsedFormat = JSON.parse(storedNumberFormat) as NumberFormatSettings;
                    if (parsedFormat && typeof parsedFormat.decimalSeparator === 'string' && typeof parsedFormat.thousandSeparator === 'string') {
                        setNumberFormatState(parsedFormat);
                    } else {
                        setNumberFormatState(DEFAULT_NUMBER_FORMAT);
                    }
                } catch (e) {
                    console.error("Error parsing numberFormat from localStorage", e);
                    setNumberFormatState(DEFAULT_NUMBER_FORMAT);
                }
            }
            if (storedExplorer && explorerOptions[storedExplorer]) {
                setPreferredExplorerState(storedExplorer);
            } else {
                setPreferredExplorerState(DEFAULT_PREFERRED_EXPLORER);
            }

        } catch (error) {
            console.error("Error loading settings from localStorage:", error);
        }
        setIsLoaded(true);
    }, [explorerOptions]);

    const fetchDynamicFees = useCallback(async () => {
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

                const newDynamicFeesInSol = {
                    Normal: calculateSolFromFeeMicroLamportsPerCu(levels.medium, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                    Fast: calculateSolFromFeeMicroLamportsPerCu(levels.high, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                    Turbo: calculateSolFromFeeMicroLamportsPerCu(levels.veryHigh, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
                };
                setDynamicFees(newDynamicFeesInSol);

            } else {
                console.warn("Helius API response did not contain expected priorityFeeLevels. Using default dynamic fees (converted to SOL).");
                setDynamicFees({
                    Normal: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                    Fast: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                    Turbo: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
                });
            }

        } catch (error) {
            console.error("Failed to fetch or process dynamic priority fees from Helius:", error);
            setDynamicFees({
                Normal: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Normal),
                Fast: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Fast),
                Turbo: calculateSolFromFeeMicroLamportsPerCu(undefined, SETTINGS_DEFAULT_DYNAMIC_FEES.Turbo),
            });
        }
    }, []);

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

    const setMaxPriorityFeeCapSol = useCallback((cap: number) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL, cap.toString());
                setMaxPriorityFeeCapSolState(cap);
            } catch (error) {
                console.error("Error saving maxPriorityFeeCapSol to localStorage:", error);
            }
        }
    }, [isLoaded]);

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

    const setPreferredLanguage = useCallback((languageCode: string) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFERRED_LANGUAGE, languageCode);
                setPreferredLanguageState(languageCode);
            } catch (error) {
                console.error("Error saving preferredLanguage to localStorage:", error);
            }
        }
    }, [isLoaded]);

    const setPreferredCurrency = useCallback((currencyCode: string) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFERRED_CURRENCY, currencyCode);
                setPreferredCurrencyState(currencyCode);
            } catch (error) {
                console.error("Error saving preferredCurrency to localStorage:", error);
            }
        }
    }, [isLoaded]);

    const setNumberFormat = useCallback((format: NumberFormatSettings) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_NUMBER_FORMAT, JSON.stringify(format));
                setNumberFormatState(format);
            } catch (error) {
                console.error("Error saving numberFormat to localStorage:", error);
            }
        }
    }, [isLoaded]);

    const setPreferredExplorer = useCallback((explorerName: string) => {
        if (isLoaded) {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFERRED_EXPLORER, explorerName);
                setPreferredExplorerState(explorerName);
            } catch (error) {
                console.error("Error saving preferredExplorer to localStorage:", error);
            }
        }
    }, [isLoaded]);

    const openSettingsModal = useCallback(() => setIsSettingsModalOpen(true), []);
    const closeSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);

    const openAlertModal = useCallback((message: string) => {
        setAlertModalMessage(message);
        setIsAlertModalOpen(true);
    }, []);

    const closeAlertModal = useCallback(() => {
        setIsAlertModalOpen(false);
    }, []);

    const priorityFee = useMemo(() => {
        const calculateMicroLamportsPerCUFromSol = (targetSol: number): number => {
            // Ensure targetSol is a number and not NaN, otherwise default to 0
            const effectiveSol = (typeof targetSol === 'number' && !isNaN(targetSol)) ? targetSol : 0;
            return Math.round((effectiveSol * 1_000_000 * LAMPORTS_PER_SOL) / TRANSACTION_COMPUTE_UNITS);
        };

        let selectedFeeLevel = feeLevel;
        // 'Custom' fee level is not directly used for automatic fee calculation;
        // it implies the user sets a raw microLamport value elsewhere if such a feature existed.
        // For this calculation, if 'Custom' is somehow selected, we should use a fallback, e.g., 'Normal'.
        if (feeLevel === 'Custom') {
            // console.warn("[SettingsContext] 'Custom' feeLevel encountered in priorityFee calculation, defaulting to Normal's capped fee for this context value.");
            selectedFeeLevel = 'Normal'; // Or handle as an error/specific logic
        }
        
        // Ensure selectedFeeLevel is a valid key for dynamicFees and SETTINGS_DEFAULT_DYNAMIC_FEES
        const validFeeLevel = selectedFeeLevel as Exclude<FeeLevel, 'Custom'>;
        
        let solForLevel: number;
        if (dynamicFees && dynamicFees[validFeeLevel] !== undefined) {
            solForLevel = dynamicFees[validFeeLevel];
        } else {
            // Fallback to default SOL value if dynamicFees isn't populated or doesn't have the level
            // The SETTINGS_DEFAULT_DYNAMIC_FEES are expected to be in SOL directly based on their current usage.
            solForLevel = SETTINGS_DEFAULT_DYNAMIC_FEES[validFeeLevel];
        }
        
        const microLamportsPerCUForLevel = calculateMicroLamportsPerCUFromSol(solForLevel);
        const maxMicroLamportsPerCUFromCap = calculateMicroLamportsPerCUFromSol(maxPriorityFeeCapSol);
        
        // Ensure a non-negative fee, then apply the cap
        const finalMicroLamportsPerCU = Math.max(0, Math.min(microLamportsPerCUForLevel, maxMicroLamportsPerCUFromCap));
        
        return finalMicroLamportsPerCU;
    }, [feeLevel, dynamicFees, maxPriorityFeeCapSol]);

    // ADDED: useEffects to save custom slippage state and raw input to localStorage
    useEffect(() => {
        localStorage.setItem('isCustomSlippage', isCustomSlippage.toString());
    }, [isCustomSlippage]);

    useEffect(() => {
        localStorage.setItem('rawCustomSlippageInput', rawCustomSlippageInput);
    }, [rawCustomSlippageInput]);

    useEffect(() => {
        localStorage.setItem('rpcEndpoint', rpcEndpoint);
    }, [rpcEndpoint]);

    const contextValue = useMemo(() => ({
        feeLevel,
        setFeeLevel,
        maxPriorityFeeCapSol,
        setMaxPriorityFeeCapSol,
        priorityFee, // Use the memoized priorityFee (in microLamports)
        dynamicFees,
        fetchDynamicFees,
        slippageBps,
        setSlippageBps,
        slippageTolerance: slippageBps / 10000, // Assuming slippageBps is out of 10000 (for 100.00%)
        rpcEndpoint,
        setRpcEndpoint,
        isSettingsModalOpen,
        openSettingsModal,
        closeSettingsModal,
        isSettingsDirty,
        setIsSettingsDirty,
        isAlertModalOpen,
        alertModalMessage,
        openAlertModal,
        closeAlertModal,
        preferredLanguage,
        setPreferredLanguage,
        preferredCurrency,
        setPreferredCurrency,
        numberFormat,
        setNumberFormat,
        preferredExplorer,
        setPreferredExplorer,
        explorerOptions,
        availableLanguages,
        availableCurrencies,
        isCustomSlippage,
        setIsCustomSlippage,
        rawCustomSlippageInput,
        setRawCustomSlippageInput
    }), [
        feeLevel, maxPriorityFeeCapSol, priorityFee, dynamicFees, slippageBps, rpcEndpoint, // Added priorityFee to dependencies
        isSettingsModalOpen, isSettingsDirty, isAlertModalOpen, alertModalMessage,
        preferredLanguage, preferredCurrency, numberFormat, preferredExplorer, 
        explorerOptions, availableLanguages, availableCurrencies, 
        setFeeLevel, setMaxPriorityFeeCapSol, fetchDynamicFees, setSlippageBps, 
        setRpcEndpoint, setIsSettingsDirty,
        openSettingsModal, closeSettingsModal, openAlertModal, closeAlertModal,
        setPreferredLanguage, setPreferredCurrency, setNumberFormat, setPreferredExplorer,
        isCustomSlippage, rawCustomSlippageInput
    ]);

    return (
        <SettingsContext.Provider value={contextValue}>
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