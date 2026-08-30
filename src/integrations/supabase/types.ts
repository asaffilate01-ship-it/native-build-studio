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
      audit_events: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          org_id: string
          target: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          org_id: string
          target?: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          org_id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      native_app_plans: {
        Row: {
          app_id: string
          approved_at: string | null
          approved_by: string | null
          confirmation_items: Json
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          plan_markdown: string
          prompt: string
          status: string
          version: number
        }
        Insert: {
          app_id: string
          approved_at?: string | null
          approved_by?: string | null
          confirmation_items?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          plan_markdown?: string
          prompt: string
          status: string
          version?: number
        }
        Update: {
          app_id?: string
          approved_at?: string | null
          approved_by?: string | null
          confirmation_items?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          plan_markdown?: string
          prompt?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "native_app_plans_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "native_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_app_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      native_apps: {
        Row: {
          active: boolean
          android_package: string
          app_role: string
          apple_app_id: string
          apple_team_id: string
          created_at: string
          credential_scope: string
          display_name: string
          engine: string
          google_developer_name: string
          id: string
          ios_bundle_id: string
          legal_owner: string
          manifest: Json
          org_id: string
          privacy_url: string
          public_brand: string
          runner: string
          slug: string
          source_ref: string
          source_repo: string
          store_record: Json
          suite: string
          support_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          android_package: string
          app_role?: string
          apple_app_id?: string
          apple_team_id?: string
          created_at?: string
          credential_scope?: string
          display_name: string
          engine: string
          google_developer_name?: string
          id?: string
          ios_bundle_id: string
          legal_owner?: string
          manifest?: Json
          org_id: string
          privacy_url?: string
          public_brand?: string
          runner: string
          slug: string
          source_ref?: string
          source_repo: string
          store_record?: Json
          suite: string
          support_url?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          android_package?: string
          app_role?: string
          apple_app_id?: string
          apple_team_id?: string
          created_at?: string
          credential_scope?: string
          display_name?: string
          engine?: string
          google_developer_name?: string
          id?: string
          ios_bundle_id?: string
          legal_owner?: string
          manifest?: Json
          org_id?: string
          privacy_url?: string
          public_brand?: string
          runner?: string
          slug?: string
          source_ref?: string
          source_repo?: string
          store_record?: Json
          suite?: string
          support_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_apps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      native_build_jobs: {
        Row: {
          app_id: string
          artifact_refs: Json
          destination: string
          failure_summary: string | null
          finished_at: string | null
          id: string
          org_id: string
          platform: string
          requested_at: string
          requested_by: string | null
          runner_job_id: string | null
          runner_url: string | null
          source_sha: string | null
          started_at: string | null
          status: string
          submit_to_internal: boolean
          upload_metadata: boolean
        }
        Insert: {
          app_id: string
          artifact_refs?: Json
          destination?: string
          failure_summary?: string | null
          finished_at?: string | null
          id?: string
          org_id: string
          platform: string
          requested_at?: string
          requested_by?: string | null
          runner_job_id?: string | null
          runner_url?: string | null
          source_sha?: string | null
          started_at?: string | null
          status: string
          submit_to_internal?: boolean
          upload_metadata?: boolean
        }
        Update: {
          app_id?: string
          artifact_refs?: Json
          destination?: string
          failure_summary?: string | null
          finished_at?: string | null
          id?: string
          org_id?: string
          platform?: string
          requested_at?: string
          requested_by?: string | null
          runner_job_id?: string | null
          runner_url?: string | null
          source_sha?: string | null
          started_at?: string | null
          status?: string
          submit_to_internal?: boolean
          upload_metadata?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "native_build_jobs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "native_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_build_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      plan_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          org_id: string
          plan_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          org_id: string
          plan_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "native_app_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      readiness_checks: {
        Row: {
          app_id: string
          category: string
          check_key: string
          id: string
          label: string
          notes: string
          org_id: string
          state: string
          updated_at: string
        }
        Insert: {
          app_id: string
          category?: string
          check_key: string
          id?: string
          label: string
          notes?: string
          org_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          category?: string
          check_key?: string
          id?: string
          label?: string
          notes?: string
          org_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_checks_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "native_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_listings: {
        Row: {
          account_deletion_url: string
          app_id: string
          appflow_app_id: string
          appflow_channel: string
          appflow_enabled: boolean
          apple_category: string
          artwork: Json
          audience: string
          contact_email: string
          contact_name: string
          contact_phone: string
          declarations: Json
          full_description: string
          google_category: string
          id: string
          keywords: string
          locale: string
          marketing_url: string
          org_id: string
          privacy_url: string
          promotional_text: string
          release_notes: string
          reviewer_notes: string
          short_description: string
          submission_status: string
          subtitle: string
          support_url: string
          title: string
          updated_at: string
        }
        Insert: {
          account_deletion_url?: string
          app_id: string
          appflow_app_id?: string
          appflow_channel?: string
          appflow_enabled?: boolean
          apple_category?: string
          artwork?: Json
          audience?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          declarations?: Json
          full_description?: string
          google_category?: string
          id?: string
          keywords?: string
          locale?: string
          marketing_url?: string
          org_id: string
          privacy_url?: string
          promotional_text?: string
          release_notes?: string
          reviewer_notes?: string
          short_description?: string
          submission_status?: string
          subtitle?: string
          support_url?: string
          title?: string
          updated_at?: string
        }
        Update: {
          account_deletion_url?: string
          app_id?: string
          appflow_app_id?: string
          appflow_channel?: string
          appflow_enabled?: boolean
          apple_category?: string
          artwork?: Json
          audience?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          declarations?: Json
          full_description?: string
          google_category?: string
          id?: string
          keywords?: string
          locale?: string
          marketing_url?: string
          org_id?: string
          privacy_url?: string
          promotional_text?: string
          release_notes?: string
          reviewer_notes?: string
          short_description?: string
          submission_status?: string
          subtitle?: string
          support_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "native_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      update_delivery: {
        Row: {
          app_ids: Json
          appflow_channel: string
          auto_upload: boolean
          bridge_installed: boolean
          created_at: string
          id: string
          org_id: string
          source_ref: string
          source_repo: string
          updated_at: string
        }
        Insert: {
          app_ids?: Json
          appflow_channel?: string
          auto_upload?: boolean
          bridge_installed?: boolean
          created_at?: string
          id?: string
          org_id: string
          source_ref?: string
          source_repo: string
          updated_at?: string
        }
        Update: {
          app_ids?: Json
          appflow_channel?: string
          auto_upload?: boolean
          bridge_installed?: boolean
          created_at?: string
          id?: string
          org_id?: string
          source_ref?: string
          source_repo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "update_delivery_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
    }
    Enums: {
      org_role: "owner" | "release_owner" | "product_owner" | "member"
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
      org_role: ["owner", "release_owner", "product_owner", "member"],
    },
  },
} as const
