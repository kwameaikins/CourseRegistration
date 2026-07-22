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
      attendance: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          join_time: string | null
          leave_time: string | null
          registration_id: string
          session_date: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          registration_id: string
          session_date: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          registration_id?: string
          session_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          class_reminder_enabled: boolean
          cohort_label: string
          course_fee: number
          course_id: string
          created_at: string
          discount_cutoff_date: string | null
          discounted_fee: number | null
          end_date: string
          facilitator_name: string
          facilitator_staff_id: string | null
          id: string
          is_active: boolean
          payment_reminder_enabled: boolean
          sms_enabled: boolean
          start_date: string
          start_time: string
          updated_at: string
          welcome_email_enabled: boolean
          whatsapp_enabled: boolean
          whatsapp_group_link: string | null
          zoom_link: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          class_reminder_enabled?: boolean
          cohort_label: string
          course_fee: number
          course_id: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date: string
          facilitator_name: string
          facilitator_staff_id?: string | null
          id?: string
          is_active?: boolean
          payment_reminder_enabled?: boolean
          sms_enabled?: boolean
          start_date: string
          start_time: string
          updated_at?: string
          welcome_email_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_group_link?: string | null
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          class_reminder_enabled?: boolean
          cohort_label?: string
          course_fee?: number
          course_id?: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date?: string
          facilitator_name?: string
          facilitator_staff_id?: string | null
          id?: string
          is_active?: boolean
          payment_reminder_enabled?: boolean
          sms_enabled?: boolean
          start_date?: string
          start_time?: string
          updated_at?: string
          welcome_email_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_group_link?: string | null
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_facilitator_staff_id_fkey"
            columns: ["facilitator_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          course_title: string
          cpd_credit: string
          created_at: string
          description: string
          hours: number
          id: string
          issued_by: string | null
          issued_date: string
          recipient_email: string | null
          recipient_name: string
          registration_id: string | null
          revoked: boolean
          revoked_reason: string | null
        }
        Insert: {
          certificate_number: string
          course_title: string
          cpd_credit?: string
          created_at?: string
          description?: string
          hours?: number
          id?: string
          issued_by?: string | null
          issued_date?: string
          recipient_email?: string | null
          recipient_name: string
          registration_id?: string | null
          revoked?: boolean
          revoked_reason?: string | null
        }
        Update: {
          certificate_number?: string
          course_title?: string
          cpd_credit?: string
          created_at?: string
          description?: string
          hours?: number
          id?: string
          issued_by?: string | null
          issued_date?: string
          recipient_email?: string | null
          recipient_name?: string
          registration_id?: string | null
          revoked?: boolean
          revoked_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      call_log: {
        Row: {
          bank_reference: string | null
          call_type: string
          created_at: string
          ended_at: string | null
          id: string
          needs_human_followup: boolean
          phone: string
          promised_payment_date: string | null
          registration_id: string | null
          status: string
          summary: string | null
          transcript: string | null
          vapi_call_id: string | null
        }
        Insert: {
          bank_reference?: string | null
          call_type: string
          created_at?: string
          ended_at?: string | null
          id?: string
          needs_human_followup?: boolean
          phone?: string
          promised_payment_date?: string | null
          registration_id?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
          vapi_call_id?: string | null
        }
        Update: {
          bank_reference?: string | null
          call_type?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          needs_human_followup?: boolean
          phone?: string
          promised_payment_date?: string | null
          registration_id?: string | null
          status?: string
          summary?: string | null
          transcript?: string | null
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          certificate_description: string
          certificate_hours: number
          certificate_serial_floor: number
          course_code: string
          course_name: string
          cpd_credit: string
          created_at: string
          id: string
          updated_at: string
          zoom_link: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          certificate_description?: string
          certificate_hours?: number
          certificate_serial_floor?: number
          course_code: string
          course_name: string
          cpd_credit?: string
          created_at?: string
          id?: string
          updated_at?: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          certificate_description?: string
          certificate_hours?: number
          certificate_serial_floor?: number
          course_code?: string
          course_name?: string
          cpd_credit?: string
          created_at?: string
          id?: string
          updated_at?: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: []
      }
      deletion_log: {
        Row: {
          deleted_at: string
          deleted_by_staff_id: string
          id: string
          participant_id: string
        }
        Insert: {
          deleted_at?: string
          deleted_by_staff_id: string
          id?: string
          participant_id: string
        }
        Update: {
          deleted_at?: string
          deleted_by_staff_id?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_log_deleted_by_staff_id_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comments_anonymous: boolean
          facilitator_rating: number
          id: string
          improvement_text: string | null
          interested_courses: string | null
          overall_rating: number
          recommend_rating: number
          registration_id: string
          submitted_at: string
          testimonial_consent: boolean
        }
        Insert: {
          comments_anonymous?: boolean
          facilitator_rating: number
          id?: string
          improvement_text?: string | null
          interested_courses?: string | null
          overall_rating: number
          recommend_rating: number
          registration_id: string
          submitted_at?: string
          testimonial_consent?: boolean
        }
        Update: {
          comments_anonymous?: boolean
          facilitator_rating?: number
          id?: string
          improvement_text?: string | null
          interested_courses?: string | null
          overall_rating?: number
          recommend_rating?: number
          registration_id?: string
          submitted_at?: string
          testimonial_consent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "feedback_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          email_type: string
          error_message: string | null
          id: string
          registration_id: string
          sent_at: string
          success: boolean
        }
        Insert: {
          email_type: string
          error_message?: string | null
          id?: string
          registration_id: string
          sent_at?: string
          success: boolean
        }
        Update: {
          email_type?: string
          error_message?: string | null
          id?: string
          registration_id?: string
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          course_id: string
          created_at: string
          email_type: string
          id: string
          is_active: boolean
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          course_id: string
          created_at?: string
          email_type: string
          id?: string
          is_active?: boolean
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          course_id?: string
          created_at?: string
          email_type?: string
          id?: string
          is_active?: boolean
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          company: string | null
          consent_at: string | null
          consent_given: boolean
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          job_title: string | null
          middle_name: string | null
          phone: string
          surname: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          job_title?: string | null
          middle_name?: string | null
          phone: string
          surname?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          job_title?: string | null
          middle_name?: string | null
          phone?: string
          surname?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      participant_auth: {
        Row: {
          participant_id: string
          pin_hash: string
          must_change_pin: boolean
          failed_attempts: number
          locked_until: string | null
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          participant_id: string
          pin_hash: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          participant_id?: string
          pin_hash?: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_auth_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_sessions: {
        Row: {
          id: string
          participant_id: string
          created_at: string
          expires_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          participant_id: string
          created_at?: string
          expires_at: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          participant_id?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_sessions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          balance: number | null
          course_fee: number
          created_at: string
          discount_amount: number
          discount_granted_at: string | null
          discount_granted_by: string | null
          discount_reason: string | null
          id: string
          original_fee: number | null
          payment_date: string | null
          payment_method: string | null
          payment_notes: string | null
          payment_status: string
          registration_id: string
          transaction_id: string | null
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          amount_paid?: number
          balance?: number | null
          course_fee: number
          created_at?: string
          discount_amount?: number
          discount_granted_at?: string | null
          discount_granted_by?: string | null
          discount_reason?: string | null
          id?: string
          original_fee?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_status?: string
          registration_id: string
          transaction_id?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          amount_paid?: number
          balance?: number | null
          course_fee?: number
          created_at?: string
          discount_amount?: number
          discount_granted_at?: string | null
          discount_granted_by?: string | null
          discount_reason?: string | null
          id?: string
          original_fee?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_status?: string
          registration_id?: string
          transaction_id?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_discount_granted_by_fkey"
            columns: ["discount_granted_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_tokens: {
        Row: {
          id: string
          participant_id: string
          registration_id: string
          expires_at: string
          consumed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          participant_id: string
          registration_id: string
          expires_at: string
          consumed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          participant_id?: string
          registration_id?: string
          expires_at?: string
          consumed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_login_tokens_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_login_tokens_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          batch_id: string
          consent_given: boolean
          id: string
          lead_source: string
          notes: string | null
          participant_id: string
          registered_at: string
          registration_status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          consent_given: boolean
          id?: string
          lead_source: string
          notes?: string | null
          participant_id: string
          registered_at?: string
          registration_status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          consent_given?: boolean
          id?: string
          lead_source?: string
          notes?: string | null
          participant_id?: string
          registered_at?: string
          registration_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_log: {
        Row: {
          error_message: string | null
          id: string
          message_type: string
          registration_id: string
          sent_at: string
          success: boolean
        }
        Insert: {
          error_message?: string | null
          id?: string
          message_type: string
          registration_id: string
          sent_at?: string
          success: boolean
        }
        Update: {
          error_message?: string | null
          id?: string
          message_type?: string
          registration_id?: string
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_log: {
        Row: {
          error_message: string | null
          id: string
          message_type: string
          registration_id: string
          sent_at: string
          success: boolean
        }
        Insert: {
          error_message?: string | null
          id?: string
          message_type: string
          registration_id: string
          sent_at?: string
          success: boolean
        }
        Update: {
          error_message?: string | null
          id?: string
          message_type?: string
          registration_id?: string
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_registrants: {
        Row: {
          created_at: string
          id: string
          join_url: string
          registration_id: string
          zoom_registrant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_url: string
          registration_id: string
          zoom_registrant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          join_url?: string
          registration_id?: string
          zoom_registrant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_registrants_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_current_role: { Args: never; Returns: string }
      fn_current_staff_id: { Args: never; Returns: string }
      fn_hard_delete_participant: {
        Args: { deleting_staff_id: string; participant_id_to_delete: string }
        Returns: undefined
      }
      fn_soft_delete_participant: {
        Args: { participant_id_to_delete: string }
        Returns: undefined
      }
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
