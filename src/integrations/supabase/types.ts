export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      ai_playbook_stats: {
        Row: {
          ai_draws: number
          ai_losses: number
          ai_wins: number
          games: number
          opening_book: Json
          piece_trade_outcomes: Json
          updated_at: string
          variant_id: string
        }
        Insert: {
          ai_draws?: number
          ai_losses?: number
          ai_wins?: number
          games?: number
          opening_book?: Json
          piece_trade_outcomes?: Json
          updated_at?: string
          variant_id: string
        }
        Update: {
          ai_draws?: number
          ai_losses?: number
          ai_wins?: number
          games?: number
          opening_book?: Json
          piece_trade_outcomes?: Json
          updated_at?: string
          variant_id?: string
        }
        Relationships: []
      }
      ai_training_games: {
        Row: {
          ai_color: string
          created_at: string
          difficulty: string
          id: string
          move_count: number
          moves: Json
          result: string
          user_id: string
          variant_id: string
        }
        Insert: {
          ai_color: string
          created_at?: string
          difficulty: string
          id?: string
          move_count?: number
          moves?: Json
          result: string
          user_id: string
          variant_id: string
        }
        Update: {
          ai_color?: string
          created_at?: string
          difficulty?: string
          id?: string
          move_count?: number
          moves?: Json
          result?: string
          user_id?: string
          variant_id?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          cta_href: string | null
          cta_label: string | null
          forum_topic_id: string | null
          id: string
          kind: string
          pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          forum_topic_id?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          forum_topic_id?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_forum_topic_id_fkey"
            columns: ["forum_topic_id"]
            isOneToOne: false
            referencedRelation: "forum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      custom_pieces: {
        Row: {
          author_id: string
          created_at: string
          def: Json
          description: string
          id: string
          image_path: string | null
          image_url: string | null
          is_featured: boolean
          is_hidden: boolean
          like_count: number
          movement_summary: string | null
          name: string
          play_count: number
          remixed_from_id: string | null
          slug: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          created_at?: string
          def: Json
          description?: string
          id?: string
          image_path?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_hidden?: boolean
          like_count?: number
          movement_summary?: string | null
          name: string
          play_count?: number
          remixed_from_id?: string | null
          slug: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          def?: Json
          description?: string
          id?: string
          image_path?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_hidden?: boolean
          like_count?: number
          movement_summary?: string | null
          name?: string
          play_count?: number
          remixed_from_id?: string | null
          slug?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_pieces_remixed_from_id_fkey"
            columns: ["remixed_from_id"]
            isOneToOne: false
            referencedRelation: "custom_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      forum_likes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          like_count: number
          topic_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          like_count?: number
          topic_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          like_count?: number
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "forum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_topics: {
        Row: {
          author_id: string
          body: string
          category: string | null
          created_at: string
          id: string
          is_announcement: boolean
          is_featured: boolean
          is_pinned: boolean
          is_showcase: boolean
          last_activity_at: string
          like_count: number
          reply_count: number
          shared_design: Json | null
          shared_design_name: string | null
          shared_piece_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          category?: string | null
          created_at?: string
          id?: string
          is_announcement?: boolean
          is_featured?: boolean
          is_pinned?: boolean
          is_showcase?: boolean
          last_activity_at?: string
          like_count?: number
          reply_count?: number
          shared_design?: Json | null
          shared_design_name?: string | null
          shared_piece_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          is_announcement?: boolean
          is_featured?: boolean
          is_pinned?: boolean
          is_showcase?: boolean
          last_activity_at?: string
          like_count?: number
          reply_count?: number
          shared_design?: Json | null
          shared_design_name?: string | null
          shared_piece_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_topics_shared_piece_id_fkey"
            columns: ["shared_piece_id"]
            isOneToOne: false
            referencedRelation: "custom_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          status?: string
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      game_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          game_id: string
          id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          game_id: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          game_id?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_comments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "published_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "game_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      game_likes: {
        Row: {
          created_at: string
          game_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_likes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "published_games"
            referencedColumns: ["id"]
          },
        ]
      }
      match_chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          match_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          match_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          match_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_chat_messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          kind: string
          match_id: string
          payload: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          kind: string
          match_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          kind?: string
          match_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_moves: {
        Row: {
          actor_id: string
          id: string
          match_id: string
          move: Json
          played_at: string
          ply: number
          time_left_ms: number
        }
        Insert: {
          actor_id: string
          id?: string
          match_id: string
          move: Json
          played_at?: string
          ply: number
          time_left_ms: number
        }
        Update: {
          actor_id?: string
          id?: string
          match_id?: string
          move?: Json
          played_at?: string
          ply?: number
          time_left_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_moves_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          black_time_ms: number
          created_at: string
          design: Json
          design_name: string
          expires_at: string | null
          finished_at: string | null
          guest_id: string | null
          host_color: string
          host_id: string
          id: string
          last_clock_update_at: string | null
          rated: boolean
          ready_b: boolean
          ready_w: boolean
          result: string | null
          result_reason: string | null
          share_token: string
          started_at: string | null
          status: string
          time_control: string
          turn: string
          updated_at: string
          visibility: string
          white_time_ms: number
        }
        Insert: {
          black_time_ms: number
          created_at?: string
          design: Json
          design_name?: string
          expires_at?: string | null
          finished_at?: string | null
          guest_id?: string | null
          host_color?: string
          host_id: string
          id?: string
          last_clock_update_at?: string | null
          rated?: boolean
          ready_b?: boolean
          ready_w?: boolean
          result?: string | null
          result_reason?: string | null
          share_token?: string
          started_at?: string | null
          status?: string
          time_control: string
          turn?: string
          updated_at?: string
          visibility?: string
          white_time_ms: number
        }
        Update: {
          black_time_ms?: number
          created_at?: string
          design?: Json
          design_name?: string
          expires_at?: string | null
          finished_at?: string | null
          guest_id?: string | null
          host_color?: string
          host_id?: string
          id?: string
          last_clock_update_at?: string | null
          rated?: boolean
          ready_b?: boolean
          ready_w?: boolean
          result?: string | null
          result_reason?: string | null
          share_token?: string
          started_at?: string | null
          status?: string
          time_control?: string
          turn?: string
          updated_at?: string
          visibility?: string
          white_time_ms?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      piece_ability_requests: {
        Row: {
          admin_note: string | null
          author_id: string
          created_at: string
          id: string
          piece_id: string
          request_text: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          author_id: string
          created_at?: string
          id?: string
          piece_id: string
          request_text: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          author_id?: string
          created_at?: string
          id?: string
          piece_id?: string
          request_text?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_ability_requests_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "custom_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_likes: {
        Row: {
          created_at: string
          piece_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          piece_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          piece_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_likes_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "custom_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed: boolean
          avatar: string | null
          avatar_url: string | null
          community_updates_opt_in: boolean
          created_at: string
          display_name: string | null
          gameplay_notify_opt_in: boolean
          id: string
          is_founder: boolean
          marketing_opt_in: boolean
          onboarded: boolean
          privacy_version: string | null
          suspended_until: string | null
          tos_accepted_at: string | null
          tos_version: string | null
          updated_at: string
          username: string
          welcomed_at: string | null
        }
        Insert: {
          age_confirmed?: boolean
          avatar?: string | null
          avatar_url?: string | null
          community_updates_opt_in?: boolean
          created_at?: string
          display_name?: string | null
          gameplay_notify_opt_in?: boolean
          id: string
          is_founder?: boolean
          marketing_opt_in?: boolean
          onboarded?: boolean
          privacy_version?: string | null
          suspended_until?: string | null
          tos_accepted_at?: string | null
          tos_version?: string | null
          updated_at?: string
          username: string
          welcomed_at?: string | null
        }
        Update: {
          age_confirmed?: boolean
          avatar?: string | null
          avatar_url?: string | null
          community_updates_opt_in?: boolean
          created_at?: string
          display_name?: string | null
          gameplay_notify_opt_in?: boolean
          id?: string
          is_founder?: boolean
          marketing_opt_in?: boolean
          onboarded?: boolean
          privacy_version?: string | null
          suspended_until?: string | null
          tos_accepted_at?: string | null
          tos_version?: string | null
          updated_at?: string
          username?: string
          welcomed_at?: string | null
        }
        Relationships: []
      }
      published_games: {
        Row: {
          author_id: string
          comment_count: number
          created_at: string
          description: string
          design: Json
          id: string
          is_featured: boolean
          is_hidden: boolean
          like_count: number
          name: string
          remixed_from_id: string | null
          slug: string
          tutorial: Json | null
          updated_at: string
        }
        Insert: {
          author_id: string
          comment_count?: number
          created_at?: string
          description?: string
          design: Json
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          like_count?: number
          name: string
          remixed_from_id?: string | null
          slug: string
          tutorial?: Json | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          comment_count?: number
          created_at?: string
          description?: string
          design?: Json
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          like_count?: number
          name?: string
          remixed_from_id?: string | null
          slug?: string
          tutorial?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_games_remixed_from_id_fkey"
            columns: ["remixed_from_id"]
            isOneToOne: false
            referencedRelation: "published_games"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          design_family: string
          games_played: number
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          design_family?: string
          games_played?: number
          id?: string
          rating?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          design_family?: string
          games_played?: number
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string
          resolution: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      solo_games: {
        Row: {
          created_at: string
          design: Json
          design_name: string
          difficulty: string
          ended_at: string
          human_color: string
          id: string
          moves: Json
          ply_count: number
          result: string
          result_reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          design: Json
          design_name: string
          difficulty: string
          ended_at?: string
          human_color: string
          id?: string
          moves?: Json
          ply_count?: number
          result: string
          result_reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          design?: Json
          design_name?: string
          difficulty?: string
          ended_at?: string
          human_color?: string
          id?: string
          moves?: Json
          ply_count?: number
          result?: string
          result_reason?: string
          user_id?: string
        }
        Relationships: []
      }
      topic_suggestions: {
        Row: {
          body: string
          created_at: string
          id: string
          shared_design: Json | null
          shared_design_name: string | null
          status: string
          suggester_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          shared_design?: Json | null
          shared_design_name?: string | null
          status?: string
          suggester_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          shared_design?: Json | null
          shared_design_name?: string | null
          status?: string
          suggester_id?: string
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variant_plays: {
        Row: {
          created_at: string
          id: string
          plays: number
          updated_at: string
          user_id: string
          variant_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          plays?: number
          updated_at?: string
          user_id: string
          variant_key: string
        }
        Update: {
          created_at?: string
          id?: string
          plays?: number
          updated_at?: string
          user_id?: string
          variant_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      variant_play_stats: {
        Row: {
          total_plays: number | null
          unique_players: number | null
          variant_key: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_users: {
        Args: { _q?: string }
        Returns: {
          created_at: string
          display_name: string
          id: string
          suspended_until: string
          username: string
        }[]
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      get_my_profile: {
        Args: never
        Returns: {
          age_confirmed: boolean
          avatar: string | null
          avatar_url: string | null
          community_updates_opt_in: boolean
          created_at: string
          display_name: string | null
          gameplay_notify_opt_in: boolean
          id: string
          is_founder: boolean
          marketing_opt_in: boolean
          onboarded: boolean
          privacy_version: string | null
          suspended_until: string | null
          tos_accepted_at: string | null
          tos_version: string | null
          updated_at: string
          username: string
          welcomed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked_either: { Args: { _a: string; _b: string }; Returns: boolean }
      is_match_participant: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          _action: string
          _details?: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      share_active_match: { Args: { _a: string; _b: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
