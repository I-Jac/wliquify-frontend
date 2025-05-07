import { BN } from '@coral-xyz/anchor';
import { 
    DynamicTokenData, 
    HistoricalTokenDataDecoded, 
    ParsedOracleTokenInfo,
    ProcessedTokenData,
    SupportedToken
} from '@/utils/types';
import { decodePriceData, formatScaledBnToDollarString } from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';

interface ProcessTokenDataParams {
    dynamicData: Map<string, DynamicTokenData>;
    historicalData: Map<string, HistoricalTokenDataDecoded | null>;
    oracleData: { data: ParsedOracleTokenInfo[] } | null;
    poolConfig: { supportedTokens: SupportedToken[] } | null;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userTokenBalances: Map<string, BN | null>;
}

export function processTokenData({
    dynamicData,
    historicalData,
    oracleData,
    poolConfig,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userTokenBalances
}: ProcessTokenDataParams): ProcessedTokenData[] | null {
    if (!poolConfig || !oracleData || !totalPoolValueScaled || !wLqiValueScaled || wLqiDecimals === null) {
        return null;
    }

    const oracleTokenMap = new Map<string, ParsedOracleTokenInfo>(oracleData.data.map(info => [info.address, info]));
    const DOMINANCE_SCALE_FACTOR_BN = new BN(10).pow(new BN(10));
    const USD_SCALE_FACTOR_BN = new BN(10).pow(new BN(USD_SCALE));

    const intermediateData = Array.from(dynamicData.entries()).map(([mintAddress, data]) => {
        const tokenConfig = poolConfig.supportedTokens.find((st: SupportedToken) => st.mint?.toBase58() === mintAddress);
        const oracleInfo = oracleTokenMap.get(mintAddress);
        const history = historicalData.get(mintAddress);

        if (!data.vaultBalance || data.decimals === null || !tokenConfig || history === undefined) {
            console.warn(`processTokenData: Skipping intermediate processing for ${mintAddress}, base data missing.`);
            return null;
        }

        const priceData = data.priceFeedInfo ? decodePriceData(data.priceFeedInfo) : null;
        if (!priceData && oracleInfo) {
            console.warn(`processTokenData: Skipping value calculation for active token ${mintAddress}, missing price data.`);
        }

        const tokenValueScaled = priceData ? data.vaultBalance
            .mul(priceData.price)
            .mul(USD_SCALE_FACTOR_BN)
            .div(new BN(10).pow(new BN(data.decimals - priceData.expo))) : new BN(0);

        return {
            mintAddress,
            data,
            tokenConfig,
            oracleInfo,
            history,
            priceData,
            tokenValueScaled,
        };
    }).filter(item => item !== null);

    return intermediateData.map((item): ProcessedTokenData | null => {
        if (!item) return null;
        const { mintAddress, data, tokenConfig, oracleInfo, history, priceData, tokenValueScaled } = item;

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

        const actualDominancePercent = totalPoolValueScaled.isZero()
            ? 0
            : tokenValueScaled.mul(new BN(100 * 10000)).div(totalPoolValueScaled).toNumber() / 10000;

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
            depositFeeOrBonusBps: isDelisted ? null : 10,
            withdrawFeeOrBonusBps: isDelisted ? -500 : 10,
            priceFeedId: tokenConfig!.priceFeed.toBase58(),
            vaultBalance: data.vaultBalance!,
            priceData: priceData!,
            userBalance: userTokenBalances.get(mintAddress) ?? null,
            timestamp: oracleInfo?.timestamp ?? '0',
        };
    }).filter((data): data is ProcessedTokenData => data !== null);
} 