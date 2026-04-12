import { Effect, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const CONFIG_FILENAME = ".ogit.kdl";

export const findConfigFile = (startDir: string): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
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
