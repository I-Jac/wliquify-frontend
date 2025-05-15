'use client';
import { useWallet } from '@solana/wallet-adapter-react';
import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WalletIcon } from './WalletIcon';
import { useTranslation } from 'react-i18next';
import { useWalletModal } from './WalletModalProvider';
import { useWalletProfile } from '@/contexts/WalletProfileContext';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

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
            {startIcon && <span style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem', flexShrink: 0 }}>{startIcon}</span>}
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 1, minWidth: 0 }}>{children}</span>
            {endIcon && <span style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem', flexShrink: 0 }}>{endIcon}</span>}
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
    const { publicKey, wallet, connecting, disconnect } = useWallet();
    const { setVisible, visible } = useWalletModal();
    const { openWalletProfile, isWalletProfileOpen } = useWalletProfile();
    
    const base58 = useMemo(() => publicKey?.toBase58(), [publicKey]);
    const { t } = useTranslation();

    const [notDetectedDropdownOpen, setNotDetectedDropdownOpen] = useState(false);
    const notDetectedDropdownRef = useRef<HTMLDivElement>(null);

    const toggleNotDetectedDropdown = useCallback(() => {
        setNotDetectedDropdownOpen(prev => !prev);
    }, []);

    const closeNotDetectedDropdown = useCallback(() => {
        setNotDetectedDropdownOpen(false);
    }, []);

    useEffect(() => {
        const listener = (event: globalThis.MouseEvent | TouchEvent) => {
            const node = notDetectedDropdownRef.current;
            if (!node || node.contains(event.target as Node)) return;
            closeNotDetectedDropdown();
        };
        if (wallet && !base58 && wallet.adapter.readyState === WalletReadyState.NotDetected) {
            document.addEventListener('mousedown', listener);
            document.addEventListener('touchstart', listener);
        }
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [wallet, base58, closeNotDetectedDropdown]);

    const openModalForChange = useCallback(() => {
        setVisible(true);
        closeNotDetectedDropdown();
    }, [setVisible, closeNotDetectedDropdown]);

    const handleDownloadWallet = useCallback(() => {
        if (wallet?.adapter.url) {
            window.open(wallet.adapter.url, '_blank', 'noopener,noreferrer');
        }
        closeNotDetectedDropdown();
    }, [wallet, closeNotDetectedDropdown]);

    const handleDisconnectFromDropdown = useCallback(async () => {
        try {
            await disconnect();
        } catch (error) {
            console.error("Error disconnecting from dropdown:", error);
            // Optionally show a toast error
        }
        closeNotDetectedDropdown();
    }, [disconnect, closeNotDetectedDropdown]);

    const mainButtonProps = {
        ...props,
    };

    if (!wallet) {
        return (
            <CustomButton
                {...mainButtonProps}
                onClick={openModalForChange}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md cursor-pointer flex items-center gap-2"
                endIcon={<ArrowIcon isOpen={visible} />}
            >
                {t('header.walletModal.selectWallet')}
            </CustomButton>
        );
    }

    if (!base58) {
        const isNotDetected = wallet.adapter.readyState === WalletReadyState.NotDetected;
        return (
            <div className="relative" ref={notDetectedDropdownRef}>
                <CustomButton
                    {...mainButtonProps}
                    disabled={connecting}
                    startIcon={<WalletIcon wallet={wallet} />}
                    onClick={isNotDetected ? toggleNotDetectedDropdown : openModalForChange}
                    isconnectedbutton="true"
                    className="cursor-pointer flex items-center gap-2"
                    endIcon={<ArrowIcon isOpen={notDetectedDropdownOpen} />}
                >
                    {wallet.adapter.name} 
                    {connecting && <span className="text-xs ml-1">({t('header.walletModal.connecting')})</span>}
                    {!connecting && isNotDetected && <span className="text-xs ml-1">({t('header.walletModal.notDetected')})</span>}
                </CustomButton>
                {isNotDetected && notDetectedDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg py-1 z-50">
                        <button
                            onClick={handleDownloadWallet}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                        >
                            {t('header.walletModal.downloadExtension', { walletName: wallet.adapter.name })}
                        </button>
                        <button
                            onClick={openModalForChange}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                        >
                            {t('header.walletModal.changeWallet')}
                        </button>
                        <button
                            onClick={handleDisconnectFromDropdown}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer flex items-center"
                        >
                            <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
                            {t('header.walletModal.disconnect')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <CustomButton
            {...mainButtonProps}
            onClick={openWalletProfile}
            className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-md flex items-center cursor-pointer px-2 sm:px-4"
            startIcon={<WalletIcon wallet={wallet} />}
            endIcon={<ArrowIcon isOpen={isWalletProfileOpen} />}
        >
            <span className="text-sm block max-[380px]:hidden whitespace-nowrap overflow-hidden text-ellipsis flex-shrink min-w-0">
                {base58.slice(0, 4) + '...' + base58.slice(-4)}
            </span>
        </CustomButton>
    );
}; 