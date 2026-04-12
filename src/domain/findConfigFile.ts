import { Effect, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as path from "node:path";

const CONFIG_FILENAME = ".ogit.kdl";

export const findConfigFile = (startDir: string): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
    Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        let dir = path.resolve(startDir);
        while (true) {
            const candidate = path.join(dir, CONFIG_FILENAME);
            const found = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false));
            if (found) {
                return Option.some(candidate);
            }
            const parent = path.dirname(dir);
            if (parent === dir) return Option.none();
            dir = parent;
        }
    });
