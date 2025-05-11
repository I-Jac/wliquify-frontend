import React, { useState, useEffect } from 'react';
import { SkeletonBlock } from './SkeletonBlock';
import { useTranslation } from 'react-i18next';

interface SkeletonTokenTableProps {
    rowCount?: number; // How many placeholder rows/cards to show
}

// Placeholder for a single row in the table skeleton
const SkeletonTableRow: React.FC = () => {
    return (
        <tr className="border-b border-gray-700">
            <td className="py-3 px-4 text-center"><SkeletonBlock className="h-4 w-6 mx-auto" /></td>{/* Rank # */}
            <td className="py-3 px-4"><SkeletonBlock className="h-4 w-12" /></td>{/* Symbol */}
            <td className="py-3 px-4"><SkeletonBlock className="h-4 w-20" /></td>{/* Value */}
            <td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Actual % */}
            <td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Target % */}
            <td className="py-3 px-4 space-y-1">
                <SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}
                <SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}
                <SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}
            </td>{/* Deposit Action */}
            <td className="py-3 px-4 space-y-1">
                <SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}
                <SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}
                <SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}
            </td>{/* Withdraw Action */}
        </tr>
    );
};

// Placeholder for a single card in the mobile skeleton
const SkeletonTokenCard: React.FC = () => {
    return (
        <div className="border border-gray-600 rounded-lg p-3 bg-gray-750">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
                <div className="flex items-center space-x-2">
                    <SkeletonBlock className="w-6 h-6 rounded-full" />
                    <SkeletonBlock className="h-5 w-20" /> {/* Symbol */}
                </div>
                {/* Optional: Delisted badge placeholder if needed */}
                {/* <SkeletonBlock className="h-4 w-16" /> */}
            </div>

            {/* Data Section */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
                <SkeletonBlock className="h-4 w-24" /> {/* Label: Pool Balance */}
                <SkeletonBlock className="h-4 w-16 ml-auto" /> {/* Value */}
                <SkeletonBlock className="h-3 w-20" /> {/* Sub-Label: Balance in Token */}
                <SkeletonBlock className="h-3 w-12 ml-auto" /> {/* Sub-Value */}
                
                <SkeletonBlock className="h-4 w-20 mt-1" /> {/* Label: Actual % */}
                <SkeletonBlock className="h-4 w-12 ml-auto mt-1" /> {/* Value */}
                
                <SkeletonBlock className="h-4 w-20" /> {/* Label: Target % */}
                <SkeletonBlock className="h-4 w-12 ml-auto" /> {/* Value */}
            </div>

            {/* Actions Section (Simplified for skeleton) */}
            {/* Simulating one action block, as deposit might be hidden */}
            <div className="border-t border-gray-600 pt-3 space-y-2">
                <SkeletonBlock className="h-4 w-32 mb-1" /> {/* Action Title */}
                <SkeletonBlock className="h-10 w-full" /> {/* Input placeholder */}
                <SkeletonBlock className="h-8 w-full" /> {/* Button placeholder */}
            </div>
        </div>
    );
};

export const SkeletonTokenTable: React.FC<SkeletonTokenTableProps> = ({ rowCount = 5 }) => {
    const { t } = useTranslation();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);
    
    return (
        <div className="overflow-x-auto animate-pulse">
            {/* Desktop Table Skeleton (Hidden on Mobile) */}
            <div className="hidden md:block">
                <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                    <thead className="bg-gray-600">
                        <tr>
                            <th className="p-2 w-12 text-center text-gray-400">{isMounted ? t('tokenTable.columns.rank') : '#'}</th>
                            <th className="p-2 w-16 text-center text-gray-400">{isMounted ? t('tokenTable.columns.symbol') : 'Symbol'}</th>
                            <th className="p-2 w-32 text-center text-gray-400">{isMounted ? t('tokenTable.columns.poolBalance') : 'Pool Balance'}</th>
                            <th className="p-2 w-28 text-center text-gray-400">{isMounted ? t('tokenTable.columns.actualPercent') : 'Actual %'}</th>
                            <th className="p-2 w-28 text-center text-gray-400">{isMounted ? t('tokenTable.columns.targetPercent') : 'Target %'}</th>
                            <th className="p-2 w-40 text-center text-gray-400">{isMounted ? t('tokenTable.columns.deposit') : 'Deposit'}</th>
                            <th className="p-2 w-40 text-center text-gray-400">{isMounted ? t('tokenTable.columns.withdraw') : 'Withdraw'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {[...Array(rowCount)].map((_, index) => (
                            <SkeletonTableRow key={`row-${index}`} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card List Skeleton (Visible on Mobile) */}
            <div className="block md:hidden space-y-3">
                {[...Array(rowCount)].map((_, index) => (
                    <SkeletonTokenCard key={`card-${index}`} />
                ))}
            </div>
        </div>
    );
}; 