import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_FILENAME = ".ogit.kdl";

export const findConfigFile = (startDir: string): string | undefined => {
    let dir = path.resolve(startDir);
    while (true) {
        const candidate = path.join(dir, CONFIG_FILENAME);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
};
