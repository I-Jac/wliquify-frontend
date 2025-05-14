'use client';

import type { WalletName } from '@solana/wallet-adapter-base';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import type { Wallet } from '@solana/wallet-adapter-react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { FC, MouseEvent } from 'react';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { WalletIcon } from './WalletIcon';
import { useWalletModal } from './WalletModalProvider';

interface WalletModalProps {
    className?: string;
    container?: string;
}

interface WalletListItemProps {
    handleClick: (event: MouseEvent<HTMLButtonElement>) => void;
    tabIndex?: number;
    wallet: Wallet;
    isConnecting?: boolean;
}

const WalletListItem: FC<WalletListItemProps> = ({ handleClick, tabIndex, wallet, isConnecting }) => {
    const { t } = useTranslation();
    return (
        <li>
            <button 
                onClick={handleClick} 
                tabIndex={tabIndex}
                disabled={isConnecting}
                className="flex items-center w-full px-3 py-2 text-gray-200 hover:bg-gray-600 hover:text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <WalletIcon wallet={wallet} className="mr-3" />
                <span className="flex-grow text-left text-base">{wallet.adapter.name}</span>
                {wallet.readyState === WalletReadyState.Installed && (
                    <span className="text-gray-400 ml-3 text-xs">{t('header.walletModal.detected')}</span>
                )}
                {isConnecting && (
                    <span className="text-gray-400 ml-3 text-xs">{t('header.walletModal.connecting')}</span>
                )}
            </button>
        </li>
    );
};

interface CollapseProps {
    expanded: boolean;
    id: string;
    children: React.ReactNode;
}

const Collapse: FC<CollapseProps> = ({ expanded, id, children }) => {
    return (
        <div
            id={id}
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
                expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
            {children}
        </div>
    );
};

