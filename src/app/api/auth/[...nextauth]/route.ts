// Auth.js endpoints: /api/auth/signin, /api/auth/callback/google, /api/auth/signout, ...
import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
