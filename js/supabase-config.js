// supabase-config.js — reemplaza estos valores con los de TU proyecto de
// Supabase (uno nuevo, separado del de Ojitos de Mili): Project Settings →
// API → "Project URL" y "anon public" key.
//
// Son públicos por diseño (los usa cualquiera que abra la app); la seguridad
// real la dan las políticas RLS del esquema (supabase/schema.sql).
let SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
let SUPABASE_ANON_KEY = 'TU-ANON-KEY';

let SUPABASE_CONFIGURADO = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');

let supabaseClient = SUPABASE_CONFIGURADO
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Llave pública del temporizador (avisos push). También pública por diseño —
// la privada vive solo como secreto de la Edge Function send-patch-reminders.
let VAPID_PUBLIC_KEY = 'TU-VAPID-PUBLIC-KEY';
let PUSH_CONFIGURADO = !VAPID_PUBLIC_KEY.includes('TU-VAPID');
