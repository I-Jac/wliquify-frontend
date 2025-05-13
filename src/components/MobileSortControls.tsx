'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SortableKey } from './TokenTable'; // Assuming SortableKey is exported from TokenTable or a types file
import { useTranslation } from 'react-i18next';

interface MobileSortControlsProps {
    currentSortKey: SortableKey | null;
    currentSortDirection: 'asc' | 'desc';
    handleSort: (key: SortableKey, explicitDirection?: 'asc' | 'desc') => void;
    hideDepositColumn: boolean;
    onSortApplied?: (shouldScroll: boolean) => void;
}

// Define a type for our sort options
type SortOption = {
    translationKeySuffix: string; // Changed from label to translationKeySuffix
    key: SortableKey;
    direction: 'asc' | 'desc';
};

export const MobileSortControls: React.FC<MobileSortControlsProps> = ({
    currentSortKey,
    currentSortDirection,
    handleSort,
    hideDepositColumn,
    onSortApplied,
}) => {
    const { t } = useTranslation(); // Added useTranslation hook
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const baseSortKeyPath = 'main.poolInfoDisplay.tokenTable.mobileSortControls.options';

    const sortOptions: SortOption[] = [
        { translationKeySuffix: 'symbolDesc', key: 'symbol', direction: 'desc' },
        { translationKeySuffix: 'symbolAsc', key: 'symbol', direction: 'asc' },
        { translationKeySuffix: 'valueDesc', key: 'value', direction: 'desc' },
        { translationKeySuffix: 'valueAsc', key: 'value', direction: 'asc' },
        { translationKeySuffix: 'actualPercentDesc', key: 'actualPercent', direction: 'desc' },
        { translationKeySuffix: 'actualPercentAsc', key: 'actualPercent', direction: 'asc' },
        { translationKeySuffix: 'targetPercentDesc', key: 'targetPercent', direction: 'desc' },
        { translationKeySuffix: 'targetPercentAsc', key: 'targetPercent', direction: 'asc' },
    ];

    if (!hideDepositColumn) {
        sortOptions.push(
            { translationKeySuffix: 'depositFeeBonusAsc', key: 'depositFeeBonus', direction: 'desc' },
            { translationKeySuffix: 'depositFeeBonusDesc', key: 'depositFeeBonus', direction: 'asc' }
        );
    }
    sortOptions.push(
        { translationKeySuffix: 'withdrawFeeBonusAsc', key: 'withdrawFeeBonus', direction: 'desc' },
        { translationKeySuffix: 'withdrawFeeBonusDesc', key: 'withdrawFeeBonus', direction: 'asc' }
    );
    
    // Correcting fee/bonus sort direction interpretation:
    // For fees/bonuses, a numerically smaller BPS value is "better" (lower fee or higher bonus).
    // So, "Best to Worst" (e.g. highest bonus first) means sorting by this value ascending.
    // "Worst to Best" (e.g. highest fee first) means sorting by this value descending.
    // The `estimateFeeBpsBN` already returns negative for bonus and positive for fee.
    // So sorting 'asc' on `depositFeeBonusSortValue` or `withdrawFeeBonusSortValue` will put best (highest bonus/lowest fee) first.
    // The desktop sort logic for fee/bonus columns is:
    // compareResult = sortDirection === 'desc' 
    //     ? valuesA.feeBonusSortValue.cmp(valuesB.feeBonusSortValue) 
    //     : valuesB.feeBonusSortValue.cmp(valuesA.feeBonusSortValue);
    // This means 'desc' for desktop (▼ arrow) means A.cmp(B) -> highest BPS (worst) first if A is positive fee.
    // And for 'asc' (▲ arrow) means B.cmp(A) -> lowest BPS (best) first if A is positive fee.

    // Let's re-verify the "Best to Worst" logic based on `estimateFeeBpsBN`
    // `estimateFeeBpsBN` returns:
    // - Negative BN for bonus (e.g., -50 for 0.5% bonus)
    // - Positive BN for fee (e.g., 50 for 0.5% fee)
    // - Larger negative is bigger bonus. Smaller positive is smaller fee.
    // To sort "Best to Worst" (highest bonus, then smallest fee):
    // We want smallest BNs first (large negative, then small positive). This is 'asc' sort.
    // To sort "Worst to Best" (highest fee, then smallest bonus):
    // We want largest BNs first (large positive, then small negative). This is 'desc' sort.
    // The labels seem correct with 'asc' for "Best to Worst" and 'desc' for "Worst to Best".

    const handleOptionClick = (option: SortOption) => {
        const shouldScroll = option.key !== currentSortKey;
        handleSort(option.key, option.direction);
        setIsOpen(false);
        onSortApplied?.(shouldScroll);
    };

    const toggleDropdown = () => setIsOpen(!isOpen);

    // Effect to handle clicks outside the dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]); // Re-run effect if isOpen changes

    return (
        <div className="sticky top-14 z-20 bg-gray-800 px-2 py-2 -mx-2 mb-4" ref={dropdownRef}>
            <button
                onClick={toggleDropdown}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left text-white bg-gray-700 hover:bg-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 cursor-pointer"
            >
                <span>
                    {t('main.poolInfoDisplay.tokenTable.mobileSortControls.buttonLabelPrefix')}
                    {(() => {
                        const selectedOption = sortOptions.find(opt => opt.key === currentSortKey && opt.direction === currentSortDirection);
                        return selectedOption
                            ? t(`${baseSortKeyPath}.${selectedOption.translationKeySuffix}`)
                            : t('main.poolInfoDisplay.tokenTable.mobileSortControls.defaultSortLabel');
                    })()}
                </span>
                {/* Heroicon: chevron-down / chevron-up */}
                <svg className={`w-5 h-5 transform transition-transform ${isOpen ? '-rotate-180' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1">
                    {sortOptions.map((option) => (
                        <button
                            key={`${option.key}-${option.direction}`}
                            onClick={() => handleOptionClick(option)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-600 cursor-pointer ${currentSortKey === option.key && currentSortDirection === option.direction ? 'bg-blue-600 text-white' : 'text-gray-200'}`}
                        >
                            {t(`${baseSortKeyPath}.${option.translationKeySuffix}`)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

MobileSortControls.displayName = 'MobileSortControls'; 