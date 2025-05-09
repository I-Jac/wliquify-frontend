'use client';

import React, { useState, useEffect } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel } from '@/utils/types';

// Helper to format microLamports
const formatMicroLamports = (fee: number) => {
    return (fee / 1_000_000).toLocaleString('fr-FR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
};

export const SettingsModal = () => {
    const {
        isSettingsModalOpen,
        closeSettingsModal,
        feeLevel,
        setFeeLevel,
        customPriorityFee,
        setCustomPriorityFee,
        dynamicFees, // Get the calculated dynamic fees
        slippageBps,
        setSlippageBps,
        rpcEndpoint,
        setRpcEndpoint
    } = useSettings();

    // Local state for inputs
    const [localCustomPriorityFee, setLocalCustomPriorityFee] = useState(customPriorityFee.toString());
    const [localSlippageBps, setLocalSlippageBps] = useState(slippageBps.toString());
    const [localRpcEndpoint, setLocalRpcEndpoint] = useState(rpcEndpoint);

    // Update local state if context changes
    useEffect(() => {
        setLocalCustomPriorityFee(customPriorityFee.toString());
        setLocalSlippageBps(slippageBps.toString());
        setLocalRpcEndpoint(rpcEndpoint);
    }, [customPriorityFee, slippageBps, rpcEndpoint]);

    if (!isSettingsModalOpen) {
        return null;
    }

    const handleSave = () => {
        // Validate and save to context
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
        // Fee level is saved directly via setFeeLevel

        if (!isNaN(slippage) && slippage >= 0) {
            setSlippageBps(slippage);
        } else {
            alert('Invalid Slippage. Please enter a non-negative number (in BPS).');
            return; 
        }

        if (localRpcEndpoint.trim()) {
            setRpcEndpoint(localRpcEndpoint.trim());
        } else {
            alert('RPC Endpoint cannot be empty.');
            return; 
        }

        closeSettingsModal();
    };

    const feeLevels: FeeLevel[] = ['Normal', 'Fast', 'Turbo', 'Custom'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 font-[family-name:var(--font-geist-mono)]">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white"> {/* Increased max-width */} 
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Transaction Settings</h2>
                    <button onClick={closeSettingsModal} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="space-y-5"> {/* Increased spacing */}
                    {/* Priority Fee Level Selection */}
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-2">Priority Fee Level</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2"> {/* Responsive grid */} 
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
                    
                    {/* Custom Priority Fee Input (Conditional) */}
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

                    {/* Slippage */}
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
                        <p className="text-xs text-gray-400 mt-1">100 BPS = 1%. Max price change tolerated. (Note: Currently informational)</p>
                    </div>

                    {/* RPC Endpoint */}
                    <div>
                        <label htmlFor="rpcEndpoint" className="block text-sm font-medium text-gray-300 mb-1">
                            RPC Endpoint
                        </label>
                        <input
                            type="text"
                            id="rpcEndpoint"
                            value={localRpcEndpoint}
                            onChange={(e) => setLocalRpcEndpoint(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                        />
                         <p className="text-xs text-gray-400 mt-1">Custom RPC URL. (Refresh may be needed)</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleSave}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}; 