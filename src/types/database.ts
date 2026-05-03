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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audio_cache: {
        Row: {
          chapter_id: string
          duration_seconds: number | null
          generated_at: string | null
          storage_path: string | null
          voice_id: string
        }
        Insert: {
          chapter_id: string
          duration_seconds?: number | null
          generated_at?: string | null
          storage_path?: string | null
          voice_id: string
        }
        Update: {
          chapter_id?: string
          duration_seconds?: number | null
          generated_at?: string | null
          storage_path?: string | null
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_cache_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          cover_storage_path: string | null
          created_at: string | null
          file_type: string | null
          id: string
          last_read_chapter: number | null
          last_read_position: number | null
          processing_status: string | null
          source: string | null
          title: string
          total_chapters: number | null
          user_id: string | null
        }
        Insert: {
          author?: string | null
          cover_storage_path?: string | null
          created_at?: string | null
          file_type?: string | null
          id?: string
          last_read_chapter?: number | null
          last_read_position?: number | null
          processing_status?: string | null
          source?: string | null
          title: string
          total_chapters?: number | null
          user_id?: string | null
        }
        Update: {
          author?: string | null
          cover_storage_path?: string | null
          created_at?: string | null
          file_type?: string | null
          id?: string
          last_read_chapter?: number | null
          last_read_position?: number | null
          processing_status?: string | null
          source?: string | null
          title?: string
          total_chapters?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string | null
          chapter_index: number
          content: string | null
          created_at: string | null
          id: string
          title: string | null
          word_count: number | null
        }
        Insert: {
          book_id?: string | null
          chapter_index: number
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
          word_count?: number | null
        }
        Update: {
          book_id?: string | null
          chapter_index?: number
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_embeddings: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          chunk_text: string | null
          embedding: string | null
          id: string
          page_number: number | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          chunk_text?: string | null
          embedding?: string | null
          id?: string
          page_number?: number | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          chunk_text?: string | null
          embedding?: string | null
          id?: string
          page_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunk_embeddings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_embeddings_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          book_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          book_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          book_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listen_sessions: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          duration_seconds: number | null
          id: string
          listened_at: string | null
          user_id: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          duration_seconds?: number | null
          id?: string
          listened_at?: string | null
          user_id?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          duration_seconds?: number | null
          id?: string
          listened_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listen_sessions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listen_sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listen_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          role: string
          sources: Json | null
          thumbs_up: boolean | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          role: string
          sources?: Json | null
          thumbs_up?: boolean | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          role?: string
          sources?: Json | null
          thumbs_up?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_credits_limit: number | null
          ai_credits_used: number | null
          audio_seconds_limit: number | null
          audio_seconds_used: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          marketing_consent: boolean
          onboarding_complete: boolean | null
          onboarding_intent: string | null
          plan: string | null
          translation_target: string | null
          updated_at: string | null
        }
        Insert: {
          ai_credits_limit?: number | null
          ai_credits_used?: number | null
          audio_seconds_limit?: number | null
          audio_seconds_used?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          marketing_consent?: boolean
          onboarding_complete?: boolean | null
          onboarding_intent?: string | null
          plan?: string | null
          translation_target?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_credits_limit?: number | null
          ai_credits_used?: number | null
          audio_seconds_limit?: number | null
          audio_seconds_used?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_consent?: boolean
          onboarding_complete?: boolean | null
          onboarding_intent?: string | null
          plan?: string | null
          translation_target?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      summaries: {
        Row: {
          chapter_id: string
          content: string | null
          generated_at: string | null
          length: string
          thumbs_down_reason: string | null
          thumbs_up: boolean | null
        }
        Insert: {
          chapter_id: string
          content?: string | null
          generated_at?: string | null
          length: string
          thumbs_down_reason?: string | null
          thumbs_up?: boolean | null
        }
        Update: {
          chapter_id?: string
          content?: string | null
          generated_at?: string | null
          length?: string
          thumbs_down_reason?: string | null
          thumbs_up?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "summaries_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
