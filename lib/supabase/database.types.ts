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
          source: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          registration_id: string
          session_date: string
          source?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          registration_id?: string
          session_date?: string
          source?: string
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
      attendance_exceptions: {
        Row: {
          id: string
          registration_id: string
          batch_id: string
          session_date: string
          exception_type: string
          raised_by_tutor_id: string | null
          requested_present: boolean | null
          reason: string
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          registration_id: string
          batch_id: string
          session_date: string
          exception_type: string
          raised_by_tutor_id?: string | null
          requested_present?: boolean | null
          reason: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          registration_id?: string
          batch_id?: string
          session_date?: string
          exception_type?: string
          raised_by_tutor_id?: string | null
          requested_present?: boolean | null
          reason?: string
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_exceptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
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
          class_reminder_enabled: boolean
          cohort_label: string
          capacity: number | null
          course_fee: number
          course_id: string
          created_at: string
          discount_cutoff_date: string | null
          discounted_fee: number | null
          end_date: string
          facilitator_name: string
          facilitator_staff_id: string | null
          facilitator_tutor_id: string | null
          id: string
          is_active: boolean
          payment_reminder_enabled: boolean
          resources_link: string | null
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
          capacity?: number | null
          course_fee: number
          course_id: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date: string
          facilitator_name: string
          facilitator_staff_id?: string | null
          facilitator_tutor_id?: string | null
          id?: string
          is_active?: boolean
          payment_reminder_enabled?: boolean
          resources_link?: string | null
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
          capacity?: number | null
          course_fee?: number
          course_id?: string
          created_at?: string
          discount_cutoff_date?: string | null
          discounted_fee?: number | null
          end_date?: string
          facilitator_name?: string
          facilitator_staff_id?: string | null
          facilitator_tutor_id?: string | null
          id?: string
          is_active?: boolean
          payment_reminder_enabled?: boolean
          resources_link?: string | null
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
          {
            foreignKeyName: "batches_facilitator_tutor_id_fkey"
            columns: ["facilitator_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
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
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_deletion_log: {
        Row: {
          id: string
          entity_type: string
          participant_id: string
          participant_name: string
          registration_id: string | null
          course_name: string | null
          cohort_label: string | null
          reason: string | null
          deleted_by_staff_id: string | null
          deleted_at: string
        }
        Insert: {
          id?: string
          entity_type: string
          participant_id: string
          participant_name: string
          registration_id?: string | null
          course_name?: string | null
          cohort_label?: string | null
          reason?: string | null
          deleted_by_staff_id?: string | null
          deleted_at?: string
        }
        Update: {
          id?: string
          entity_type?: string
          participant_id?: string
          participant_name?: string
          registration_id?: string | null
          course_name?: string | null
          cohort_label?: string | null
          reason?: string | null
          deleted_by_staff_id?: string | null
          deleted_at?: string
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
          id: string
          registration_id: string
          method: string
          amount: number
          transaction_reference: string | null
          payment_date: string
          slip_file_path: string | null
          participant_notes: string | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          registration_id: string
          method: string
          amount: number
          transaction_reference?: string | null
          payment_date: string
          slip_file_path?: string | null
          participant_notes?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          registration_id?: string
          method?: string
          amount?: number
          transaction_reference?: string | null
          payment_date?: string
          slip_file_path?: string | null
          participant_notes?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
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
      partners: {
        Row: {
          id: string
          category: string
          full_name: string
          email: string | null
          phone: string
          company_name: string | null
          tutor_id: string | null
          participant_id: string | null
          commission_rate: number | null
          payout_method: string | null
          payout_details: string | null
          status: string
          social_links: string | null
          professional_background: string | null
          promotional_methods: string | null
          estimated_audience_size: string | null
          agreed_to_code_of_conduct: boolean
          reviewed_by: string | null
          reviewed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: string
          full_name: string
          email?: string | null
          phone: string
          company_name?: string | null
          tutor_id?: string | null
          participant_id?: string | null
          commission_rate?: number | null
          payout_method?: string | null
          payout_details?: string | null
          status?: string
          social_links?: string | null
          professional_background?: string | null
          promotional_methods?: string | null
          estimated_audience_size?: string | null
          agreed_to_code_of_conduct?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string
          full_name?: string
          email?: string | null
          phone?: string
          company_name?: string | null
          tutor_id?: string | null
          participant_id?: string | null
          commission_rate?: number | null
          payout_method?: string | null
          payout_details?: string | null
          status?: string
          social_links?: string | null
          professional_background?: string | null
          promotional_methods?: string | null
          estimated_audience_size?: string | null
          agreed_to_code_of_conduct?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
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
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_auth: {
        Row: {
          partner_id: string
          pin_hash: string
          must_change_pin: boolean
          failed_attempts: number
          locked_until: string | null
          last_login_at: string | null
          created_at: string
        }
        Insert: {
          partner_id: string
          pin_hash: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
        }
        Update: {
          partner_id?: string
          pin_hash?: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
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
      partner_sessions: {
        Row: {
          id: string
          partner_id: string
          expires_at: string
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          expires_at: string
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          expires_at?: string
          revoked_at?: string | null
          created_at?: string
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
      codes: {
        Row: {
          id: string
          code: string
          partner_id: string | null
          discount_type: string | null
          discount_value: number | null
          applies_to_course_id: string | null
          max_uses: number | null
          uses_count: number
          one_per_participant: boolean
          expires_at: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          partner_id?: string | null
          discount_type?: string | null
          discount_value?: number | null
          applies_to_course_id?: string | null
          max_uses?: number | null
          uses_count?: number
          one_per_participant?: boolean
          expires_at?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          partner_id?: string | null
          discount_type?: string | null
          discount_value?: number | null
          applies_to_course_id?: string | null
          max_uses?: number | null
          uses_count?: number
          one_per_participant?: boolean
          expires_at?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codes_applies_to_course_id_fkey"
            columns: ["applies_to_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      code_redemptions: {
        Row: {
          id: string
          code_id: string
          registration_id: string
          participant_id: string
          discount_amount_applied: number
          attribution_method: string
          existing_lead_at_redemption: boolean
          self_referral_at_redemption: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code_id: string
          registration_id: string
          participant_id: string
          discount_amount_applied?: number
          attribution_method: string
          existing_lead_at_redemption?: boolean
          self_referral_at_redemption?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code_id?: string
          registration_id?: string
          participant_id?: string
          discount_amount_applied?: number
          attribution_method?: string
          existing_lead_at_redemption?: boolean
          self_referral_at_redemption?: boolean
          created_at?: string
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
            foreignKeyName: "code_redemptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_redemptions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_link_clicks: {
        Row: {
          id: string
          code_id: string
          created_at: string
        }
        Insert: {
          id?: string
          code_id: string
          created_at?: string
        }
        Update: {
          id?: string
          code_id?: string
          created_at?: string
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
      partner_commissions: {
        Row: {
          id: string
          partner_id: string
          registration_id: string
          code_redemption_id: string
          commission_amount: number
          status: string
          qualifies_at: string
          approved_at: string | null
          marked_payable_at: string | null
          marked_payable_by: string | null
          payout_id: string | null
          paid_at: string | null
          clawback_reason: string | null
          redeemed_against_registration_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          registration_id: string
          code_redemption_id: string
          commission_amount: number
          status?: string
          qualifies_at: string
          approved_at?: string | null
          marked_payable_at?: string | null
          marked_payable_by?: string | null
          payout_id?: string | null
          paid_at?: string | null
          clawback_reason?: string | null
          redeemed_against_registration_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          registration_id?: string
          code_redemption_id?: string
          commission_amount?: number
          status?: string
          qualifies_at?: string
          approved_at?: string | null
          marked_payable_at?: string | null
          marked_payable_by?: string | null
          payout_id?: string | null
          paid_at?: string | null
          clawback_reason?: string | null
          redeemed_against_registration_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_code_redemption_id_fkey"
            columns: ["code_redemption_id"]
            isOneToOne: false
            referencedRelation: "code_redemptions"
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
            foreignKeyName: "partner_commissions_marked_payable_by_fkey"
            columns: ["marked_payable_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          id: string
          partner_id: string
          total_amount: number
          method: string
          reference: string | null
          period_start: string | null
          period_end: string | null
          paid_by: string | null
          paid_at: string
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          total_amount: number
          method: string
          reference?: string | null
          period_start?: string | null
          period_end?: string | null
          paid_by?: string | null
          paid_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          total_amount?: number
          method?: string
          reference?: string | null
          period_start?: string | null
          period_end?: string | null
          paid_by?: string | null
          paid_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_paid_by_fkey"
            columns: ["paid_by"]
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
      participant_pin_reset_tokens: {
        Row: {
          id: string
          participant_id: string
          expires_at: string
          consumed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          participant_id: string
          expires_at: string
          consumed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          participant_id?: string
          expires_at?: string
          consumed_at?: string | null
          created_at?: string
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
      live_session_registrants: {
        Row: {
          created_at: string
          id: string
          join_url: string
          live_session_id: string
          registration_id: string
          zoom_registrant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_url: string
          live_session_id: string
          registration_id: string
          zoom_registrant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          join_url?: string
          live_session_id?: string
          registration_id?: string
          zoom_registrant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_registrants_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_registrants_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
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
      live_session_attendance: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          join_time: string | null
          leave_time: string | null
          live_session_id: string
          registration_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          live_session_id: string
          registration_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          join_time?: string | null
          leave_time?: string | null
          live_session_id?: string
          registration_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_attendance_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
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
      session_materials: {
        Row: {
          id: string
          batch_id: string
          live_session_id: string | null
          uploaded_by_tutor_id: string | null
          title: string
          link: string
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          live_session_id?: string | null
          uploaded_by_tutor_id?: string | null
          title: string
          link: string
          created_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          live_session_id?: string | null
          uploaded_by_tutor_id?: string | null
          title?: string
          link?: string
          created_at?: string
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
            foreignKeyName: "session_materials_uploaded_by_tutor_id_fkey"
            columns: ["uploaded_by_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutors: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tutor_auth: {
        Row: {
          tutor_id: string
          pin_hash: string
          must_change_pin: boolean
          failed_attempts: number
          locked_until: string | null
          last_login_at: string | null
          created_at: string
        }
        Insert: {
          tutor_id: string
          pin_hash: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
        }
        Update: {
          tutor_id?: string
          pin_hash?: string
          must_change_pin?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_login_at?: string | null
          created_at?: string
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
          id: string
          tutor_id: string
          expires_at: string
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tutor_id: string
          expires_at: string
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tutor_id?: string
          expires_at?: string
          revoked_at?: string | null
          created_at?: string
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
      tutor_action_audit_log: {
        Row: {
          id: string
          tutor_id: string
          action_type: string
          target_batch_id: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          tutor_id: string
          action_type: string
          target_batch_id?: string | null
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          tutor_id?: string
          action_type?: string
          target_batch_id?: string | null
          details?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_action_audit_log_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_action_audit_log_target_batch_id_fkey"
            columns: ["target_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
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
      fn_delete_registration_immediately: {
        Args: {
          registration_id_to_delete: string
          deleting_staff_id: string
          reason: string | null
        }
        Returns: undefined
      }
      fn_delete_participant_immediately: {
        Args: {
          participant_id_to_delete: string
          deleting_staff_id: string
          reason: string | null
        }
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




