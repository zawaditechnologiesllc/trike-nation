import type { NextFunction, Request, Response } from "express";
import { supabase } from "./supabase";

export interface AuthedUser {
  id: string;
  email: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

export async function getUserFromRequest(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.authorization;
  if (!supabase || !header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user || !supabase) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!data?.is_admin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.user = user;
  next();
}
