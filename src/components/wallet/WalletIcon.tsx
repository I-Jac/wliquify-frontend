import type { Wallet } from '@solana/wallet-adapter-react';
import React, { FC } from 'react';
import Image from 'next/image';

export interface WalletIconProps {
    wallet: Wallet | null;
    className?: string;
    width?: number;
    height?: number;
}

export const WalletIcon: FC<WalletIconProps> = ({ wallet, className, width = 24, height = 24 }) => {
    return wallet && wallet.adapter.icon ? (
        <Image 
            src={wallet.adapter.icon} 
            alt={`${wallet.adapter.name} icon`} 
            width={width}
            height={height}
            className={className}
        />
    ) : null;
}; 