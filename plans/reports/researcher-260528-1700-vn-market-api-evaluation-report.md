# Vietnamese Stock Market API Research Report
**Date:** 2026-05-28 | **Researcher:** Technical Analyst  
**Goal:** Identify best free/public sources for (a) all-stock snapshot with sector, (b) foreign buy/sell (khối ngoại), (c) intraday cumulative volume by minute.

---

## Executive Summary

**Verdict:** No single "perfect" API. **SSI FastConnect** is the strongest general-purpose choice (real-time data, intraday OHLCV, market breadth). **DNSE LightSpeed** required for institutional-grade speed but needs authentication. **vnstock wrapper** best for research/rapid prototyping. Foreign investor data remains sparse in public APIs—Vietstock Finance only source found but requires direct integration.

**Recommendation ranking:**
1. **SSI FastConnect Data** — Best for (a) all-stock snapshot + (c) intraday volume
2. **DNSE LightSpeed API** — Best for real-time low-latency needs; lacks public docs
3. **vnstock (TCBS wrapper)** — Best for free/quick prototyping; read-only; (b) not available
4. **VNDirect finfo-api** — Limited; stock prices only
5. **Vietstock Finance API** — Only source for (b) foreign investor; requires SSO

---

## API Evaluation Matrix

| **Criteria** | **SSI FC Data** | **DNSE LightSpeed** | **vnstock** | **VNDirect** | **Vietstock** |
|---|---|---|---|---|---|
| **All-stock snapshot** | ✅ Yes (`GetSecuritiesList`) | ✅ Yes (`plaintext/quotes/stock/SI`) | ✅ Yes (via wrapper) | ❌ Single symbol only | ❌ No |
| **Sector grouping** | ⚠️ Via index components | ⚠️ Via index components | ❌ No direct | ❌ No | ❌ No |
| **Intraday OHLCV** | ✅ Yes (`IntradayOhlc`) | ✅ Yes (`plaintext/quotes/stock/tick`) | ⚠️ Limited fidelity | ❌ No | ❌ No |
| **Foreign flow (khối ngoại)** | ❌ Not documented | ❌ Not documented | ❌ Not available | ❌ No | ✅ Yes (API) |
| **Auth required** | ✅ Bearer token (free tier via iBoard) | ✅ JWT + OTP (trading); REST token (data) | ❌ Free (guest/community) | ❌ None | ✅ SSO required |
| **Rate limits** | Unknown (undocumented) | Unknown | 20–60 req/min (free tier) | Unknown | Unknown |
| **Update frequency** | Real-time | Real-time | Delayed (30min+) | EOD | Delayed |
| **Cost** | Free (iBoard registration) | Free (account required) | Free (no ads: community tier) | Free | Free (restricted access) |
| **Maturity** | High (institutional) | High (SSI group) | Medium (community-driven) | Low | Medium |
| **Documentation** | ⭐⭐⭐⭐ (good) | ⭐⭐ (scattered) | ⭐⭐⭐ (GitHub) | ⭐ (minimal) | ⭐⭐ (undocumented) |

---

## Detailed Findings

### 1. SSI FastConnect Data API (Recommended for Production)

**Source:** [SSI FastConnect API Guide](https://guide.ssi.com.vn/ssi-products/fastconnect-data)  
**Base URL:** `https://fc-data.ssi.com.vn/`

#### Key Endpoints for Your Needs

**a) All-Stock Snapshot**
```
GET /api/Market/Securities?pageIndex=0&pageSize=5000&market=hose
```
- **Response schema:** `Symbol`, `StockName`, `Market`, `StockEnName`
- **Limitation:** Paginated; need to loop through pages for full snapshot
- **Frequency:** Real-time

**b) Daily Stock Price (intraday ready)**
```
GET /api/Market/DailyStockPrice?Symbol=VNM&FromDate=2026-05-28&ToDate=2026-05-28
```
- **Response:** Last price, % change, volume, value, bid/ask
- **Frequency:** Real-time
- **Note:** Does NOT return minute-level cumulative volume

**c) Intraday OHLC (minute-level cumulative)**
```
GET /api/Market/IntradayOhlc?Symbol=VNM&FromDate=2026-05-28&ToDate=2026-05-28
```
- **Response:** Open, High, Low, Close, Volume, Value per time interval
- **Granularity:** Likely 1-min (not explicitly stated in docs)
- **Frequency:** Real-time

