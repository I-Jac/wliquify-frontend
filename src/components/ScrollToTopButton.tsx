'use client';

import React, { useState, useEffect } from 'react';

export const ScrollToTopButton: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    // Show button when page is scrolled down
    const toggleVisibility = () => {
        if (window.scrollY > 300) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    };

    // Set up scroll event listener
    useEffect(() => {
        window.addEventListener('scroll', toggleVisibility);
        return () => {
            window.removeEventListener('scroll', toggleVisibility);
        };
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    return (
        // Removed hidden md:block from here, it will always render if isVisible is true
        // Responsive positioning: closer to edge on mobile, further on md screens
        <div className={`fixed z-50 bottom-4 right-4 md:bottom-6 md:right-6`}>
            {isVisible && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    // Responsive padding and a base class for common styles
                    className="bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-opacity duration-300 ease-in-out p-2 md:p-3 cursor-pointer"
                    aria-label="Scroll to top"
                >
                    {/* Icon size can also be responsive if needed, but h-6 w-6 is often fine. For smaller button, h-5 w-5 might be better */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                </button>
            )}
        </div>
    );
};

ScrollToTopButton.displayName = 'ScrollToTopButton'; 