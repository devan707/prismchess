import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isReservedUsername, TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

const UsernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/, "Username must be lowercase letters, numbers, or underscores")
  .refine((u) => !isReservedUsername(u), { message: "That username isn't available." });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id, username, display_name, created_at, onboarded, avatar, avatar_url, tos_version, privacy_version, tos_accepted_at, age_confirmed, marketing_opt_in, community_updates_opt_in, gameplay_notify_opt_in",
      )
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
        avatar: z.string().max(40).nullable().optional(),
        avatar_url: z.string().url().max(1024).nullable().optional(),
        age_confirmed: z.literal(true),
        tos_version: z.string().min(1).max(40),
        privacy_version: z.string().min(1).max(40),
        marketing_opt_in: z.boolean().optional(),
        community_updates_opt_in: z.boolean().optional(),
        gameplay_notify_opt_in: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.tos_version !== TOS_VERSION || data.privacy_version !== PRIVACY_VERSION) {
      throw new Error("Please review and accept the current Terms and Privacy Policy.");
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({
        username: data.username,
        display_name: data.display_name,
        avatar: data.avatar ?? null,
        avatar_url: data.avatar_url ?? null,
        onboarded: true,
        age_confirmed: true,
        tos_version: data.tos_version,
        tos_accepted_at: new Date().toISOString(),
        privacy_version: data.privacy_version,
        marketing_opt_in: data.marketing_opt_in ?? false,
        community_updates_opt_in: data.community_updates_opt_in ?? false,
        gameplay_notify_opt_in: data.gameplay_notify_opt_in ?? true,
      })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        marketing_opt_in: z.boolean().optional(),
        community_updates_opt_in: z.boolean().optional(),
        gameplay_notify_opt_in: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      marketing_opt_in?: boolean;
      community_updates_opt_in?: boolean;
      gameplay_notify_opt_in?: boolean;
    } = {};
    if (typeof data.marketing_opt_in === "boolean") patch.marketing_opt_in = data.marketing_opt_in;
    if (typeof data.community_updates_opt_in === "boolean") patch.community_updates_opt_in = data.community_updates_opt_in;
    if (typeof data.gameplay_notify_opt_in === "boolean") patch.gameplay_notify_opt_in = data.gameplay_notify_opt_in;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        avatar: z.string().max(40).nullable().optional(),
        avatar_url: z.string().url().max(1024).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, string | null> = {};
    if ("avatar" in data) patch.avatar = data.avatar ?? null;
    if ("avatar_url" in data) patch.avatar_url = data.avatar_url ?? null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) throw new Error(error.message);
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
