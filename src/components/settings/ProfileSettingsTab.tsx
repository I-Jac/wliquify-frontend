'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NumberFormatSettings, SolanaExplorerOption, LanguageOption, CurrencyOption } from '@/utils/types';

interface ProfileSettingsTabProps {
    localPreferredLanguage: string;
    setLocalPreferredLanguage: (value: string) => void;
    localPreferredCurrency: string;
    setLocalPreferredCurrency: (value: string) => void;
    localNumberFormat: NumberFormatSettings;
    setLocalNumberFormat: (value: NumberFormatSettings) => void;
    localPreferredExplorer: string;
    setLocalPreferredExplorer: (value: string) => void;
    explorerOptions: Record<string, SolanaExplorerOption>;
    availableLanguages: LanguageOption[];
    availableCurrencies: CurrencyOption[];
}

export const ProfileSettingsTab: React.FC<ProfileSettingsTabProps> = ({
    localPreferredLanguage,
    setLocalPreferredLanguage,
    localPreferredCurrency,
    setLocalPreferredCurrency,
    localNumberFormat,
    setLocalNumberFormat,
    localPreferredExplorer,
    setLocalPreferredExplorer,
    explorerOptions,
    availableLanguages,
    availableCurrencies,
}) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            {/* Language Setting */}
            <div>
                <label htmlFor="language-select" className="block text-sm font-medium text-gray-300 mb-1">{t('header.settings.languageLabel')}</label>
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

            {/* Preferred Currency Setting (Commented out as in original) */}
            {/*
            <div>
                <label htmlFor="currency-select" className="block text-sm font-medium text-gray-300 mb-1">{t('header.settings.preferredCurrencyLabel')}</label>
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
            */}

            {/* Number Format Setting (Commented out as in original) */}
            {/*
            <div className="space-y-3">
                <p className="block text-sm font-medium text-gray-300">{t('header.settings.numberFormatting')}</p>
                <div className="flex items-center space-x-4">
                    <div>
                        <label htmlFor="decimal-separator" className="block text-xs text-gray-400 mb-1">{t('header.settings.decimalSeparatorLabel')}</label>
                        <select
                            id="decimal-separator"
                            value={localNumberFormat.decimalSeparator}
                            onChange={(e) => setLocalNumberFormat({ ...localNumberFormat, decimalSeparator: e.target.value as '.' | ',' })}
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                        >
                            <option value=".">{t('header.settings.dotOption')}</option>
                            <option value=",">{t('header.settings.commaOption')}</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="thousand-separator" className="block text-xs text-gray-400 mb-1">{t('header.settings.thousandSeparatorLabel')}</label>
                        <select
                            id="thousand-separator"
                            value={localNumberFormat.thousandSeparator}
                            onChange={(e) => setLocalNumberFormat({ ...localNumberFormat, thousandSeparator: e.target.value as ',' | '.' | ' ' | '' })}
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                        >
                            <option value=",">{t('header.settings.commaOption')}</option>
                            <option value=".">{t('header.settings.dotOption')}</option>
                            <option value=" ">{t('header.settings.spaceOption')}</option>
                            <option value="">{t('header.settings.noneOption')}</option>
                        </select>
                    </div>
                </div>
            </div>
            */}

            {/* Preferred Explorer Setting */}
            <div>
                <label htmlFor="explorer-select" className="block text-sm font-medium text-gray-300 mb-1">{t('header.settings.preferredExplorerLabel')}</label>
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
    );
};

ProfileSettingsTab.displayName = 'ProfileSettingsTab'; 