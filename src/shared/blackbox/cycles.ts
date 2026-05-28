import { CYCLES, type Cycle, type CycleData, type DailyFlow } from "./types.js";
import { trailingSum, rollingNormalize } from "./util.js";

/**
 * Build per-cycle windowed series from daily flow.
 *   DMx = trailing sum of dm over x days   (Mặc định raw)
 *   DSx = trailing sum of ds over x days
 *   speed_x = DMx − DSx                     (Tốc độ / EM)
 *   CHDMx/CHDSx = 50-session 0-100 normalize (Chuẩn hóa — drives Uốn signals)
 */
export function cycleSeries(flows: DailyFlow[]): Record<Cycle, CycleData> {
  const dmDaily = flows.map((f) => f.dm);
  const dsDaily = flows.map((f) => f.ds);
  const result = {} as Record<Cycle, CycleData>;

  for (const cycle of CYCLES) {
    const dm = trailingSum(dmDaily, cycle);
    const ds = trailingSum(dsDaily, cycle);
    const speed = dm.map((v, i) =>
      Number.isFinite(v) && Number.isFinite(ds[i]) ? v - ds[i] : NaN,
    );
    result[cycle] = {
      dm,
      ds,
      speed,
      chdm: rollingNormalize(dm, 50),
      chds: rollingNormalize(ds, 50),
    };
  }
  return result;
}
