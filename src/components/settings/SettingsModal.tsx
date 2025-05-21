'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel, InitialSettings } from '@/utils/core/types';
import {
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
        isCustomSlippage: contextIsCustomSlippage,
        setIsCustomSlippage: setContextIsCustomSlippage,
        rawCustomSlippageInput: contextRawCustomSlippageInput,
        setRawCustomSlippageInput: setContextRawCustomSlippageInput,
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
    // Initialize localSlippageInput and localIsCustomSlippageActive based on context values,
    // the useEffect will refine this based on initialSettingsRef logic.
    const [localSlippageInput, setLocalSlippageInput] = useState(contextIsCustomSlippage ? contextRawCustomSlippageInput : "");
    const [localIsCustomSlippageActive, setLocalIsCustomSlippageActive] = useState(contextIsCustomSlippage);
    
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
        if (isSettingsModalOpen && !initialSettingsRef.current) {
            console.log("[InitializationEffect] Running FULL initialization because modal is open and initialSettingsRef is null.");
            const currentInitialRpcIsPredefined = PREDEFINED_RPCS.some(r => r.url === contextRpcEndpoint);
            const currentInitialRpcIsCustomDerived = !currentInitialRpcIsPredefined;

            // Slippage Initialization - Use direct context values for custom state and raw input
            let initialDisplaySlippageInput = "";
            if (contextIsCustomSlippage) {
                initialDisplaySlippageInput = contextRawCustomSlippageInput || ""; // Use stored raw string from context
            } else {
                // If not custom, input field is typically blank as predefined buttons are used.
                // Alternatively, it could display the percentage of the active predefined BPS.
                // For now, keeping it blank if not custom.
                initialDisplaySlippageInput = "";
            }

            initialSettingsRef.current = {
                feeLevel: contextFeeLevel,
                maxPriorityFeeCapSol: contextMaxPriorityFeeCapSol,
                slippageBps: contextSlippageBps, // Actual BPS value from context
                selectedRpcUrl: currentInitialRpcIsPredefined ? contextRpcEndpoint : (PREDEFINED_RPCS[0]?.url || ''),
                isCustomRpc: currentInitialRpcIsCustomDerived,
                customRpcInputValue: currentInitialRpcIsCustomDerived ? contextRpcEndpoint : 'https://',
                isCustomSlippage: contextIsCustomSlippage, // Directly from context
                rawCustomSlippageInput: contextRawCustomSlippageInput, // Directly from context
                preferredLanguage: contextPreferredLanguage,
                preferredExplorer: contextPreferredExplorer,
            };
            console.log("[InitializationEffect] Set initialSettingsRef.current:", initialSettingsRef.current);

            setLocalFeeLevel(contextFeeLevel);
            setLocalMaxPriorityFeeCapSol(contextMaxPriorityFeeCapSol.toString());
            setLocalSlippageBps(contextSlippageBps.toString());
            setLocalIsCustomSlippageActive(contextIsCustomSlippage); 
            setLocalSlippageInput(initialDisplaySlippageInput); // Use the determined display value

            setLocalSelectedRpcUrl(currentInitialRpcIsPredefined ? contextRpcEndpoint : (PREDEFINED_RPCS[0]?.url || ''));
            setLocalIsCustomRpc(currentInitialRpcIsCustomDerived);
            setLocalCustomRpcInputValue(currentInitialRpcIsCustomDerived ? contextRpcEndpoint : 'https://');

            setLocalPreferredLanguage(contextPreferredLanguage);
            setLocalPreferredExplorer(contextPreferredExplorer);
            
            setIsSettingsDirty(false);
        } else if (!isSettingsModalOpen && initialSettingsRef.current) {
            console.log("[InitializationEffect] Modal closed. Clearing initialSettingsRef.current.");
            initialSettingsRef.current = null;
        }
    }, [
        isSettingsModalOpen,
        contextFeeLevel,
        contextMaxPriorityFeeCapSol,
        contextSlippageBps,
        contextRpcEndpoint,
        setIsSettingsDirty,
        contextPreferredLanguage,
        contextPreferredExplorer,
        contextIsCustomSlippage,
        contextRawCustomSlippageInput
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
            localSlippageBps, // This is the BPS string derived from input or predefined
            localSelectedRpcUrl,
            localIsCustomRpc,
            localCustomRpcInputValue,
            localIsCustomSlippageActive, // Boolean: is custom mode UI active?
            localSlippageInput, // string: the raw text in the custom input field
            localPreferredLanguage,
            localPreferredExplorer,
            initialSettings: initialSettingsRef.current // Log what it's comparing against
        });

        if (!initialSettingsRef.current) {
            // This can happen if this effect runs before the initialization effect.
            // To be safe, only proceed if initial settings are captured.
            return;
        }

        const parsedLocalMaxPriorityFeeCapSol = parseFloat(localMaxPriorityFeeCapSol);

        const feeLevelChanged = localFeeLevel !== initialSettingsRef.current.feeLevel;
        const maxPriorityFeeCapSolChanged = (isNaN(parsedLocalMaxPriorityFeeCapSol) || parsedLocalMaxPriorityFeeCapSol < 0 ? -1 : parsedLocalMaxPriorityFeeCapSol) !== initialSettingsRef.current.maxPriorityFeeCapSol;
        
        // Revised Slippage dirty check
        let slippageDirty = false;
        if (localIsCustomSlippageActive !== initialSettingsRef.current.isCustomSlippage) {
            slippageDirty = true; // Mode itself changed (e.g., predefined to custom, or custom to predefined)
        } else {
            // Mode hasn't changed, check if the relevant value for that mode has changed
            if (localIsCustomSlippageActive) { // If custom mode is active (both now and initially)
                if (localSlippageInput !== initialSettingsRef.current.rawCustomSlippageInput) {
                    slippageDirty = true; // Raw input text changed
                }
                // Also consider if the derived BPS changed, though raw input is primary for custom
                const parsedLocalSlippageBps = parseInt(localSlippageBps, 10);
                const currentLocalSlippageBps = isNaN(parsedLocalSlippageBps) ? -1 : parsedLocalSlippageBps;
                if (currentLocalSlippageBps !== initialSettingsRef.current.slippageBps && !slippageDirty) {
                    // This case might occur if raw input is same but processing changes BPS.
                    // Or if user types "0.5", then types "0.50" - BPS is same, raw input changed (already caught).
                    // If rawInput didn't change, but localSlippageBps (derived) did, it's also dirty.
                    // This primarily ensures that if localSlippageInput didn't make it dirty, but the BPS value *did* (e.g. clearing custom input makes BPS 0), it's caught.
                    slippageDirty = true;
                }

            } else { // If predefined mode is active (both now and initially)
                const parsedLocalSlippageBps = parseInt(localSlippageBps, 10);
                const currentLocalSlippageBps = isNaN(parsedLocalSlippageBps) ? -1 : parsedLocalSlippageBps; // Ensure consistent comparison
                if (currentLocalSlippageBps !== initialSettingsRef.current.slippageBps) {
                    slippageDirty = true; // Selected predefined BPS value changed
                }
            }
        }
        
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
        localSlippageInput, // Log the raw input that's active at save time
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
            localSlippageInput, // Log the raw input that's active at save time
            localPreferredLanguage,
            localPreferredExplorer,
        });

        const slippageNum = parseInt(localSlippageBps, 10); // This is the BPS value derived from input (e.g., 0 if input was "0.000001")
        const maxPriorityFeeCapSolNum = parseFloat(localMaxPriorityFeeCapSol);

        // Validate and set Fee Level
        console.log("[PerformSave] Setting Fee Level to context:", localFeeLevel);
        setContextFeeLevel(localFeeLevel);

        // Validate and set Slippage
        if (!isNaN(slippageNum) && slippageNum >= 0) {
            console.log("[PerformSave] Setting SlippageBps to context:", slippageNum);
            setContextSlippageBps(slippageNum);
            // Also save custom slippage state and raw input to context
            setContextIsCustomSlippage(localIsCustomSlippageActive);
            if (localIsCustomSlippageActive) {
                setContextRawCustomSlippageInput(localSlippageInput);
            } else {
                // If a predefined option was selected, clear the raw custom input in context
                setContextRawCustomSlippageInput(""); 
            }
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
                slippageBps: slippageNum, // The effective BPS value saved
                selectedRpcUrl: !localIsCustomRpc ? finalRpcToSave : (PREDEFINED_RPCS[0]?.url || ''),
                isCustomRpc: localIsCustomRpc,
                customRpcInputValue: localIsCustomRpc ? finalRpcToSave : 'https://',
                isCustomSlippage: localIsCustomSlippageActive, // Save the custom mode state
                rawCustomSlippageInput: localIsCustomSlippageActive ? localSlippageInput : "", // Save the raw input string if custom was active
                preferredLanguage: localPreferredLanguage,
                preferredExplorer: localPreferredExplorer,
            };
            console.log("[PerformSave] Updated initialSettingsRef.current:", initialSettingsRef.current);
        }
        setIsSettingsDirty(false); 
        return true; 
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