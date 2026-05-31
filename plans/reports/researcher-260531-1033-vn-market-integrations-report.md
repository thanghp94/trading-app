# VN Market Data & Feature Integration Research

**Task:** Identify concrete data + feature integrations worth adding to trading-app, grounded in what real VN apps actually ship.

**Scope:** VN stock market, gold market, cross-asset features. Three research areas below.

---

## 1. VN STOCK-MARKET APPS: DISTINCTIVE DATA & FEATURES

### Apps & Integrations Surveyed

**FireAnt (Market Leader, 95% CSAT)**
- Data: Real-time OHLCV (every 1sec), technical charts, insider trades, company profiles
- Distinctive: News sentiment tagging, market pulse digest (daily curated news), multi-condition alert system
- API: Closed; scraped via VN Stock API MCP (unofficial)
- Free tier: Yes; paywalled: Pro (149k/mo), Premium (599k/mo)

**TCBS TCInvest**
- Data: 1,350+ company financial statements (balance sheet, P/E, P/B, ROE), VN30F derivatives charts, hedging tools
- Distinctive: One-click financial report system, sector/industry heatmaps, derivatives basis (VN30F), margin lending list
- API: Limited public docs; vnstock lib partial support
- Cost: Free mobile app; margin/derivatives require brokerage account

**DNSE Entrade X**
- Data: Real-time stocks + VN30F futures, warrant data, minute-by-minute updates
- Distinctive: AI suggests investment strategies, loan packages (margin), zero-fee trading (DNSE internal)
- API: Closed; proprietary to DNSE brokers only
- Access: App only; no public API

**SSI iBoard Pro**
- Data: Real-time trading data, warrants, ETFs, derivatives, S-Products (fixed income)
- Distinctive: Personalized watchlist/alerts, alert conditions on price/technicals/volume
- API: Closed; proprietary
- Access: iBoard Pro (web); restricted to SSI account holders

**Simplize, Vietstock, CafeF**
- Simplize: Community sentiment, AI-powered screening (not heavily documented)
- Vietstock: 24/7 global + VN data, real-time charts, news
- CafeF: News-heavy platform, news sentiment tags, market digest
- API Access: All closed; news scraping possible via CafeF unofficial feeds

### FREE/UNOFFICIAL APIs AVAILABLE

| Data | Source | API | Update Cadence | Why VN Retail Values |
|------|--------|-----|-----------------|----------------------|
| Stock OHLCV + financials | vnstock (Python lib) | Open-source; covers insider/foreign | Real-time (5sec batch) | Battle-tested, covers foreign ownership flow |
| News + sentiment | CafeF scrape | Unofficial; news-tagging available | 5min | Tracks sentiment shift on stocks |
| VN30 Index + technicals | VN Stock API MCP | Unofficial; aggregates multi-broker | 1sec | Unified access across HOSE/HNX/Upcom |
| Insider/foreign trades | vnstock foreign module | Open-source | 1-5min batches | Identifies accumulation/distribution by foreign entities |

### KEY GAPS IN MARKET DATA

- **Order book depth & bid-ask imbalance:** Only SSI iBoard + DNSE Entrade offer live L2 data (proprietary access). Retail can't access via public API.
- **Foreign flow real-time:** vnstock provides historical; real-time requires brokerage API (VNDirect, SSI, TCBS internal only).
- **Proprietary/self-trading flow:** Not exposed publicly; insider module in vnstock is best proxy.
- **VN30F basis (futures vs index spread):** TCBS charts show it; no public calculation API.
- **Margin availability + utilization rates:** TCBS lists eligible securities; actual utilization not public.

---

## 2. GOLD MARKET INTEGRATION (VN + WORLD PRICING)

### Domestic Gold Pricing (SJC, PNJ, DOJI)

**APIs Available**

| Dealer | Endpoint | Provider | Update Cadence | Free/Paid |
|--------|----------|----------|-----------------|-----------|
| SJC | /api/sjc | vn-gold-price-api (GitHub) | ~5-15min (scraped) | Free |
| DOJI | /api/doji | vn-gold-price-api | ~5-15min (scraped) | Free |
| PNJ | /api/pnj | vn-gold-price-api | ~5-15min (scraped) | Free |
| All 3 | /api/v2/gold/{sjc,doji,pnj} | vAPI (VNAppMob) | 5min guaranteed | Free |

**Buy/Sell Spread Signals**
- SJC/PNJ/DOJI publish separate buy/sell prices; spread widens → indicates low liquidity, high friction
- Traders want: Alert when SJC-PNJ spread > threshold (indicates dealer divergence)
- Data: JSON includes buy_price, sell_price per update

**World Gold (XAU/USD)**
- Sources: Metals-API (free), GoldPriceZ, MetalpriceAPI
- Update: Real-time (Metals-API) or 5-15min (others)
- **SJC-vs-world premium spread:** VN-specific signal = (SJC_price_VND / USD_VND_rate) - XAU_USD. Tracks if VN gold trades at premium/discount vs world.

### MXV Commodity Futures (Gold + Metals)

- Exchange: Mercantile Exchange of Vietnam (only national commodity market)
- Gold contracts: Standard, mini, micro futures (tied to COMEX/LME)
- Data access: MXV website + broker APIs only; no free public API found
- Retail interest: Basis trading (MXV gold futures vs spot SJC), hedging portfolio with futures

**Gap:** MXV price feed not exposed via public API; requires broker integration (Prospero, etc.).

---

