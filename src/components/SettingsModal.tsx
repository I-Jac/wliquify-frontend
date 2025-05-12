'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel, InitialSettings, NumberFormatSettings } from '@/utils/types';
import {
    PREDEFINED_SLIPPAGE_OPTIONS,
    PREDEFINED_RPCS
} from '@/utils/constants';
import { useConnection } from '@solana/wallet-adapter-react';
import { getRpcLatency } from '@/utils/networkUtils';

interface SettingsModalProps {
    closePanel?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ closePanel }) => {
    const { t, i18n } = useTranslation();

    const {
        closeSettingsModal,
        feeLevel: contextFeeLevel,
        setFeeLevel: setContextFeeLevel,
        maxPriorityFeeCapSol: contextMaxPriorityFeeCapSol,
        setMaxPriorityFeeCapSol: setContextMaxPriorityFeeCapSol,
        dynamicFees,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        fetchDynamicFees: _fetchDynamicFees,
        slippageBps: contextSlippageBps,
        setSlippageBps: setContextSlippageBps,
        rpcEndpoint: contextRpcEndpoint,
        setRpcEndpoint: setContextRpcEndpoint,
        isSettingsDirty,
        setIsSettingsDirty,
        openAlertModal,
        isSettingsModalOpen,
        // Profile settings from context
        preferredLanguage: contextPreferredLanguage,
        setPreferredLanguage: setContextPreferredLanguage,
        preferredCurrency: contextPreferredCurrency,
        setPreferredCurrency: setContextPreferredCurrency,
        numberFormat: contextNumberFormat,
        setNumberFormat: setContextNumberFormat,
        preferredExplorer: contextPreferredExplorer,
        setPreferredExplorer: setContextPreferredExplorer,
        explorerOptions,
        availableLanguages,
        availableCurrencies
    } = useSettings();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { connection: _connection } = useConnection();

    // Local states for all editable fields
    const [localFeeLevel, setLocalFeeLevel] = useState<FeeLevel>(contextFeeLevel);
    const [localMaxPriorityFeeCapSol, setLocalMaxPriorityFeeCapSol] = useState(contextMaxPriorityFeeCapSol.toString());
    const [localSlippageBps, setLocalSlippageBps] = useState(contextSlippageBps.toString());
    // New state for the custom slippage percentage input string
    const [localSlippageInput, setLocalSlippageInput] = useState((contextSlippageBps / 100).toFixed(2));
    // New state to track if custom slippage is active
    const [localIsCustomSlippageActive, setLocalIsCustomSlippageActive] = useState(false);
    
    const initialContextRpcIsPredefined = PREDEFINED_RPCS.some(r => r.url === contextRpcEndpoint);
    const initialContextRpcIsCustom = !initialContextRpcIsPredefined;
    const [localSelectedRpcUrl, setLocalSelectedRpcUrl] = useState(initialContextRpcIsPredefined ? contextRpcEndpoint : PREDEFINED_RPCS[0]?.url || '');
    const [localIsCustomRpc, setLocalIsCustomRpc] = useState(initialContextRpcIsCustom);
    const [localCustomRpcInputValue, setLocalCustomRpcInputValue] = useState(initialContextRpcIsCustom ? contextRpcEndpoint : 'https://');
    
    // Local state for Profile settings (for dirty checking and saving)
    const [localPreferredLanguage, setLocalPreferredLanguage] = useState(contextPreferredLanguage);
    const [localPreferredCurrency, setLocalPreferredCurrency] = useState(contextPreferredCurrency);
    const [localNumberFormat, setLocalNumberFormat] = useState<NumberFormatSettings>(contextNumberFormat);
    const [localPreferredExplorer, setLocalPreferredExplorer] = useState(contextPreferredExplorer);

    // Other states (ping, active tab, mounted ref)
    const [pingTimes, setPingTimes] = useState<{ [url: string]: number | null | 'pinging' }>({});
    type ActiveTabType = 'profile' | 'connection' | 'transaction';
    const [activeTab, setActiveTab] = useState<ActiveTabType>('profile');
    const componentIsMountedRef = useRef(true);
    const initialSettingsRef = useRef<InitialSettings | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID

    // Effect to initialize/reset local states and initialSettingsRef ONCE on MOUNT
    // or when the modal is effectively re-initialized (e.g. by closing and reopening)
    useEffect(() => {
        // Only re-initialize fully if isSettingsModalOpen is true AND initialSettingsRef is not yet set.
        // This means subsequent changes to context values while the modal is open won't cause a full reset.
        // A more robust solution might track the previous value of isSettingsModalOpen.
        if (isSettingsModalOpen && !initialSettingsRef.current) {
            console.log("[InitializationEffect] Running FULL initialization because modal is open and initialSettingsRef is null.");
            // Capture initial settings from context when component mounts
            const currentInitialRpcIsPredefined = PREDEFINED_RPCS.some(r => r.url === contextRpcEndpoint);
            const currentInitialRpcIsCustomDerived = !currentInitialRpcIsPredefined; // Derived value

            // Determine initial slippage mode and input value
            const matchingPredefinedSlippage = PREDEFINED_SLIPPAGE_OPTIONS.find(o => o.bps === contextSlippageBps);
            let initialIsCustomSlippage: boolean;
            let initialSlippageInputValue: string;

            if (matchingPredefinedSlippage) {
                initialIsCustomSlippage = false;
                initialSlippageInputValue = ""; // Clear input if a predefined is active from context
            } else {
                initialIsCustomSlippage = true;
                initialSlippageInputValue = (contextSlippageBps / 100).toFixed(2);
            }

            // First, set initialSettingsRef.current with values derived from context
            initialSettingsRef.current = {
                feeLevel: contextFeeLevel,
                maxPriorityFeeCapSol: contextMaxPriorityFeeCapSol,
                slippageBps: contextSlippageBps,
                selectedRpcUrl: currentInitialRpcIsPredefined ? contextRpcEndpoint : (PREDEFINED_RPCS[0]?.url || ''),
                isCustomRpc: currentInitialRpcIsCustomDerived,
                customRpcInputValue: currentInitialRpcIsCustomDerived ? contextRpcEndpoint : 'https://',
                isCustomSlippage: initialIsCustomSlippage,
                // Add profile settings to initial ref from context
                preferredLanguage: contextPreferredLanguage,
                preferredCurrency: contextPreferredCurrency,
                numberFormat: contextNumberFormat, // Deep copy might be better if object is complex, but context should provide new obj on change
                preferredExplorer: contextPreferredExplorer,
            };
            console.log("[InitializationEffect] Set initialSettingsRef.current:", initialSettingsRef.current);

            // Then, set local states based on context (or derived values for RPC)
            setLocalFeeLevel(contextFeeLevel);
            setLocalMaxPriorityFeeCapSol(contextMaxPriorityFeeCapSol.toString());
            setLocalSlippageBps(contextSlippageBps.toString());
            
            setLocalIsCustomSlippageActive(initialIsCustomSlippage); 
            setLocalSlippageInput(initialSlippageInputValue);

            // Set local RPC states directly from derived context values
            setLocalSelectedRpcUrl(currentInitialRpcIsPredefined ? contextRpcEndpoint : (PREDEFINED_RPCS[0]?.url || ''));
            setLocalIsCustomRpc(currentInitialRpcIsCustomDerived);
            setLocalCustomRpcInputValue(currentInitialRpcIsCustomDerived ? contextRpcEndpoint : 'https://');

            // Set local Profile states from context
            setLocalPreferredLanguage(contextPreferredLanguage);
            setLocalPreferredCurrency(contextPreferredCurrency);
            setLocalNumberFormat(contextNumberFormat);
            setLocalPreferredExplorer(contextPreferredExplorer);
            
            setIsSettingsDirty(false); // Initially, form is not dirty
        } else if (!isSettingsModalOpen && initialSettingsRef.current) {
            // If modal is closing, clear the initialSettingsRef so it re-initializes next time it opens.
            console.log("[InitializationEffect] Modal closed. Clearing initialSettingsRef.current.");
            initialSettingsRef.current = null;
            // Optionally, also reset isSettingsDirty if it shouldn't persist after closing
            // setIsSettingsDirty(false); // Uncomment if dirty state should reset on close regardless
        }
    }, [
        isSettingsModalOpen,
        contextFeeLevel,
        contextMaxPriorityFeeCapSol,
        contextSlippageBps,
        contextRpcEndpoint,
        setIsSettingsDirty,
        contextPreferredLanguage,
        contextPreferredCurrency,
        contextNumberFormat,
        contextPreferredExplorer
    ]);

    // ComponentDidMount/Unmount for componentIsMountedRef
    useEffect(() => {
        componentIsMountedRef.current = true;
        return () => {
            componentIsMountedRef.current = false;
        };
    }, []);

    // Effect to check for changes and update isSettingsDirty
    useEffect(() => {
        console.log("[DirtyCheckEffect] Running. Local states before check:", {
            localFeeLevel,
            localMaxPriorityFeeCapSol,
            localSlippageBps,
            localSelectedRpcUrl,
            localIsCustomRpc,
            localCustomRpcInputValue,
            localIsCustomSlippageActive,
            // Include local profile states in log
            localPreferredLanguage,
            localPreferredCurrency,
            localNumberFormat,
            localPreferredExplorer,
            initialSettings: initialSettingsRef.current // Also log what it's comparing against
        });

        if (!initialSettingsRef.current) {
            // This can happen if this effect runs before the initialization effect.
            // To be safe, only proceed if initial settings are captured.
            return;
        }

        const parsedLocalSlippage = parseInt(localSlippageBps, 10);
        const parsedLocalMaxPriorityFeeCapSol = parseFloat(localMaxPriorityFeeCapSol);

        const feeLevelChanged = localFeeLevel !== initialSettingsRef.current.feeLevel;
        const maxPriorityFeeCapSolChanged = (isNaN(parsedLocalMaxPriorityFeeCapSol) || parsedLocalMaxPriorityFeeCapSol < 0 ? -1 : parsedLocalMaxPriorityFeeCapSol) !== initialSettingsRef.current.maxPriorityFeeCapSol;
        
        // Slippage dirty check
        const currentSlippageBpsValue = (isNaN(parsedLocalSlippage) || parsedLocalSlippage < 0 ? -1 : parsedLocalSlippage);
        const slippageBpsValueChanged = currentSlippageBpsValue !== initialSettingsRef.current.slippageBps;
        const slippageModeChanged = localIsCustomSlippageActive !== initialSettingsRef.current.isCustomSlippage;
        const slippageDirty = slippageBpsValueChanged || slippageModeChanged;
        
        let rpcChanged = false;
        if (localIsCustomRpc) {
            rpcChanged = initialSettingsRef.current.isCustomRpc !== true || 
                         localCustomRpcInputValue !== initialSettingsRef.current.customRpcInputValue;
        } else {
            rpcChanged = initialSettingsRef.current.isCustomRpc !== false ||
                         localSelectedRpcUrl !== initialSettingsRef.current.selectedRpcUrl;
        }
        
        // Profile settings dirty check
        const languageChanged = localPreferredLanguage !== initialSettingsRef.current.preferredLanguage;
        const currencyChanged = localPreferredCurrency !== initialSettingsRef.current.preferredCurrency;
        const numberFormatChanged = JSON.stringify(localNumberFormat) !== JSON.stringify(initialSettingsRef.current.numberFormat);
        const explorerChanged = localPreferredExplorer !== initialSettingsRef.current.preferredExplorer;
        
        const dirty = feeLevelChanged || maxPriorityFeeCapSolChanged || slippageDirty || rpcChanged ||
                      languageChanged || currencyChanged || numberFormatChanged || explorerChanged;
        if (isSettingsDirty !== dirty) { // Only update if the dirty state actually changes
           setIsSettingsDirty(dirty);
        }
    }, [
        localFeeLevel, 
        localMaxPriorityFeeCapSol,
        localSlippageBps, 
        localSelectedRpcUrl, 
        localIsCustomRpc, 
        localCustomRpcInputValue, 
        localIsCustomSlippageActive,
        // Add local profile states to dependency array
        localPreferredLanguage,
        localPreferredCurrency,
        localNumberFormat,
        localPreferredExplorer,
        setIsSettingsDirty, 
        isSettingsDirty // Include isSettingsDirty to prevent unnecessary calls to setIsSettingsDirty
        // initialSettingsRef.current changes should not trigger this effect directly.
    ]);

    // Ping effect & Fetch dynamic fees effect
    useEffect(() => {
        const clearExistingInterval = () => {
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
        };

        const performPing = async (url: string) => {
            if (!url || !url.startsWith('http')) { // Basic validation
                if (componentIsMountedRef.current) {
                    setPingTimes(prev => ({ ...prev, [url]: null }));
                }
                return;
            }
            if (componentIsMountedRef.current) {
                setPingTimes(prev => ({ ...prev, [url]: 'pinging' }));
            }
            try {
                const latency = await getRpcLatency(url);
                if (componentIsMountedRef.current) {
                    setPingTimes(prev => ({ ...prev, [url]: latency }));
                }
            } catch (error) {
                console.error(`Error pinging ${url}:`, error);
                if (componentIsMountedRef.current) {
                    setPingTimes(prev => ({ ...prev, [url]: null }));
                }
            }
        };

        const pingAllRelevantRpcs = () => {
            if (!componentIsMountedRef.current) return;

            PREDEFINED_RPCS.forEach((rpc) => {
                // Only start a new ping if not already pinging or successfully pinged recently (to avoid spamming on interval)
                // For simplicity in this interval, let's just re-ping.
                // A more complex logic could avoid re-pinging if a successful ping was recent.
                performPing(rpc.url);
            });

            if (localIsCustomRpc && localCustomRpcInputValue) {
                performPing(localCustomRpcInputValue);
            }
        };

        if (isSettingsModalOpen && activeTab === 'connection') {
            clearExistingInterval(); // Clear previous interval if any
            pingAllRelevantRpcs(); // Initial ping when tab/modal becomes active
            pingIntervalRef.current = setInterval(pingAllRelevantRpcs, 5000); // Ping every 5 seconds
        } else if (isSettingsModalOpen && activeTab === 'profile') {
            // No pinging needed for profile tab, clear interval if it was running
            clearExistingInterval();
        } else {
            clearExistingInterval(); // Clear interval if modal is closed or not on connection/profile tab
        }

        // Cleanup on component unmount or when dependencies change triggering effect re-run
        return () => {
            clearExistingInterval();
        };
    }, [isSettingsModalOpen, activeTab, localIsCustomRpc, localCustomRpcInputValue]); // Add localIsCustomRpc and localCustomRpcInputValue

    const performSave = () => {
        console.log("[PerformSave] Starting. Local states:", {
            localFeeLevel,
            localMaxPriorityFeeCapSol,
            localSlippageBps,
            localSelectedRpcUrl,
            localIsCustomRpc,
            localCustomRpcInputValue,
            localIsCustomSlippageActive,
            // Add local profile states to log
            localPreferredLanguage,
            localPreferredCurrency,
            localNumberFormat,
            localPreferredExplorer,
        });

        const slippageNum = parseInt(localSlippageBps, 10);
        const maxPriorityFeeCapSolNum = parseFloat(localMaxPriorityFeeCapSol);

        // Validate and set Fee Level
        console.log("[PerformSave] Setting Fee Level to context:", localFeeLevel);
        setContextFeeLevel(localFeeLevel);

        // Validate and set Slippage
        if (!isNaN(slippageNum) && slippageNum >= 0) {
            console.log("[PerformSave] Setting SlippageBps to context:", slippageNum);
            setContextSlippageBps(slippageNum);
        } else {
            openAlertModal(t('notifications.invalidSlippageAlert'));
            return false; 
        }

        // Validate and set Max Priority Fee Cap
        if (isNaN(maxPriorityFeeCapSolNum) || maxPriorityFeeCapSolNum < 0) {
            openAlertModal(t('notifications.invalidMaxCapAlert'));
            return false;
        }
        console.log("[PerformSave] Setting MaxPriorityFeeCapSol to context:", maxPriorityFeeCapSolNum);
        setContextMaxPriorityFeeCapSol(maxPriorityFeeCapSolNum); 

        // Validate and set RPC Endpoint
        let finalRpcToSave = '';
        if (localIsCustomRpc) {
            if (localCustomRpcInputValue.trim() && localCustomRpcInputValue.trim() !== 'https://') {
                finalRpcToSave = localCustomRpcInputValue.trim();
            } else {
                openAlertModal(t('notifications.invalidCustomRpcAlert'));
                return false;
            }
        } else {
            finalRpcToSave = localSelectedRpcUrl;
        }
        
        // Determine initial effective RPC URL for comparison
        let initialEffectiveRpcUrl = '';
        if (initialSettingsRef.current) { 
            if (initialSettingsRef.current.isCustomRpc) {
                initialEffectiveRpcUrl = initialSettingsRef.current.customRpcInputValue;
            } else {
                initialEffectiveRpcUrl = initialSettingsRef.current.selectedRpcUrl;
            }
        }
        
        // ADD DIAGNOSTIC LOGGING HERE
        console.log("[PerformSave RPC Check]", {
            finalRpcToSave,
            initialEffectiveRpcUrl,
            isCustomRpcInInitialRef: initialSettingsRef.current?.isCustomRpc,
            customRpcInInitialRef: initialSettingsRef.current?.customRpcInputValue,
            selectedRpcInInitialRef: initialSettingsRef.current?.selectedRpcUrl,
            localIsCustomRpc_atSaveTime: localIsCustomRpc,
            localCustomRpcInputValue_atSaveTime: localCustomRpcInputValue,
            localSelectedRpcUrl_atSaveTime: localSelectedRpcUrl
        });
        const rpcHasChanged = finalRpcToSave !== initialEffectiveRpcUrl;

        // Apply all settings to context
        // Non-RPC settings are applied first
        // setContextFeeLevel(localFeeLevel); // Already set above
        // setContextMaxPriorityFeeCapSol(maxPriorityFeeCapSolNum); // Already set above
        // setContextSlippageBps(slippageNum); // Already set above
        
        // Conditionally update RPC context and show alert
        if (rpcHasChanged) {
            console.log("[PerformSave] Setting RPC Endpoint to context:", finalRpcToSave);
            setContextRpcEndpoint(finalRpcToSave);
            openAlertModal(t('notifications.rpcUpdateAlert'));
        }
        
        // Save Profile Settings to context
        setContextPreferredLanguage(localPreferredLanguage);
        setContextPreferredCurrency(localPreferredCurrency);
        setContextNumberFormat(localNumberFormat);
        setContextPreferredExplorer(localPreferredExplorer);
        
        // After successful context updates, update initialSettingsRef to reflect the new "saved" state
        if (initialSettingsRef.current) { 
            initialSettingsRef.current = {
                feeLevel: localFeeLevel,
                maxPriorityFeeCapSol: maxPriorityFeeCapSolNum,
                slippageBps: slippageNum, 
                selectedRpcUrl: !localIsCustomRpc ? finalRpcToSave : (PREDEFINED_RPCS[0]?.url || ''),
                isCustomRpc: localIsCustomRpc,
                customRpcInputValue: localIsCustomRpc ? finalRpcToSave : 'https://',
                isCustomSlippage: localIsCustomSlippageActive,
                // Update initialSettingsRef with saved profile settings
                preferredLanguage: localPreferredLanguage,
                preferredCurrency: localPreferredCurrency,
                numberFormat: localNumberFormat, // Store the saved object
                preferredExplorer: localPreferredExplorer,
            };
            console.log("[PerformSave] Updated initialSettingsRef.current:", initialSettingsRef.current);
        }
        setIsSettingsDirty(false); // Mark as not dirty
        return true; // Indicate save was successful
    };

    const handleTabChange = (tab: ActiveTabType) => {
        if (tab === activeTab) {
            // If clicking the already active tab, do nothing.
            return;
        }

        if (isSettingsDirty) {
            openAlertModal(t('notifications.unsavedChangesAlert'));
            return; // Prevent switching if dirty and clicking a different tab
        }
        setActiveTab(tab); // Only switch if not dirty or clicking the same tab (which is handled above)
    };

    const handleMainButtonClick = () => {
        if (isSettingsDirty) {
            const savedSuccessfully = performSave(); // This sets isSettingsDirty to false in context
            if (savedSuccessfully) {
                console.log("[SettingsModal ButtonClick] Save successful. Popover remains open.");
            }
        } else {
            // This is the "Close" button click (when settings are not dirty)
            console.log("[SettingsModal ButtonClick] 'Close' button clicked.");
            if (closePanel) {
                console.log("[SettingsModal ButtonClick] Calling closePanel() for HUI.");
                closePanel(); // Tell HUI to close its internal state
            }
            console.log("[SettingsModal ButtonClick] Directly calling closeSettingsModal() for context.");
            closeSettingsModal(); // Directly close our context state
        }
    };
    
    const handleLocalRpcSelection = (url: string) => {
        console.log("[handleLocalRpcSelection] Called with URL:", url);
        setLocalSelectedRpcUrl(url);
        setLocalIsCustomRpc(false);
        if (!localCustomRpcInputValue || localCustomRpcInputValue === 'https://') {
            setLocalCustomRpcInputValue('https://');
        }
    };

    const handleLocalCustomRpcSelect = () => {
        console.log("[handleLocalCustomRpcSelect] Called");
        setLocalIsCustomRpc(true);
    };

    const handlePredefinedSlippageClick = (bpsValue: number) => {
        console.log("[handlePredefinedSlippageClick] Called with BPS:", bpsValue);
        setLocalSlippageBps(bpsValue.toString());
        setLocalSlippageInput(""); // Clear input when predefined is clicked
        setLocalIsCustomSlippageActive(false); // Set mode to predefined
    };

    const handleCustomSlippageInputFocus = () => {
        console.log("[handleCustomSlippageInputFocus] Called");
        setLocalIsCustomSlippageActive(true);
        // If the input is empty when focused, and we have a valid non-custom BPS,
        // we could pre-fill it. However, Jupiter's behavior is to keep it empty
        // or retain the previous custom value, letting the user type afresh.
        // So, no explicit pre-fill here on focus based on current localSlippageBps.
        // If localSlippageInput already has a value (from previous custom input), it will be retained.
    };

    const handleCustomSlippageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log("[handleCustomSlippageInputChange] Called with value:", e.target.value);
        setLocalIsCustomSlippageActive(true); // Ensure custom mode is active when typing
        const inputValue = e.target.value;
        setLocalSlippageInput(inputValue);
        // Allow empty input or valid float, then convert to BPS
        if (inputValue.trim() === '' || isNaN(parseFloat(inputValue))) {
            // If input is empty or not a number, maybe set BPS to a default or invalid marker, or just wait for valid input
            // For now, let's only update BPS if it's a valid number to avoid errors during parsing in performSave
            // Or, we could set localSlippageBps to an empty string or a specific invalid marker if needed for validation display
        } else {
            const percentage = parseFloat(inputValue);
            if (!isNaN(percentage) && percentage >= 0) {
                setLocalSlippageBps(Math.round(percentage * 100).toString()); // Convert % to BPS
            }
        }
    };

    return (
        <Fragment>
            <div id="settings-modal-container">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">{t('settings.title')}</h2>
                    {/* <button 
                        onClick={handleXCloseButtonClick} 
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        &times;
                    </button> */}
                </div>

                <div className="flex mb-4 border-b border-gray-700">
                    <button
                        className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors
                            ${activeTab === 'profile'
                                ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                                : isSettingsDirty 
                                    ? 'text-gray-500 hover:text-gray-400'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                            }`}
                        onClick={() => handleTabChange('profile')}
                    >
                        {t('settings.profileTab')}
                    </button>
                    <button
                        className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors
                            ${activeTab === 'connection'
                                ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                                : isSettingsDirty 
                                    ? 'text-gray-500 hover:text-gray-400'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                            }`}
                        onClick={() => handleTabChange('connection')}
                    >
                        {t('settings.connectionTab')}
                    </button>
                    <button
                        className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors
                            ${activeTab === 'transaction'
                                ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                                : isSettingsDirty 
                                    ? 'text-gray-500 hover:text-gray-400'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                            }`}
                        onClick={() => handleTabChange('transaction')}
                    >
                        {t('settings.transactionTab')}
                    </button>
                </div>

                <div className="space-y-5 min-h-[250px]">
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            {/* Language Setting */}
                            <div>
                                <label htmlFor="language-select" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.languageLabel')}</label>
                                <select 
                                    id="language-select"
                                    value={localPreferredLanguage}
                                    onChange={(e) => setLocalPreferredLanguage(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                                >
                                    {availableLanguages.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Preferred Currency Setting */}
                            <div>
                                <label htmlFor="currency-select" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.preferredCurrencyLabel')}</label>
                                <select 
                                    id="currency-select"
                                    value={localPreferredCurrency}
                                    onChange={(e) => setLocalPreferredCurrency(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                                >
                                    {availableCurrencies.map(curr => (
                                        <option key={curr.code} value={curr.code}>{curr.name} ({curr.symbol})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Number Format Setting */}
                            <div className="space-y-3">
                                <p className="block text-sm font-medium text-gray-300">{t('settings.numberFormatting')}</p>
                                <div className="flex items-center space-x-4">
                                    <div>
                                        <label htmlFor="decimal-separator" className="block text-xs text-gray-400 mb-1">{t('settings.decimalSeparatorLabel')}</label>
                                        <select 
                                            id="decimal-separator"
                                            value={localNumberFormat.decimalSeparator}
                                            onChange={(e) => setLocalNumberFormat({ ...localNumberFormat, decimalSeparator: e.target.value as '.' | ',' })}
                                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                                        >
                                            <option value=".">{t('settings.dotOption')}</option>
                                            <option value=",">{t('settings.commaOption')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="thousand-separator" className="block text-xs text-gray-400 mb-1">{t('settings.thousandSeparatorLabel')}</label>
                                        <select 
                                            id="thousand-separator"
                                            value={localNumberFormat.thousandSeparator}
                                            onChange={(e) => setLocalNumberFormat({ ...localNumberFormat, thousandSeparator: e.target.value as ',' | '.' | ' ' | '' })}
                                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                                        >
                                            <option value=",">{t('settings.commaOption')}</option>
                                            <option value=".">{t('settings.dotOption')}</option>
                                            <option value=" ">{t('settings.spaceOption')}</option>
                                            <option value="">{t('settings.noneOption')}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Preferred Explorer Setting */}
                            <div>
                                <label htmlFor="explorer-select" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.preferredExplorerLabel')}</label>
                                <select 
                                    id="explorer-select"
                                    value={localPreferredExplorer}
                                    onChange={(e) => setLocalPreferredExplorer(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                                >
                                    {Object.values(explorerOptions).map(explorer => (
                                        <option key={explorer.name} value={explorer.name}>{explorer.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                    {activeTab === 'connection' && (
                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-gray-200">{t('settings.customRpcUrl')}</p>
                            {PREDEFINED_RPCS.map((rpc) => (
                                <label key={rpc.url} className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-gray-700/50">
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="radio"
                                            name="rpcEndpoint"
                                            value={rpc.url}
                                            checked={!localIsCustomRpc && localSelectedRpcUrl === rpc.url}
                                            onChange={() => handleLocalRpcSelection(rpc.url)}
                                            className="form-radio h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500"
                                        />
                                        <span className="text-sm text-gray-300">{rpc.name}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 w-20 text-right">
                                        {pingTimes[rpc.url] === 'pinging' && <span className="animate-pulse">{t('settings.pinging')}</span>}
                                        {typeof pingTimes[rpc.url] === 'number' && (
                                            <span className={
                                                (pingTimes[rpc.url] as number) <= 100 ? 'text-green-400' :
                                                (pingTimes[rpc.url] as number) <= 200 ? 'text-yellow-400' :
                                                'text-red-400'
                                            }>
                                                {pingTimes[rpc.url]}ms
                                            </span>
                                        )}
                                        {pingTimes[rpc.url] === null && <span className="text-red-400">{t('global.error')}</span>}
                                    </div>
                                </label>
                            ))}
                            <label className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-gray-700/50">
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        name="rpcEndpoint"
                                        value="custom"
                                        checked={localIsCustomRpc}
                                        onChange={handleLocalCustomRpcSelect}
                                        className="form-radio h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500"
                                    />
                                    <span className="text-sm text-gray-300">{t('settings.customRpcUrl')}</span>
                                </div>
                                {localIsCustomRpc && pingTimes[localCustomRpcInputValue] !== undefined && (
                                    <div className="text-xs text-gray-400 w-20 text-right">
                                        {pingTimes[localCustomRpcInputValue] === 'pinging' && <span className="animate-pulse">{t('settings.pinging')}</span>}
                                        {typeof pingTimes[localCustomRpcInputValue] === 'number' && (
                                            <span className={
                                                (pingTimes[localCustomRpcInputValue] as number) <= 100 ? 'text-green-400' :
                                                (pingTimes[localCustomRpcInputValue] as number) <= 200 ? 'text-yellow-400' :
                                                'text-red-400'
                                            }>
                                                {pingTimes[localCustomRpcInputValue]}ms
                                            </span>
                                        )}
                                        {pingTimes[localCustomRpcInputValue] === null && <span className="text-red-400">{t('global.error')}</span>}
                                    </div>
                                )}
                            </label>
                            {localIsCustomRpc && (
                                <div className="pl-8 mt-2 space-y-2">
                                    <input
                                        type="text"
                                        id="customRpcEndpointInput"
                                        value={localCustomRpcInputValue}
                                        onChange={(e) => {
                                            console.log("[CustomRPCInput] Changed. Setting localCustomRpcInputValue to:", e.target.value);
                                            setLocalCustomRpcInputValue(e.target.value)
                                        }}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                                        placeholder={t('settings.enterCustomRpcUrl')}
                                    />
                                    <p className="text-xs text-gray-400">{t('settings.enterCustomRpcUrl')}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'transaction' && (
                        <>
                            <div className="space-y-4 mb-6 p-4 border border-gray-700 rounded-md">
                                <div>
                                    <label htmlFor="priorityFee" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.priorityFeeLabel')}</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['Normal', 'Fast', 'Turbo'] as FeeLevel[]).map((level) => {
                                            const feeInSol = dynamicFees[level as Exclude<FeeLevel, 'Custom'>];
                                            const translatedLevel = t(`settings.feeLevel${level}`);
                                            
                                            const isSelected = localFeeLevel === level;
                                            const maxCapNum = parseFloat(localMaxPriorityFeeCapSol);
                                            let isCappedAndSelected = false;

                                            if (isSelected && feeInSol !== undefined && !isNaN(maxCapNum) && maxCapNum >= 0 && feeInSol > maxCapNum) {
                                                isCappedAndSelected = true;
                                            }

                                            let finalTooltipContent = '';
                                            if (isCappedAndSelected) {
                                                finalTooltipContent = t('settings.feeLevelTooltipCappedInSettings', {
                                                    feeLevel: translatedLevel,
                                                    maxCapValue: maxCapNum.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 9 })
                                                });
                                            } else if (feeInSol !== undefined) {
                                                finalTooltipContent = t('settings.feeLevelTooltip', {
                                                    feeLevel: translatedLevel,
                                                    value: feeInSol.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 9 })
                                                });
                                            } else {
                                                finalTooltipContent = translatedLevel; // Fallback if feeInSol is undefined
                                            }

                                            return (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setLocalFeeLevel(level)}
                                                    className={`py-2 px-3 text-xs sm:text-sm rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 flex flex-col items-center justify-center
                                                        ${localFeeLevel === level ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}
                                                    `}
                                                    data-tooltip-id="app-tooltip"
                                                    data-tooltip-content={finalTooltipContent}
                                                >
                                                    <span>{translatedLevel}</span>
                                                    {feeInSol !== undefined && (
                                                        <span className={`text-xs mt-0.5 ${isCappedAndSelected ? 'text-red-400 font-semibold' : 'opacity-80'}`}>
                                                            {t('header.approximateFee', { value: feeInSol.toLocaleString(i18n.language, { minimumFractionDigits: 6, maximumFractionDigits: 9 }) })}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                <div>
                                    <label htmlFor="maxPriorityFeeCapSol" className="block text-sm font-medium text-gray-300 mb-1">
                                        {t('settings.maxCapLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        id="maxPriorityFeeCapSol"
                                        min="0"
                                        step="0.0001"
                                        value={localMaxPriorityFeeCapSol}
                                        onChange={(e) => {
                                            console.log("[MaxCapInput] Changed. Setting localMaxPriorityFeeCapSol to:", e.target.value);
                                            setLocalMaxPriorityFeeCapSol(e.target.value);
                                        }}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                                        placeholder={t('settings.enterMaxCapPlaceholder')}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">{t('settings.maxCapDescription')}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-2 p-4 border border-gray-700 rounded-md">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('settings.slippageTolerance')}</label>
                                    <div className="flex items-center space-x-2 mb-2">
                                        {PREDEFINED_SLIPPAGE_OPTIONS.map((option) => (
                                            <button
                                                key={option.bps}
                                                type="button"
                                                onClick={() => handlePredefinedSlippageClick(option.bps)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-medium border
                                                    ${!localIsCustomSlippageActive && parseInt(localSlippageBps, 10) === option.bps
                                                        ? 'bg-cyan-600 border-cyan-500 text-white' 
                                                        : 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300'
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                        <div className={`flex items-center bg-gray-750 border border-gray-600 rounded px-3 ml-2 w-24 
                                            ${localIsCustomSlippageActive ? 'ring-2 ring-cyan-500' : ''}`}
                                        >
                                            <input
                                                type="text" 
                                                inputMode="decimal"
                                                id="customSlippageInput"
                                                value={localSlippageInput}
                                                onFocus={handleCustomSlippageInputFocus}
                                                onChange={handleCustomSlippageInputChange}
                                                className="flex-grow py-1.5 bg-transparent focus:outline-none text-white text-xs w-full text-right pr-1"
                                                placeholder="0.00" 
                                            />
                                            <span className="text-gray-400 text-xs">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleMainButtonClick}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500"
                    >
                        {isSettingsDirty ? t('settings.saveChanges') : t('global.close')}
                    </button>
                </div>
            </div>
        </Fragment>
    );
}; 