**d) Market Breadth (Advance/Decline count)**
- **Via index data:** `GET /api/Market/DailyIndex?IndexCode=VN30`
- **Schema:** `Advances`, `NoChanges`, `Declines` fields present
- **Note:** Index-level only; no sector-specific breakdown in API docs

#### Authentication
- **Method:** Bearer token (JWT)
- **Setup:** Free iBoard account registration at `https://iboard.ssi.com.vn`
- **Consumer credentials:** ID + Secret obtained post-registration

#### Adoption Assessment
- **Maturity:** ⭐⭐⭐⭐⭐ (institutional-grade; SSI group company)
- **Breaking changes:** Low risk (mature platform)
- **Community size:** Small (SSI customers only; ~5K+ professional users estimated)
- **Maintenance:** Active (SSI engineers)

**Trade-offs:**
- ✅ Real-time, comprehensive market data, sector components via index API
- ✅ Official documentation, maintained
- ✅ Streaming support for live updates
- ❌ Requires registration (not true "public")
- ❌ Sector-level snapshot requires loop through all sectors
- ❌ No foreign investor data

---

### 2. DNSE LightSpeed API (Low-Latency Alternative)

**Source:** [DNSE Developers Portal](https://developers.dnse.com.vn/) | [ENTRADE Documentation](https://hdsd.dnse.com.vn/san-pham-dich-vu/lightspeed-api)

**Base URL:** `https://api.dnse.com.vn/` (REST) + WebSocket `datafeed-lts-krx.dnse.com.vn:443/wss` (streaming)

#### Key Endpoints

**a) Stock Info Snapshot**
```
GET /plaintext/quotes/stock/SI/{symbol}
```

**c) Tick Data (high-fidelity intraday)**
```
GET /plaintext/quotes/stock/tick/{symbol}
```

**d) Market Index**
```
GET /plaintext/quotes/index/MI/{marketID}
```
- **marketID examples:** `VN30`, `VNALLSHARE`, `VNINDEX`, `HNX30`

#### Authentication
- **Method:** Layer 1: Account + password → JWT token; Layer 2: OTP (for trading only)
- **For data-only:** REST token sufficient
- **Cost:** Free (account required)

#### Adoption Assessment
- **Maturity:** ⭐⭐⭐⭐ (DNSE official; used by algorithmic traders)
- **Community size:** Medium (1000+ members in Zalo community)
- **Documentation:** Fragmented across multiple hdsd.dnse.com.vn subdomains
- **Support:** +84 247 108 9234 (Vietnamese-only hours)

**Trade-offs:**
- ✅ Lowest documented latency ("fastest market processing")
- ✅ WebSocket streaming support
- ✅ Tick-level granularity
- ❌ Documentation scattered; no consolidated API reference
- ❌ No foreign investor data
- ❌ Requires account creation
- ⚠️ No sector grouping endpoint documented

**Confidence:** 65% — endpoint URLs inferred from search results; official docs not directly accessible

---

### 3. vnstock Python Library (Best for Rapid Prototyping)

