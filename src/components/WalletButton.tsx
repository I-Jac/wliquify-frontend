'use client';
import { useWallet } from '@solana/wallet-adapter-react';
import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WalletIcon } from './WalletIcon';
import { useTranslation } from 'react-i18next';
import { useWalletModal } from './WalletModalProvider';
import { WalletReadyState } from '@solana/wallet-adapter-base';

interface CustomButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    startIcon?: React.ReactNode;
    endIcon?: React.ReactNode;
    isconnectedbutton?: 'true' | 'false'; 
}

const CustomButton: FC<CustomButtonProps> = ({ children, startIcon, endIcon, isconnectedbutton, ...props }) => {
    const baseStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    };

    const connectedStyle: React.CSSProperties = isconnectedbutton === 'true' ? {
        padding: '0.375rem 0.75rem',
        height: 'auto',
    } : {};

    const finalStyle = { ...baseStyle, ...connectedStyle, ...props.style };

    return (
        <button {...props} style={finalStyle}>
            {startIcon && <span style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem' }}>{startIcon}</span>}
            <span style={{ display: 'flex', alignItems: 'center' }}>{children}</span>
            {endIcon && <span style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>{endIcon}</span>}
        </button>
    );
};

const ArrowIcon: FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg
        className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

export const WalletButton: FC<CustomButtonProps> = (props) => {
    const { publicKey, wallet, disconnect } = useWallet();
    const { setVisible, visible } = useWalletModal();
    const [copied, setCopied] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const base58 = useMemo(() => publicKey?.toBase58(), [publicKey]);
    const { t } = useTranslation();

    const handleCopyAddress = async () => {
        if (publicKey) {
            await navigator.clipboard.writeText(publicKey.toString());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const toggleDropdown = useCallback(() => {
        setDropdownOpen(prev => !prev);
    }, []);

    const closeDropdown = useCallback(() => {
        setDropdownOpen(false);
    }, []);

    const openModal = useCallback(() => {
        setVisible(true);
        closeDropdown();
    }, [setVisible, closeDropdown]);

    const handleDownloadWallet = useCallback(() => {
        if (wallet?.adapter.url) {
            window.open(wallet.adapter.url, '_blank', 'noopener,noreferrer');
        }
        closeDropdown();
    }, [wallet, closeDropdown]);

    useEffect(() => {
        const listener = (event: globalThis.MouseEvent | TouchEvent) => {
            const node = dropdownRef.current;
            if (!node || node.contains(event.target as Node)) return;
            closeDropdown();
        };
        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [closeDropdown]);

    const mainButtonProps = {
        ...props,
    };

    if (!wallet) {
        return (
            <CustomButton
                {...mainButtonProps}
                onClick={openModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md cursor-pointer flex items-center gap-2"
                endIcon={<ArrowIcon isOpen={visible} />}
            >
                {t('walletButton.selectWallet')}
            </CustomButton>
        );
    }

    if (!base58) {
        const isNotDetected = wallet.adapter.readyState === WalletReadyState.NotDetected;
        
        return (
            <div className="relative" ref={dropdownRef}>
                <CustomButton
                    {...mainButtonProps}
                    disabled={wallet.adapter.connecting}
                    startIcon={<WalletIcon wallet={wallet} />}
                    onClick={isNotDetected ? toggleDropdown : openModal}
                    isconnectedbutton="true"
                    className="cursor-pointer flex items-center gap-2"
                    endIcon={<ArrowIcon isOpen={dropdownOpen} />}
                >
                    {wallet.adapter.name}
                </CustomButton>
                {isNotDetected && dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50">
                        <button
                            onClick={handleDownloadWallet}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                        >
                            {t('walletButton.downloadExtension')}
                        </button>
                        <button
                            onClick={openModal}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                        >
                            {t('walletButton.changeWallet')}
                        </button>
                        <button
                            onClick={() => {
                                disconnect();
                                closeDropdown();
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                        >
                            {t('walletButton.disconnect')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <CustomButton
                {...mainButtonProps}
                onClick={toggleDropdown}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md flex items-center gap-3 cursor-pointer"
                endIcon={<ArrowIcon isOpen={dropdownOpen} />}
            >
                <div className="flex items-center gap-3">
                    <WalletIcon wallet={wallet} />
                    <span className="text-sm">
                        {base58.slice(0, 4) + '...' + base58.slice(-4)}
                    </span>
                </div>
            </CustomButton>
            {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50">
                    <button
                        onClick={handleCopyAddress}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                    >
                        {copied ? t('wallet.copied') : t('walletButton.copyAddress')}
                    </button>
                    <button
                        onClick={openModal}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                    >
                        {t('walletButton.changeWallet')}
                    </button>
                    <button
                        onClick={() => disconnect()}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                    >
                        {t('walletButton.disconnect')}
                    </button>
                </div>
            )}
        </div>
    );
}; 