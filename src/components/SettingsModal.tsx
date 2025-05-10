'use client';

import React, { useState, useEffect, Fragment, useRef } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel, RpcOption } from '@/utils/types';
import { Connection } from '@solana/web3.js';

// Helper to format microLamports
const formatMicroLamports = (fee: number) => {
    return (fee / 1_000_000).toLocaleString('fr-FR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
};

const PREDEFINED_RPCS: RpcOption[] = [
    { name: 'Solana Devnet', url: 'https://api.devnet.solana.com' },
    // { name: 'dRPC Devnet', url: 'https://solana.drpc.org' }, // Commented out for now
];

// Original getRpcLatency function - restored
async function getRpcLatency(url: string): Promise<number | null> {
    try {
        console.log(`[getRpcLatency] Attempting to connect: ${url}`); 
        const connection = new Connection(url, { 
            commitment: 'confirmed', 
            confirmTransactionInitialTimeout: 10000 // Increased timeout to 10 seconds
        });
        const startTime = performance.now();
        console.log(`[getRpcLatency] Calling getEpochInfo for: ${url}`); 
        await connection.getEpochInfo(); 
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        console.log(`[getRpcLatency] Success for ${url}. Latency: ${duration}ms`); 
        return duration;
    } catch (error) {
        console.error(`[getRpcLatency] Ping failed for ${url}:`, error instanceof Error ? error.message : String(error));
        return null; 
    }
}

interface SettingsModalProps {
    closePanel?: () => void;
}

interface InitialSettings {
    feeLevel: FeeLevel;
    customPriorityFee: number;
    slippageBps: number;
    selectedRpcUrl: string;
    isCustomRpc: boolean;
    customRpcInputValue: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ closePanel }) => {
    const {
        closeSettingsModal,
        feeLevel: contextFeeLevel,
        setFeeLevel: setContextFeeLevel,
        customPriorityFee: contextCustomPriorityFee,
        setCustomPriorityFee: setContextCustomPriorityFee,
        dynamicFees,
        slippageBps: contextSlippageBps,
        setSlippageBps: setContextSlippageBps,
        rpcEndpoint: contextRpcEndpoint,
        setRpcEndpoint: setContextRpcEndpoint,
        isSettingsDirty,
        setIsSettingsDirty,
        openAlertModal
    } = useSettings();

    // Local states for all editable fields
    const [localFeeLevel, setLocalFeeLevel] = useState<FeeLevel>(contextFeeLevel);
    const [localCustomPriorityFee, setLocalCustomPriorityFee] = useState(contextCustomPriorityFee.toString());
    const [localSlippageBps, setLocalSlippageBps] = useState(contextSlippageBps.toString());
    
    const initialContextRpcIsPredefined = PREDEFINED_RPCS.some(r => r.url === contextRpcEndpoint);
    const initialContextRpcIsCustom = !initialContextRpcIsPredefined;
    const [localSelectedRpcUrl, setLocalSelectedRpcUrl] = useState(initialContextRpcIsPredefined ? contextRpcEndpoint : PREDEFINED_RPCS[0]?.url || '');
    const [localIsCustomRpc, setLocalIsCustomRpc] = useState(initialContextRpcIsCustom);
    const [localCustomRpcInputValue, setLocalCustomRpcInputValue] = useState(initialContextRpcIsCustom ? contextRpcEndpoint : 'https://');
    
    // Other states (ping, active tab, mounted ref)
    const [pingTimes, setPingTimes] = useState<{ [url: string]: number | null | 'pinging' }>({});
    const [activeTab, setActiveTab] = useState<'general' | 'transaction'>('general');
    const componentIsMountedRef = useRef(true);
    const initialSettingsRef = useRef<InitialSettings | null>(null);
    const [needsCloseAfterSave, setNeedsCloseAfterSave] = useState(false);

    // Effect to initialize/reset local states and initialSettingsRef ONCE on MOUNT
    // or when the modal is effectively re-initialized (e.g. by closing and reopening)
    useEffect(() => {
        // Capture initial settings from context when component mounts
        const currentInitialRpcIsPredefined = PREDEFINED_RPCS.some(r => r.url === contextRpcEndpoint);
        const currentInitialRpcIsCustom = !currentInitialRpcIsPredefined;

        initialSettingsRef.current = {
            feeLevel: contextFeeLevel,
            customPriorityFee: contextCustomPriorityFee,
            slippageBps: contextSlippageBps,
            selectedRpcUrl: currentInitialRpcIsPredefined ? contextRpcEndpoint : (PREDEFINED_RPCS[0]?.url || ''),
            isCustomRpc: currentInitialRpcIsCustom,
            customRpcInputValue: currentInitialRpcIsCustom ? contextRpcEndpoint : 'https://',
        };

        // Initialize local states from context
        setLocalFeeLevel(contextFeeLevel);
        setLocalCustomPriorityFee(contextCustomPriorityFee.toString());
        setLocalSlippageBps(contextSlippageBps.toString());
        setLocalSelectedRpcUrl(initialSettingsRef.current.selectedRpcUrl);
        setLocalIsCustomRpc(initialSettingsRef.current.isCustomRpc);
        setLocalCustomRpcInputValue(initialSettingsRef.current.customRpcInputValue);
        
        setIsSettingsDirty(false); // Initially, form is not dirty

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // INTENTIONALLY EMPTY: Run once on mount to capture initial state.
            // If modal can re-open without unmounting/remounting, this needs a trigger like isSettingsModalOpen.
            // For now, assuming mount corresponds to new opening.

    // ComponentDidMount/Unmount for componentIsMountedRef
    useEffect(() => {
        componentIsMountedRef.current = true;
        return () => {
            componentIsMountedRef.current = false;
        };
    }, []);

    // Effect to check for changes and update isSettingsDirty
    useEffect(() => {
        if (!initialSettingsRef.current) {
            // This can happen if this effect runs before the initialization effect.
            // To be safe, only proceed if initial settings are captured.
            return;
        }

        const parsedLocalCustomFee = parseInt(localCustomPriorityFee, 10);
        const parsedLocalSlippage = parseInt(localSlippageBps, 10);

        const feeLevelChanged = localFeeLevel !== initialSettingsRef.current.feeLevel;
        const customFeeChanged = (isNaN(parsedLocalCustomFee) || parsedLocalCustomFee < 0 ? -1 : parsedLocalCustomFee) !== initialSettingsRef.current.customPriorityFee;
        const slippageChanged = (isNaN(parsedLocalSlippage) || parsedLocalSlippage < 0 ? -1 : parsedLocalSlippage) !== initialSettingsRef.current.slippageBps;
        
        let rpcChanged = false;
        if (localIsCustomRpc) {
            rpcChanged = initialSettingsRef.current.isCustomRpc !== true || 
                         localCustomRpcInputValue !== initialSettingsRef.current.customRpcInputValue;
        } else {
            rpcChanged = initialSettingsRef.current.isCustomRpc !== false ||
                         localSelectedRpcUrl !== initialSettingsRef.current.selectedRpcUrl;
        }
        
        const dirty = feeLevelChanged || customFeeChanged || slippageChanged || rpcChanged;
        if (isSettingsDirty !== dirty) { // Only update if the dirty state actually changes
           setIsSettingsDirty(dirty);
        }
    }, [
        localFeeLevel, 
        localCustomPriorityFee, 
        localSlippageBps, 
        localSelectedRpcUrl, 
        localIsCustomRpc, 
        localCustomRpcInputValue, 
        setIsSettingsDirty, 
        isSettingsDirty // Include isSettingsDirty to prevent unnecessary calls to setIsSettingsDirty
        // initialSettingsRef.current changes should not trigger this effect directly.
    ]);

    // Ping effect (no changes needed here for dirty state logic)
    useEffect(() => {
        if (activeTab === 'general') {
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
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]); // Ping times removed as per previous fix

    // useEffect to handle auto-closing the panel after a successful save
    useEffect(() => {
        if (needsCloseAfterSave && !isSettingsDirty) {
            if (closePanel) {
                console.log("[SettingsModal Effect] Auto-closing after save, calling closePanel()");
                closePanel();
            } else {
                // Fallback, though closePanel should always be provided by HUI Popover
                console.log("[SettingsModal Effect] Auto-closing after save, calling closeSettingsModal()");
                closeSettingsModal();
            }
            setNeedsCloseAfterSave(false); // Reset the flag
        }
    }, [needsCloseAfterSave, isSettingsDirty, closePanel, closeSettingsModal]);

    const performSave = () => {
        const customFeeNum = parseInt(localCustomPriorityFee, 10);
        const slippageNum = parseInt(localSlippageBps, 10);

        // Validate and set Fee Level and Custom Priority Fee
        if (localFeeLevel === 'Custom') {
            if (!isNaN(customFeeNum) && customFeeNum >= 0) {
                setContextCustomPriorityFee(customFeeNum);
            } else {
                openAlertModal('Invalid Custom Priority Fee. Please enter a non-negative number.');
                return false; 
            }
        }
        setContextFeeLevel(localFeeLevel); // Always save the selected fee level

        // Validate and set Slippage
        if (!isNaN(slippageNum) && slippageNum >= 0) {
            setContextSlippageBps(slippageNum);
        } else {
            openAlertModal('Invalid Slippage. Please enter a non-negative number (in BPS).');
            return false; 
        }

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
        setContextRpcEndpoint(finalRpcToSave);
        
        // After successful context updates, update initialSettingsRef to current local values
        initialSettingsRef.current = {
            feeLevel: localFeeLevel,
            customPriorityFee: localFeeLevel === 'Custom' ? customFeeNum : contextCustomPriorityFee, // Use the one that would be in context
            slippageBps: slippageNum,
            selectedRpcUrl: finalRpcToSave, 
            isCustomRpc: localIsCustomRpc,
            customRpcInputValue: localIsCustomRpc ? finalRpcToSave : 'https://',
        };
        setIsSettingsDirty(false); // Mark as not dirty
        return true; // Indicate save was successful
    };

    const handleTabChange = (tab: 'general' | 'transaction') => {
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
                console.log("[SettingsModal ButtonClick] Save successful, setting needsCloseAfterSave=true");
                setNeedsCloseAfterSave(true); // useEffect will call closePanel() then
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
        setLocalSelectedRpcUrl(url);
        setLocalIsCustomRpc(false);
        if (!localCustomRpcInputValue || localCustomRpcInputValue === 'https://') {
            setLocalCustomRpcInputValue('https://');
        }
    };

    const handleLocalCustomRpcSelect = () => {
        setLocalIsCustomRpc(true);
    };

    const feeButtonLevels: FeeLevel[] = ['Normal', 'Fast', 'Turbo', 'Custom'];

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
                            ${activeTab === 'general'
                                ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                                : isSettingsDirty 
                                    ? 'text-gray-500 hover:text-gray-400'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                            }`}
                        onClick={() => handleTabChange('general')}
                    >
                        General
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
                    {activeTab === 'general' && (
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
                                        onChange={(e) => setLocalCustomRpcInputValue(e.target.value)}
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
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {feeButtonLevels.map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setLocalFeeLevel(level)} // Set localFeeLevel
                                            className={`px-3 py-2 rounded-md text-sm font-medium border ${localFeeLevel === level 
                                                ? 'bg-cyan-600 border-cyan-500 text-white' 
                                                : 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300'
                                            }`}
                                        >
                                            {level}
                                            {level !== 'Custom' && dynamicFees[level] !== undefined && (
                                                <span className="block text-xs opacity-75"> 
                                                    (~{formatMicroLamports(dynamicFees[level])} SOL)
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {localFeeLevel === 'Custom' && (
                                <div>
                                    <label htmlFor="priorityFee" className="block text-sm font-medium text-gray-300 mb-1">
                                        Custom Priority Fee (microLamports)
                                    </label>
                                    <input
                                        type="number"
                                        id="priorityFee"
                                        min="0"
                                        value={localCustomPriorityFee}
                                        onChange={(e) => setLocalCustomPriorityFee(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Set the exact additional fee per transaction.</p>
                                </div>
                            )}

                            <div>
                                <label htmlFor="slippage" className="block text-sm font-medium text-gray-300 mb-1">
                                    Slippage Tolerance (BPS)
                                </label>
                                <input
                                    type="number"
                                    id="slippage"
                                    min="0"
                                    value={localSlippageBps}
                                    onChange={(e) => setLocalSlippageBps(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                                />
                                <p className="text-xs text-gray-400 mt-1">100 BPS = 1%. Max price change tolerated.</p>
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