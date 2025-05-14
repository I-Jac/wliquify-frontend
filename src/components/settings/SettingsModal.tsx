'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel, InitialSettings } from '@/utils/core/types';
import {
    PREDEFINED_SLIPPAGE_OPTIONS,
    PREDEFINED_RPCS
} from '@/utils/core/constants';
import { useConnection } from '@solana/wallet-adapter-react';
import { ProfileSettingsTab } from './tabs/ProfileSettingsTab';
import { ConnectionSettingsTab } from './tabs/ConnectionSettingsTab';
import { TransactionSettingsTab } from './tabs/TransactionSettingsTab';

interface SettingsModalProps {
    closePanel?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ closePanel }) => {
    const { t } = useTranslation();

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
        preferredExplorer: contextPreferredExplorer,
        setPreferredExplorer: setContextPreferredExplorer,
        explorerOptions,
        availableLanguages
        // availableCurrencies
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
    const [localPreferredExplorer, setLocalPreferredExplorer] = useState(contextPreferredExplorer);

    // Other states (active tab, mounted ref)
    type ActiveTabType = 'profile' | 'connection' | 'transaction';
    const [activeTab, setActiveTab] = useState<ActiveTabType>('profile');
    const componentIsMountedRef = useRef(true);
    const initialSettingsRef = useRef<InitialSettings | null>(null);

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
        const explorerChanged = localPreferredExplorer !== initialSettingsRef.current.preferredExplorer;
        
        const dirty = feeLevelChanged || maxPriorityFeeCapSolChanged || slippageDirty || rpcChanged ||
                      languageChanged || explorerChanged;
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
        localPreferredExplorer,
        setIsSettingsDirty, 
        isSettingsDirty // Include isSettingsDirty to prevent unnecessary calls to setIsSettingsDirty
        // initialSettingsRef.current changes should not trigger this effect directly.
    ]);

    // Ping effect & Fetch dynamic fees effect
    useEffect(() => {
        // Ping logic moved to ConnectionSettingsTab.tsx
        // Fetch dynamic fees logic can remain if it's general or move if specific to transaction tab

        // const clearExistingInterval = () => { ... }; // Removed
        // const performPing = async (url: string) => { ... }; // Removed
        // const pingAllRelevantRpcs = () => { ... }; // Removed

        // if (isSettingsModalOpen && activeTab === 'connection') { ... } // Removed
        // else if (isSettingsModalOpen && activeTab === 'profile') { ... } // Removed
        // else { ... } // Removed

        // return () => { // Removed
        //    clearExistingInterval(); // Removed
        // }; // Removed
    }, [isSettingsModalOpen, activeTab]); // Simplified dependencies

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
            openAlertModal(t('alertModal.invalidSlippageAlert'));
            return false; 
        }

        // Validate and set Max Priority Fee Cap
        if (isNaN(maxPriorityFeeCapSolNum) || maxPriorityFeeCapSolNum < 0) {
            openAlertModal(t('alertModal.invalidMaxCapAlert'));
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
                openAlertModal(t('alertModal.invalidCustomRpcAlert'));
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
            openAlertModal(t('alertModal.rpcUpdateAlert'));
        }
        
        // Save Profile Settings to context
        setContextPreferredLanguage(localPreferredLanguage);
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
            openAlertModal(t('alertModal.unsavedChangesAlert'));
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
    
    // const handlePredefinedSlippageClick = (bpsValue: number) => { ... }; // Moved to TransactionSettingsTab

    // const handleCustomSlippageInputFocus = () => { ... }; // Moved to TransactionSettingsTab

    // const handleCustomSlippageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { ... }; // Moved to TransactionSettingsTab

    return (
        <Fragment>
            <div id="settings-modal-container">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">{t('header.settings.title')}</h2>
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
                        {t('header.settings.profileTab')}
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
                        {t('header.settings.connectionTab')}
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
                        {t('header.settings.transactionTab')}
                    </button>
                </div>

                <div className="space-y-5 min-h-[250px]">
                    {activeTab === 'profile' && (
                        <ProfileSettingsTab
                            localPreferredLanguage={localPreferredLanguage}
                            setLocalPreferredLanguage={setLocalPreferredLanguage}
                            localPreferredExplorer={localPreferredExplorer}
                            setLocalPreferredExplorer={setLocalPreferredExplorer}
                            explorerOptions={explorerOptions}
                            availableLanguages={availableLanguages}
                        />
                    )}
                    {activeTab === 'connection' && (
                        <ConnectionSettingsTab
                            localSelectedRpcUrl={localSelectedRpcUrl}
                            setLocalSelectedRpcUrl={setLocalSelectedRpcUrl}
                            localIsCustomRpc={localIsCustomRpc}
                            setLocalIsCustomRpc={setLocalIsCustomRpc}
                            localCustomRpcInputValue={localCustomRpcInputValue}
                            setLocalCustomRpcInputValue={setLocalCustomRpcInputValue}
                            isSettingsModalOpen={isSettingsModalOpen} // Pass this to control pinging within the tab
                        />
                    )}
                    {activeTab === 'transaction' && (
                        <TransactionSettingsTab
                            localFeeLevel={localFeeLevel}
                            setLocalFeeLevel={setLocalFeeLevel}
                            dynamicFees={dynamicFees} // Pass dynamicFees from context
                            localMaxPriorityFeeCapSol={localMaxPriorityFeeCapSol}
                            setLocalMaxPriorityFeeCapSol={setLocalMaxPriorityFeeCapSol}
                            localSlippageBps={localSlippageBps}
                            setLocalSlippageBps={setLocalSlippageBps}
                            localSlippageInput={localSlippageInput}
                            setLocalSlippageInput={setLocalSlippageInput}
                            localIsCustomSlippageActive={localIsCustomSlippageActive}
                            setLocalIsCustomSlippageActive={setLocalIsCustomSlippageActive}
                        />
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleMainButtonClick}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500"
                    >
                        {isSettingsDirty ? t('header.settings.saveChanges') : t('global.close')}
                    </button>
                </div>
            </div>
        </Fragment>
    );
}; 