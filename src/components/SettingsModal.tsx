'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel, InitialSettings } from '@/utils/types';
import {
    SETTINGS_DEFAULT_DYNAMIC_FEES,
    PREDEFINED_SLIPPAGE_OPTIONS,
    PREDEFINED_RPCS
} from '@/utils/constants';
import { useConnection } from '@solana/wallet-adapter-react';
import { getRpcLatency } from '@/utils/networkUtils';
import { calculateEffectiveDisplayFeeSol } from '@/utils/calculations';

interface SettingsModalProps {
    closePanel?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ closePanel }) => {
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
        isSettingsModalOpen
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
    
    // Other states (ping, active tab, mounted ref)
    const [pingTimes, setPingTimes] = useState<{ [url: string]: number | null | 'pinging' }>({});
    const [activeTab, setActiveTab] = useState<'connection' | 'transaction'>('connection');
    const componentIsMountedRef = useRef(true);
    const initialSettingsRef = useRef<InitialSettings | null>(null);

    // Effect to initialize/reset local states and initialSettingsRef ONCE on MOUNT
    // or when the modal is effectively re-initialized (e.g. by closing and reopening)
    useEffect(() => {
        // Only re-initialize fully if the modal is just opening.
        // We use initialSettingsRef.current === null as a proxy for "just opened and not initialized"
        // OR if isSettingsModalOpen became true in this render cycle (needs a ref to track previous state of isSettingsModalOpen)

        // Let's simplify: For now, only fully initialize if isSettingsModalOpen is true AND initialSettingsRef is not yet set.
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
        contextFeeLevel, // Keep these as they are needed if we decide to re-sync on external changes
        contextMaxPriorityFeeCapSol,
        contextSlippageBps,
        contextRpcEndpoint,
        setIsSettingsDirty,
        // PREDEFINED_SLIPPAGE_OPTIONS is now a module constant, remove from deps
        // PREDEFINED_RPCS is a stable constant
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
        
        const dirty = feeLevelChanged || maxPriorityFeeCapSolChanged || slippageDirty || rpcChanged;
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
        setIsSettingsDirty, 
        isSettingsDirty // Include isSettingsDirty to prevent unnecessary calls to setIsSettingsDirty
        // initialSettingsRef.current changes should not trigger this effect directly.
    ]);

    // Ping effect & Fetch dynamic fees effect
    useEffect(() => {
        if (activeTab === 'connection') {
            PREDEFINED_RPCS.forEach((rpc) => {
                if (pingTimes[rpc.url] === undefined || pingTimes[rpc.url] === null) {
                    setPingTimes(prev => ({ ...prev, [rpc.url]: 'pinging' }));
                    getRpcLatency(rpc.url).then(latency => {
                        if (componentIsMountedRef.current) {
                            setPingTimes(prev => ({ ...prev, [rpc.url]: latency }));
                        }
                    }).catch(() => {
                        if (componentIsMountedRef.current) {
                            setPingTimes(prev => ({ ...prev, [rpc.url]: null }));
                        }
                    });
                }
            });
        } else if (activeTab === 'transaction') {
            // Removed on-demand fetch for transaction tab.
            // Fees will be based on dynamicFees from context, updated by DynamicFeeUpdater.
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]); // Removed contextRpcEndpoint and fetchDynamicFees from dependencies for this simplified effect

    const performSave = () => {
        console.log("[PerformSave] Starting. Local states:", {
            localFeeLevel,
            localMaxPriorityFeeCapSol,
            localSlippageBps,
            localSelectedRpcUrl,
            localIsCustomRpc,
            localCustomRpcInputValue,
            localIsCustomSlippageActive,
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
            openAlertModal('Invalid Slippage. Please enter a non-negative number (in BPS).');
            return false; 
        }

        // Validate and set Max Priority Fee Cap
        if (isNaN(maxPriorityFeeCapSolNum) || maxPriorityFeeCapSolNum < 0) {
            openAlertModal('Invalid Max Priority Fee Cap. Please enter a non-negative number.');
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
                openAlertModal('Custom RPC Endpoint must be a valid URL.');
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
            openAlertModal('RPC endpoint updated. A page refresh may be needed for it to take full effect.');
        }
        
        // After successful context updates, update initialSettingsRef to reflect the new "saved" state
        // This primes it for the next time the modal is opened or dirty state is checked.
        if (initialSettingsRef.current) { 
            initialSettingsRef.current = {
                feeLevel: localFeeLevel,
                maxPriorityFeeCapSol: maxPriorityFeeCapSolNum,
                slippageBps: slippageNum, 
                selectedRpcUrl: !localIsCustomRpc ? finalRpcToSave : (PREDEFINED_RPCS[0]?.url || ''),
                isCustomRpc: localIsCustomRpc,
                customRpcInputValue: localIsCustomRpc ? finalRpcToSave : 'https://',
                isCustomSlippage: localIsCustomSlippageActive,
            };
            console.log("[PerformSave] Updated initialSettingsRef.current:", initialSettingsRef.current);
        }
        setIsSettingsDirty(false); // Mark as not dirty
        return true; // Indicate save was successful
    };

    const handleTabChange = (tab: 'connection' | 'transaction') => {
        if (tab === activeTab) {
            // If clicking the already active tab, do nothing.
            return;
        }

        if (isSettingsDirty) {
            openAlertModal("You have unsaved changes. Please save or revert them before switching tabs.");
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

    const feeButtonLevels: FeeLevel[] = ['Normal', 'Fast', 'Turbo'];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handlePredefinedSlippageClick = (bpsValue: number, _stringValue: string) => {
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
                    <h2 className="text-xl font-bold">Settings</h2>
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
                            ${activeTab === 'connection'
                                ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                                : isSettingsDirty 
                                    ? 'text-gray-500 hover:text-gray-400'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                            }`}
                        onClick={() => handleTabChange('connection')}
                    >
                        Connection
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
                        Transaction
                    </button>
                </div>

                <div className="space-y-5 min-h-[250px]">
                    {activeTab === 'connection' && (
                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-gray-200">RPC Endpoint</p>
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
                                        {pingTimes[rpc.url] === 'pinging' && <span className="animate-pulse">Pinging...</span>}
                                        {typeof pingTimes[rpc.url] === 'number' && <span className="text-green-400">{pingTimes[rpc.url]}ms</span>}
                                        {pingTimes[rpc.url] === null && <span className="text-red-400">Error</span>}
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
                                    <span className="text-sm text-gray-300">Custom</span>
                                </div>
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
                                        placeholder="https://your-custom-rpc-url.com"
                                    />
                                    <p className="text-xs text-gray-400">Enter your custom RPC URL.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'transaction' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Priority Fee Level</label>
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {feeButtonLevels.map((level) => {
                                        const isSelectedLevel = localFeeLevel === level;
                                        const baseSolForLevel = dynamicFees[level as Exclude<FeeLevel, 'Custom'>];
                                        const maxCapSolNum = parseFloat(localMaxPriorityFeeCapSol);
                                        let isCappedAndSelected = false;

                                        if (isSelectedLevel && baseSolForLevel !== undefined && !isNaN(maxCapSolNum) && maxCapSolNum >= 0) {
                                            if (baseSolForLevel > maxCapSolNum) {
                                                isCappedAndSelected = true;
                                            }
                                        }

                                        return (
                                            <button
                                                key={level}
                                                onClick={() => {
                                                    console.log("[FeeLevelButton] Clicked. Setting localFeeLevel to:", level);
                                                    setLocalFeeLevel(level);
                                                }}
                                                className={`px-3 py-2 rounded-md text-sm font-medium border ${isSelectedLevel 
                                                    ? 'bg-cyan-600 border-cyan-500 text-white' 
                                                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300'
                                                }`}
                                                data-tooltip-id="app-tooltip"
                                                data-tooltip-content={
                                                    isCappedAndSelected && baseSolForLevel !== undefined && !isNaN(maxCapSolNum)
                                                        ? `Base fee for ${level} (${baseSolForLevel.toLocaleString('en-US', {minimumFractionDigits: 9, maximumFractionDigits: 9})} SOL) exceeds your max cap of ${maxCapSolNum.toLocaleString('en-US', {minimumFractionDigits: 9, maximumFractionDigits: 9})} SOL. Consider increasing cap or choosing a lower level.`
                                                        : `Select ${level} priority`
                                                }
                                            >
                                                {level}
                                                {baseSolForLevel !== undefined && (
                                                    <span 
                                                        className={`block text-xs ${isCappedAndSelected ? 'text-red-400 font-semibold' : 'opacity-75'}`}
                                                    > 
                                                        (~ 
                                                        {calculateEffectiveDisplayFeeSol(
                                                            baseSolForLevel, // This is now SOL
                                                            SETTINGS_DEFAULT_DYNAMIC_FEES[level as Exclude<FeeLevel, 'Custom'>] // This is microLamports/CU
                                                        )}
                                                        SOL)
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div>
                                <label htmlFor="maxPriorityFeeCapSol" className="block text-sm font-medium text-gray-300 mb-1">
                                    Set Max Cap (SOL)
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
                                    placeholder="e.g., 0.001"
                                />
                                <p className="text-xs text-gray-400 mt-1">Max SOL to spend on priority fees per transaction.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Slippage Tolerance</label>
                                <div className="flex items-center space-x-2 mb-2">
                                    {PREDEFINED_SLIPPAGE_OPTIONS.map((option) => (
                                        <button
                                            key={option.bps}
                                            type="button"
                                            onClick={() => handlePredefinedSlippageClick(option.bps, option.value)}
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
                        </>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleMainButtonClick}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500"
                    >
                        {isSettingsDirty ? 'Save Changes' : 'Close'}
                    </button>
                </div>
            </div>
        </Fragment>
    );
}; 