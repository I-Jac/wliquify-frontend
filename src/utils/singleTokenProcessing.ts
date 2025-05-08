import { BN } from '@coral-xyz/anchor';
import { 
    DynamicTokenData, 
    HistoricalTokenDataDecoded, 
    ParsedOracleTokenInfo,
    ProcessedTokenData,
    SupportedToken
} from '@/utils/types';
import { formatScaledBnToDollarString } from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';
import { priceDataCacheManager } from './priceDataUtils';
import { 
    DOMINANCE_SCALE_FACTOR,
    DELISTED_WITHDRAW_BONUS_BPS,
    BASE_FEE_BPS
} from './constants';

interface ProcessSingleTokenParams {
    mintAddress: string;
    data: DynamicTokenData;
    tokenConfig: SupportedToken;
    oracleInfo: ParsedOracleTokenInfo | undefined;
    history: HistoricalTokenDataDecoded | null;
    currentTvlFromState: BN;
    userBalance: BN | null;
}

const DOMINANCE_SCALE_FACTOR_BN = new BN(DOMINANCE_SCALE_FACTOR.toString());
const USD_SCALE_FACTOR_BN = new BN(10).pow(new BN(USD_SCALE));

export function processSingleToken({
    mintAddress,
    data,
    tokenConfig,
    oracleInfo,
    history,
    currentTvlFromState,
    userBalance
}: ProcessSingleTokenParams): ProcessedTokenData | null {
    // Early return for delisted tokens with no value
    if (!oracleInfo && (!data.vaultBalance || data.vaultBalance.isZero())) {
        return null;
    }

    if (!data.vaultBalance || data.decimals === null || !tokenConfig || history === undefined) {
        console.warn(`processSingleToken: Skipping processing for ${mintAddress}, base data missing.`);
        return null;
    }

    const priceData = data.priceFeedInfo ? priceDataCacheManager.getDecodedPriceData(data.priceFeedInfo) : null;
    if (!priceData && oracleInfo) {
        console.warn(`processSingleToken: Missing price data for active token ${mintAddress}`);
    }

    const tokenValueScaled = priceData ? data.vaultBalance
        .mul(priceData.price)
        .mul(USD_SCALE_FACTOR_BN)
        .div(new BN(10).pow(new BN(data.decimals - priceData.expo))) : new BN(0);

    const isDelisted = !oracleInfo;

    let symbol: string;
    if (history?.symbol && history.symbol.length > 0 && !history.symbol.includes('\0')) {
        symbol = history.symbol;
    } else if (oracleInfo?.symbol && oracleInfo.symbol.length > 0 && !oracleInfo.symbol.includes('\0')) {
        symbol = oracleInfo.symbol;
    } else {
        symbol = mintAddress.substring(0, 4) + '...';
    }

    const targetDominanceBN = isDelisted ? new BN(0) : new BN(oracleInfo!.dominance);
    const targetDominancePercent = isDelisted ? 0 : targetDominanceBN.mul(new BN(100 * 10000)).div(DOMINANCE_SCALE_FACTOR_BN).toNumber() / 10000;
    const targetDominanceDisplay = isDelisted ? "0%" : `${targetDominancePercent.toFixed(4)}%`;

    const actualDominancePercent = currentTvlFromState.isZero()
        ? 0
        : tokenValueScaled.mul(new BN(100 * 10000)).div(currentTvlFromState).toNumber() / 10000;

    let icon = '@/public/tokens/unknown.png';
    if (symbol && !symbol.includes('...')) {
        const sanitizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
        icon = `/tokens/${sanitizedSymbol}.png`;
    }

    return {
        mintAddress,
        symbol,
        icon,
        poolValueUSD: formatScaledBnToDollarString(tokenValueScaled, USD_SCALE),
        actualDominancePercent,
        targetDominance: targetDominanceBN,
        targetDominancePercent,
        targetDominanceDisplay,
        decimals: history?.decimals ?? data.decimals!,
        isDelisted,
        depositFeeOrBonusBps: isDelisted ? null : BASE_FEE_BPS,
        withdrawFeeOrBonusBps: isDelisted ? DELISTED_WITHDRAW_BONUS_BPS : BASE_FEE_BPS,
        priceFeedId: tokenConfig.priceFeed.toBase58(),
        vaultBalance: data.vaultBalance!,
        priceData: priceData!,
        userBalance,
        timestamp: oracleInfo?.timestamp ?? '0',
    };
} 