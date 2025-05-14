'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import { WalletButton } from '../wallet/WalletButton';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel } from '@/utils/types';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Popover, Transition } from '@headlessui/react';
import { Cog6ToothIcon as SolidCogIcon } from '@heroicons/react/24/solid';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    TRANSACTION_COMPUTE_UNITS,
    FAUCET_URL_TOKEN,
    FAUCET_URL_SOL_1,
    FAUCET_URL_SOL_2
} from '@/utils/constants';
import { useTranslation } from 'react-i18next';

// Helper component to manage Popover state synchronization with context
interface PopoverStateSyncProps {
    internalPopoverOpenState: boolean;
    isSettingsModalOpen: boolean;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
    isSettingsDirty?: boolean;
    openAlertModal: (message: string) => void;
}

const PopoverStateSync: React.FC<PopoverStateSyncProps> = ({
    internalPopoverOpenState,
    isSettingsModalOpen,
    openSettingsModal,
    closeSettingsModal,
    isSettingsDirty,
    openAlertModal,
}) => {
    const prevInternalPopoverOpenStateRef = useRef<boolean>(internalPopoverOpenState);
    const { t } = useTranslation();

    React.useEffect(() => {
        const prevHuiOpen = prevInternalPopoverOpenStateRef.current;
        const huiOpen = internalPopoverOpenState;

        // Scenario 1: Headless UI trying to open, but our context says modal is closed
        if (huiOpen && !prevHuiOpen && !isSettingsModalOpen) {
            openSettingsModal();
        }
        // Scenario 2: Headless UI trying to close, but our context says modal is open
        // This is usually an Esc key press or click outside.
        else if (!huiOpen && prevHuiOpen && isSettingsModalOpen) {
            if (isSettingsDirty) {
                openAlertModal(t('alertModal.attemptCloseDirtyMessage'));
            } else {
                closeSettingsModal();
            }
        }
        // Scenario 3: Our context modal is told to close (e.g., by 'Close' button), but Headless UI is still open
        else if (huiOpen && prevHuiOpen && !isSettingsModalOpen) {
            closeSettingsModal();
        }
        // Scenario 4: Our context modal is told to open, but Headless UI is closed
        // This shouldn't happen if openSettingsModal is only called from the Popover.Button
        // but as a safeguard:
        else if (!huiOpen && !prevHuiOpen && isSettingsModalOpen) {
        }

        prevInternalPopoverOpenStateRef.current = huiOpen;
    }, [internalPopoverOpenState, isSettingsModalOpen, openSettingsModal, closeSettingsModal, isSettingsDirty, openAlertModal, t]);

    return null;
};


