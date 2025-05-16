// import type { PublicKey as SolanaWeb3PublicKey } from '@solana/web3.js'; // Aliased import - REMOVED
import type { WalletContextState as WalletAdapterContextState } from '@solana/wallet-adapter-react';

declare global {
    interface Window {
        Jupiter: JupiterTerminal;
    }
}

/** The position of the widget */
export type WidgetPosition =
    | "bottom-left"
    | "bottom-right"
    | "top-left"
    | "top-right";

/** The size of the widget */
export type WidgetSize = "sm" | "default";

export type SwapMode = "ExactIn" | "ExactOut";

export interface FormProps {
    swapMode?: SwapMode;
    initialAmount?: string;
    fixedAmount?: boolean;
    initialInputMint?: string;
    fixedInputMint?: boolean;
    initialOutputMint?: string;
    fixedOutputMint?: boolean;
    initialSlippageBps?: number; // V3, deprecated in V4 Ultra
}

export type DEFAULT_EXPLORER =
    | "Solana Explorer"
    | "Solscan"
    | "Solana Beach"
    | "SolanaFM";

// Forward declaring these as they are complex and might come from @solana/web3.js or wallet-adapter
// For full accuracy, these would ideally be imported or defined based on Jupiter's actual expected types.
// type SolanaPublicKey = any;
// type SolanaTransactionError = any;
// type WalletContextState = any;

type SolanaPublicKey = string; // Using string for addresses passed to Jupiter, simpler for .d.ts
type SolanaTransactionError = Error; // Generic Error type
type WalletContextState = WalletAdapterContextState; // Using imported type

// Simplified from Jupiter's docs, assuming these are opaque or defined elsewhere
export type QuoteResponseMeta = Record<string, unknown>;
export type SwapResult = Record<string, unknown>;
export type IForm = Record<string, unknown>;
export type IScreen = Record<string, unknown>;

export interface PlatformFeeAndAccounts {
    feeBps: number;
    feeAccounts: Map<string, SolanaPublicKey>; // Assuming string is mint address
}

export interface IInit {
    endpoint: string;
    platformFeeAndAccounts?: PlatformFeeAndAccounts;
    formProps?: FormProps;
    strictTokenList?: boolean; // V3, deprecated in V4 Ultra (auto true)
    defaultExplorer?: DEFAULT_EXPLORER;
    displayMode?: "modal" | "integrated" | "widget";
    integratedTargetId?: string;
    widgetStyle?: {
        position?: WidgetPosition;
        size?: WidgetSize;
    };
    containerStyles?: React.CSSProperties;
    containerClassName?: string;
    enableWalletPassthrough?: boolean;
    passthroughWalletContextState?: WalletContextState; // For initial state if ready
    onRequestConnectWallet?: () => void | Promise<void>;
    onSwapError?: (payload: { error?: SolanaTransactionError; code?: number; quoteResponseMeta?: QuoteResponseMeta | null }) => void;
    onSuccess?: (payload: { txid: string; swapResult: SwapResult; quoteResponseMeta?: QuoteResponseMeta | null }) => void;
    onFormUpdate?: (form: IForm) => void;
    onScreenUpdate?: (screen: IScreen) => void;
    maxAccounts?: number; // V3, deprecated in V4 Ultra
    scriptDomain?: string;
    theme?: 'light' | 'dark' | 'auto';
    customTheme?: Partial<Record<string, string>>;

    // V4 specific props from what can be inferred
    marketplaces?: string[]; // Example: ['RAYDIUM', 'ORCA']
    enableExperimentalAutobundle?: boolean;
    simulateWalletPassthrough?: boolean; // For testing
}

export interface JupiterTerminal {
    _instance: unknown | null; // Replaced any with unknown
    init: (props: IInit) => Promise<void>; // Init can be async
    resume: () => void;
    close: () => void;
    syncProps: (props: { passthroughWalletContextState?: WalletContextState }) => void;
    // Add other methods or properties if known and needed
} 