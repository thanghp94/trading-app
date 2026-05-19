import 'dotenv/config';
import { writeFileSync } from 'fs';
import { DnseAdapter } from '../dist/server/server/adapters/dnse-adapter.js';

// Rổ VN100 (90 mã phổ biến và thanh khoản tốt nhất)
const VN100 = [
  "ACB", "BCG", "BID", "BVH", "CII", "CTG", "DBC", "DCM", "DGC", "DGW",
  "DHC", "DIG", "DPM", "DXG", "EIB", "FPT", "FRT", "FTS", "GAS", "GEX",
  "GMD", "HCM", "HDB", "HDC", "HDG", "HHV", "HPG", "HSG", "KBC", "KDC",
  "KDH", "LPB", "MBB", "MSB", "MSN", "MWG", "NKG", "NLG", "NVL", "OCB",
  "PAN", "PC1", "PDR", "PHR", "PLX", "PNJ", "POW", "PTB", "PVD", "PVT",
  "REE", "SAB", "SBT", "SCS", "SHB", "SJS", "SSB", "SSI", "STB", "SZC",
  "TCB", "TCH", "TPB", "VCB", "VCG", "VCI", "VGC", "VHC", "VHM", "VIB",
  "VIC", "VIX", "VJC", "VND", "VNM", "VPB", "VPI", "VRE", "CTR", "VGI",
  "MCH", "VEA", "IDC", "BSR", "QNS", "VSN", "FOX", "VTP", "SIP", "NAB"
];

async function verifyAndSaveSymbols() {
    const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);
    const validSymbols = [];
    
    console.log(`Verifying ${VN100.length} symbols with DNSE API...`);
    
    // Batch requests in chunks of 10 to not overwhelm connection
    const chunks = [];
    for (let i = 0; i < VN100.length; i += 10) {
        chunks.push(VN100.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
        const promises = chunk.map(async (sym) => {
            try {
                const toSec = Math.floor(Date.now() / 1000);
                const fromSec = toSec - 86400 * 5; // just need to know if it exists
                const data = await adapter.fetchHistorical({
                    symbol: sym, timeframe: '1d', limit: 1, sinceSec: fromSec
                });
                return { sym, ok: data.length > 0 };
            } catch (e) {
                return { sym, ok: false };
            }
        });
        
        const results = await Promise.all(promises);
        for (const r of results) {
            if (r.ok) {
                validSymbols.push(r.sym);
                process.stdout.write(`\x1b[32m${r.sym}\x1b[0m `);
            } else {
                process.stdout.write(`\x1b[31m${r.sym}\x1b[0m `);
            }
        }
    }
    
    console.log(`\n\nFound ${validSymbols.length}/${VN100.length} valid symbols.`);
    
    // Save to data folder
    const outputPath = './data/vn_symbols.json';
    writeFileSync(outputPath, JSON.stringify(validSymbols, null, 2));
    console.log(`Saved to ${outputPath}`);
    
    process.exit(0);
}

verifyAndSaveSymbols();