export const Header: React.FC = () => {
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const devToolsRef = useRef<HTMLDivElement>(null);
    const { t, i18n } = useTranslation();
    const { 
        openSettingsModal, 
        closeSettingsModal, 
        isSettingsModalOpen, 
        feeLevel,
        priorityFee,
        dynamicFees,
        maxPriorityFeeCapSol,
        isSettingsDirty,
        openAlertModal
    } = useSettings();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isMobileDevToolsOpen, setIsMobileDevToolsOpen] = useState(false);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

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

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isSettingsModalOpen && settingsButtonRef.current) {
            settingsButtonRef.current.blur();
        }
    }, [isSettingsModalOpen]);

    const openTokenFaucet = () => {
        window.open(FAUCET_URL_TOKEN, '_blank', 'noopener,noreferrer');
    };
    const openSolFaucet = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    return (
        <header className="sticky top-0 z-30 bg-gray-800 shadow-md w-full">
            <nav className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14">
                    <div className="flex items-center">
                        <span className="text-white text-xl font-bold">
                            wLiquify
                        </span>
                        <button
                            onClick={toggleMobileMenu}
                            className="ml-3 p-2 bg-gray-700 text-white rounded-md md:hidden hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white cursor-pointer h-9 w-9 flex items-center justify-center"
                            aria-controls="mobile-menu"
                            aria-expanded={isMobileMenuOpen}
                            title={isMounted ? t('header.openMainMenu') : 'Open main menu'}
                        >
                            <span className="sr-only">{isMounted ? t('header.openMainMenu') : 'Open main menu'}</span>
                            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                        </button>

                        <div className="relative hidden md:block ml-3 sm:ml-4" ref={devToolsRef}>
                            <button
                                onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-2 sm:px-3 rounded-md text-xs sm:text-sm flex items-center space-x-1"
                                title="Developer Tools & Faucets"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                                        <button onClick={() => { openSolFaucet(FAUCET_URL_SOL_1); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title="Get Devnet/Testnet SOL (Option 1)">
                                            1. Airdrop SOL (solfaucet.com)
                                        </button>
                                        <button onClick={() => { openSolFaucet(FAUCET_URL_SOL_2); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title="Get Devnet/Testnet SOL (Option 2)">
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

                    <div className="flex items-center space-x-2 sm:space-x-3">
                        {isMounted && (
                            <>
                                {feeLevel && (
                                    <div 
                                        className="hidden sm:flex items-center bg-gray-700 text-gray-300 text-xs px-2.5 py-1.5 rounded-md"
                                        title={t('header.settings.tooltips.transactionPriority', { feeLevel: t(`header.settings.feeLevel${feeLevel}`)})}
                                    >
                                        <span>{t('header.priorityLabel')}</span>
                                        <span className="text-white font-semibold ml-1.5">{t(`header.settings.feeLevel${feeLevel}`)}</span>
                                        {(priorityFee !== undefined && TRANSACTION_COMPUTE_UNITS > 0) && (() => {
                                            // Ensure tempFeeLevel is a valid key for dynamicFees
                                            let tempFeeLevel: Exclude<FeeLevel, 'Custom'> = feeLevel as Exclude<FeeLevel, 'Custom'>;
                                            if (feeLevel === 'Custom') {
                                                tempFeeLevel = 'Normal'; // Default to 'Normal' if current feeLevel is 'Custom'
                                            }
                                            
                                            const baseSolForSelectedLevel = dynamicFees[tempFeeLevel];
                                            
                                            let isSelectedLevelCapped = false;
                                            if (baseSolForSelectedLevel !== undefined && maxPriorityFeeCapSol >= 0) {
                                                if (baseSolForSelectedLevel > maxPriorityFeeCapSol) {
                                                    isSelectedLevelCapped = true;
                                                }
                                            }
                                            const displayedSol = (priorityFee * TRANSACTION_COMPUTE_UNITS) / (1_000_000 * LAMPORTS_PER_SOL);
                                            const translatedFeeLevel = t(`header.settings.feeLevel${feeLevel}`);
                                            
                                            return (
                                                <span 
                                                    className={`${isSelectedLevelCapped ? 'text-red-400 font-semibold' : 'text-gray-400'} ml-1`}
                                                    data-tooltip-id="app-tooltip"
                                                    data-tooltip-content={isSelectedLevelCapped ? t('header.settings.tooltips.feeCapped', { feeLevel: translatedFeeLevel }) : t('header.settings.tooltips.feeNormal')}
                                                >
                                                    {t('header.approximateFee', { value: displayedSol.toLocaleString(i18n.language, { minimumFractionDigits: 6, maximumFractionDigits: 9 }) })}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                )}

                                <Popover className="relative">
                                    {/* Reverted to HUI controlling its open state, PopoverStateSync bridges it */}
                                    {({ open: internalPopoverOpenState, close: internalPopoverCloseFunction }) => (
                                        <>
                                            <PopoverStateSync 
                                                internalPopoverOpenState={internalPopoverOpenState}
                                                isSettingsModalOpen={isSettingsModalOpen}
                                                openSettingsModal={openSettingsModal}
                                                closeSettingsModal={closeSettingsModal}
                                                isSettingsDirty={isSettingsDirty}
                                                openAlertModal={openAlertModal}
                                            />
                                            <Popover.Button 
                                                ref={settingsButtonRef}
                                                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 flex items-center justify-center h-9 w-9 cursor-pointer md:ml-0 ml-3"
                                                title={t('header.settings.buttonTitle')}
                                            >
                                                <SolidCogIcon className="h-5 w-5" />
                                            </Popover.Button>

                                            {/* Overlay: shown when our context modal is open. */}
                                            <Transition
                                                as={Fragment}
                                                show={isSettingsModalOpen} // Show overlay when our modal is open
                                                enter="transition-opacity ease-linear duration-100"
                                                enterFrom="opacity-0"
                                                enterTo="opacity-100"
                                                leave="transition-opacity ease-linear duration-75"
                                                leaveFrom="opacity-100"
                                                leaveTo="opacity-0"
                                            >
                                                <Popover.Overlay 
                                                    className="fixed inset-0 z-40 bg-black/30" 
                                                    onClick={() => {
                                                        if (isSettingsDirty) {
                                                            openAlertModal(t('alertModal.attemptCloseDirtyMessage'));
                                                        } else {
                                                            closeSettingsModal(); 
                                                        }
                                                    }}
                                                />
                                            </Transition>

                                            {/* Panel: shown when our context modal is open. */}
                                            <Transition
                                                as={Fragment}
                                                show={isSettingsModalOpen} // Show panel when our modal is open
                                                enter="transition ease-out duration-100"
                                                enterFrom="transform opacity-0 scale-95"
                                                enterTo="transform opacity-100 scale-100"
                                                leave="transition ease-in duration-75"
                                                leaveFrom="transform opacity-100 scale-100"
                                                leaveTo="transform opacity-0 scale-95"
                                            >
                                                <Popover.Panel
                                                    static
                                                    className="fixed md:absolute z-50 mt-2 inset-x-4 md:left-auto md:right-0 md:w-screen md:max-w-lg origin-top-right rounded-md shadow-lg focus:outline-none"
                                                >
                                                    <div className="overflow-hidden rounded-lg bg-gray-800 p-6 text-white shadow-xl ring-1 ring-black ring-opacity-5 font-[family-name:var(--font-geist-mono)]">
                                                        <SettingsModal closePanel={internalPopoverCloseFunction} />
                                                    </div>
                                                </Popover.Panel>
                                            </Transition>
                                        </>
                                    )}
                                </Popover>
                                
                                <WalletButton 
                                    style={{
                                        backgroundColor: '#1D4ED8',
                                        fontSize: '0.875rem',
                                        lineHeight: '1.25rem',
                                        fontWeight: '600',
                                        borderRadius: '0.375rem',
                                        height: 'auto',
                                        padding: '0.375rem 0.75rem',
                                        color: 'white',
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </nav>

            {isMobileMenuOpen && (
                <>
                    <div 
                        className="fixed inset-0 z-40 bg-black bg-opacity-75 md:hidden"
                        onClick={toggleMobileMenu} 
                        aria-hidden="true"
                    />
                    <div
                        className={`fixed top-0 left-0 z-50 h-full w-[90%] max-w-xs bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out md:hidden ${
                            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="mobile-menu-title"
                        onClick={() => {
                            if (isMobileDevToolsOpen) {
                                setIsMobileDevToolsOpen(false);
                            }
                        }}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <span id="mobile-menu-title" className="text-white text-lg font-bold">
                                wLiquify
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMobileMenu();
                                }}
                                className="p-2 text-gray-400 hover:text-white"
                                aria-label={t('header.closeMobileMenu')}
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div 
                            className="p-4 space-y-1"
                        >
                            <div onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMobileDevToolsOpen(!isMobileDevToolsOpen);
                                    }}
                                    className="flex items-center justify-between w-full px-2 py-2.5 text-sm text-gray-200 hover:bg-gray-700 hover:text-white rounded-md font-semibold"
                                >
                                    <span className="flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 16v-2m8-6h-2M4 12H2m15.364 6.364l-1.414-1.414M6.343 6.343l-1.414-1.414m12.728 0l-1.414 1.414M6.343 17.657l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                        Developer Tools
                                    </span>
                                    <svg 
                                        className={`w-4 h-4 transition-transform ${
                                            isMobileDevToolsOpen ? 'rotate-180' : ''
                                        }`}
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24" 
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                {isMobileDevToolsOpen && (
                                    <div 
                                        className="pl-4 mt-1 space-y-1 border-l border-gray-700 ml-2"
                                    >
                                        <div className="px-2 pt-2 pb-1 text-xs text-gray-400">
                                            <p>Tip: Copy wallet address to paste into faucets.</p>
                                        </div>
                                        <button 
                                            onClick={() => { openSolFaucet(FAUCET_URL_SOL_1); toggleMobileMenu(); setIsMobileDevToolsOpen(false);}}
                                            className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                        >
                                            1. Airdrop SOL (solfaucet.com)
                                        </button>
                                        <button 
                                            onClick={() => { openSolFaucet(FAUCET_URL_SOL_2); toggleMobileMenu(); setIsMobileDevToolsOpen(false);}}
                                            className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                        >
                                            1. Airdrop SOL (solfate.com)
                                        </button>
                                        <button 
                                            onClick={() => { openTokenFaucet(); toggleMobileMenu(); setIsMobileDevToolsOpen(false);}}
                                            className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                        >
                                            2. Mint Test Tokens
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </header>
    );
};

Header.displayName = 'Header'; 