/**
 * Tooltip content for dashboard metrics
 *
 * Provides layman's explanations for all financial and AI metrics
 */

export const tooltips = {
  // Portfolio Metrics
  portfolioValue: "The total value of your portfolio right now, including cash and the current market value of all open positions.",

  startingCash: "The initial amount of virtual money you started trading with ($100,000).",

  cashBalance: "The amount of cash currently available to make new trades. This decreases when you buy stocks and increases when you sell.",

  totalPnL: "Total Profit and Loss - The total amount of money you've made or lost across all trades, including both closed positions and positions still open.",

  realizedPnL: "Profit and Loss from trades you've already closed. This money is locked in - you can't lose or gain more from these trades.",

  unrealizedPnL: "Profit or loss on positions you still own. This number changes as stock prices move up and down. You won't lock in this profit/loss until you sell.",

  totalROI: "Return on Investment - Shows how much your portfolio has grown or shrunk as a percentage. Calculated as: (Current Portfolio Value - Starting Cash) / Starting Cash × 100%",

  realizedROI: "Return on Investment from closed trades only. Shows what percentage you've actually locked in through completed trades.",

  // Trading Metrics
  winRate: "The percentage of trades that made money. For example, 55% means 55 out of every 100 trades were profitable.",

  totalTrades: "The total number of stock purchases (BUY actions) the AI has executed since the start.",

  openPositions: "Stocks you currently own. Each position shows how many shares, what you paid (avg price), and current market value.",

  marketValue: "What your shares are worth right now at current market prices. This changes throughout the trading day.",

  costBasis: "The total amount of money you originally paid for your shares. This doesn't change - it's your initial investment.",

  avgPrice: "The average price you paid per share. If you bought shares at different times, this averages them out.",

  // Capital Management
  cashAvailability: "How much of your starting cash is still available. HIGH = 70%+ available, MEDIUM = 30-70%, LOW = less than 30%.",

  portfolioExposure: "How much of your cash is currently invested in stocks. NONE = <5%, LIGHT = <50%, HEAVY = 50-100%, OVEREXTENDED = >100% (margin).",

  costBasisDeployed: "The total amount of cash currently tied up in open positions. Higher values mean more capital at risk.",

  exposureRatio: "The percentage of your cash balance that's invested in stocks. 50% means half your money is in stocks, half is cash.",

  // AI / Q-Learning Metrics
  explorationRate: "How often the AI makes random decisions to learn new strategies vs. using what it already knows. High = still learning (random), Low = using learned patterns.",

  qTable: "The AI's 'memory' - a table storing the value of taking different actions in different market situations. Larger means more experience.",

  learningRate: "How quickly the AI updates its knowledge from new experiences. 0.1 = moderate learning speed.",

  discountFactor: "How much the AI values future rewards. 0.95 means it cares about long-term results, not just immediate gains.",

  episodes: "Number of trading days the AI has completed. Each day is one 'episode' of learning.",

  stateSpace: "The number of different market situations the AI can recognize (2,916 total). Combines factors like RSI, price momentum, and cash levels.",

  // Technical Indicators
  rsi: "Relative Strength Index (0-100) - Shows if a stock is overbought (>70) or oversold (<30). Helps identify when prices might reverse.",

  sma: "Simple Moving Average - The average stock price over the last 50 time periods. Helps identify trends: price above SMA = uptrend, below = downtrend.",

  vwap: "Volume Weighted Average Price - The average price weighted by trading volume. Institutional traders use this as a benchmark for good execution.",

  priceMomentum: "Whether the stock price is moving UP, DOWN, or staying FLAT compared to the previous price.",

  // Decision Quality
  decisionMix: "Breakdown of the AI's decisions by cash and exposure levels. Shows how the AI behaves in different capital situations.",

  executedBuys: "BUY decisions that actually resulted in a trade. Some BUYs aren't executed if there's not enough cash or position limits are reached.",

  // Risk Metrics
  sharpeRatio: "Risk-adjusted return - Higher is better. Shows how much return you're getting for the amount of risk you're taking. Above 1.0 is good.",

  maxDrawdown: "The largest peak-to-valley loss from your highest portfolio value. Shows the worst-case scenario you've experienced.",

  // Performance
  avgWin: "The average profit on winning trades. Higher is better - means your wins are substantial.",

  avgLoss: "The average loss on losing trades. Lower (closer to $0) is better - means you're cutting losses quickly.",

  profitFactor: "Total profits divided by total losses. Above 1.0 means you're making more than you're losing. 2.0 = you make $2 for every $1 you lose."
}

export type TooltipKey = keyof typeof tooltips