**Source:** [GitHub: thinh-vu/vnstock](https://github.com/thinh-vu/vnstock) | [PyPI](https://pypi.org/project/vnstock/)

**Wrapper layer:** Python bindings over TCBS (read-only) + SSI FastConnect APIs

#### Capabilities

```python
from vnstock import *

# All-stock snapshot (TCBS backend)
stocks = stock.get_listing_companies(exchange='HOSE', columns=['symbol', 'name', 'sector'])

# Intraday OHLCV (TCBS)
data = stock.get_intraday_data(symbol='VNM', resolution='1')  # 1 = 1-minute

# Index data
index = index.get_quote(symbol='VN30')
```

#### Limitations
- ❌ **No foreign investor data** (TCBS restriction)
- ⚠️ TCBS recently enforced user authentication; direct access now restricted
- ⚠️ Intraday data subject to TCBS API changes (documented in issues)
- ✅ Free tier: 20 req/min (guest) → 60 req/min (community tier)

#### Adoption Assessment
- **Maturity:** ⭐⭐⭐ (active community; ~100+ GitHub stars)
- **Risk:** Medium — TCBS frequently changes API; last major deprecation noted in early 2026
- **Support:** Community-driven (GitHub issues); no commercial SLA
- **Learning curve:** Low (Pythonic API)

**Best for:** Research, backtesting, ad-hoc queries. **Not suitable** for production real-time feeds.

---

### 4. VNDirect finfo-api (Limited)

**Source:** [GitHub wrapper](https://github.com/nguyenngocbinh/vnstock)

**Base URL:** `https://finfo-api.vndirect.com.vn/v4/`

#### Available Endpoints
```
GET /stock_prices?code={symbol}&date={YYYY-MM-DD}
GET /stocks?symbol={symbol}
```

#### Assessment
- ✅ Simple, no auth required
- ❌ Single symbol only; no bulk snapshot
- ❌ No intraday; EOD only
- ❌ No sector/foreign investor data
- ⭐⭐ Low maturity; frequently broken (community reports)

**Verdict:** Avoid for your use case.

---

### 5. Vietstock Finance API (Only Source for Foreign Investor Data)

**Source:** [Vietstock Finance API Portal](https://finance.vietstock.vn/API)

**Endpoint:** Analysis of foreign investor buy/sell (khối ngoại) transactions

#### What It Provides
- Matching batch analysis
- Trading history (foreign investor, proprietary, agreement segmentation)
- Monthly/quarterly/annual statistics

#### Limitations
- ✅ Only API documenting foreign investor flow
- ❌ Requires SSO (corporate account)
- ❌ No public REST endpoints; appears to be internal-API-only or requires direct integration
- ❌ No free tier identified

**Confidence:** 40% — search results reference capability but no working endpoint found

---

## Foreign Investor Data (khối ngoại) — GAP ANALYSIS

**Finding:** No free public API provides foreign buy/sell data with good coverage.

### Available Options

| Source | Method | Auth | Coverage | Status |
|---|---|---|---|---|
| **Vietstock** | (Unknown; likely SSO) | Corporate SSO | Daily summaries | Undocumented |
| **Scrapers** (CafeF, SSI iBoard) | HTML scraping | None | Snapshot | Fragile; ToS violation |
| **Brokerage APIs** | Proprietary | Account-based | Real-time (subscribers) | Not public |

### Recommendation for (b)
**Implement hybrid approach:**
1. **Primary:** SSI FastConnect `DailyStockPrice` (missing foreign flow; shows only net volume)
2. **Secondary:** Vietstock Finance direct contact or reverse-engineer via browser DevTools
3. **Fallback:** Daily EOD manual web scrape (CafeF, SSI iBoard) for display-only purposes

**Cost of not having real foreign flow API:** Decision-making lags by hours; no tick-level granularity.

---

## Architectural Fit Assessment

### For Your Trading App (current stack: Node/TS, Payload CMS, React)

**Recommendation priority:**

1. **Tier 1 (Core):** SSI FastConnect Data + DNSE LightSpeed WebSocket
   - Combines completeness (SSI) with low-latency streaming (DNSE)
   - Setup: 2 API keys, separate authentication layers
   - Estimated integration effort: 1–2 weeks

2. **Tier 2 (Fallback):** vnstock Python bridge
   - Useful for backfill, research, non-critical queries
   - Setup: Python subprocess or GraphQL wrapper
   - Estimated effort: 3–5 days

3. **Tier 3 (Manual supplement):** Vietstock Finance scrape for foreign investor
   - Until proper API available
   - Estimated effort: 1–2 days (with maintenance overhead)

### Sector Grouping (Treemap Data)

**Issue:** None of the APIs directly return sector-aggregated market cap or live sector snapshot.

**Workaround:**
```
1. Fetch all stocks from SSI (500+ symbols)
2. Fetch sector assignments from index components:
   - VNFIN (Finance)
   - VNIND (Industrial)
   - VNIT (IT)
   - VNREALEST (Real Estate)
   - etc.
3. Aggregate by sector server-side
4. Cache for 5–10 minutes (refresh on major market moves)
```

**Performance:** O(n) grouping; feasible with 1 API call per sector index.

---

## Code Examples

### SSI FastConnect: All-Stock Snapshot with Sector

```typescript
// Pseudocode
const accessToken = await ssi.getAccessToken(consumerId, consumerSecret);

const allStocks = await ssi.get('/api/Market/Securities', {
  headers: { Authorization: `Bearer ${accessToken}` },
  pageSize: 5000, // Adjust per rate limits
  market: 'hose'
});

// Sector data via index components
const sectorMap = {};
for (const sector of ['VNFIN', 'VNIND', 'VNIT', ...]) {
  const components = await ssi.get(`/api/Market/IndexComponents`, {
    indexCode: sector,
    pageSize: 500
  });
  sectorMap[sector] = components.map(c => c.symbol);
}

// Build snapshot with sectors
const snapshot = allStocks.map(stock => ({
  symbol: stock.symbol,
  price: stock.lastPrice,
  change: stock.priceChange,
  volume: stock.volume,
  sector: findSectorForSymbol(stock.symbol, sectorMap)
}));
```

### DNSE WebSocket: Real-Time Tick Data

```typescript
// Pseudocode
import WebSocket from 'ws';

const ws = new WebSocket('wss://datafeed-lts-krx.dnse.com.vn:443/wss');

ws.on('open', () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    topics: ['plaintext/quotes/stock/tick/VNM', 'plaintext/quotes/stock/tick/HPG']
  }));
});

ws.on('message', (msg) => {
  const tick = JSON.parse(msg);
  console.log(`${tick.symbol}: ${tick.price} x ${tick.volume}`);
});
```

---

## Unresolved Questions

1. **DNSE rate limits / subscription tiers:** Not documented; unclear if data API has per-key limits
2. **SSI IntradayOhlc time granularity:** Docs don't specify 1-min vs 5-min vs other; needs verification via test call
3. **Vietstock foreign investor API endpoint:** Appears internal-only; requires reverse engineering or direct contact
4. **Sector-level market breadth:** Is there a way to get advance/decline per sector without looping indices?
5. **VNDirect API status:** Community reports frequent breakage; unknown maintenance window or deprecation schedule

---

## Next Steps

1. **Verify SSI endpoints** with test credentials (get free iBoard account)
   - Confirm `IntradayOhlc` granularity (1-min? 5-min?)
   - Confirm rate limits under production load
   
2. **Document DNSE WebSocket schema** (currently inferred from old docs)
   - Test live tick subscription
   - Measure latency (claimed "fastest")
   
3. **Contact Vietstock Finance** for foreign investor API access
   - Clarify authentication method
   - Inquire about refresh frequency, historical depth
   
4. **Prototype dual-source ingestion:**
   - SSI for core snapshot + intraday volume
   - DNSE WebSocket for low-latency alerts/updates
   - Fallback to vnstock for backfill/research

---

## Sources

- [DNSE OpenAPI Developers Portal](https://developers.dnse.com.vn/)
- [DNSE ENTRADE LightSpeed API Documentation](https://hdsd.dnse.com.vn/san-pham-dich-vu/lightspeed-api)
- [SSI FastConnect API Guide](https://guide.ssi.com.vn/ssi-products/fastconnect-data)
- [SSI FastConnect API Specs](https://guide.ssi.com.vn/ssi-products/fastconnect-data/api-specs)
- [vnstock GitHub Repository](https://github.com/thinh-vu/vnstock)
- [vnstock PyPI Package](https://pypi.org/project/vnstock/)
- [VNDirect API Wrapper (GitHub)](https://github.com/nguyenngocbinh/vnstock)
- [Vietstock Finance API](https://finance.vietstock.vn/API)
- [SSI Securities FastConnect Python Client](https://github.com/SSI-Securities-Corporation/python-fcdata)
- [Vietstock Foreign Investor Transaction Analysis](https://finance.vietstock.vn/API/thong-ke-giao-dich.htm)
- [Vietnam Stock API Integration Guide 2026 (Medium)](https://medium.com/@wutainfofu/2026-vietnam-stock-exchange-vn30-hose-api-integration-guide-072173b4ce0b)
- [AlgoTrade VN Stock Market API Knowledge Hub](https://hub.algotrade.vn/knowledge-hub/api-in-vietnam-stock-market/)
