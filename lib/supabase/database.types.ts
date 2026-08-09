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
      agent_run_log: {
        Row: {
          agent_name: string
          confidence: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_ref: string | null
          model: string
          output_summary: string | null
          pipeline_job_id: string | null
          success: boolean
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          agent_name: string
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_ref?: string | null
          model: string
          output_summary?: string | null
          pipeline_job_id?: string | null
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          agent_name?: string
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_ref?: string | null
          model?: string
          output_summary?: string | null
          pipeline_job_id?: string | null
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_log_pipeline_job_id_fkey"
            columns: ["pipeline_job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      article_drafts: {
        Row: {
          created_at: string
          draft_headline: string | null
          draft_sections: Json | null
          draft_summary: string | null
          id: string
          model_used: string
          research_note: string | null
          story_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          created_at?: string
          draft_headline?: string | null
          draft_sections?: Json | null
          draft_summary?: string | null
          id?: string
          model_used: string
          research_note?: string | null
          story_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          created_at?: string
          draft_headline?: string | null
          draft_sections?: Json | null
          draft_summary?: string | null
          id?: string
          model_used?: string
          research_note?: string | null
          story_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_drafts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          content_type: string
          feedback: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          grade: number | null
          id: string
          participant_notes: string | null
          registration_id: string
          reviewed_at: string | null
          reviewed_by_staff_id: string | null
          reviewed_by_tutor_id: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          assignment_id: string
          content_type: string
          feedback?: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          grade?: number | null
          id?: string
          participant_notes?: string | null
          registration_id: string
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          reviewed_by_tutor_id?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          assignment_id?: string
          content_type?: string
          feedback?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          grade?: number | null
          id?: string
          participant_notes?: string | null
          registration_id?: string
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          reviewed_by_tutor_id?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_tutor_id_fkey"
            columns: ["reviewed_by_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          allow_resubmission: boolean
          batch_id: string
          created_at: string
          created_by_staff_id: string | null
          created_by_tutor_id: string | null
          due_at: string | null
          id: string
          instructions: string | null
          live_session_id: string | null
          status: string
          title: string
        }
        Insert: {
          allow_resubmission?: boolean
          batch_id: string
          created_at?: string
          created_by_staff_id?: string | null
          created_by_tutor_id?: string | null
          due_at?: string | null
          id?: string
          instructions?: string | null
          live_session_id?: string | null
          status?: string
          title: string
        }
        Update: {
          allow_resubmission?: boolean
          batch_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          created_by_tutor_id?: string | null
          due_at?: string | null
          id?: string
          instructions?: string | null
          live_session_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_tutor_id_fkey"
            columns: ["created_by_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          join_time: string | null
          leave_time: string | null
          live_session_id: string | null
          registration_id: string
          session_date: string
          session_minutes: number | null
          source: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          live_session_id?: string | null
          registration_id: string
          session_date: string
          session_minutes?: number | null
          source?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          live_session_id?: string | null
          registration_id?: string
          session_date?: string
          session_minutes?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_exceptions: {
        Row: {
          batch_id: string
          created_at: string
          exception_type: string
          id: string
          raised_by_tutor_id: string | null
          reason: string
          registration_id: string
          requested_present: boolean | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_date: string
          status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          exception_type: string
          id?: string
          raised_by_tutor_id?: string | null
          reason: string
          registration_id: string
          requested_present?: boolean | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_date: string
          status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          exception_type?: string
          id?: string
          raised_by_tutor_id?: string | null
          reason?: string
          registration_id?: string
          requested_present?: boolean | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_exceptions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_raised_by_tutor_id_fkey"
            columns: ["raised_by_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          capacity: number | null
          class_reminder_enabled: boolean
          cohort_label: string
          course_fee: number
          course_id: string
          created_at: string
          discount_cutoff_date: string | null
          discounted_fee: number | null
          end_date: string
          end_time: string | null
          facilitator_name: string
          facilitator_staff_id: string | null
          facilitator_tutor_id: string | null
          id: string
          is_active: boolean
          is_free: boolean
          meeting_days: number[] | null
          payment_reminder_enabled: boolean
          resources_link: string | null
          sms_enabled: boolean
          start_date: string
          start_time: string
          updated_at: string
          welcome_email_enabled: boolean
          whatsapp_enabled: boolean
          whatsapp_group_link: string | null
          zoom_access_revoked_at: string | null
          zoom_link: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          capacity?: number | null
          class_reminder_enabled?: boolean
          cohort_label: string
          course_fee: number
          course_id: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date: string
          end_time?: string | null
          facilitator_name: string
          facilitator_staff_id?: string | null
          facilitator_tutor_id?: string | null
          id?: string
          is_active?: boolean
          is_free?: boolean
          meeting_days?: number[] | null
          payment_reminder_enabled?: boolean
          resources_link?: string | null
          sms_enabled?: boolean
          start_date: string
          start_time: string
          updated_at?: string
          welcome_email_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_group_link?: string | null
          zoom_access_revoked_at?: string | null
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          capacity?: number | null
          class_reminder_enabled?: boolean
          cohort_label?: string
          course_fee?: number
          course_id?: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date?: string
          end_time?: string | null
          facilitator_name?: string
          facilitator_staff_id?: string | null
          facilitator_tutor_id?: string | null
          id?: string
          is_active?: boolean
          is_free?: boolean
          meeting_days?: number[] | null
          payment_reminder_enabled?: boolean
          resources_link?: string | null
          sms_enabled?: boolean
          start_date?: string
          start_time?: string
          updated_at?: string
          welcome_email_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_group_link?: string | null
          zoom_access_revoked_at?: string | null
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
          {
            foreignKeyName: "batches_facilitator_tutor_id_fkey"
            columns: ["facilitator_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
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
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          lead_id: string | null
          preview_message: string
          registration_id: string | null
          send_error: string | null
          sent_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          lead_id?: string | null
          preview_message: string
          registration_id?: string | null
          send_error?: string | null
          sent_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          preview_message?: string
          registration_id?: string | null
          send_error?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_send_settings: {
        Row: {
          channel: string
          live_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          live_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          live_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_send_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_type: string
          channel: string
          created_at: string
          created_by: string | null
          filter_batch_id: string | null
          filter_course_id: string | null
          filter_lead_source: string | null
          filter_min_score: number | null
          filter_payment_status: string | null
          filter_registration_status: string | null
          filter_status: string | null
          id: string
          message_body: string
          message_subject: string | null
          name: string
          queued_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience_type?: string
          channel: string
          created_at?: string
          created_by?: string | null
          filter_batch_id?: string | null
          filter_course_id?: string | null
          filter_lead_source?: string | null
          filter_min_score?: number | null
          filter_payment_status?: string | null
          filter_registration_status?: string | null
          filter_status?: string | null
          id?: string
          message_body: string
          message_subject?: string | null
          name: string
          queued_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience_type?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          filter_batch_id?: string | null
          filter_course_id?: string | null
          filter_lead_source?: string | null
          filter_min_score?: number | null
          filter_payment_status?: string | null
          filter_registration_status?: string | null
          filter_status?: string | null
          id?: string
          message_body?: string
          message_subject?: string | null
          name?: string
          queued_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_filter_batch_id_fkey"
            columns: ["filter_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_filter_course_id_fkey"
            columns: ["filter_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
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
          facilitator_name: string | null
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
          facilitator_name?: string | null
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
          facilitator_name?: string | null
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
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      code_redemptions: {
        Row: {
          attribution_method: string
          code_id: string
          created_at: string
          discount_amount_applied: number
          existing_lead_at_redemption: boolean
          id: string
          participant_id: string
          registration_id: string
          self_referral_at_redemption: boolean
        }
        Insert: {
          attribution_method: string
          code_id: string
          created_at?: string
          discount_amount_applied?: number
          existing_lead_at_redemption?: boolean
          id?: string
          participant_id: string
          registration_id: string
          self_referral_at_redemption?: boolean
        }
        Update: {
          attribution_method?: string
          code_id?: string
          created_at?: string
          discount_amount_applied?: number
          existing_lead_at_redemption?: boolean
          id?: string
          participant_id?: string
          registration_id?: string
          self_referral_at_redemption?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_redemptions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_redemptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      codes: {
        Row: {
          applies_to_course_id: string | null
          code: string
          created_at: string
          created_by: string | null
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          one_per_participant: boolean
          partner_id: string | null
          uses_count: number
        }
        Insert: {
          applies_to_course_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          one_per_participant?: boolean
          partner_id?: string | null
          uses_count?: number
        }
        Update: {
          applies_to_course_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          one_per_participant?: boolean
          partner_id?: string | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "codes_applies_to_course_id_fkey"
            columns: ["applies_to_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          billing_address: string | null
          billing_contact_name: string
          billing_email: string
          billing_phone: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          tin: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          billing_contact_name: string
          billing_email: string
          billing_phone: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          tin?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          billing_contact_name?: string
          billing_email?: string
          billing_phone?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          tin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_admin_auth: {
        Row: {
          company_id: string
          created_at: string
          failed_attempts: number
          last_login_at: string | null
          locked_until: string | null
          must_change_pin: boolean
          pin_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_admin_auth_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_admin_sessions: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_admin_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_batch_allocations: {
        Row: {
          batch_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          price_per_seat: number
          seats_purchased: number
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          price_per_seat: number
          seats_purchased: number
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          price_per_seat?: number
          seats_purchased?: number
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_batch_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_batch_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_batch_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections_log: {
        Row: {
          corrected_by: string | null
          correction_text: string
          created_at: string
          id: string
          published_article_id: string
        }
        Insert: {
          corrected_by?: string | null
          correction_text: string
          created_at?: string
          id?: string
          published_article_id: string
        }
        Update: {
          corrected_by?: string | null
          correction_text?: string
          created_at?: string
          id?: string
          published_article_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_log_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_log_published_article_id_fkey"
            columns: ["published_article_id"]
            isOneToOne: false
            referencedRelation: "published_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_attempt_log: {
        Row: {
          attempted_at: string
          id: string
          participant_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          participant_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_attempt_log_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          applied_at_stage: string
          applied_by_staff_id: string | null
          coupon_id: string
          created_at: string
          discount_amount_applied: number
          id: string
          participant_id: string
          registration_id: string
        }
        Insert: {
          applied_at_stage: string
          applied_by_staff_id?: string | null
          coupon_id: string
          created_at?: string
          discount_amount_applied?: number
          id?: string
          participant_id: string
          registration_id: string
        }
        Update: {
          applied_at_stage?: string
          applied_by_staff_id?: string | null
          coupon_id?: string
          created_at?: string
          discount_amount_applied?: number
          id?: string
          participant_id?: string
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_applied_by_staff_id_fkey"
            columns: ["applied_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to_course_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          one_per_participant: boolean
          starts_at: string | null
          updated_at: string
          uses_count: number
        }
        Insert: {
          applies_to_course_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          one_per_participant?: boolean
          starts_at?: string | null
          updated_at?: string
          uses_count?: number
        }
        Update: {
          applies_to_course_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          one_per_participant?: boolean
          starts_at?: string | null
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_applies_to_course_id_fkey"
            columns: ["applies_to_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
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
      deadlines: {
        Row: {
          category: string | null
          created_at: string
          deadline_date: string
          description: string | null
          id: string
          professional_body: string | null
          published_article_id: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deadline_date: string
          description?: string | null
          id?: string
          professional_body?: string | null
          published_article_id?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deadline_date?: string
          description?: string | null
          id?: string
          professional_body?: string | null
          published_article_id?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_published_article_id_fkey"
            columns: ["published_article_id"]
            isOneToOne: false
            referencedRelation: "published_articles"
            referencedColumns: ["id"]
          },
        ]
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
      editorial_reviews: {
        Row: {
          article_draft_id: string
          claim_checks: Json | null
          created_at: string
          id: string
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: number | null
          risk_reasons: string[]
          verification_passed: boolean | null
        }
        Insert: {
          article_draft_id: string
          claim_checks?: Json | null
          created_at?: string
          id?: string
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: number | null
          risk_reasons?: string[]
          verification_passed?: boolean | null
        }
        Update: {
          article_draft_id?: string
          claim_checks?: Json | null
          created_at?: string
          id?: string
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: number | null
          risk_reasons?: string[]
          verification_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_reviews_article_draft_id_fkey"
            columns: ["article_draft_id"]
            isOneToOne: false
            referencedRelation: "article_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
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
      feedback: {
        Row: {
          confidence_rating: number
          facilitator_rating: number
          id: string
          improvement_text: string | null
          materials_clarity: string
          most_valuable_text: string | null
          other_course_suggestion: string | null
          overall_rating: number
          recommendation: string
          registration_id: string
          relevance_rating: number
          submitted_at: string
          testimonial_choice: string
        }
        Insert: {
          confidence_rating: number
          facilitator_rating: number
          id?: string
          improvement_text?: string | null
          materials_clarity: string
          most_valuable_text?: string | null
          other_course_suggestion?: string | null
          overall_rating: number
          recommendation: string
          registration_id: string
          relevance_rating: number
          submitted_at?: string
          testimonial_choice?: string
        }
        Update: {
          confidence_rating?: number
          facilitator_rating?: number
          id?: string
          improvement_text?: string | null
          materials_clarity?: string
          most_valuable_text?: string | null
          other_course_suggestion?: string | null
          overall_rating?: number
          recommendation?: string
          registration_id?: string
          relevance_rating?: number
          submitted_at?: string
          testimonial_choice?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          lead_id: string
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          lead_id: string
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_rules: {
        Row: {
          assigned_to: string
          created_at: string
          id: string
          is_active: boolean
          lead_source: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          id?: string
          is_active?: boolean
          lead_source: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lead_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_rules_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          job_title: string | null
          lead_source: string
          next_follow_up_at: string | null
          notes: string | null
          participant_id: string | null
          phone: string
          registration_id: string | null
          score: number
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          job_title?: string | null
          lead_source?: string
          next_follow_up_at?: string | null
          notes?: string | null
          participant_id?: string | null
          phone: string
          registration_id?: string | null
          score?: number
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          job_title?: string | null
          lead_source?: string
          next_follow_up_at?: string | null
          notes?: string | null
          participant_id?: string | null
          phone?: string
          registration_id?: string | null
          score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_audit_log: {
        Row: {
          actor_staff_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          live_session_id: string
          reason: string | null
        }
        Insert: {
          actor_staff_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          live_session_id: string
          reason?: string | null
        }
        Update: {
          actor_staff_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          live_session_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_audit_log_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_audit_log_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_reminders: {
        Row: {
          channel: string
          error_message: string | null
          id: string
          live_session_id: string
          registration_id: string
          reminder_type: string
          sent_at: string
          success: boolean
        }
        Insert: {
          channel: string
          error_message?: string | null
          id?: string
          live_session_id: string
          registration_id: string
          reminder_type: string
          sent_at?: string
          success: boolean
        }
        Update: {
          channel?: string
          error_message?: string | null
          id?: string
          live_session_id?: string
          registration_id?: string
          reminder_type?: string
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "live_session_reminders_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_reminders_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          agenda: string | null
          batch_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          learning_outcomes: string | null
          provider: string
          starts_at: string
          status: string
          status_reason: string | null
          timezone: string
          title: string
          tutor_id: string | null
          tutor_staff_id: string | null
          updated_at: string
          updated_by: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          agenda?: string | null
          batch_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          learning_outcomes?: string | null
          provider?: string
          starts_at: string
          status?: string
          status_reason?: string | null
          timezone?: string
          title: string
          tutor_id?: string | null
          tutor_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          agenda?: string | null
          batch_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          learning_outcomes?: string | null
          provider?: string
          starts_at?: string
          status?: string
          status_reason?: string | null
          timezone?: string
          title?: string
          tutor_id?: string | null
          tutor_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_tutor_staff_id_fkey"
            columns: ["tutor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_deletion_log: {
        Row: {
          cohort_label: string | null
          course_name: string | null
          deleted_at: string
          deleted_by_staff_id: string | null
          entity_type: string
          id: string
          participant_id: string
          participant_name: string
          reason: string | null
          registration_id: string | null
        }
        Insert: {
          cohort_label?: string | null
          course_name?: string | null
          deleted_at?: string
          deleted_by_staff_id?: string | null
          entity_type: string
          id?: string
          participant_id: string
          participant_name: string
          reason?: string | null
          registration_id?: string | null
        }
        Update: {
          cohort_label?: string | null
          course_name?: string | null
          deleted_at?: string
          deleted_by_staff_id?: string | null
          entity_type?: string
          id?: string
          participant_id?: string
          participant_name?: string
          reason?: string | null
          registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_deletion_log_deleted_by_staff_id_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          created_at: string
          created_by: string | null
          default_category: string | null
          id: string
          last_fetch_error: string | null
          last_fetched_at: string | null
          name: string
          reliability_score: number
          source_type: string
          source_url: string
          status: string
          tier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_category?: string | null
          id?: string
          last_fetch_error?: string | null
          last_fetched_at?: string | null
          name: string
          reliability_score?: number
          source_type?: string
          source_url: string
          status?: string
          tier: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_category?: string | null
          id?: string
          last_fetch_error?: string | null
          last_fetched_at?: string | null
          name?: string
          reliability_score?: number
          source_type?: string
          source_url?: string
          status?: string
          tier?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number
          batch_label: string
          course_name: string
          created_at: string
          expected_close_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          registration_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          amount?: number
          batch_label: string
          course_name: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          registration_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_label?: string
          course_name?: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          registration_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_auth: {
        Row: {
          created_at: string
          failed_attempts: number
          last_login_at: string | null
          locked_until: string | null
          must_change_pin: boolean
          participant_id: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          participant_id: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          participant_id?: string
          pin_hash?: string
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
      participant_pin_reset_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          participant_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          participant_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_pin_reset_tokens_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          participant_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          participant_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          participant_id?: string
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
      partner_auth: {
        Row: {
          created_at: string
          failed_attempts: number
          last_login_at: string | null
          locked_until: string | null
          must_change_pin: boolean
          partner_id: string
          pin_hash: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          partner_id: string
          pin_hash: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          partner_id?: string
          pin_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_auth_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commissions: {
        Row: {
          approved_at: string | null
          clawback_reason: string | null
          code_redemption_id: string
          commission_amount: number
          created_at: string
          id: string
          marked_payable_at: string | null
          marked_payable_by: string | null
          paid_at: string | null
          partner_id: string
          payout_id: string | null
          qualifies_at: string
          redeemed_against_registration_id: string | null
          registration_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          clawback_reason?: string | null
          code_redemption_id: string
          commission_amount: number
          created_at?: string
          id?: string
          marked_payable_at?: string | null
          marked_payable_by?: string | null
          paid_at?: string | null
          partner_id: string
          payout_id?: string | null
          qualifies_at: string
          redeemed_against_registration_id?: string | null
          registration_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          clawback_reason?: string | null
          code_redemption_id?: string
          commission_amount?: number
          created_at?: string
          id?: string
          marked_payable_at?: string | null
          marked_payable_by?: string | null
          paid_at?: string | null
          partner_id?: string
          payout_id?: string | null
          qualifies_at?: string
          redeemed_against_registration_id?: string | null
          registration_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_code_redemption_id_fkey"
            columns: ["code_redemption_id"]
            isOneToOne: false
            referencedRelation: "code_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_marked_payable_by_fkey"
            columns: ["marked_payable_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_redeemed_against_registration_id_fkey"
            columns: ["redeemed_against_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_link_clicks: {
        Row: {
          code_id: string
          created_at: string
          id: string
        }
        Insert: {
          code_id: string
          created_at?: string
          id?: string
        }
        Update: {
          code_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_link_clicks_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          created_at: string
          id: string
          method: string
          paid_at: string
          paid_by: string | null
          partner_id: string
          period_end: string | null
          period_start: string | null
          reference: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          method: string
          paid_at?: string
          paid_by?: string | null
          partner_id: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          total_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          paid_at?: string
          paid_by?: string | null
          partner_id?: string
          period_end?: string | null
          period_start?: string | null
          reference?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          partner_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          partner_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          partner_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          agreed_to_code_of_conduct: boolean
          category: string
          commission_rate: number | null
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_audience_size: string | null
          full_name: string
          id: string
          participant_id: string | null
          payout_details: string | null
          payout_method: string | null
          phone: string
          professional_background: string | null
          promotional_methods: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          social_links: string | null
          status: string
          tutor_id: string | null
          updated_at: string
        }
        Insert: {
          agreed_to_code_of_conduct?: boolean
          category: string
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_audience_size?: string | null
          full_name: string
          id?: string
          participant_id?: string | null
          payout_details?: string | null
          payout_method?: string | null
          phone: string
          professional_background?: string | null
          promotional_methods?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: string | null
          status?: string
          tutor_id?: string | null
          updated_at?: string
        }
        Update: {
          agreed_to_code_of_conduct?: boolean
          category?: string
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_audience_size?: string | null
          full_name?: string
          id?: string
          participant_id?: string | null
          payout_details?: string | null
          payout_method?: string | null
          phone?: string
          professional_background?: string | null
          promotional_methods?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: string | null
          status?: string
          tutor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          paid_at: string | null
          payment_id: string
          payment_status: string
          registration_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          paid_at?: string | null
          payment_id: string
          payment_status?: string
          registration_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          paid_at?: string | null
          payment_id?: string
          payment_status?: string
          registration_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_submissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          participant_notes: string | null
          payment_date: string
          registration_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slip_file_path: string | null
          status: string
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          participant_notes?: string | null
          payment_date: string
          registration_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_file_path?: string | null
          status?: string
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          participant_notes?: string | null
          payment_date?: string
          registration_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_file_path?: string | null
          status?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
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
            foreignKeyName: "payments_discount_granted_by_fkey"
            columns: ["discount_granted_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
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
        ]
      }
      pipeline_jobs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          last_advanced_at: string | null
          raw_news_item_id: string | null
          stage: string
          story_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_advanced_at?: string | null
          raw_news_item_id?: string | null
          stage?: string
          story_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_advanced_at?: string | null
          raw_news_item_id?: string | null
          stage?: string
          story_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_jobs_raw_news_item_id_fkey"
            columns: ["raw_news_item_id"]
            isOneToOne: false
            referencedRelation: "raw_news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_jobs_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          participant_id: string
          registration_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          participant_id: string
          registration_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          participant_id?: string
          registration_id?: string
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
      published_articles: {
        Row: {
          audience: string[]
          category: string
          content_type: string | null
          geography: string[]
          headline: string
          id: string
          image_url: string | null
          importance: string | null
          last_corrected_at: string | null
          published_at: string
          risk_level: number | null
          sections: Json
          seo_description: string | null
          seo_title: string | null
          slug: string
          source_urls: string[]
          story_id: string | null
          subcategories: string[]
          summary: string
          transparency_labels: string[]
          updated_at: string
          view_count: number
        }
        Insert: {
          audience?: string[]
          category: string
          content_type?: string | null
          geography?: string[]
          headline: string
          id?: string
          image_url?: string | null
          importance?: string | null
          last_corrected_at?: string | null
          published_at?: string
          risk_level?: number | null
          sections: Json
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          source_urls?: string[]
          story_id?: string | null
          subcategories?: string[]
          summary: string
          transparency_labels?: string[]
          updated_at?: string
          view_count?: number
        }
        Update: {
          audience?: string[]
          category?: string
          content_type?: string | null
          geography?: string[]
          headline?: string
          id?: string
          image_url?: string | null
          importance?: string | null
          last_corrected_at?: string | null
          published_at?: string
          risk_level?: number | null
          sections?: Json
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          source_urls?: string[]
          story_id?: string | null
          subcategories?: string[]
          summary?: string
          transparency_labels?: string[]
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_articles_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_news_items: {
        Row: {
          collected_at: string
          content_hash: string
          created_at: string
          external_url: string | null
          id: string
          published_at: string | null
          raw_text: string | null
          raw_text_purged_at: string | null
          source_id: string
          status: string
          title: string
        }
        Insert: {
          collected_at?: string
          content_hash: string
          created_at?: string
          external_url?: string | null
          id?: string
          published_at?: string | null
          raw_text?: string | null
          raw_text_purged_at?: string | null
          source_id: string
          status?: string
          title: string
        }
        Update: {
          collected_at?: string
          content_hash?: string
          created_at?: string
          external_url?: string | null
          id?: string
          published_at?: string | null
          raw_text?: string | null
          raw_text_purged_at?: string | null
          source_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_access_grants: {
        Row: {
          created_at: string
          expires_on: string
          granted_at: string
          granted_by: string | null
          id: string
          note: string
          reason: string
          registration_id: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          created_at?: string
          expires_on: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          note: string
          reason: string
          registration_id: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          created_at?: string
          expires_on?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          note?: string
          reason?: string
          registration_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_access_grants_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_access_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          batch_id: string
          company_allocation_id: string | null
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
          company_allocation_id?: string | null
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
          company_allocation_id?: string | null
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
            foreignKeyName: "registrations_company_allocation_id_fkey"
            columns: ["company_allocation_id"]
            isOneToOne: false
            referencedRelation: "company_batch_allocations"
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
      session_materials: {
        Row: {
          batch_id: string
          content_type: string | null
          created_at: string
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          link: string | null
          live_session_id: string | null
          title: string
          uploaded_by_staff_id: string | null
          uploaded_by_tutor_id: string | null
        }
        Insert: {
          batch_id: string
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          link?: string | null
          live_session_id?: string | null
          title: string
          uploaded_by_staff_id?: string | null
          uploaded_by_tutor_id?: string | null
        }
        Update: {
          batch_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          link?: string | null
          live_session_id?: string | null
          title?: string
          uploaded_by_staff_id?: string | null
          uploaded_by_tutor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_materials_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_materials_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_materials_uploaded_by_staff_id_fkey"
            columns: ["uploaded_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_materials_uploaded_by_tutor_id_fkey"
            columns: ["uploaded_by_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
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
      staff_action_audit_log: {
        Row: {
          action_type: string
          actor_staff_id: string | null
          created_at: string
          details: Json
          id: string
          reason: string | null
          target_registration_id: string | null
        }
        Insert: {
          action_type: string
          actor_staff_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          reason?: string | null
          target_registration_id?: string | null
        }
        Update: {
          action_type?: string
          actor_staff_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          reason?: string | null
          target_registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_action_audit_log_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_action_audit_log_target_registration_id_fkey"
            columns: ["target_registration_id"]
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
      stories: {
        Row: {
          audience: string[]
          canonical_title: string
          category: string
          content_type: string | null
          created_at: string
          geography: string[]
          id: string
          importance: string | null
          status: string
          subcategories: string[]
          updated_at: string
        }
        Insert: {
          audience?: string[]
          canonical_title: string
          category: string
          content_type?: string | null
          created_at?: string
          geography?: string[]
          id?: string
          importance?: string | null
          status?: string
          subcategories?: string[]
          updated_at?: string
        }
        Update: {
          audience?: string[]
          canonical_title?: string
          category?: string
          content_type?: string | null
          created_at?: string
          geography?: string[]
          id?: string
          importance?: string | null
          status?: string
          subcategories?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      story_sources: {
        Row: {
          created_at: string
          id: string
          raw_news_item_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          raw_news_item_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          raw_news_item_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sources_raw_news_item_id_fkey"
            columns: ["raw_news_item_id"]
            isOneToOne: false
            referencedRelation: "raw_news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_sources_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_action_audit_log: {
        Row: {
          action_type: string
          created_at: string
          details: Json
          id: string
          target_batch_id: string | null
          tutor_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json
          id?: string
          target_batch_id?: string | null
          tutor_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json
          id?: string
          target_batch_id?: string | null
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_action_audit_log_target_batch_id_fkey"
            columns: ["target_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_action_audit_log_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_auth: {
        Row: {
          created_at: string
          failed_attempts: number
          last_login_at: string | null
          locked_until: string | null
          must_change_pin: boolean
          pin_hash: string
          tutor_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash: string
          tutor_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash?: string
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_auth_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: true
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          tutor_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          tutor_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_sessions_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutors: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          batch_id: string
          consent_given: boolean
          converted_registration_id: string | null
          created_at: string
          id: string
          lead_source: string
          notes: string | null
          offered_at: string | null
          participant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          consent_given?: boolean
          converted_registration_id?: string | null
          created_at?: string
          id?: string
          lead_source: string
          notes?: string | null
          offered_at?: string | null
          participant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          consent_given?: boolean
          converted_registration_id?: string | null
          created_at?: string
          id?: string
          lead_source?: string
          notes?: string | null
          offered_at?: string | null
          participant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_converted_registration_id_fkey"
            columns: ["converted_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
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
            isOneToOne: true
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
      fn_delete_participant_immediately: {
        Args: {
          deleting_staff_id: string
          participant_id_to_delete: string
          reason: string
        }
        Returns: undefined
      }
      fn_delete_registration_immediately: {
        Args: {
          deleting_staff_id: string
          reason: string
          registration_id_to_delete: string
        }
        Returns: undefined
      }
      fn_hard_delete_participant: {
        Args: { deleting_staff_id: string; participant_id_to_delete: string }
        Returns: undefined
      }
      fn_news_increment_view_count: {
        Args: { p_article_id: string }
        Returns: undefined
      }
      fn_news_similar_titles: {
        Args: { p_since: string; p_title: string }
        Returns: {
          id: string
          title: string
        }[]
      }
      fn_soft_delete_participant: {
        Args: { participant_id_to_delete: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
