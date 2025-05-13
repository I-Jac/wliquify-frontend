'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PREDEFINED_RPCS } from '@/utils/constants';
import { getRpcLatency } from '@/utils/networkUtils';

interface ConnectionSettingsTabProps {
    localSelectedRpcUrl: string;
    setLocalSelectedRpcUrl: (value: string) => void;
    localIsCustomRpc: boolean;
    setLocalIsCustomRpc: (value: boolean) => void;
    localCustomRpcInputValue: string;
    setLocalCustomRpcInputValue: (value: string) => void;
    isSettingsModalOpen: boolean; // To control pinging
}

export const ConnectionSettingsTab: React.FC<ConnectionSettingsTabProps> = ({
    localSelectedRpcUrl,
    setLocalSelectedRpcUrl,
    localIsCustomRpc,
    setLocalIsCustomRpc,
    localCustomRpcInputValue,
    setLocalCustomRpcInputValue,
    isSettingsModalOpen,
}) => {
    const { t } = useTranslation();
    const [pingTimes, setPingTimes] = useState<{ [url: string]: number | null | 'pinging' }>({});
    const componentIsMountedRef = useRef(true);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        componentIsMountedRef.current = true;
        return () => {
            componentIsMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const clearExistingInterval = () => {
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
        };

        const performPing = async (url: string) => {
            if (!url || !url.startsWith('http')) {
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
                performPing(rpc.url);
            });

            if (localIsCustomRpc && localCustomRpcInputValue) {
                const trimmedUrl = localCustomRpcInputValue.trim();
                if (trimmedUrl !== '' && trimmedUrl !== 'https://') {
                    performPing(trimmedUrl);
                } else {
                    if (componentIsMountedRef.current) {
                        setPingTimes(prev => {
                            if (prev.hasOwnProperty(localCustomRpcInputValue)) {
                                const newState = { ...prev };
                                delete newState[localCustomRpcInputValue];
                                return newState;
                            }
                            return prev;
                        });
                    }
                }
            }
        };

        if (isSettingsModalOpen) { // Simplified: Ping if modal is open and this tab is rendered
            clearExistingInterval();
            pingAllRelevantRpcs();
            pingIntervalRef.current = setInterval(pingAllRelevantRpcs, 5000);
        } else {
            clearExistingInterval();
        }

        return () => {
            clearExistingInterval();
        };
    }, [isSettingsModalOpen, localIsCustomRpc, localCustomRpcInputValue]);

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

    return (
        <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-200">{t('header.settings.customRpcUrl')}</p>
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
                        {pingTimes[rpc.url] === 'pinging' && <span className="animate-pulse">{t('header.settings.pinging')}</span>}
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
                    <span className="text-sm text-gray-300">{t('header.settings.customRpcUrl')}</span>
                </div>
                {localIsCustomRpc && pingTimes[localCustomRpcInputValue] !== undefined && (
                    <div className="text-xs text-gray-400 w-20 text-right">
                        {pingTimes[localCustomRpcInputValue] === 'pinging' && <span className="animate-pulse">{t('header.settings.pinging')}</span>}
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
                        onChange={(e) => setLocalCustomRpcInputValue(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                        placeholder={t('header.settings.enterCustomRpcUrl')}
                    />
                    <p className="text-xs text-gray-400">{t('header.settings.enterCustomRpcUrl')}</p>
                </div>
            )}
        </div>
    );
};

ConnectionSettingsTab.displayName = 'ConnectionSettingsTab'; 