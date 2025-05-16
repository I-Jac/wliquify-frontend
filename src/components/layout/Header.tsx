'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '../wallet/WalletButton';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useSettings } from '@/contexts/SettingsContext';
import type { FeeLevel } from '@/utils/core/types';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Popover, Transition } from '@headlessui/react';
import { Cog6ToothIcon as SolidCogIcon } from '@heroicons/react/24/solid';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    TRANSACTION_COMPUTE_UNITS,
    FAUCET_URL_TOKEN,
    FAUCET_URL_SOL_1,
    FAUCET_URL_SOL_2
} from '@/utils/core/constants';
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

        if (huiOpen && !prevHuiOpen && !isSettingsModalOpen) {
            openSettingsModal();
        } else if (!huiOpen && prevHuiOpen && isSettingsModalOpen) {
            if (isSettingsDirty) {
                openAlertModal(t('alertModal.attemptCloseDirtyMessage'));
            } else {
                closeSettingsModal();
            }
        } else if (huiOpen && prevHuiOpen && !isSettingsModalOpen) {
            closeSettingsModal();
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
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isMobileDevToolsOpen, setIsMobileDevToolsOpen] = useState(false);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    // Refs for mobile menu dev tools collapse logic
    const flexGrowDivRef = useRef<HTMLDivElement>(null);
    const mobileDevToolsToggleButtonRef = useRef<HTMLButtonElement>(null);
    const mobileDevToolsCollapsibleRef = useRef<HTMLDivElement>(null);

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

    // Effect to handle collapsing mobile dev tools when clicking outside
    useEffect(() => {
        const handleFlexGrowClick = (event: MouseEvent) => {
            if (!isMobileDevToolsOpen) return;

            const target = event.target as Node;

            // Check if click was on the toggle button
            if (mobileDevToolsToggleButtonRef.current && mobileDevToolsToggleButtonRef.current.contains(target)) {
                return; 
            }

            // Check if click was inside the collapsible content
            if (mobileDevToolsCollapsibleRef.current && mobileDevToolsCollapsibleRef.current.contains(target)) {
                return;
            }
            
            // If the click is on the flexGrowDiv itself or another child (e.g. Pool/Swap buttons), collapse dev tools.
            setIsMobileDevToolsOpen(false);
        };

        const currentFlexGrowDiv = flexGrowDivRef.current;
        if (isMobileMenuOpen && currentFlexGrowDiv) {
            currentFlexGrowDiv.addEventListener('mousedown', handleFlexGrowClick);
        }

        return () => {
            if (currentFlexGrowDiv) {
                currentFlexGrowDiv.removeEventListener('mousedown', handleFlexGrowClick);
            }
        };
    }, [isMobileMenuOpen, isMobileDevToolsOpen]);

    const openTokenFaucet = () => {
        window.open(FAUCET_URL_TOKEN, '_blank', 'noopener,noreferrer');
    };
    const openSolFaucet = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
        if (isMobileMenuOpen) {
            setIsMobileDevToolsOpen(false);
        } else if (!isMobileMenuOpen && isMobileDevToolsOpen) {
            setIsMobileDevToolsOpen(false);
        }
    };

    const isPoolActive = pathname === '/' || pathname === '/pool';
    const isSwapActive = pathname === '/swap';

    return (
        <header className="sticky top-0 z-30 bg-gray-800 shadow-md w-full">
            <nav className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14">
                    <div className="flex items-center">
                        <span className="text-white text-xl font-bold">
                            wLiquify
                        </span>
                        <div className="hidden md:flex items-center space-x-2 ml-4">
                            <Link href="/" passHref legacyBehavior>
                                <a className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer 
                                    ${
                                        isPoolActive
                                            ? 'bg-blue-500 text-white' 
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {isMounted ? t('header.nav.pool') : 'Pool'}
                                </a>
                            </Link>
                            <Link href="/swap" passHref legacyBehavior>
                                <a className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer 
                                    ${
                                        isSwapActive
                                            ? 'bg-blue-500 text-white' 
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {isMounted ? t('header.nav.swap') : 'Swap'}
                                </a>
                            </Link>
                        </div>
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
                        <div className="relative hidden md:block ml-3 sm:ml-4 mr-2" ref={devToolsRef}>
                            <button
                                onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-2 sm:px-3 rounded-md text-xs sm:text-sm flex items-center space-x-1"
                                title={isMounted ? t('header.devToolsTitle', 'Developer Tools') : 'Developer Tools'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 16v-2m8-6h-2M4 12H2m15.364 6.364l-1.414-1.414M6.343 6.343l-1.414-1.414m12.728 0l-1.414 1.414M6.343 17.657l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="hidden sm:inline whitespace-nowrap">{isMounted ? t('header.devToolsButton', 'Dev Tools') : 'Dev Tools'}</span>
                                <svg className={`w-3 h-3 transition-transform ${isDevToolsOpen ? 'rotate-180' : ''} hidden sm:inline`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            {isDevToolsOpen && (
                                <div className="absolute left-0 mt-2 w-64 origin-top-left rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-50">
                                    <div className="px-4 pt-3 pb-1 text-xs text-gray-400">
                                        <p>{isMounted ? t('header.faucetTip') : 'Tip: Copy wallet address for faucets.'}</p>
                                    </div>
                                    <div className="py-1" role="menu" aria-orientation="vertical">
                                        <button onClick={() => { openSolFaucet(FAUCET_URL_SOL_1); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title={isMounted ? t('header.faucetSol1Tooltip') : 'Get Devnet/Testnet SOL (Option 1)'}>
                                            1. {isMounted ? t('header.faucetSol1', 'Airdrop SOL (solfaucet.com)') : 'Airdrop SOL (solfaucet.com)'}
                                        </button>
                                        <button onClick={() => { openSolFaucet(FAUCET_URL_SOL_2); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title={isMounted ? t('header.faucetSol2Tooltip') : 'Get Devnet/Testnet SOL (Option 2)'}>
                                            1. {isMounted ? t('header.faucetSol2', 'Airdrop SOL (solfate.com)') : 'Airdrop SOL (solfate.com)'}
                                        </button>
                                        <button onClick={() => { openTokenFaucet(); setIsDevToolsOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white" role="menuitem" title={isMounted ? t('header.faucetTokensTooltip') : 'Mint test tokens (requires SOL)'}>
                                            2. {isMounted ? t('header.faucetTokens', 'Mint Test Tokens') : 'Mint Test Tokens'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 sm:space-x-3">
                        {feeLevel && (
                            <div 
                                className="hidden sm:flex items-center bg-gray-700 text-gray-300 text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap"
                                title={t('header.settings.tooltips.transactionPriority', { feeLevel: t(`header.settings.feeLevel${feeLevel}`)})}
                            >
                                <span>{t('header.priorityLabel')}</span>
                                <span className="text-white font-semibold ml-1.5">{t(`header.settings.feeLevel${feeLevel}`)}</span>
                                {(priorityFee !== undefined && TRANSACTION_COMPUTE_UNITS > 0) && (() => {
                                    let tempFeeLevel: Exclude<FeeLevel, 'Custom'> = feeLevel as Exclude<FeeLevel, 'Custom'>;
                                    if (feeLevel === 'Custom') {
                                        tempFeeLevel = 'Normal';
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
                                    <Transition
                                        as={Fragment}
                                        show={isSettingsModalOpen} 
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
                                    <Transition
                                        as={Fragment}
                                        show={isSettingsModalOpen} 
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
                    </div>
                </div>
            </nav>

            {isMounted && (
                <Transition.Root show={isMobileMenuOpen} as={Fragment}>
                    <div className="md:hidden" role="dialog" aria-modal="true">
                        <Transition.Child
                            as={Fragment}
                            enter="transition-opacity ease-linear duration-300"
                            enterFrom="opacity-0"
                            enterTo="opacity-100"
                            leave="transition-opacity ease-linear duration-300"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <div className="fixed inset-0 z-40 bg-black bg-opacity-75" onClick={toggleMobileMenu} aria-hidden="true" />
                        </Transition.Child>

                        <Transition.Child
                            as={Fragment}
                            enter="transition ease-in-out duration-300 transform"
                            enterFrom="-translate-x-full"
                            enterTo="translate-x-0"
                            leave="transition ease-in-out duration-300 transform"
                            leaveFrom="translate-x-0"
                            leaveTo="-translate-x-full"
                        >
                            <div className="fixed top-0 left-0 z-50 h-full w-[90%] max-w-xs bg-gray-800 shadow-xl flex flex-col">
                                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                                    <span id="mobile-menu-title" className="text-white text-lg font-bold">
                                        {t('header.mobileMenuTitle', 'Menu')}
                                    </span>
                                    <button
                                        onClick={toggleMobileMenu}
                                        className="p-2 text-gray-400 hover:text-white"
                                        aria-label={t('header.closeMobileMenu', 'Close menu')}
                                    >
                                        <XMarkIcon className="h-6 w-6" />
                                    </button>
                                </div>
                                <div ref={flexGrowDivRef} className="flex-grow p-4 space-y-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                    <Link href="/" passHref legacyBehavior>
                                        <a onClick={toggleMobileMenu}
                                            className={`block w-full text-left px-3 py-2.5 rounded-md text-base font-medium transition-colors cursor-pointer 
                                                ${
                                                    isPoolActive
                                                        ? 'bg-blue-500 text-white' 
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                        >
                                            {t('header.nav.pool', 'Pool')}
                                        </a>
                                    </Link>
                                    <Link href="/swap" passHref legacyBehavior>
                                        <a onClick={toggleMobileMenu}
                                            className={`block w-full text-left px-3 py-2.5 rounded-md text-base font-medium transition-colors cursor-pointer 
                                                ${
                                                    isSwapActive
                                                        ? 'bg-blue-500 text-white' 
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                        >
                                            {t('header.nav.swap', 'Swap')}
                                        </a>
                                    </Link>
                                    <div className="border-t border-gray-700 pt-3 mt-3">
                                        <button 
                                            ref={mobileDevToolsToggleButtonRef}
                                            onClick={() => setIsMobileDevToolsOpen(!isMobileDevToolsOpen)}
                                            className="flex items-center justify-between w-full px-3 py-2.5 text-sm text-gray-200 hover:bg-gray-700 hover:text-white rounded-md font-semibold"
                                        >
                                            <span className="flex items-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 16v-2m8-6h-2M4 12H2m15.364 6.364l-1.414-1.414M6.343 6.343l-1.414-1.414m12.728 0l-1.414 1.414M6.343 17.657l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                                {t('header.devToolsTitle', 'Developer Tools')}
                                            </span>
                                            <svg 
                                                className={`w-4 h-4 transition-transform ${isMobileDevToolsOpen ? 'rotate-180' : ''}`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                            </svg>
                                        </button>
                                        {isMobileDevToolsOpen && (
                                            <div ref={mobileDevToolsCollapsibleRef} className="pl-6 mt-1 space-y-1 border-l border-gray-600 ml-2">
                                                <div className="px-2 pt-2 pb-1 text-xs text-gray-400">
                                                    <p>{t('header.faucetTip')}</p>
                                                </div>
                                                <button 
                                                    onClick={() => { openSolFaucet(FAUCET_URL_SOL_1); toggleMobileMenu(); }}
                                                    className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                                >
                                                    1. {t('header.faucetSol1', 'Airdrop SOL (solfaucet.com)')}
                                                </button>
                                                <button 
                                                    onClick={() => { openSolFaucet(FAUCET_URL_SOL_2); toggleMobileMenu(); }}
                                                    className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                                >
                                                    1. {t('header.faucetSol2', 'Airdrop SOL (solfate.com)')}
                                                </button>
                                                <button 
                                                    onClick={() => { openTokenFaucet(); toggleMobileMenu(); }}
                                                    className="flex items-center w-full text-left px-2 py-2 text-xs text-gray-300 hover:bg-gray-600 hover:text-white rounded-md"
                                                >
                                                    2. {t('header.faucetTokens', 'Mint Test Tokens')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Transition.Child>
                    </div>
                </Transition.Root>
            )}
        </header>
    );
};

Header.displayName = 'Header'; 