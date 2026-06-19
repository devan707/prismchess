import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Design, Move } from "@/game/types";

const ColorSchema = z.enum(["w", "b"]);
const ResultSchema = z.enum(["w", "b", "draw"]);

export interface SoloGameDetail {
  id: string;
  designName: string;
  design: Design;
  difficulty: string;
  humanColor: "w" | "b";
  result: "w" | "b" | "draw";
  resultReason: string;
  moves: Move[];
  endedAt: string;
}

export const getSoloGame = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SoloGameDetail> => {
    const { data: row, error } = await context.supabase
      .from("solo_games")
      .select("id, design_name, design, difficulty, human_color, result, result_reason, moves, ended_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Game not found");
    return {
      id: row.id,
      designName: row.design_name,
      design: row.design as unknown as Design,
      difficulty: row.difficulty,
      humanColor: row.human_color as "w" | "b",
      result: row.result as "w" | "b" | "draw",
      resultReason: row.result_reason,
      moves: (row.moves as unknown as Move[]) ?? [],
      endedAt: row.ended_at,
    };
  });

export const recordSoloGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        designName: z.string().min(1).max(120),
        design: z.object({}).passthrough(),
        difficulty: z.string().min(1).max(40),
        humanColor: ColorSchema,
        result: ResultSchema,
        resultReason: z.string().min(1).max(40),
        moves: z.array(z.object({}).passthrough()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("solo_games")
      .insert({
        user_id: context.userId,
        design_name: data.designName,
        design: data.design as never,
        difficulty: data.difficulty,
        human_color: data.humanColor,
        result: data.result,
        result_reason: data.resultReason,
        moves: data.moves as never,
        ply_count: data.moves.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteSoloGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("solo_games")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface HistoryEntry {
  source: "solo" | "multiplayer";
  id: string;
  designName: string;
  endedAt: string;
  // From my perspective.
  outcome: "win" | "loss" | "draw" | "unfinished";
  resultReason: string | null;
  // Solo-only
  difficulty?: string;
  humanColor?: "w" | "b";
  // MP-only
  opponentName?: string | null;
  status?: "open" | "active" | "finished" | "aborted";
  timeControl?: string;
}

export const listGameHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = context.userId;

    const [{ data: solo, error: sErr }, { data: mp, error: mErr }] = await Promise.all([
      context.supabase
        .from("solo_games")
        .select("id, design_name, difficulty, human_color, result, result_reason, ply_count, ended_at")
        .eq("user_id", me)
        .order("ended_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("matches")
        .select(
          "id, host_id, guest_id, design_name, time_control, status, host_color, result, result_reason, created_at, updated_at, finished_at",
        )
        .or(`host_id.eq.${me},guest_id.eq.${me}`)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (mErr) throw new Error(mErr.message);

    const opponentIds = Array.from(
      new Set(
        (mp ?? [])
          .map((r) => (r.host_id === me ? r.guest_id : r.host_id))
          .filter((v): v is string => !!v),
      ),
    );
    const profMap: Record<string, { username: string; display_name: string | null }> = {};
    if (opponentIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", opponentIds);
      for (const p of profs ?? []) profMap[p.id] = { username: p.username, display_name: p.display_name };
    }

    const soloEntries: HistoryEntry[] = (solo ?? []).map((r) => {
      const outcome: HistoryEntry["outcome"] =
        r.result === "draw" ? "draw" : r.result === r.human_color ? "win" : "loss";
      return {
        source: "solo",
        id: r.id,
        designName: r.design_name,
        endedAt: r.ended_at,
        outcome,
        resultReason: r.result_reason,
        difficulty: r.difficulty,
        humanColor: r.human_color as "w" | "b",
      };
    });

    const mpEntries: HistoryEntry[] = (mp ?? []).map((r) => {
      const myColor: "w" | "b" =
        r.host_id === me
          ? (r.host_color as "w" | "b")
          : r.host_color === "w"
            ? "b"
            : "w";
      const oppId = r.host_id === me ? r.guest_id : r.host_id;
      const opp = oppId ? profMap[oppId] ?? null : null;
      let outcome: HistoryEntry["outcome"] = "unfinished";
      if (r.status === "finished") {
        outcome = r.result === "draw" ? "draw" : r.result === myColor ? "win" : "loss";
      }
      return {
        source: "multiplayer",
        id: r.id,
        designName: r.design_name,
        endedAt: r.finished_at ?? r.updated_at ?? r.created_at,
        outcome,
        resultReason: r.result_reason,
        opponentName: opp?.display_name ?? opp?.username ?? null,
        status: r.status as HistoryEntry["status"],
        timeControl: r.time_control,
      };
    });

    return [...soloEntries, ...mpEntries].sort(
      (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
    );
  });
