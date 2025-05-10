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

export const SettingsModal = () => {
    const {
        closeSettingsModal,
        feeLevel,
        setFeeLevel,
        customPriorityFee,
        setCustomPriorityFee,
        dynamicFees,
        slippageBps,
        setSlippageBps,
        rpcEndpoint, // This is the initially loaded RPC from context
        setRpcEndpoint
    } = useSettings();

    const [localCustomPriorityFee, setLocalCustomPriorityFee] = useState(customPriorityFee.toString());
    const [localSlippageBps, setLocalSlippageBps] = useState(slippageBps.toString());
    
    // RPC States
    // Determine if the rpcEndpoint from context is one of the predefined ones
    const isContextRpcPredefined = PREDEFINED_RPCS.some(r => r.url === rpcEndpoint);
    const initialIsCustom = !isContextRpcPredefined;
    
    const [selectedRpcUrl, setSelectedRpcUrl] = useState(isContextRpcPredefined ? rpcEndpoint : PREDEFINED_RPCS[0]?.url || '');
    const [isCustomRpc, setIsCustomRpc] = useState(initialIsCustom);
    // If initial RPC is custom, use it; otherwise, start custom input with "https://"
    const [customRpcInputValue, setCustomRpcInputValue] = useState(initialIsCustom ? rpcEndpoint : 'https://');
    
    const [pingTimes, setPingTimes] = useState<{ [url: string]: number | null | 'pinging' }>({});
    const [activeTab, setActiveTab] = useState<'general' | 'transaction'>('general');

    const componentIsMountedRef = useRef(true);

    useEffect(() => {
        componentIsMountedRef.current = true;
        return () => {
            componentIsMountedRef.current = false;
        };
    }, []); // Runs once on mount and cleanup on unmount

    useEffect(() => {
        setLocalCustomPriorityFee(customPriorityFee.toString());
        setLocalSlippageBps(slippageBps.toString());
        
        const isCtxRpcPredefined = PREDEFINED_RPCS.some(r => r.url === rpcEndpoint);
        const newIsCustom = !isCtxRpcPredefined;

        setSelectedRpcUrl(newIsCustom ? (PREDEFINED_RPCS[0]?.url || '') : rpcEndpoint);
        setIsCustomRpc(newIsCustom);
        setCustomRpcInputValue(newIsCustom ? rpcEndpoint : 'https://');
        
    }, [customPriorityFee, slippageBps, rpcEndpoint, activeTab]); // Added activeTab to ensure RPC state resets if tab changes before modal load with new rpcEndpoint

    useEffect(() => {
        console.log("Ping effect triggered. Active tab:", activeTab);

        if (activeTab === 'general') {
            PREDEFINED_RPCS.forEach((rpc) => {
                console.log("Checking RPC:", rpc.url, "Current state:", pingTimes[rpc.url]);

                if (pingTimes[rpc.url] === undefined || pingTimes[rpc.url] === null) {
                    console.log("Setting to 'pinging' for:", rpc.url);
                    setPingTimes(prev => ({ ...prev, [rpc.url]: 'pinging' }));

                    getRpcLatency(rpc.url).then(latency => {
                        console.log("Ping result for:", rpc.url, "Latency:", latency, "Is component mounted:", componentIsMountedRef.current);
                        if (componentIsMountedRef.current) {
                            setPingTimes(prev => ({ ...prev, [rpc.url]: latency }));
                        }
                    }).catch(error => {
                        console.error("Error in getRpcLatency promise chain for:", rpc.url, error);
                        if (componentIsMountedRef.current) {
                            setPingTimes(prev => ({ ...prev, [rpc.url]: null }));
                        }
                    });
                }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]); // Removed pingTimes from dependencies, PREDEFINED_RPCS is stable

    const handleSave = () => {
        const customFee = parseInt(localCustomPriorityFee, 10);
        const slippage = parseInt(localSlippageBps, 10);

        if (feeLevel === 'Custom') {
            if (!isNaN(customFee) && customFee >= 0) {
                setCustomPriorityFee(customFee);
            } else {
                alert('Invalid Custom Priority Fee. Please enter a non-negative number.');
                return; 
            }
        }

        if (!isNaN(slippage) && slippage >= 0) {
            setSlippageBps(slippage);
        } else {
            alert('Invalid Slippage. Please enter a non-negative number (in BPS).');
            return; 
        }

        let finalRpcToSave = '';
        if (isCustomRpc) {
            if (customRpcInputValue.trim() && customRpcInputValue.trim() !== 'https://') {
                finalRpcToSave = customRpcInputValue.trim();
            } else {
                alert('Custom RPC Endpoint must be a valid URL.');
                return;
            }
        } else {
            finalRpcToSave = selectedRpcUrl;
        }
        setRpcEndpoint(finalRpcToSave);
        
        closeSettingsModal();
    };

    const handleRpcSelection = (url: string) => {
        setSelectedRpcUrl(url);
        setIsCustomRpc(false);
        // When a predefined is selected, custom input can revert to placeholder or last custom value if needed
        // For now, let's ensure it has a sensible default if user switches back and forth
        if (!customRpcInputValue || customRpcInputValue === 'https://') {
            setCustomRpcInputValue('https://');
        }
    };

    const handleCustomRpcSelect = () => {
        setIsCustomRpc(true);
        // If custom input is just the placeholder, don't set selectedRpcUrl to it yet
        // setSelectedRpcUrl(customRpcInputValue.trim() !== 'https://' ? customRpcInputValue.trim() : '');
    };

    const feeLevels: FeeLevel[] = ['Normal', 'Fast', 'Turbo', 'Custom'];

    return (
        <Fragment>
            <div id="settings-modal-container">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button onClick={closeSettingsModal} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="flex mb-4 border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-2 -mb-px font-semibold text-sm focus:outline-none ${
                            activeTab === 'general'
                                ? 'border-b-2 border-cyan-500 text-cyan-400'
                                : 'text-gray-400 hover:text-gray-200 hover:border-b-2 hover:border-gray-500'
                        }`}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('transaction')}
                        className={`px-4 py-2 -mb-px font-semibold text-sm focus:outline-none ${
                            activeTab === 'transaction'
                                ? 'border-b-2 border-cyan-500 text-cyan-400'
                                : 'text-gray-400 hover:text-gray-200 hover:border-b-2 hover:border-gray-500'
                        }`}
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
                                            checked={!isCustomRpc && selectedRpcUrl === rpc.url}
                                            onChange={() => handleRpcSelection(rpc.url)}
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
                                        checked={isCustomRpc}
                                        onChange={handleCustomRpcSelect}
                                        className="form-radio h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500"
                                    />
                                    <span className="text-sm text-gray-300">Custom</span>
                                </div>
                            </label>
                            {isCustomRpc && (
                                <div className="pl-8 mt-2 space-y-2">
                                    <input
                                        type="text"
                                        id="customRpcEndpointInput"
                                        value={customRpcInputValue}
                                        onChange={(e) => setCustomRpcInputValue(e.target.value)}
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
                                    {feeLevels.map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setFeeLevel(level)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium border ${feeLevel === level 
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
                            
                            {feeLevel === 'Custom' && (
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
                        onClick={handleSave}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </Fragment>
    );
}; 