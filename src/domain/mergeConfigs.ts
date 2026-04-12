import type { OgitConfig } from "./OgitConfig.ts";

export const mergeConfigs = (...configs: ReadonlyArray<OgitConfig>): OgitConfig => {
    const result: Record<string, unknown> = {};
    for (const config of configs) {
        for (const [key, value] of Object.entries(config)) {
            if (value === undefined) continue;
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                result[key] = { ...(result[key] as Record<string, unknown> ?? {}), ...value };
            } else {
                result[key] = value;
            }
        }
    }
    return result as OgitConfig;
};