export const WalletModal: FC<WalletModalProps> = ({ className = '', container = 'body' }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { wallets, select, connecting } = useWallet();
    const { setVisible } = useWalletModal();
    const [expanded, setExpanded] = useState(false);
    const [fadeIn, setFadeIn] = useState(false);
    const [portal, setPortal] = useState<Element | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { t } = useTranslation();

    const [listedWallets, collapsedWallets] = useMemo(() => {
        const installed: Wallet[] = [];
        const notInstalled: Wallet[] = [];

        for (const wallet of wallets) {
            if (wallet.readyState === WalletReadyState.Installed) {
                installed.push(wallet);
            } else {
                notInstalled.push(wallet);
            }
        }

        return installed.length ? [installed, notInstalled] : [notInstalled, []];
    }, [wallets]);

    const hideModal = useCallback(() => {
        setFadeIn(false);
        setTimeout(() => setVisible(false), 150);
    }, [setVisible]);

    const handleClose = useCallback(
        (event: MouseEvent) => {
            event.preventDefault();
            hideModal();
        },
        [hideModal]
    );

    const handleWalletClick = useCallback(
        async (event: MouseEvent, walletName: WalletName) => {
            try {
                setError(null);
                await select(walletName);
                handleClose(event);
            } catch (err) {
                console.error('Wallet connection error:', err);
                setError(t('header.walletModal.connectionError'));
            }
        },
        [select, handleClose, t]
    );

    const handleCollapseClick = useCallback(() => setExpanded(!expanded), [expanded]);

    const handleTabKey = useCallback(
        (event: KeyboardEvent) => {
            const node = ref.current;
            if (!node) return;

            const focusableElements = node.querySelectorAll('button');
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement?.focus();
                    event.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement?.focus();
                    event.preventDefault();
                }
            }
        },
        [ref]
    );

    useLayoutEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                hideModal();
            } else if (event.key === 'Tab') {
                handleTabKey(event);
            }
        };

        const { overflow } = window.getComputedStyle(document.body);
        setTimeout(() => setFadeIn(true), 0);
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown, false);

        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', handleKeyDown, false);
        };
    }, [hideModal, handleTabKey]);

    useLayoutEffect(() => setPortal(document.querySelector(container)), [container]);

    return (
        portal &&
        createPortal(
            <div
                aria-labelledby="wallet-adapter-modal-title"
                aria-modal="true"
                className={`fixed inset-0 z-50 flex items-center justify-center ${fadeIn ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150 ${className}`}
                ref={ref}
                role="dialog"
            >
                <div 
                    className="fixed inset-0 bg-black/50" 
                    onMouseDown={handleClose}
                />
                <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
                    <div className="p-6">
                        <button 
                            onClick={handleClose} 
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M14 12.461L8.3 6.772l5.234-5.233L12.006 0 6.772 5.234 1.54 0 0 1.539l5.234 5.233L0 12.006l1.539 1.528L6.772 8.3l5.69 5.7L14 12.461z" fill="currentColor"/>
                            </svg>
                        </button>
                        {error && (
                            <div className="mb-4 p-3 bg-red-900/30 text-red-200 rounded-md text-sm">
                                {error}
                            </div>
                        )}
                        {listedWallets.length ? (
                            <>
                                <h1 className="text-xl font-semibold text-white mb-4">
                                    {t('header.walletModal.connectWallet')}
                                </h1>
                                <ul className="space-y-2">
                                    {listedWallets.map((wallet) => (
                                        <WalletListItem
                                            key={wallet.adapter.name}
                                            handleClick={(event) => handleWalletClick(event, wallet.adapter.name)}
                                            wallet={wallet}
                                            isConnecting={connecting}
                                        />
                                    ))}
                                    {collapsedWallets.length ? (
                                        <Collapse expanded={expanded} id="wallet-adapter-modal-collapse">
                                            {collapsedWallets.map((wallet) => (
                                                <WalletListItem
                                                    key={wallet.adapter.name}
                                                    handleClick={(event) =>
                                                        handleWalletClick(event, wallet.adapter.name)
                                                    }
                                                    tabIndex={expanded ? 0 : -1}
                                                    wallet={wallet}
                                                    isConnecting={connecting}
                                                />
                                            ))}
                                        </Collapse>
                                    ) : null}
                                </ul>
                                {collapsedWallets.length ? (
                                    <button
                                        className="mt-4 w-full flex items-center justify-center text-sm text-gray-400 hover:text-white"
                                        onClick={handleCollapseClick}
                                        tabIndex={0}
                                    >
                                        <span>{expanded ? t('header.walletModal.lessOptions') : t('header.walletModal.moreOptions')}</span>
                                        <svg
                                            width="13"
                                            height="7"
                                            viewBox="0 0 13 7"
                                            className={`ml-2 transition-transform duration-200 ${
                                                expanded ? 'rotate-180' : ''
                                            }`}
                                            fill="currentColor"
                                        >
                                            <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" />
                                        </svg>
                                    </button>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <h1 className="text-xl font-semibold text-white mb-4">
                                    {t('header.walletModal.needWallet')}
                                </h1>
                                <div className="flex justify-center mb-6">
                                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                                        <path d="M32 0C14.327 0 0 14.327 0 32C0 49.673 14.327 64 32 64C49.673 64 64 49.673 64 32C64 14.327 49.673 0 32 0ZM32 8C36.418 8 40 11.582 40 16C40 20.418 36.418 24 32 24C27.582 24 24 20.418 24 16C24 11.582 27.582 8 32 8ZM32 56C25.373 56 19.373 52.745 16 47.5C16.125 39.5 32 35.5 32 35.5C32 35.5 47.875 39.5 48 47.5C44.627 52.745 38.627 56 32 56Z" fill="currentColor"/>
                                    </svg>
                                </div>
                                {collapsedWallets.length ? (
                                    <>
                                        <button
                                            className="w-full flex items-center justify-center text-sm text-gray-400 hover:text-white"
                                            onClick={handleCollapseClick}
                                            tabIndex={0}
                                        >
                                            <span>{expanded ? t('header.walletModal.hideOptions') : t('header.walletModal.viewOptions')}</span>
                                            <svg
                                                width="13"
                                                height="7"
                                                viewBox="0 0 13 7"
                                                className={`ml-2 transition-transform duration-200 ${
                                                    expanded ? 'rotate-180' : ''
                                                }`}
                                                fill="currentColor"
                                            >
                                                <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" />
                                            </svg>
                                        </button>
                                        <Collapse expanded={expanded} id="wallet-adapter-modal-collapse">
                                            <ul className="mt-4 space-y-2">
                                                {collapsedWallets.map((wallet) => (
                                                    <WalletListItem
                                                        key={wallet.adapter.name}
                                                        handleClick={(event) =>
                                                            handleWalletClick(event, wallet.adapter.name)
                                                        }
                                                        tabIndex={expanded ? 0 : -1}
                                                        wallet={wallet}
                                                        isConnecting={connecting}
                                                    />
                                                ))}
                                            </ul>
                                        </Collapse>
                                    </>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            </div>,
            portal
        )
    );
}; 