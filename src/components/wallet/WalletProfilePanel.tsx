'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWalletProfile } from '@/contexts/WalletProfileContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { usePoolData } from '@/hooks/usePoolData';
import { useWalletModal } from './WalletModalProvider';
import { useTranslation } from 'react-i18next';
import { XMarkIcon, DocumentDuplicateIcon, ArrowRightOnRectangleIcon, ArrowsRightLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { formatUnits } from 'ethers';
import { BN } from '@coral-xyz/anchor';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { useSettings } from '@/contexts/SettingsContext';
import {
    EXPLORER_CLUSTER,
    DEFAULT_EXPLORER_OPTIONS,
    DEFAULT_PREFERRED_EXPLORER,
    USD_SCALE,
} from '@/utils/core/constants';
import { formatScaledBnToDollarString } from '@/utils/app/formatUtils';

interface TokenDisplayInfo {
    mint: string;
    symbol: string;
    name: string;
    logoURI?: string;
    balanceAmount: string;
    balanceUsd: string;
    decimals: number;
}

export const WalletProfilePanel: React.FC = () => {
    const { isWalletProfileOpen, closeWalletProfile } = useWalletProfile();
    const walletHookValues = useWallet();
    const { publicKey, wallet, disconnect, connected } = walletHookValues;
    const { setVisible: setWalletModalVisible } = useWalletModal();
    const { connection } = useConnection();
    const { program, provider, readOnlyProvider } = useAnchorProgram();
    const { t } = useTranslation();
    const { preferredExplorer, explorerOptions } = useSettings();

    const {
        poolConfig,
        processedTokenData,
        userWlqiBalance,
        wLqiDecimals,
        wLqiValueScaled,
        isLoadingPublicData,
        isLoadingUserData,
    } = usePoolData({ 
        program, 
        provider, 
        readOnlyProvider, 
        connection, 
        wallet: walletHookValues, 
        enabled: isWalletProfileOpen
    });

    const [portalNode, setPortalNode] = useState<Element | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setPortalNode(document.body);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                // closeWalletProfile();
            }
        };

        if (isWalletProfileOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'auto';
        };
    }, [isWalletProfileOpen, closeWalletProfile]);

    const shortenedAddress = useMemo(() => {
        if (!publicKey) return '';
        const base58 = publicKey.toBase58();
        return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
    }, [publicKey]);

    const handleCopyAddress = useCallback(() => {
        if (publicKey) {
            navigator.clipboard.writeText(publicKey.toBase58());
            toast.success(t('header.walletModal.copied'));
        }
    }, [publicKey, t]);

    const handleChangeWallet = useCallback(() => {
        closeWalletProfile();
        setWalletModalVisible(true);
    }, [setWalletModalVisible, closeWalletProfile]);

    const handleDisconnect = useCallback(async () => {
        closeWalletProfile();
        try {
            await disconnect();
        } catch (error) {
            console.error("Error disconnecting wallet:", error);
            toast.error(t('header.walletModal.disconnectError'));
        }
    }, [disconnect, closeWalletProfile, t]);

    const handleOpenAddressExplorer = useCallback(() => {
        if (!publicKey) return;

        const currentPreferredExplorer = preferredExplorer || DEFAULT_PREFERRED_EXPLORER;
        const currentExplorerOptions = explorerOptions || DEFAULT_EXPLORER_OPTIONS;

        const explorerInfo = currentExplorerOptions[currentPreferredExplorer] || currentExplorerOptions[DEFAULT_PREFERRED_EXPLORER];
        const clusterQuery = explorerInfo.getClusterQueryParam(EXPLORER_CLUSTER);
        
        // Use addressUrlTemplate, fallback to tokenUrlTemplate if address one isn't defined for some reason
        const templateUrl = explorerInfo.addressUrlTemplate || explorerInfo.tokenUrlTemplate; 

        if (!templateUrl) {
            console.warn(`No address or token URL template found for explorer: ${explorerInfo.name}, falling back to Solscan.`);
            const fallbackExplorer = DEFAULT_EXPLORER_OPTIONS['Solscan'];
            // Use addressUrlTemplate for fallback as well
            const fallbackTemplateUrl = fallbackExplorer.addressUrlTemplate || fallbackExplorer.tokenUrlTemplate;
            if (fallbackTemplateUrl) {
                 const url = fallbackTemplateUrl
                    .replace('{address}', publicKey.toBase58()) 
                    .replace('{token_address}', publicKey.toBase58()) // In case token_address is the placeholder
                    .replace('{cluster}', fallbackExplorer.getClusterQueryParam(EXPLORER_CLUSTER));
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        const url = templateUrl
            .replace('{address}', publicKey.toBase58())
            .replace('{token_address}', publicKey.toBase58()) // In case token_address is the placeholder
            .replace('{cluster}', clusterQuery);
        
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [publicKey, preferredExplorer, explorerOptions]);

    const { wlqiTokenInfo, otherTokensInfo, totalPortfolioUsd } = useMemo(() => {
        let totalUsd = 0;
        let wlqiInfo: TokenDisplayInfo | null = null;
        const others: TokenDisplayInfo[] = [];
        const otherTokensWithNumericUsd: (TokenDisplayInfo & { numericUsdValue: number })[] = [];

        // Helper function to safely create BN instances
        const createSafeBn = (value: number): BN | null => {
            if (!Number.isFinite(value)) {
                return null;
            }
            const roundedValue = Math.round(value);
            // Math.round on a finite number produces a finite number.
            if (Math.abs(roundedValue) > Number.MAX_SAFE_INTEGER) {
                return new BN(roundedValue.toString(10));
            }
            return new BN(roundedValue);
        };

        if (poolConfig && connected && publicKey) {
            // Only attempt to populate if data loading is complete for this panel's hook instance
            if (!isLoadingUserData && !isLoadingPublicData) {
                // wLQI Token
                if (userWlqiBalance && typeof wLqiDecimals === 'number') {
                    const wlqiAmount = parseFloat(formatUnits(userWlqiBalance.toString(), wLqiDecimals));
                    let wlqiUsdStr: string;

                    // Attempt to convert BN to number for wLqiValueScaled
                    let wLqiPriceAsNumber: number | undefined = undefined;
                    if (wLqiValueScaled instanceof BN) {
                        try {
                            wLqiPriceAsNumber = wLqiValueScaled.toNumber();
                        } catch (e) {
                            console.error("[WalletProfilePanel] Error converting wLqiValueScaled (BN) to number:", e);
                            // Keep wLqiPriceAsNumber as undefined
                        }
                    } else if (typeof wLqiValueScaled === 'number') {
                        wLqiPriceAsNumber = wLqiValueScaled;
                    }

                    if (typeof wLqiPriceAsNumber === 'number' && !isNaN(wLqiPriceAsNumber)) {
                        const pricePerTokenCorrectlyScaled = wLqiPriceAsNumber / Math.pow(10, USD_SCALE);
                        const wlqiUsd = wlqiAmount * pricePerTokenCorrectlyScaled;
                        
                        if (Number.isFinite(wlqiUsd)) {
                            totalUsd += wlqiUsd;
                        }

                        const rawWlqiUsdScaled = wlqiUsd * Math.pow(10, USD_SCALE);
                        const wlqiUsdScaledBn = createSafeBn(rawWlqiUsdScaled);
                        wlqiUsdStr = formatScaledBnToDollarString(wlqiUsdScaledBn, USD_SCALE);
                    } else {
                        // wlqiUsdStr = t('walletProfile.valueUnavailable', '$ --,--'); // Old fallback
                        wlqiUsdStr = formatScaledBnToDollarString(null, USD_SCALE); // Standardized fallback
                    }

                    wlqiInfo = {
                        mint: poolConfig.wliMint.toBase58(),
                        symbol: 'wLQI',
                        name: 'Wrapped Liquidity Index',
                        logoURI: '/tokens/default.png',
                        balanceAmount: wlqiAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: wLqiDecimals > 5 ? 5 : wLqiDecimals }),
                        balanceUsd: wlqiUsdStr,
                        decimals: wLqiDecimals,
                    };

                } else if (userWlqiBalance === undefined && typeof wLqiDecimals === 'number') {
                    // If userWlqiBalance is undefined AFTER loading, treat as 0 for display
                    // We need wLqiDecimals to format the '0' correctly.
                    wlqiInfo = {
                        mint: poolConfig.wliMint.toBase58(),
                        symbol: 'wLQI',
                        name: 'Wrapped Liquidity Index',
                        logoURI: '/tokens/default.png',
                        balanceAmount: (0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                        balanceUsd: formatScaledBnToDollarString(new BN(0), USD_SCALE),
                        decimals: wLqiDecimals, // Keep decimals for consistency, even if balance is 0
                    };
                }
            }

            // Other Whitelisted Tokens - Iterating processedTokenData directly
            // This part can still run even if wLQI info is being loaded, 
            // as other token balances might come from a different part of usePoolData or be less critical for the immediate wLQI display issue.
            if (processedTokenData) {
                processedTokenData.forEach(ptd => {
                    // Skip if it's the wLQI token itself, as it's handled above
                    if (poolConfig && ptd.mintAddress === poolConfig.wliMint.toBase58()) {
                        return;
                    }

                    const balance = ptd.userBalance || new BN(0);
                    const balanceAmount = parseFloat(formatUnits(balance.toString(), ptd.decimals));
                    let tokenUsdValue = 0;
                    if (ptd.priceData && ptd.priceData.price && typeof ptd.priceData.expo === 'number') {
                        const pricePerToken = Number(ptd.priceData.price) * Math.pow(10, ptd.priceData.expo);
                        tokenUsdValue = balanceAmount * pricePerToken;
                    }
                    if (Number.isFinite(tokenUsdValue)) {
                        totalUsd += tokenUsdValue;
                    }

                    otherTokensWithNumericUsd.push({
                        mint: ptd.mintAddress,
                        symbol: ptd.symbol,
                        name: ptd.symbol, // Use symbol as name, as ProcessedTokenData doesn't have a separate 'name'
                        logoURI: ptd.icon || `/tokens/${ptd.symbol.toUpperCase()}.png`, // Fallback logo pattern
                        balanceAmount: balanceAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: ptd.decimals > 5 ? 5 : ptd.decimals }),
                        balanceUsd: (() => {
                            const rawTokenUsdScaled = tokenUsdValue * Math.pow(10, USD_SCALE);
                            const tokenUsdScaledBn = createSafeBn(rawTokenUsdScaled);
                            return formatScaledBnToDollarString(tokenUsdScaledBn, USD_SCALE);
                        })(),
                        decimals: ptd.decimals,
                        numericUsdValue: tokenUsdValue, // Store numeric USD value for sorting
                    });
                });

                // Sort otherTokensWithNumericUsd by numericUsdValue in descending order
                otherTokensWithNumericUsd.sort((a, b) => b.numericUsdValue - a.numericUsdValue);
                // Assign to others after sorting (without the temporary numericUsdValue field if needed, but it's fine if TokenDisplayInfo doesn't strictly enforce no extra fields)
                others.push(...otherTokensWithNumericUsd);
            }
        }

        const finalRawTotalUsdScaled = totalUsd * Math.pow(10, USD_SCALE);
        const totalUsdScaledBn = createSafeBn(finalRawTotalUsdScaled);
        const finalTotalPortfolioUsdString = formatScaledBnToDollarString(totalUsdScaledBn, USD_SCALE);

        return { 
            wlqiTokenInfo: wlqiInfo, 
            otherTokensInfo: others, 
            totalPortfolioUsd: finalTotalPortfolioUsdString
        };
    }, [poolConfig, processedTokenData, userWlqiBalance, wLqiDecimals, wLqiValueScaled, connected, publicKey, isLoadingPublicData, isLoadingUserData]);

    const isLoading = isLoadingPublicData || isLoadingUserData;

    if (!isWalletProfileOpen || !portalNode) {
        return null;
    }
    
    const handleTokenRowClick = (mintAddress: string) => {
        const currentPreferredExplorer = preferredExplorer || DEFAULT_PREFERRED_EXPLORER;
        const currentExplorerOptions = explorerOptions || DEFAULT_EXPLORER_OPTIONS;
        const explorerInfo = currentExplorerOptions[currentPreferredExplorer] || currentExplorerOptions[DEFAULT_PREFERRED_EXPLORER];
        const clusterQuery = explorerInfo.getClusterQueryParam(EXPLORER_CLUSTER);

        const templateUrl = explorerInfo.tokenUrlTemplate;

        if (!templateUrl) {
            console.warn(`No token URL template found for explorer: ${explorerInfo.name}, falling back to Solscan.`);
            const fallbackExplorer = DEFAULT_EXPLORER_OPTIONS['Solscan'];
            if (fallbackExplorer.tokenUrlTemplate) {
                const url = fallbackExplorer.tokenUrlTemplate.replace('{token_address}', mintAddress).replace('{cluster}', fallbackExplorer.getClusterQueryParam(EXPLORER_CLUSTER));
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }
        
        const url = templateUrl.replace('{token_address}', mintAddress).replace('{cluster}', clusterQuery);
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const renderTokenRow = (token: TokenDisplayInfo) => (
        <div 
            key={token.mint} 
            className="flex items-center justify-between p-3 hover:bg-gray-700/50 rounded-md cursor-pointer" 
            onClick={() => handleTokenRowClick(token.mint)}
            title={t('walletProfile.viewOnExplorer', { 
                symbol: token.symbol, 
                explorerName: (explorerOptions || DEFAULT_EXPLORER_OPTIONS)[preferredExplorer || DEFAULT_PREFERRED_EXPLORER]?.name || 'Explorer'
            })}
        >
            <div className="flex items-center">
                {token.logoURI && (
                    <Image src={token.logoURI} alt={token.symbol} width={32} height={32} className="rounded-full mr-3" onError={(e) => (e.target as HTMLImageElement).src = '/tokens/default.png'}/>
                )}
                <div>
                    <div className="text-sm font-medium text-white">{token.symbol}</div>
                </div>
            </div>
            <div className="text-right">
                <div className="text-sm font-medium text-white">{token.balanceAmount}</div>
                <div className="text-xs text-gray-400">{token.balanceUsd}</div>
            </div>
        </div>
    );

    return createPortal(
        <div
            className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out ${isWalletProfileOpen ? 'backdrop-blur-sm' : ''}`}
            onClick={closeWalletProfile}
            aria-hidden={!isWalletProfileOpen}
        >
            <div
                ref={panelRef}
                onClick={(e) => e.stopPropagation()}
                className={`fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out ${isWalletProfileOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center space-x-2">
                        {wallet?.adapter.icon && 
                            <Image 
                                src={wallet.adapter.icon} 
                                alt={wallet.adapter.name} 
                                width={24} 
                                height={24} 
                                className="w-6 h-6 rounded-full" 
                            />}
                        <span className="text-lg font-semibold text-white">{shortenedAddress}</span>
                        <button onClick={handleCopyAddress} title={t('header.walletModal.copy')} className="p-1 text-gray-400 hover:text-white cursor-pointer">
                            <DocumentDuplicateIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleOpenAddressExplorer} 
                            title={t('walletProfile.viewAddressOnExplorer', { explorerName: (explorerOptions || DEFAULT_EXPLORER_OPTIONS)[preferredExplorer || DEFAULT_PREFERRED_EXPLORER]?.name || 'Explorer' })}
                            className="p-1 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <button onClick={closeWalletProfile} className="p-1 text-gray-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Total Balance & Actions */}
                <div className="p-4 space-y-3 border-b border-gray-700">
                    <div>
                        <div className="text-xs text-gray-400">{t('header.walletModal.walletProfile.totalValue')}</div>
                        <div className="text-2xl font-bold text-white">{isLoading ? t('header.walletModal.walletProfile.loading') : totalPortfolioUsd}</div>
                    </div>

                    {/* wLQI Specific Display */}
                    {connected && wlqiTokenInfo && (
                        <div 
                            className="pt-2 pb-1 border-t border-b border-gray-700/50 my-3 hover:bg-gray-700/50 rounded-md cursor-pointer p-3"
                            onClick={() => handleTokenRowClick(wlqiTokenInfo.mint)}
                            title={t('walletProfile.viewOnExplorer', { 
                                symbol: wlqiTokenInfo.symbol, 
                                explorerName: (explorerOptions || DEFAULT_EXPLORER_OPTIONS)[preferredExplorer || DEFAULT_PREFERRED_EXPLORER]?.name || 'Explorer'
                            })}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    {wlqiTokenInfo.logoURI && (
                                        <Image 
                                            src={wlqiTokenInfo.logoURI} 
                                            alt={wlqiTokenInfo.symbol} 
                                            width={28} 
                                            height={28} 
                                            className="rounded-full mr-2.5" 
                                            onError={(e) => {
                                                // Type assertion to satisfy TypeScript if it complains about currentTarget
                                                (e.target as HTMLImageElement).src = '/tokens/default.png';
                                            }}
                                        />
                                    )}
                                    <div>
                                        <div className="text-sm font-medium text-purple-300">{wlqiTokenInfo.symbol}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-medium text-white">{wlqiTokenInfo.balanceAmount}</div>
                                    <div className="text-xs text-gray-400">{wlqiTokenInfo.balanceUsd}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex space-x-2">
                        <button 
                            onClick={handleChangeWallet}
                            className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 cursor-pointer"
                        >
                            <ArrowsRightLeftIcon className="w-5 h-5 mr-2" />
                            {t('header.walletModal.changeWallet')}
                        </button>
                        <button 
                            onClick={handleDisconnect}
                            className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-red-500 hover:text-red-400 hover:bg-red-700/20 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500 cursor-pointer"
                        >
                           <ArrowRightOnRectangleIcon className="w-5 h-5 mr-2" />
                           {t('header.walletModal.disconnect')}
                        </button>
                    </div>
                </div>
                
                {/* Portfolio Section */}
                <div className="flex-grow p-4 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">{t('header.walletModal.walletProfile.portfolio')}</h3>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-md animate-pulse">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-gray-600 mr-3"></div>
                                        <div>
                                            <div className="h-4 w-20 bg-gray-600 rounded mb-1"></div>
                                            <div className="h-3 w-24 bg-gray-600 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="h-4 w-16 bg-gray-600 rounded mb-1"></div>
                                        <div className="h-3 w-12 bg-gray-600 rounded"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {otherTokensInfo.length > 0 ? (
                                otherTokensInfo.map(renderTokenRow)
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-4">{t('walletProfile.noOtherTokensFound', 'No other tokens found in your wallet.')}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        portalNode
    );
};

// Add default export if this is the only export, or ensure named export is used correctly
// export default WalletProfilePanel; // If it's the default 