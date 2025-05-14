import React from 'react';

interface SkeletonBlockProps {
    className?: string; // Allow custom styling (e.g., width, height)
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = '' }) => {
    return (
        <div
            className={`animate-pulse bg-gray-600 rounded ${className}`}
            // Add default height/width if needed, or rely on parent/className
            // Example: style={{ height: '1rem', width: '80px' }} 
        >
             {/* Empty div for background color */}
             {/* Use &nbsp; or min-height if you need it to take up space reliably */}
             &nbsp;
        </div>
    );
}; 