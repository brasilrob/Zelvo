import { addMonths, format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatMonthYearPT } from '../i18n/pt-PT';

export interface HistoricalMonthPoint {
  key: string;
  monthDate: Date;
  label: string;
  fullLabel: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

export interface LinearRegressionModel {
  slope: number;
  intercept: number;
  rSquared: number;
  sampleSize: number;
  predict: (x: number) => number;
}

export interface ForecastChartPoint {
  key: string;
  monthDate: Date;
  label: string;
  fullLabel: string;
  isForecast: boolean;
  receitas: number | null;
  despesas: number | null;
  saldo: number | null;
  receitaPrevista: number;
  despesaPrevista: number;
  saldoPrevisto: number;
}

export interface ProjectedMonthSummary {
  step: number;
  key: string;
  monthDate: Date;
  label: string;
  fullLabel: string;
  estimatedRevenue: number;
  estimatedExpense: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
}

export interface FinancialForecastResult {
  revenueModel: LinearRegressionModel;
  expenseModel: LinearRegressionModel;
  nextMonth: ProjectedMonthSummary & {
    revenueDeltaVsLastPct: number | null;
    expenseDeltaVsLastPct: number | null;
    profitDeltaVsLast: number;
  };
  horizon: ProjectedMonthSummary[];
  sixMonthPlusNextChart: ForecastChartPoint[];
  fullProjectionChart: ForecastChartPoint[];
  lastHistoricalLabel: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatShortMonthPT(date: Date): string {
  const raw = format(date, 'MMM', { locale: pt }).replace('.', '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Computes Ordinary Least Squares (OLS) simple linear regression: y = intercept + slope * x
 * over equally spaced time indices x = 0, 1, ..., n - 1.
 */
export function computeLinearRegression(values: number[]): LinearRegressionModel {
  const n = values.length;
  if (n === 0) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      sampleSize: 0,
      predict: () => 0,
    };
  }

  if (n === 1) {
    const onlyValue = Math.max(0, roundCurrency(values[0]));
    return {
      slope: 0,
      intercept: onlyValue,
      rSquared: 1,
      sampleSize: 1,
      predict: () => onlyValue,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    const y = values[i];
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  const meanY = sumY / n;

  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  let ssTotal = 0;
  let ssResidual = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * i;
    ssTotal += (values[i] - meanY) ** 2;
    ssResidual += (values[i] - predicted) ** 2;
  }

  const rSquared =
    ssTotal === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssResidual / ssTotal));

  return {
    slope: roundCurrency(slope),
    intercept: roundCurrency(intercept),
    rSquared: Math.round(rSquared * 1000) / 1000,
    sampleSize: n,
    predict: (x: number) => Math.max(0, roundCurrency(intercept + slope * x)),
  };
}

/**
 * Builds linear-regression revenue & cost forecasts from historical monthly data.
 */
export function buildFinancialForecast(
  history: HistoricalMonthPoint[],
  horizonMonths = 3
): FinancialForecastResult {
  const revenueValues = history.map((m) => m.receitas);
  const expenseValues = history.map((m) => m.despesas);

  const revenueModel = computeLinearRegression(revenueValues);
  const expenseModel = computeLinearRegression(expenseValues);

  const n = history.length;
  const baseDate = n > 0 ? history[n - 1].monthDate : new Date();
  const lastActual = n > 0 ? history[n - 1] : null;

  const historicalChartPoints: ForecastChartPoint[] = history.map((m, idx) => {
    const revTrend = revenueModel.predict(idx);
    const expTrend = expenseModel.predict(idx);
    return {
      key: m.key,
      monthDate: m.monthDate,
      label: m.label,
      fullLabel: m.fullLabel,
      isForecast: false,
      receitas: m.receitas,
      despesas: m.despesas,
      saldo: m.saldo,
      receitaPrevista: revTrend,
      despesaPrevista: expTrend,
      saldoPrevisto: roundCurrency(revTrend - expTrend),
    };
  });

  const horizon: ProjectedMonthSummary[] = [];
  const futureChartPoints: ForecastChartPoint[] = [];

  for (let step = 1; step <= horizonMonths; step += 1) {
    const targetDate = addMonths(baseDate, step);
    const xIndex = n - 1 + step;
    const estRev = revenueModel.predict(xIndex);
    const estExp = expenseModel.predict(xIndex);
    const estProfit = roundCurrency(estRev - estExp);
    const estMargin =
      estRev > 0 ? Math.round((estProfit / estRev) * 1000) / 10 : 0;

    const shortMonth = formatShortMonthPT(targetDate);
    const fullLabel = `${formatMonthYearPT(targetDate)} (Previsão)`;

    horizon.push({
      step,
      key: format(targetDate, 'yyyy-MM'),
      monthDate: targetDate,
      label: `${shortMonth} *`,
      fullLabel,
      estimatedRevenue: estRev,
      estimatedExpense: estExp,
      estimatedProfit: estProfit,
      estimatedMarginPct: estMargin,
    });

    futureChartPoints.push({
      key: format(targetDate, 'yyyy-MM'),
      monthDate: targetDate,
      label: `${shortMonth} (Prev.)`,
      fullLabel,
      isForecast: true,
      receitas: null,
      despesas: null,
      saldo: null,
      receitaPrevista: estRev,
      despesaPrevista: estExp,
      saldoPrevisto: estProfit,
    });
  }

  const next = horizon[0];
  const revenueDeltaVsLastPct =
    lastActual && lastActual.receitas > 0
      ? Math.round(((next.estimatedRevenue - lastActual.receitas) / lastActual.receitas) * 1000) /
        10
      : null;
  const expenseDeltaVsLastPct =
    lastActual && lastActual.despesas > 0
      ? Math.round(((next.estimatedExpense - lastActual.despesas) / lastActual.despesas) * 1000) /
        10
      : null;
  const profitDeltaVsLast = roundCurrency(
    next.estimatedProfit - (lastActual?.saldo ?? 0)
  );

  return {
    revenueModel,
    expenseModel,
    nextMonth: {
      ...next,
      revenueDeltaVsLastPct,
      expenseDeltaVsLastPct,
      profitDeltaVsLast,
    },
    horizon,
    sixMonthPlusNextChart: [
      ...historicalChartPoints,
      ...(futureChartPoints[0] ? [futureChartPoints[0]] : []),
    ],
    fullProjectionChart: [...historicalChartPoints, ...futureChartPoints],
    lastHistoricalLabel: lastActual?.label ?? '',
  };
}
