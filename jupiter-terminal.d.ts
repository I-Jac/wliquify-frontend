declare global {
  interface Window {
    Jupiter: JupiterTerminal;
  }
}

export type FormProps = {
  fixedInputMint?: boolean;
  fixedOutputMint?: boolean;
  swapMode?: 'ExactIn' | 'ExactOut';
  initialAmount?: string;
  initialInputMint?: string;
  initialOutputMint?: string;
  initialSlippageBps?: number; // V3
  maxAccounts?: number; // V3
  useUserSlippage?: boolean; // V3
};

export type TransactionFee = {
  amount: string; // Amount of the fee in lamports
  mint: string; // Mint address of the fee token
  account: string; // Public key of the fee account
};

export interface PlatformFeeAndAccounts {
  referralAccount?: string;
  feeBps?: number;
  feeAccounts?: Map<string, TransactionFee>;
}

export type QuoteResponse = any; // Replace with actual type if available
export type SwapResult = any; // Replace with actual type if available
export type TransactionError = any; // Replace with actual type if available

export type IForm = {
  inputMint?: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    logoURI?: string;
  };
  outputMint?: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    logoURI?: string;
  };
  inputAmount?: number;
  outputAmount?: number;
  slippageBps?: number;
  swapMode?: 'ExactIn' | 'ExactOut';
  // ... other form properties
};

export type IScreen =
  | 'SelectToken'
  | 'SwapSettings'
  | 'TokenDetails'
  | 'ConfirmSwap'
  | 'EnterAmount'
  | 'Initial'; // Add other relevant screen names


export interface JupiterTerminal {
  _instance: any; // Replace with a more specific type if known
  init: (props: {
    displayMode?: 'integrated' | 'modal' | 'widget';
    integratedTargetId?: string;
    widgetStyle?: {
      position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
      size?: 'sm' | 'default';
    };
    endpoint: string;
    cluster?: 'mainnet-beta' | 'testnet' | 'devnet';
    enableWalletPassthrough?: boolean;
    passthroughWalletContextState?: any; // Consider using a more specific type from wallet-adapter
    onRequestIxCallback?: (ix: any) => void; // V3
    onSwapError?: (params: { error: TransactionError; quoteResponseMeta: QuoteResponse | null }) => void;
    onSuccess?: (params: { txid: string; swapResult: SwapResult; quoteResponseMeta: QuoteResponse | null }) => void;
    onFormUpdate?: (form: IForm) => void;
    onScreenUpdate?: (screen: IScreen, isModal?: boolean) => void;
    formProps?: FormProps;
    platformFeeAndAccounts?: PlatformFeeAndAccounts;
    strictTokenList?: boolean; // default true
    defaultExplorer?: 'Solana Explorer' | 'Solscan' | 'Solana Beach' | 'SolanaFM';
    containerStyles?: React.CSSProperties;
    containerClassName?: string;
    useUserSlippage?: boolean; // V3
    initialSlippageBps?: number; // V3
    maxAccounts?: number; // V3
    restrictIntermediateTokens?: boolean;
    intermediateTokens?: string[];
    simulateWalletPassthrough?: boolean;
    marketplaces?: string[]; // " MeteoraDLMM, RaydiumCLMM, OrcaCLMM"
    onlyDirectRoutes?: boolean;
    showNonStrictTokenWarning?: boolean;
    styleOverrides?: Record<string, string>;
  }) => void;
  syncProps: (props: { passthroughWalletContextState?: any, platformFeeAndAccounts?: PlatformFeeAndAccounts, endpoint?: string, formProps?: FormProps }) => void; // Add other syncable props as needed
  resume: () => void;
  close: () => void;
  // Add other methods if available and needed
}

// This is to ensure the file is treated as a module.
export {}; 