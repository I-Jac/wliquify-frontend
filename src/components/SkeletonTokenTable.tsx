import React from 'react';
import { SkeletonBlock } from './SkeletonBlock';

interface SkeletonTokenTableProps {
    rowCount?: number; // How many placeholder rows to show
}

// Placeholder row component
const SkeletonTableRow: React.FC = () => {
    return (
        <tr className="border-b border-gray-700"><td className="py-3 px-4"><SkeletonBlock className="h-4 w-12" /></td>{/* Symbol */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-20" /></td>{/* Value */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Actual % */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-10" /></td>{/* Target % */}<td className="py-3 px-4"><SkeletonBlock className="h-4 w-16" /></td>{/* User Balance */}<td className="py-3 px-4 space-y-1"><SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}<SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}<SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}</td>{/* Deposit Action */}<td className="py-3 px-4 space-y-1"><SkeletonBlock className="h-8 w-full" />{/* Input placeholder */}<SkeletonBlock className="h-6 w-full" />{/* Button placeholder */}<SkeletonBlock className="h-3 w-16 mx-auto" />{/* Fee placeholder */}</td>{/* Withdraw Action */}</tr>
    );
};

export const SkeletonTokenTable: React.FC<SkeletonTokenTableProps> = ({ rowCount = 5 }) => {
    return (
        <div className="overflow-x-auto bg-gray-900 text-gray-200 rounded-lg shadow-md">
            <table className="min-w-full table-auto">
                <thead>
                     {/* Use the same header as the actual TokenTable for consistency */}
                     <tr className="bg-gray-800 text-left text-xs font-semibold uppercase tracking-wider">
                         <th className="py-3 px-4">Symbol</th>
                         <th className="py-3 px-4 text-right">Value</th>
                         <th className="py-3 px-4 text-right">Actual %</th>
                         <th className="py-3 px-4 text-right">Target %</th>
                         <th className="py-3 px-4 text-right">Your Balance</th>
                         <th className="py-3 px-4 text-center">Deposit Action</th>
                         <th className="py-3 px-4 text-center">Withdraw Action</th>
                     </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-700">
                    {[...Array(rowCount)].map((_, index) => (
                        <SkeletonTableRow key={index} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}; 