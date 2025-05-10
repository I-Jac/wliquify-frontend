'use client';

import React, { useState, useEffect, useRef } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SettingsModal } from './SettingsModal';
import { useSettings } from '@/contexts/SettingsContext';

export const Header: React.FC = () => {
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const devToolsRef = useRef<HTMLDivElement>(null);
    const { openSettingsModal } = useSettings();

    useEffect(() => {
        function handleClickOutsideDevTools(event: MouseEvent) {
            if (devToolsRef.current && !devToolsRef.current.contains(event.target as Node)) {
                setIsDevToolsOpen(false);
            }
        }
        if (isDevToolsOpen) {
            document.addEventListener("mousedown", handleClickOutsideDevTools);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutsideDevTools);
        };
    }, [isDevToolsOpen]);

    const openTokenFaucet = () => {
        window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
    };
    const openSolFaucet = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <header className="sticky top-0 z-50 bg-gray-800 shadow-md w-full">
            {/* Main Navigation */}
            <nav className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="flex items-center justify-between h-14">
                    {/* Left: Logo/Brand & Dev Tools */}
                    <div className="flex items-center space-x-3 sm:space-x-4">
                        <span className="text-white text-xl font-bold">
                            wLiquify
                        </span>
                        {/* Dev Tools Button - Moved to Left */}
                        <div className="relative" ref={devToolsRef}>
                            <button
                                onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-2 sm:px-3 rounded-md text-xs sm:text-sm flex items-center space-x-1"
                                title="Developer Tools & Faucets"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    {/* Using a more generic "tools" or "lab" icon might be better than settings icon here */}
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 16v-2m8-6h-2M4 12H2m15.364 6.364l-1.414-1.414M6.343 6.343l-1.414-1.414m12.728 0l-1.414 1.414M6.343 17.657l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="hidden sm:inline">Dev Tools</span>
                                <svg className={`w-3 h-3 transition-transform ${isDevToolsOpen ? 'rotate-180' : ''} hidden sm:inline`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            {isDevToolsOpen && (
                                <div className="absolute left-0 mt-2 w-64 origin-top-left rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-50">
                                    <div className="px-4 pt-3 pb-1 text-xs text-gray-400">
                                        <p>Tip: Copy wallet address to paste into faucets.</p>
                                    </div>
                                    <div className="py-1" role="menu" aria-orientation="vertical">
                                        <button onClick={() => { openSolFaucet('https://solfaucet.com/'); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title="Get Devnet/Testnet SOL (Option 1)">
                                            1. Airdrop SOL (solfaucet.com)
                                        </button>
                                        <button onClick={() => { openSolFaucet('https://solfate.com/faucet'); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title="Get Devnet/Testnet SOL (Option 2)">
                                            1. Airdrop SOL (solfate.com)
                                        </button>
                                        <button onClick={() => { openTokenFaucet(); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title="Mint test tokens (requires SOL)">
                                            2. Mint Test Tokens
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center space-x-2 sm:space-x-3">
                        {/* Settings Button Placeholder */}
                        <button
                            onClick={openSettingsModal}
                            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
                            title="Settings"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        
                        <WalletMultiButton 
                            style={{
                                backgroundColor: '#1D4ED8', // Tailwind blue-700
                                fontSize: '0.875rem', 
                                lineHeight: '1.25rem',
                                fontWeight: '600',
                                borderRadius: '0.375rem', 
                                height: 'auto', 
                                padding: '0.375rem 0.75rem',
                            }}
                        />
                    </div>
                </div>
            </nav>

            <SettingsModal />
        </header>
    );
};

Header.displayName = 'Header'; 