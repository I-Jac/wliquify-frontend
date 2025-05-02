import React from 'react';
import { SkeletonBlock } from './SkeletonBlock';

interface SkeletonTokenTableProps {
    rowCount?: number; // How many placeholder rows to show
}

// Placeholder row component
const SkeletonTableRow: React.FC = () => {
    return (
        <tr className="border-b border-gray-700"><td className="py-3 px-4"><SkeletonBlock className="h-4 w-12" /></td>{/* Symbol */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-20" /></td>{/* Value */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Actual % */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Target % */}<td className="py-3 px-4 space-y-1"><SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}<SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}<SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}</td>{/* Deposit Action */}<td className="py-3 px-4 space-y-1"><SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}<SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}<SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}</td>{/* Withdraw Action */}</tr>
    );
};

export const SkeletonTokenTable: React.FC<SkeletonTokenTableProps> = ({ rowCount = 5 }) => {
    return (
        <div className="overflow-x-auto animate-pulse">
            {/* Use table-fixed and consistent background */}
            <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                {/* Match header style and content from TokenTable */}
                <thead className="bg-gray-600">
                    <tr>
                        <th className="p-2 w-16 text-center text-gray-400">Symbol</th>
                        <th className="p-2 w-32 text-center text-gray-400">Pool Balance</th>
                        <th className="p-2 w-28 text-center text-gray-400">Actual %</th>
                        <th className="p-2 w-28 text-center text-gray-400">Target %</th>
                        <th className="p-2 w-40 text-center text-gray-400">Deposit</th>
                        <th className="p-2 w-40 text-center text-gray-400">Withdraw</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {[...Array(rowCount)].map((_, index) => (
                        <SkeletonTableRow key={index} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}; 