import { spawn } from "node:child_process";

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

/**
 * Spawns `python <scriptPath> <arg>` and resolves its stdout. Rejects with a
 * plain Error (non-zero exit, spawn failure) — callers wrap it in a typed error.
 */
export function spawnPythonJson(
  scriptPath: string,
  arg: string,
  timeoutMs = 30_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [scriptPath, arg], { timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`python exited ${code}: ${stderr.trim() || "no stderr"}`),
        );
        return;
      }
      resolve(stdout);
    });
  });
}
