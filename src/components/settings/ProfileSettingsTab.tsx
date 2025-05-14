'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SolanaExplorerOption, LanguageOption } from '@/utils/types';

interface ProfileSettingsTabProps {
    localPreferredLanguage: string;
    setLocalPreferredLanguage: (value: string) => void;
    localPreferredExplorer: string;
    setLocalPreferredExplorer: (value: string) => void;
    explorerOptions: Record<string, SolanaExplorerOption>;
    availableLanguages: LanguageOption[];
}

export const ProfileSettingsTab: React.FC<ProfileSettingsTabProps> = ({
    localPreferredLanguage,
    setLocalPreferredLanguage,
    localPreferredExplorer,
    setLocalPreferredExplorer,
    explorerOptions,
    availableLanguages,
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