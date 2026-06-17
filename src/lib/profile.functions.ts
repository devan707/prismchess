import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UsernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/, "Username must be lowercase letters, numbers, or underscores");

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, created_at, onboarded, avatar")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      isAdmin: roles.includes("admin"),
      isModerator: roles.includes("moderator"),
      roles,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: UsernameSchema,
        display_name: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ username: data.username, display_name: data.display_name })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: UsernameSchema,
        display_name: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        username: data.username,
        display_name: data.display_name,
        onboarded: true,
      })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const isUsernameAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ username: UsernameSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .neq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { available: !row };
  });
