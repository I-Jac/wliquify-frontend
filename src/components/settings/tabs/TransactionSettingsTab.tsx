'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FeeLevel } from '@/utils/types';
import { PREDEFINED_SLIPPAGE_OPTIONS } from '@/utils/constants';

interface TransactionSettingsTabProps {
    localFeeLevel: FeeLevel;
    setLocalFeeLevel: (value: FeeLevel) => void;
    dynamicFees: { [key in Exclude<FeeLevel, 'Custom'>]?: number };
    localMaxPriorityFeeCapSol: string;
    setLocalMaxPriorityFeeCapSol: (value: string) => void;
    localSlippageBps: string;
    setLocalSlippageBps: (value: string) => void;
    localSlippageInput: string;
    setLocalSlippageInput: (value: string) => void;
    localIsCustomSlippageActive: boolean;
    setLocalIsCustomSlippageActive: (value: boolean) => void;
}

export const TransactionSettingsTab: React.FC<TransactionSettingsTabProps> = ({
    localFeeLevel,
    setLocalFeeLevel,
    dynamicFees,
    localMaxPriorityFeeCapSol,
    setLocalMaxPriorityFeeCapSol,
    localSlippageBps,
    setLocalSlippageBps,
    localSlippageInput,
    setLocalSlippageInput,
    localIsCustomSlippageActive,
    setLocalIsCustomSlippageActive,
}) => {
    const { t, i18n } = useTranslation();

    const handlePredefinedSlippageClick = (bpsValue: number) => {
        setLocalSlippageBps(bpsValue.toString());
        setLocalSlippageInput("");
        setLocalIsCustomSlippageActive(false);
    };

    const handleCustomSlippageInputFocus = () => {
        setLocalIsCustomSlippageActive(true);
    };

    const handleCustomSlippageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalIsCustomSlippageActive(true);
        const inputValue = e.target.value;
        setLocalSlippageInput(inputValue);
        if (inputValue.trim() === '' || isNaN(parseFloat(inputValue))) {
            // Potentially set BPS to an invalid marker or wait for valid input
        } else {
            const percentage = parseFloat(inputValue);
            if (!isNaN(percentage) && percentage >= 0) {
                setLocalSlippageBps(Math.round(percentage * 100).toString());
            }
        }
    };

    return (
        <>
            <div className="space-y-4 mb-6 p-4 border border-gray-700 rounded-md">
                <div>
                    <label htmlFor="priorityFee" className="block text-sm font-medium text-gray-300 mb-1">{t('header.settings.priorityFeeLabel')}</label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['Normal', 'Fast', 'Turbo'] as FeeLevel[]).map((level) => {
                            const feeInSol = dynamicFees[level as Exclude<FeeLevel, 'Custom'>];
                            const translatedLevel = t(`header.settings.feeLevel${level}`);
                            const isSelected = localFeeLevel === level;
                            const maxCapNum = parseFloat(localMaxPriorityFeeCapSol);
                            let isCappedAndSelected = false;

                            if (isSelected && feeInSol !== undefined && !isNaN(maxCapNum) && maxCapNum >= 0 && feeInSol > maxCapNum) {
                                isCappedAndSelected = true;
                            }

                            let finalTooltipContent = '';
                            if (isCappedAndSelected) {
                                finalTooltipContent = t('header.settings.tooltips.feeLevelCapped', {
                                    feeLevel: translatedLevel,
                                    maxCapValue: maxCapNum.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 9 })
                                });
                            } else if (feeInSol !== undefined) {
                                finalTooltipContent = t('header.settings.tooltips.feeLevel', {
                                    feeLevel: translatedLevel,
                                    value: feeInSol.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 9 })
                                });
                            } else {
                                finalTooltipContent = translatedLevel;
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
                        {t('header.settings.maxCapLabel')}
                    </label>
                    <input
                        type="number"
                        id="maxPriorityFeeCapSol"
                        min="0"
                        step="0.0001"
                        value={localMaxPriorityFeeCapSol}
                        onChange={(e) => setLocalMaxPriorityFeeCapSol(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 text-white"
                        placeholder={t('header.settings.enterMaxCapPlaceholder')}
                    />
                    <p className="text-xs text-gray-400 mt-1">{t('header.settings.maxCapDescription')}</p>
                </div>
            </div>
            
            <div className="space-y-2 p-4 border border-gray-700 rounded-md">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t('header.settings.slippageTolerance')}</label>
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
    );
};

TransactionSettingsTab.displayName = 'TransactionSettingsTab'; 