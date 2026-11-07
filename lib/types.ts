// Tipos compartilhados entre o servidor e as telas (formatos que a API devolve).

export type Role = 'super' | 'city' | 'shop';
export type ApptStatus = 'scheduled' | 'confirmed' | 'done' | 'cancelled' | 'no_show';
export type Payment = 'pix' | 'dinheiro' | 'cartao';
export type LeadStatus = 'novo' | 'contatado' | 'cadastrado' | 'descartado';
export type Hours = Partial<Record<string, [string, string]>>; // { "1": ["08:00","18:00"] } (0 = domingo)

export interface City {
  id: number; slug: string; name: string; state: string; tagline: string | null;
  description: string | null; color: string; active: boolean; total?: number;
}

export interface Category { id: number; slug: string; name: string; icon: string; color: string; sort: number; total?: number }

export interface Business {
  id: number; city_id: number; category_id: number; slug: string; name: string; description: string | null;
  address: string | null; neighborhood: string | null; phone: string | null; instagram: string | null;
  hours: Hours; booking_enabled: boolean; featured: boolean; active: boolean;
  category_name: string; category_slug: string; category_icon: string; category_color: string;
  city_slug?: string; owners?: string | null;
}

export interface SessionUser {
  id: number; name: string; email: string; role: Role; city_id: number | null; business_id: number | null;
}

export interface Service { id: number; shop_id?: number; name: string; description: string | null; duration_min: number; price_cents: number; active: boolean }

export interface BarberHour { weekday: number; start: string; end: string; break_start: string | null; break_end: string | null }
export interface Barber {
  id: number; name: string; phone: string | null; commission_pct: number; color: string; active: boolean;
  hours: BarberHour[];
}

export interface Appointment {
  id?: number; code: string; date: string; start: string; end: string; start_min: number; end_min: number;
  status: ApptStatus; price_cents: number; service_id: number; service_name: string;
  barber_id: number; barber_name: string; barber_color: string; client_name: string;
  client_id?: number; client_phone?: string; source?: 'online' | 'admin'; payment?: Payment | null;
  notes?: string | null; reminded?: boolean; created_at?: string;
}

export interface LoyaltyCard { stamps: number; goal: number; available: number; missing: number; reward_label: string }

export interface PublicAppointment extends Appointment {
  shop_name?: string; shop_phone?: string | null; booking_path?: string | null;
  loyalty?: (LoyaltyCard & { summary: string; counts_label: string }) | null;
}

export interface Settings {
  shop_name: string; shop_phone: string; shop_address: string; slot_interval: string; min_advance_min: string;
  max_days_ahead: string; cancel_limit_hours: string; max_active_per_phone: string; block_after_no_shows: string;
  reminder_template: string;
}

export interface LoyaltyConfig {
  enabled: boolean; goal: number; services: number[]; min_cents: number; reward_type: 'service' | 'percent' | 'other';
  reward_service: number | null; reward_percent: number; reward_text: string; expire_days: number; start: string | null;
  public: boolean; reward_label: string; counts_label: string; summary: string;
}
