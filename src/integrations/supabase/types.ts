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
      candidates: {
        Row: {
          created_at: string
          email: string
          experience_summary: string | null
          id: string
          interview_token: string | null
          job_id: string
          match_reasoning: string | null
          match_score: number | null
          name: string
          recruiter_id: string
          resume_text: string | null
          resume_url: string | null
          skills: string[] | null
          status: Database["public"]["Enums"]["candidate_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          experience_summary?: string | null
          id?: string
          interview_token?: string | null
          job_id: string
          match_reasoning?: string | null
          match_score?: number | null
          name: string
          recruiter_id: string
          resume_text?: string | null
          resume_url?: string | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          experience_summary?: string | null
          id?: string
          interview_token?: string | null
          job_id?: string
          match_reasoning?: string | null
          match_score?: number | null
          name?: string
          recruiter_id?: string
          resume_text?: string | null
          resume_url?: string | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_invites: {
        Row: {
          candidate_id: string
          created_at: string
          duration_minutes: number
          email_sent_to: string | null
          expires_at: string
          id: string
          job_id: string
          recruiter_id: string
          scheduled_at: string
          token: string
          used_at: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          duration_minutes?: number
          email_sent_to?: string | null
          expires_at?: string
          id?: string
          job_id: string
          recruiter_id: string
          scheduled_at?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          duration_minutes?: number
          email_sent_to?: string | null
          expires_at?: string
          id?: string
          job_id?: string
          recruiter_id?: string
          scheduled_at?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_invites_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_invites_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          interview_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interview_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_violations: {
        Row: {
          candidate_id: string
          created_at: string
          detail: string | null
          id: string
          interview_id: string
          kind: string
          recruiter_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          detail?: string | null
          id?: string
          interview_id: string
          kind: string
          recruiter_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          interview_id?: string
          kind?: string
          recruiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_violations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_violations_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          communication_score: number | null
          completed_at: string | null
          hire_decision: string | null
          id: string
          overall_score: number | null
          recommendation: string | null
          recommendation_reasoning: string | null
          recording_url: string | null
          recruiter_id: string
          started_at: string
          status: string
          strengths: string | null
          technical_score: number | null
          weaknesses: string | null
        }
        Insert: {
          candidate_id: string
          communication_score?: number | null
          completed_at?: string | null
          hire_decision?: string | null
          id?: string
          overall_score?: number | null
          recommendation?: string | null
          recommendation_reasoning?: string | null
          recording_url?: string | null
          recruiter_id: string
          started_at?: string
          status?: string
          strengths?: string | null
          technical_score?: number | null
          weaknesses?: string | null
        }
        Update: {
          candidate_id?: string
          communication_score?: number | null
          completed_at?: string | null
          hire_decision?: string | null
          id?: string
          overall_score?: number | null
          recommendation?: string | null
          recommendation_reasoning?: string | null
          recording_url?: string | null
          recruiter_id?: string
          started_at?: string
          status?: string
          strengths?: string | null
          technical_score?: number | null
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          description: string
          difficulty: string
          id: string
          interview_duration: number
          interview_type: string
          recruiter_id: string
          role_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          difficulty?: string
          id?: string
          interview_duration?: number
          interview_type?: string
          recruiter_id: string
          role_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          difficulty?: string
          id?: string
          interview_duration?: number
          interview_type?: string
          recruiter_id?: string
          role_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "recruiter" | "admin"
      candidate_status:
        | "pending"
        | "shortlisted"
        | "rejected"
        | "interview_sent"
        | "interviewed"
        | "selected"
        | "final_rejected"
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
      app_role: ["recruiter", "admin"],
      candidate_status: [
        "pending",
        "shortlisted",
        "rejected",
        "interview_sent",
        "interviewed",
        "selected",
        "final_rejected",
      ],
    },
  },
} as const
