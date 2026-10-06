import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req));
