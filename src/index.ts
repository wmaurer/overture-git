import { Effect } from "effect";

const program = Effect.log("Hello from Overture Kit!");

Effect.runPromise(program);
