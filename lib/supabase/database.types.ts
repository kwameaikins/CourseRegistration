// Database types for the Supabase schema in supabase/migrations.
//
// NOTE: Document 11 requires these types to be generated via
// `npx supabase gen types typescript` once a Supabase project is linked or a
// local instance is running. This file was authored to match the foundation
// migration exactly so development can proceed before the project is linked.
// Regenerate and overwrite this file after the first `supabase db push`.

export type StaffRole = 'admin' | 'finance' | 'marketing' | 'tutor' | 'management';

export type RegistrationStatus = 'Registered' | 'Confirmed' | 'Attended' | 'Cancelled';

export type PaymentStatus = 'Unpaid' | 'Part Payment' | 'Paid';

export type PaymentMethod = 'Paystack Card' | 'MTN MoMo' | 'Bank Transfer' | 'Cash' | 'Other';

export type LeadSource = 'WhatsApp' | 'Facebook' | 'LinkedIn' | 'Referral' | 'Website' | 'Other';

export type EmailType =
  | 'welcome'
  | 'payment_instruction'
  | 'reminder_1'
  | 'reminder_2'
  | 'reminder_3'
  | 'reminder_4'
  | 'payment_confirmation'
  | 'class_reminder_24h'
  | 'class_reminder_2h'
  | 'zoom_link'
  | 'whatsapp_invite'
  | 'post_training_thankyou'
  | 'upsell';

export interface Database {
  public: {
    Tables: {
      staff_users: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string;
          role: StaffRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          email: string;
          role: StaffRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          email?: string;
          role?: StaffRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          course_code: string;
          course_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_code: string;
          course_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_code?: string;
          course_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      batches: {
        Row: {
          id: string;
          course_id: string;
          cohort_label: string;
          course_fee: number;
          start_date: string;
          start_time: string;
          end_date: string;
          zoom_link: string | null;
          whatsapp_group_link: string | null;
          facilitator_name: string;
          facilitator_staff_id: string | null;
          welcome_email_enabled: boolean;
          payment_reminder_enabled: boolean;
          class_reminder_enabled: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          cohort_label: string;
          course_fee: number;
          start_date: string;
          start_time: string;
          end_date: string;
          zoom_link?: string | null;
          whatsapp_group_link?: string | null;
          facilitator_name: string;
          facilitator_staff_id?: string | null;
          welcome_email_enabled?: boolean;
          payment_reminder_enabled?: boolean;
          class_reminder_enabled?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          cohort_label?: string;
          course_fee?: number;
          start_date?: string;
          start_time?: string;
          end_date?: string;
          zoom_link?: string | null;
          whatsapp_group_link?: string | null;
          facilitator_name?: string;
          facilitator_staff_id?: string | null;
          welcome_email_enabled?: boolean;
          payment_reminder_enabled?: boolean;
          class_reminder_enabled?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      participants: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string;
          consent_given: boolean;
          consent_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          phone: string;
          consent_given?: boolean;
          consent_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string;
          consent_given?: boolean;
          consent_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          id: string;
          participant_id: string;
          batch_id: string;
          registration_status: RegistrationStatus;
          lead_source: LeadSource;
          consent_given: boolean;
          notes: string | null;
          registered_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          participant_id: string;
          batch_id: string;
          registration_status?: RegistrationStatus;
          lead_source: LeadSource;
          consent_given: boolean;
          notes?: string | null;
          registered_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          participant_id?: string;
          batch_id?: string;
          registration_status?: RegistrationStatus;
          lead_source?: LeadSource;
          consent_given?: boolean;
          notes?: string | null;
          registered_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          registration_id: string;
          course_fee: number;
          amount_paid: number;
          balance: number;
          payment_status: PaymentStatus;
          payment_method: PaymentMethod | null;
          transaction_id: string | null;
          payment_date: string | null;
          verified_by: string | null;
          payment_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          course_fee: number;
          amount_paid?: number;
          payment_method?: PaymentMethod | null;
          transaction_id?: string | null;
          payment_date?: string | null;
          verified_by?: string | null;
          payment_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          course_fee?: number;
          amount_paid?: number;
          payment_method?: PaymentMethod | null;
          transaction_id?: string | null;
          payment_date?: string | null;
          verified_by?: string | null;
          payment_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_templates: {
        Row: {
          id: string;
          course_id: string;
          email_type: EmailType;
          subject: string;
          body: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          email_type: EmailType;
          subject: string;
          body: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          email_type?: EmailType;
          subject?: string;
          body?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_log: {
        Row: {
          id: string;
          registration_id: string;
          email_type: string;
          sent_at: string;
          success: boolean;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          registration_id: string;
          email_type: string;
          sent_at?: string;
          success: boolean;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          registration_id?: string;
          email_type?: string;
          sent_at?: string;
          success?: boolean;
          error_message?: string | null;
        };
        Relationships: [];
      };
      deletion_log: {
        Row: {
          id: string;
          participant_id: string;
          deleted_by_staff_id: string;
          deleted_at: string;
        };
        Insert: {
          id?: string;
          participant_id: string;
          deleted_by_staff_id: string;
          deleted_at?: string;
        };
        Update: {
          id?: string;
          participant_id?: string;
          deleted_by_staff_id?: string;
          deleted_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_current_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      fn_current_staff_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      fn_soft_delete_participant: {
        Args: { participant_id_to_delete: string };
        Returns: undefined;
      };
      fn_hard_delete_participant: {
        Args: { participant_id_to_delete: string; deleting_staff_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