## 3. CROSS-ASSET FEATURES RETAIL VN TRADERS VALUE

### Single Watchlist Across Assets
- **App precedent:** FireAnt (stocks only), Entrade X (stocks + derivatives)
- **Not yet unified:** No major VN app offers single watchlist spanning stock+gold+crypto+forex
- **Why retail wants:** Time-poor traders (~2-3 daily check-ins), track portfolio at a glance
- **Tech lift:** Moderate (normalize symbols, aggregate prices from heterogeneous sources)

### Daily Market Pulse Digest
- **Precedent:** FireAnt news digest (curated daily), CafeF market digest
- **Distinctive for VN:** Include gold/crypto + stock sentiment, SJC-vs-world premium, FX moves
- **Format:** Push notification + email, 1-paragraph market summary + top 5 movers + alerts triggered
- **Sentiment signals:** Count bullish vs bearish articles, flag major news events

### Telegram Bot Integration
- **Global precedent:** Crypto (Telegram dominant), not yet stock
- **VN trading communities:** Telegram groups 1k-10k members; hand-paste signals common
- **What retail wants:** 1-click limit order from Telegram alert, watchlist broadcast, trade summary
- **Gap:** VN stock brokers don't expose Telegram bots natively; DIY integrations via n8n/zapier (confirmed in project memory: auto.meraki.edu.vn n8n instance available)

### AI-Summarized "Why Did This Move?"
- **App precedent:** Entrade X (AI suggests strategies); limited news-linking
- **Distinctive:** Link price move to 1-2 tagged news articles + sentiment shift, not just chart pattern
- **Data:** Requires news API + NLP sentiment; CafeF/FireAnt both have sentiment tagging

---

## RANKED INTEGRATIONS BY SIGNAL-VALUE / EFFORT

**Tier 1: Highest value, lowest effort (1-2 weeks)**

1. **Gold SJC/PNJ/DOJI Price Feed + Buy/Sell Spread Alerts**
   - Data: vAPI (free, 5min updates)
   - Why: SJC gold is 2nd most-tracked asset in VN after stocks; premium-spread signals track dealer liquidity
   - Effort: Fetch 3 endpoints, store prices, compute spread, alert on threshold

2. **Foreign Ownership Flow Tracking (via vnstock)**
   - Data: vnstock.stock.foreign_traders() API
   - Why: Foreign entities drive VN30 momentum; retail watches accumulation/distribution
   - Effort: Wrapper + time-series storage of foreign buy/sell volumes

3. **VN30F Basis Calculation (futures vs index)**
   - Data: VN30 spot (vnstock) + VN30F price (TCBS charts, requires scrape OR broker API)
   - Why: Basis > 0 = contango (carry cost implied); basis < 0 = backwardation (demand for immediate). Retail hedgers watch this.
   - Effort: Scrape TCBS real-time VN30F + compute spread; ~2 days

**Tier 2: High value, moderate effort (2-4 weeks)**

4. **Unified Stock + Gold + Crypto Watchlist**
   - Data: vnstock + vAPI (gold) + CoinGecko (crypto)
   - Why: Lazy retail doesn't want 3 apps
   - Effort: Symbol normalization, aggregation service, UI consolidation

5. **Daily Market Digest (Stock + Gold + Crypto + Sentiment)**
   - Data: CafeF news (scrape) + vnstock sentiment + gold spread + BTC dominance
   - Why: Single notification replaces 5 app-opens for daily trader
   - Effort: Sentiment aggregation, scheduling, template; ~3 days

**Tier 3: Nice-to-have, higher effort (3-8 weeks)**

6. **Telegram Bot (Price Alerts + Limit Orders)**
   - Data: All above + broker API (VNDirect, TCBS, SSI)
   - Why: Telegram-native; VN trading communities already there
   - Effort: n8n workflow (proof: auto.meraki.edu.vn), broker OAuth, state management

7. **AI Summary: Why Did X Move?**
   - Data: CafeF news API + sentiment tagger + LLM
   - Why: Differentiates vs competitors; time-poor trader appeal
   - Effort: News-to-price correlation, prompt engineering, real-time LLM calls (~4 weeks)

---

## UNRESOLVED QUESTIONS

1. **Real-time foreign flow**: Does vnstock cover intraday foreign buy/sell, or only daily settlement? (May need broker API instead.)
2. **VN30F data source**: TCBS charts are real-time but behind login. Any public/unofficial VN30F price feed?
3. **CafeF news API**: Is there a published CafeF API, or only scraping possible?
4. **Broker OAuth landscape**: Which VN brokers (VNDirect, SSI, TCBS) expose modern APIs (OAuth, REST, webhooks) vs legacy SOAP/custom?
5. **MXV gold futures pricing**: Why no public API for commodity exchange? Regulatory, technical, or market-structure reason?

---

## SOURCES

- [FireAnt Mobile - Official](https://fireant.vn/)
- [vnstock Python Library](https://github.com/thinh-vu/vnstock)
- [vn-gold-price-api GitHub](https://github.com/namtrhg/vn-gold-price-api)
- [vAPI Gold Price Documentation](https://vapi.vnappmob.com/gold.v2.html)
- [TCBS Individual Trading](https://www.tcbs.com.vn/en/individual/)
- [MXV - Mercantile Exchange of Vietnam](https://en.mxv.com.vn/)
- [Top 5 VN Stock Market Apps](https://mytour.vn/en/blog/bai-viet/top-5-stock-market-apps-in-vietnam-right-now.html)
